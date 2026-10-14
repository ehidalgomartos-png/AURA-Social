'use strict';
// Defend against SSRF, redirects, huge files, content spoofing and DNS rebinding.
const dns=require('node:dns').promises;
const https=require('node:https');
const net=require('node:net');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const UPLOADS=process.env.UPLOAD_DIR||path.join(__dirname,'..','..','uploads');
const MAX_IMAGE=5*1024*1024,MAX_PHOTOS=6;
function publicIPv4(ip){
 if(net.isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 if(a===0||a===10||a===127||a>=224||a===169)return false;
 if(a===100&&b>=64&&b<=127)return false;
 if(a===172&&b>=16&&b<=31)return false;
 if(a===192&&(b===168||b===0||(b===0&&c===2)))return false;
 if(a===198&&(b===18||b===19||(b===51&&c===100)))return false;
 if(a===203&&b===0&&c===113)return false;
 if(a===192&&b===0&&c===2)return false;
 if(a===255)return false;
 return true;
}
function safeHost(raw){
 let url;try{url=new URL(raw);}catch{throw new Error('image_invalid_url');}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('image_requires_https');
 const hostname=url.hostname.toLowerCase();
 if(net.isIP(hostname)||hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.local')||hostname.endsWith('.internal')||hostname.endsWith('.test')||hostname.endsWith('.invalid')||!hostname.includes('.')||hostname.length>253)throw new Error('image_private_host');
 if(!/^[a-z0-9.-]+$/.test(hostname)||hostname.split('.').some(s=>!s||s.length>63||s.startsWith('-')||s.endsWith('-')))throw new Error('image_invalid_host');
 if(url.href.length>2000)throw new Error('image_url_too_long');
 return url;
}
function sniff(bytes){
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return '.jpg';
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return '.webp';
 throw new Error('image_unsupported_format');
}
async function downloadImage(raw){
 const url=safeHost(raw);
 const addresses=await dns.lookup(url.hostname,{all:true,family:4,verbatim:true});
 if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw new Error('image_private_address');
 const address=addresses[0].address;
 return new Promise((resolve,reject)=>{
  let finished=false;const fail=error=>{if(finished)return;finished=true;reject(error);};
  const request=https.request(url,{
   method:'GET',
   agent:false,
   timeout:6500,
   headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'RedLibertad-MarketplaceImporter/1.0'},
   lookup:(_host,_opts,done)=>done(null,address,4)
  },response=>{
   const code=response.statusCode||0;
   if(code<200||code>=300){response.resume();return fail(new Error('image_http_'+code));}
   const length=Number(response.headers['content-length']||0);
   if(length>MAX_IMAGE){response.destroy();return fail(new Error('image_too_large'));}
   const contentType=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
   if(!['image/jpeg','image/png','image/webp'].includes(contentType)){response.destroy();return fail(new Error('image_invalid_mime'));}
   let count=0;const parts=[];
   response.on('data',chunk=>{count+=chunk.length;if(count>MAX_IMAGE){response.destroy();return fail(new Error('image_too_large'));}parts.push(chunk);});
   response.on('error',fail);
   response.on('end',()=>{
    if(finished)return;try{
     const data=Buffer.concat(parts);if(data.length<100)throw new Error('image_empty');
     const ext=sniff(data);
     const expected={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[contentType];
     if(expected!==ext)throw new Error('image_mime_mismatch');
     finished=true;resolve({data,ext});
    }catch(error){fail(error);}
   });
  });
  request.on('timeout',()=>request.destroy(new Error('image_timeout')));
  request.on('error',fail);request.end();
 });
}
async function saveImages(urls){
 if(!Array.isArray(urls)||!urls.length||urls.length>MAX_PHOTOS)throw new Error('image_urls_required');
 await fs.mkdir(UPLOADS,{recursive:true});
 const stored=[];
 try{
  for(const url of urls){
   const {data,ext}=await downloadImage(url);
   const filename='market-import-'+crypto.randomUUID()+ext;
   const full=path.join(UPLOADS,filename);
   await fs.writeFile(full,data,{flag:'wx',mode:0o600});
   stored.push({full,url:'/uploads/'+filename});
  }
  return {paths:stored.map(x=>x.url),files:stored.map(x=>x.full)};
 }catch(error){
  await Promise.allSettled(stored.map(x=>fs.unlink(x.full)));
  throw error;
 }
}
async function eraseFiles(paths){
 await Promise.allSettled((paths||[]).map(p=>fs.unlink(p)));
}
module.exports={safeHost,publicIPv4,sniff,saveImages,eraseFiles,MAX_IMAGE,MAX_PHOTOS};
