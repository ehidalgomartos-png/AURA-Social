'use strict';

// Manual, admin-only RSS/Atom discovery. Never touches posts, users, or uploads.
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');
const crypto=require('node:crypto');
const {XMLParser}=require('fast-xml-parser');
const {validateFeedUrl}=require('./editorial-v320');

const MAX_XML_BYTES=768*1024;
const MAX_ITEMS=20;
const TIMEOUT_MS=8500;
const parser=new XMLParser({
  ignoreAttributes:false,
  attributeNamePrefix:'@_',
  textNodeName:'#text',
  removeNSPrefix:true,
  parseTagValue:false,
  parseAttributeValue:false,
  processEntities:false,
  trimValues:true
});

function publicIPv4(address){
  if(net.isIP(address)!==4)return false;
  const [a,b,c]=address.split('.').map(Number);
  if([0,10,127].includes(a)||a>=224)return false;
  if(a===100&&b>=64&&b<=127)return false;
  if(a===169&&b===254)return false;
  if(a===172&&b>=16&&b<=31)return false;
  if(a===192&&(b===168||b===0||b===88&&c===99))return false;
  if(a===198&&(b===18||b===19||b===51&&c===100))return false;
  if(a===203&&b===0&&c===113)return false;
  return true;
}

function feedError(code){
  const error=new Error(code);
  error.code=code;
  return error;
}
function networkError(error,fallback='feed_connect_error'){
  if(error&&typeof error.code==='string'&&/^feed_/.test(error.code))return error;
  const code=String(error?.code||'');
  if(['ENOTFOUND','EAI_AGAIN','EAI_FAIL','ENODATA'].includes(code))return feedError('feed_dns_error');
  if(/(?:CERT|TLS|SSL|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|EPROTO)/i.test(code))return feedError('feed_tls_error');
  return feedError(fallback);
}
function publicIPv6(address){
  if(net.isIP(address)!==6||address.includes('%')||address.toLowerCase().includes('.'))return false;
  const lower=address.toLowerCase();
  const first=parseInt(lower.split(':')[0],16);
  // Only IPv6 global unicast (2000::/3); no loopback, private, mapped,
  // IPv4 tunnels, documentation, deprecated/special-purpose 2001:0::/23.
  if(!Number.isInteger(first)||first<0x2000||first>0x3fff)return false;
  if(first===0x2002)return false;
  if(first===0x2001){
    const second=parseInt(lower.split(':')[1]||'0',16);
    if(second<0x0200||second===0x0db8)return false;
  }
  return true;
}
function publicAddress(item){
  if(!item||typeof item.address!=='string')return false;
  if(item.family===4)return publicIPv4(item.address);
  if(item.family===6)return publicIPv6(item.address);
  return false;
}
async function resolvePublicAddresses(host,lookup=dns.lookup){
  let timer;
  let addresses;
  try{
    addresses=await Promise.race([
      Promise.resolve().then(()=>lookup(host,{all:true,verbatim:true})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(feedError('feed_timeout')),TIMEOUT_MS);timer.unref?.();})
    ]);
  }catch(error){throw networkError(error,'feed_dns_error');}
  finally{clearTimeout(timer);}
  // Reject mixed public/private DNS answers, not just the selected address.
  if(!Array.isArray(addresses)||addresses.length===0)throw feedError('feed_dns_error');
  // Always derive the family from the literal address and reject mismatches.
  const resolved=addresses.map(item=>{
    const inferred=net.isIP(item?.address||'');
    if(!inferred||item.family&&item.family!==inferred)return null;
    return {address:item.address,family:inferred};
  });
  if(resolved.some(item=>!publicAddress(item)))throw feedError('feed_network_blocked');
  // One address per network family first; a second IPv4 fallback for CDNs.
  const ipv4=resolved.filter(a=>a.family===4);
  const ipv6=resolved.filter(a=>a.family===6);
  return [ipv4[0],ipv6[0],ipv4[1],ipv6[1]].filter(Boolean);
}
async function resolvePublicIPv4(host,lookup=dns.lookup){
  let timer,addresses;
  try{
    addresses=await Promise.race([
      Promise.resolve().then(()=>lookup(host,{family:4,all:true})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(feedError('feed_timeout')),TIMEOUT_MS);timer.unref?.();})
    ]);
  }catch(error){throw networkError(error,'feed_dns_error');}
  finally{clearTimeout(timer);}
  if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!publicIPv4(a.address))){
    throw feedError('feed_network_blocked');
  }
  return addresses[0].address;
}
function fetchOne(url,ip,request,timeoutMs){
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const done=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(error)reject(error);else resolve(value);
    };
    let req;
    try{
      req=request({
        protocol:'https:',hostname:url.hostname,port:443,path:url.pathname+url.search,
        method:'GET',agent:false,maxHeaderSize:12000,
        // TLS/SNI and certificate validation use the actual URL hostname.
        // Only the TCP destination is pinned to a validated public address.
        lookup:(_name,_opts,callback)=>callback(null,ip.address,ip.family),
        headers:{
          Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml',
          'Accept-Encoding':'identity',
          'User-Agent':'RedLibertadEditorial/3.2.7.1 (manual RSS review)'
        }
      },res=>{
        const status=Number(res.statusCode||0);
        if(status>=300&&status<400){res.destroy();return done(feedError('feed_redirect_blocked'));}
        if(status!==200){res.destroy();return done(feedError('feed_http_error'));}
        const type=String(res.headers['content-type']||'').toLowerCase();
        if(type&&!/(?:xml|rss|atom)/.test(type)){res.destroy();return done(feedError('feed_not_xml'));}
        const length=Number(res.headers['content-length']||0);
        if(length>MAX_XML_BYTES){res.destroy();return done(feedError('feed_too_large'));}
        let size=0;
        const chunks=[];
        res.on('data',chunk=>{
          size+=chunk.length;
          if(size>MAX_XML_BYTES){res.destroy();done(feedError('feed_too_large'));return;}
          chunks.push(chunk);
        });
        res.on('end',()=>done(null,Buffer.concat(chunks).toString('utf8')));
        res.on('error',()=>done(feedError('feed_response_error')));
        res.on('aborted',()=>done(feedError('feed_response_error')));
      });
      timer=setTimeout(()=>req.destroy(feedError('feed_timeout')),timeoutMs);
      timer.unref?.();
      req.setTimeout(timeoutMs,()=>req.destroy(feedError('feed_timeout')));
      req.on('error',error=>done(networkError(error)));
      req.end();
    }catch(error){done(networkError(error));}
  });
}
async function fetchXml(feedUrl,{lookup=dns.lookup,request=https.request}={}){
  const urlText=validateFeedUrl(feedUrl);
  if(!urlText)throw feedError('feed_url_rejected');
  const url=new URL(urlText);
  const addresses=await resolvePublicAddresses(url.hostname,lookup);
  const deadline=Date.now()+14000;
  let error=null;
  for(const ip of addresses){
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    try{return await fetchOne(url,ip,request,Math.min(5500,remaining));}
    catch(e){
      error=e;
      if(!['feed_connect_error','feed_tls_error','feed_timeout'].includes(e.code))throw e;
    }
  }
  throw error||feedError('feed_timeout');
}

