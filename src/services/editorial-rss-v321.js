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
async function resolvePublicIPv4(host,lookup=dns.lookup){
  // Deliberately IPv4-only in V3.2.1; never connect to an unresolved or internal address.
  let timer;
  let addresses;
  try{
    addresses=await Promise.race([
      Promise.resolve().then(()=>lookup(host,{family:4,all:true})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(feedError('feed_timeout')),TIMEOUT_MS);timer.unref?.();})
    ]);
  }catch(error){
    if(error.code==='feed_timeout')throw error;
    throw feedError('feed_network_error');
  }finally{clearTimeout(timer);}
  if(!Array.isArray(addresses)||!addresses.length||
     addresses.some(item=>!publicIPv4(item.address)))throw feedError('feed_network_blocked');
  return addresses[0].address;
}

function fetchXml(feedUrl,{lookup=dns.lookup,request=https.request}={}){
  const urlText=validateFeedUrl(feedUrl);
  if(!urlText)return Promise.reject(feedError('feed_url_rejected'));
  const url=new URL(urlText);
  return resolvePublicIPv4(url.hostname,lookup).then(ip=>new Promise((resolve,reject)=>{
    let settled=false;
    let overallTimer;
    const done=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(overallTimer);
      if(error)reject(error);else resolve(value);
    };
    const req=request({
      protocol:'https:',hostname:url.hostname,port:443,path:url.pathname+url.search,
      method:'GET',agent:false,maxHeaderSize:12000,
      lookup:(_name,_opts,callback)=>callback(null,ip,4),
      headers:{
        Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'Accept-Encoding':'identity',
        'User-Agent':'RedLibertadEditorial/3.2.1 (RSS review only)'
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
      res.on('error',()=>done(feedError('feed_network_error')));
      res.on('aborted',()=>done(feedError('feed_network_error')));
    });
    overallTimer=setTimeout(()=>req.destroy(feedError('feed_timeout')),TIMEOUT_MS);
    overallTimer.unref?.();
    req.setTimeout(TIMEOUT_MS,()=>req.destroy(feedError('feed_timeout')));
    req.on('error',error=>done(
      ['feed_timeout','feed_too_large','feed_redirect_blocked'].includes(error.code)?error:feedError('feed_network_error')
    ));
    req.end();
  }));
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

module.exports={publicIPv4,resolvePublicIPv4,fetchXml,parseFeed,canonicalArticleUrl,normalizedTitle,MAX_ITEMS,MAX_XML_BYTES};
