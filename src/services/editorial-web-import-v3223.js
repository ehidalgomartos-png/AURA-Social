'use strict';
// V3.2.23 — bounded extraction of public webpage *metadata*, not a scraper
// of copyrighted articles. All networking is administrator-triggered.
const https=require('node:https');
const crypto=require('node:crypto');
const {resolvePublicAddresses,pinnedAddressLookup,normalizedTitle}=require('./editorial-rss-v321');
const {validateFeedUrl}=require('./editorial-v320');
const {validatedImageUrl}=require('./editorial-image-v3222');
const MAX_PAGE_BYTES=700*1024;
function articleUrlV3223(raw){
  if(typeof raw!=='string'||raw.length>2048)return null;
  let parsed;
  try{parsed=new URL(raw.trim());parsed.hash='';}catch(_){return null;}
  const validated=validateFeedUrl(parsed.href);
  if(!validated)return null;
  const u=new URL(validated);
  if(!u.pathname||u.pathname==='/'&&!u.search)return null;
  if(/\.(?:xml|rss|atom|json|zip|pdf|jpg|jpeg|png|gif|webp|svg|mp4|webm)(?:$|\?)/i.test(u.pathname))return null;
  u.hash='';
  for(const key of [...u.searchParams.keys()]){
    if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid'].includes(key.toLowerCase()))u.searchParams.delete(key);
  }
  u.searchParams.sort();
  if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');
  return u.href;
}
function pageError(code,status=422){const err=new Error(code);err.code=code;err.status=status;return err;}
function decodeEntitiesV3223(text){
  const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',hellip:'…',mdash:'—',ndash:'–',
    rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
  return String(text||'').replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,9});/gi,(all,key)=>{
    const name=key.toLowerCase();
    if(entities[name])return entities[name];
    const n=name.startsWith('#x')?parseInt(name.slice(2),16):
      name.startsWith('#')?parseInt(name.slice(1),10):NaN;
    return n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all;
  });
}
function plainV3223(raw,max=400){
  return decodeEntitiesV3223(String(raw||'').replace(/<[^>]{0,500}>/g,' '))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function attributesV3223(tag){
  const props={};
  for(const match of String(tag).matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
    props[match[1].toLowerCase()]=decodeEntitiesV3223(match[2]??match[3]??match[4]??'');
  }
  return props;
}
function extractPageMetadataV3223(html,url){
  if(typeof html!=='string'||Buffer.byteLength(html)>MAX_PAGE_BYTES)throw pageError('editorial_web_page_invalid');
  // Untrusted script, style and markup are NEVER reproduced as HTML.
  const tags=[...html.matchAll(/<meta\b[^>]{0,3000}>/gi)].slice(0,150);
  const meta=new Map();
  for(const m of tags){
    const attr=attributesV3223(m[0]);
    const name=String(attr.property||attr.name||'').trim().toLowerCase();
    if(name&&attr.content&&!meta.has(name))meta.set(name,attr.content);
  }
  const heading=html.match(/<h1\b[^>]*>([\s\S]{0,1600}?)<\/h1\s*>/i);
  const htmlTitle=html.match(/<title\b[^>]*>([\s\S]{0,1200}?)<\/title\s*>/i);
  const title=plainV3223(meta.get('og:title')||meta.get('twitter:title')||heading?.[1]||htmlTitle?.[1],240);
  const summary=plainV3223(meta.get('og:description')||meta.get('description')||
    meta.get('twitter:description')||'',400);
  const imageRaw=meta.get('og:image:secure_url')||meta.get('og:image')||
    meta.get('twitter:image')||'';
  let photoUrl='';
  if(imageRaw){
    try{
      const absolute=new URL(imageRaw,url).href;
      photoUrl=validatedImageUrl(absolute)||'';
    }catch(_){/* invalid metadata is ignored */}
  }
  if(title.length<8)throw pageError('editorial_web_title_unavailable',422);
  let site=plainV3223(meta.get('og:site_name')||new URL(url).hostname,100);
  if(site.length<3)site=new URL(url).hostname;
  const publishedRaw=meta.get('article:published_time')||meta.get('datepublished')||'';
  const parsedDate=publishedRaw?Date.parse(publishedRaw):NaN;
  const published=Number.isFinite(parsedDate)&&parsedDate<=Date.now()+86400000?
    new Date(parsedDate).toISOString():null;
  return {
    canonical_url:url,source_title:title,source_excerpt:summary,
    source_image_url:photoUrl||null,source_name:site,
    published_at:published,
    image_is_metadata_only:true,original_content_not_imported:true
  };
}
async function fetchWebPageV3223(raw,{lookup,request=https.request}={}){
  const url=articleUrlV3223(raw);
  if(!url)throw pageError('editorial_web_url_invalid',400);
  const u=new URL(url);
  const pins=await resolvePublicAddresses(u.hostname,lookup);
  let last=null;
  for(const ip of pins.slice(0,3)){
    try{
      const html=await new Promise((resolve,reject)=>{
        let req,finished=false,timer,bytes=0;
        const chunks=[];
        const finish=(error,data)=>{
          if(finished)return;
          finished=true;clearTimeout(timer);
          if(error){req?.destroy();reject(error);}else resolve(data);
        };
        timer=setTimeout(()=>finish(pageError('editorial_web_timeout')),6500);
        timer.unref?.();
        try{
          req=request({
            protocol:'https:',hostname:u.hostname,port:443,path:u.pathname+u.search,
            method:'GET',agent:false,maxHeaderSize:10000,
            lookup:pinnedAddressLookup(ip),
            headers:{Accept:'text/html,application/xhtml+xml','Accept-Encoding':'identity',
              'User-Agent':'RedLibertadEditorial/3.2.23 (admin metadata preview)'}
          },res=>{
            if(Number(res.statusCode)!==200)return finish(pageError('editorial_web_http_error'));
            const mime=String(res.headers['content-type']||'').toLowerCase();
            if(mime&&!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/.test(mime))
              return finish(pageError('editorial_web_not_html'));
            if(Number(res.headers['content-length']||0)>MAX_PAGE_BYTES)
              return finish(pageError('editorial_web_too_large'));
            res.on('data',piece=>{
              bytes+=piece.length;
              if(bytes>MAX_PAGE_BYTES)return finish(pageError('editorial_web_too_large'));
              chunks.push(piece);
            });
            res.on('end',()=>finish(null,Buffer.concat(chunks).toString('utf8')));
            res.on('error',()=>finish(pageError('editorial_web_download_failed')));
            res.on('aborted',()=>finish(pageError('editorial_web_download_failed')));
          });
          req.setTimeout(6500,()=>finish(pageError('editorial_web_timeout')));
          req.on('error',()=>finish(pageError('editorial_web_download_failed')));
          req.end();
        }catch(_){finish(pageError('editorial_web_download_failed'));}
      });
      return extractPageMetadataV3223(html,url);
    }catch(error){
      last=error;
      if(!['editorial_web_timeout','editorial_web_download_failed'].includes(error.code))throw error;
    }
  }
  throw last||pageError('editorial_web_download_failed');
}
function draftFromMetadataV3223(meta){
  const title=plainV3223(meta.source_title,220);
  // The source title remains a reference; a human must write a different
  // editorial headline and >70-character original summary before approval.
  const base=plainV3223(meta.source_excerpt,390);
  return {
    title_suggestion:title,
    summary_suggestion:base||'La página no proporciona una descripción utilizable. Consulta el artículo original y redacta un resumen propio verificando la información.',
    note:'Borrador basado solo en metadatos públicos. Reescribir, contrastar hechos y revisar atribución antes de aprobar.'
  };
}
function fingerprintV3223(category,title){
  return crypto.createHash('sha256').update(category+'|'+normalizedTitle(title)).digest('hex');
}
module.exports={MAX_PAGE_BYTES,articleUrlV3223,decodeEntitiesV3223,plainV3223,attributesV3223,
  extractPageMetadataV3223,fetchWebPageV3223,draftFromMetadataV3223,fingerprintV3223};
