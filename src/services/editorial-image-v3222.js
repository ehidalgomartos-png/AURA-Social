'use strict';
// V3.2.22: RSS metadata is untrusted. Remote bytes are fetched ONLY on an
// authenticated admin preview/explicit licensing action, never during RSS fetch.
const https=require('node:https');
const net=require('node:net');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {resolvePublicAddresses,pinnedAddressLookup}=require('./editorial-rss-v321');

const MAX_IMAGE_BYTES=4*1024*1024;
function validatedImageUrl(raw){
  if(typeof raw!=='string'||raw.length>2048||/[\s\\]/.test(raw))return '';
  try{
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
      !host.includes('.')||net.isIP(host)||host==='localhost'||
      /\.(?:local|localhost|internal|test|invalid|example|onion)$/.test(host))return '';
    return u.href;
  }catch(_){return '';}
}
function extractRssImageV3222(entry={},type='rss'){
  if(!entry||typeof entry!=='object')return '';
  const asArray=value=>Array.isArray(value)?value:value==null?[]:[value];
  const choices=[];
  const collect=(items)=>{
    for(const item of asArray(items)){
      if(!item||typeof item!=='object')continue;
      const url=item['@_url']||item['@_href']||'';
      const kind=String(item['@_type']||item['@_medium']||'').toLowerCase();
      if(kind&&kind!=='image'&&!/^image\/(?:jpeg|png|webp)$/.test(kind))continue;
      const safe=validatedImageUrl(url);
      if(safe)choices.push(safe);
    }
  };
  collect(entry.content);
  collect(entry.thumbnail);
  collect(entry.enclosure);
  collect(entry.group?.content);
  collect(entry.group?.thumbnail);
  if(type==='atom')collect(asArray(entry.link).filter(x=>
    x&&typeof x==='object'&&x['@_rel']==='enclosure'));
  const image=entry.image;
  if(typeof image==='string'){
    const safe=validatedImageUrl(image);
    if(safe)choices.push(safe);
  }
  return choices[0]||'';
}
function mimeOfImage(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<16)return null;
  if(buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return {mime:'image/jpeg',ext:'.jpg'};
  if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return {mime:'image/png',ext:'.png'};
  if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')
    return {mime:'image/webp',ext:'.webp'};
  return null;
}
function imageError(code){
  const err=new Error(code);err.code=code;err.status=422;return err;
}
async function fetchImageV3222(raw,{lookup,request=https.request}={}){
  const url=validatedImageUrl(raw);
  if(!url)throw imageError('editorial_image_url_invalid');
  const u=new URL(url);
  const pins=await resolvePublicAddresses(u.hostname,lookup);
  const attempts=pins.slice(0,3);
  let lastError=null;
  for(const pin of attempts){
    try{
      return await new Promise((resolve,reject)=>{
        let completed=false,bytes=0,resp,req;
        const parts=[];
        const end=(err,body)=>{
          if(completed)return;
          completed=true;clearTimeout(timer);
          if(err){req?.destroy();reject(err);}else resolve(body);
        };
        const timer=setTimeout(()=>end(imageError('editorial_image_timeout')),6500);
        timer.unref?.();
        try{
          req=request({
            protocol:'https:',hostname:u.hostname,port:443,
            path:u.pathname+u.search,method:'GET',agent:false,
            maxHeaderSize:10000,lookup:pinnedAddressLookup(pin),
            headers:{Accept:'image/jpeg,image/png,image/webp','Accept-Encoding':'identity',
              'User-Agent':'RedLibertadEditorial/3.2.22 (human-licensed image check)'}
          },res=>{
            resp=res;
            const status=Number(res.statusCode||0);
            if(status!==200)return end(imageError('editorial_image_http_error'));
            const mime=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
            if(!['image/jpeg','image/png','image/webp'].includes(mime))
              return end(imageError('editorial_image_type_invalid'));
            if(Number(res.headers['content-length']||0)>MAX_IMAGE_BYTES)
              return end(imageError('editorial_image_too_large'));
            res.on('data',chunk=>{
              bytes+=chunk.length;
              if(bytes>MAX_IMAGE_BYTES)return end(imageError('editorial_image_too_large'));
              parts.push(chunk);
            });
            res.on('end',()=>{
              if(completed)return;
              const buffer=Buffer.concat(parts);
              const signature=mimeOfImage(buffer);
              if(!signature||signature.mime!==mime)return end(imageError('editorial_image_type_invalid'));
              end(null,{buffer,mime,ext:signature.ext});
            });
            res.on('error',()=>end(imageError('editorial_image_download_failed')));
            res.on('aborted',()=>end(imageError('editorial_image_download_failed')));
          });
          req.setTimeout(6500,()=>end(imageError('editorial_image_timeout')));
          req.on('error',()=>end(imageError('editorial_image_download_failed')));
          req.end();
        }catch(_){end(imageError('editorial_image_download_failed'));}
      });
    }catch(error){
      lastError=error;
      if(!['editorial_image_download_failed','editorial_image_timeout'].includes(error?.code))throw error;
    }
  }
  throw lastError||imageError('editorial_image_download_failed');
}
const uploadRoot=()=>process.env.UPLOAD_DIR||path.join(__dirname,'..','..','uploads');
async function saveEditorialImageV3222(downloaded){
  const directory=path.join(uploadRoot(),'editorial');
  await fs.mkdir(directory,{recursive:true});
  const file=crypto.randomUUID()+downloaded.ext;
  const fullPath=path.join(directory,file);
  await fs.writeFile(fullPath,downloaded.buffer,{flag:'wx',mode:0o644});
  return {url:'/uploads/editorial/'+file,absolutePath:fullPath};
}
function safeLocalImageV3222(value){
  return typeof value==='string'&&/^\/uploads\/editorial\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(value);
}
module.exports={MAX_IMAGE_BYTES,validatedImageUrl,extractRssImageV3222,
  mimeOfImage,fetchImageV3222,saveEditorialImageV3222,safeLocalImageV3222};