function decodeBasicEntities(value){
  return String(value||'').replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/gi,(m,entity)=>{
    const key=entity.toLowerCase();
    const basics={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    if(Object.prototype.hasOwnProperty.call(basics,key))return basics[key];
    let n=key.startsWith('#x')?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isInteger(n)&&n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
  });
}
function textOf(value){
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(value&&typeof value==='object')return textOf(value['#text']||value.__cdata||'');
  return '';
}
function plainText(value,max=500){
  return decodeBasicEntities(textOf(value))
    .replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,max);
}
function normalizedTitle(title){
  return String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function canonicalArticleUrl(raw){
  const value=decodeBasicEntities(String(raw||'')).trim();
  if(value.length>2048)return null;
  try{
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.'))return null;
    if(net.isIP(u.hostname)||/[\s\\]/.test(value))return null;
    u.hash='';
    for(const key of [...u.searchParams.keys()]){
      if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid'].includes(key.toLowerCase()))u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');
    return u.href.slice(0,2048);
  }catch(_){return null;}
}
function pickAtomLink(link){
  for(const item of Array.isArray(link)?link:[link]){
    if(typeof item==='string'&&item)return item;
    if(item&&typeof item==='object'&&(!item['@_rel']||item['@_rel']==='alternate'))return item['@_href']||'';
  }
  return '';
}
function asArray(value){return Array.isArray(value)?value:value==null?[]:[value];}
function parseFeed(xml,{category,profileId=null,sourceId=null,now=new Date()}={}){
  if(typeof xml!=='string'||Buffer.byteLength(xml)>MAX_XML_BYTES||/<\s*!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)){
    throw feedError('feed_xml_rejected');
  }
  let document;
  try{document=parser.parse(xml);}catch(_){throw feedError('feed_parse_failed');}
  let entries,type;
  if(document.rss?.channel){entries=asArray(document.rss.channel.item);type='rss';}
  else if(document.feed){entries=asArray(document.feed.entry);type='atom';}
  else if(document.RDF){entries=asArray(document.RDF.item);type='rss';}
  else throw feedError('feed_parse_failed');
  const candidates=[];
  const seen=new Set();
  const cutoff=now.getTime()-30*24*3600*1000;
  for(const entry of entries.slice(0,100)){
    if(!entry||typeof entry!=='object')continue;
    const title=plainText(entry.title,240);
    const link=canonicalArticleUrl(type==='atom'?pickAtomLink(entry.link):textOf(entry.link));
    if(title.length<8||!link)continue;
    const key=normalizedTitle(title);
    if(key.length<10||seen.has(key))continue;
    const rawDate=plainText(entry.pubDate||entry.published||entry.updated||entry.date,100);
    const epoch=rawDate?Date.parse(rawDate):NaN;
    if(Number.isFinite(epoch)&&(epoch<cutoff||epoch>now.getTime()+24*3600*1000))continue;
    seen.add(key);
    candidates.push({
      source_id:sourceId,profile_id:profileId,category,
      source_title:title,source_excerpt:plainText(entry.description||entry.summary||entry.content,400),
      canonical_url:link,title_fingerprint:crypto.createHash('sha256').update(category+'|'+key).digest('hex'),
      published_at:Number.isFinite(epoch)?new Date(epoch).toISOString():null
    });
    if(candidates.length>=MAX_ITEMS)break;
  }
  return candidates;
}

module.exports={publicIPv4,publicIPv6,resolvePublicIPv4,resolvePublicAddresses,fetchXml,parseFeed,canonicalArticleUrl,normalizedTitle,MAX_ITEMS,MAX_XML_BYTES};
