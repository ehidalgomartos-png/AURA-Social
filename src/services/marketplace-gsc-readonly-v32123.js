'use strict';
// V3.2.123 — manual, admin-triggered Google Search Console URL Inspection.
// Never request live URL indexing, submit sitemaps, crawl arbitrary targets or
// mutate any listings. Disabled unless explicitly configured in Coolify.
const crypto=require('node:crypto');
const ORIGIN='https://redlibertad.com';
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const INSPECTION_URL='https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const PROPERTY_OPTIONS=Object.freeze([
 'sc-domain:redlibertad.com','https://redlibertad.com/'
]);
const PUBLIC_LISTING_SQL="SELECT l.id,l.title FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true LIMIT 1";
const MAX_TEXT=180;
class GscError extends Error{
 constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
function serviceConfig(env=process.env){
 const enabled=env.GSC_READONLY_ENABLED==='true';
 const email=String(env.GSC_SERVICE_ACCOUNT_EMAIL||'').trim();
 const privateKey=String(env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n').trim();
 const siteUrl=String(env.GSC_SITE_URL||'').trim();
 const validEmail=/^[^\s@]+@[a-z0-9][a-z0-9-]*\.iam\.gserviceaccount\.com$/i.test(email);
 const validKey=privateKey.startsWith('-----BEGIN PRIVATE KEY-----')&&privateKey.endsWith('-----END PRIVATE KEY-----');
 const validSite=PROPERTY_OPTIONS.includes(siteUrl);
 const configured=enabled&&validEmail&&validKey&&validSite;
 return {enabled,configured,email,privateKey,siteUrl};
}
function status(env=process.env){
 const c=serviceConfig(env);
 return {
  mode:'google_search_console_readonly',enabled:c.enabled,configured:c.configured,
  state:!c.enabled?'disabled':c.configured?'ready':'needs_configuration',
  property:c.configured?c.siteUrl:null,
  note:!c.enabled
   ?'Conexión con Google desactivada: sin peticiones ni datos de indexación.'
   :c.configured
    ?'Conexión configurada. Los datos reales solo se consultan pulsando Inspeccionar; se requiere acceso de la cuenta de servicio a la propiedad en Google.'
    :'Completa la cuenta de servicio y la propiedad verificada en Coolify. Nunca pegues la clave privada en un chat o formulario público.'
 };
}
function safeListingId(value){
 return typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value);
}
function short(value,limit=MAX_TEXT){
 return typeof value==='string'?value.trim().slice(0,limit):'';
}
function sanitizeInspection(raw,url){
 const result=raw?.inspectionResult?.indexStatusResult;
 if(!result||typeof result!=='object'||Array.isArray(result))throw new GscError('gsc_invalid_response');
 const statuses=new Set(['PASS','FAIL','NEUTRAL','PARTIAL','VERDICT_UNSPECIFIED']);
 const verdict=statuses.has(result.verdict)?result.verdict:'VERDICT_UNSPECIFIED';
 const timestamp=short(result.lastCrawlTime,40);
 return {
  source:'google_search_console_url_inspection',inspectionUrl:url,checkedAt:new Date().toISOString(),
  verdict,coverageState:short(result.coverageState),
  indexingState:short(result.indexingState,55),
  pageFetchState:short(result.pageFetchState,55),
  robotsTxtState:short(result.robotsTxtState,55),
  lastCrawlTime:!Number.isNaN(Date.parse(timestamp))?timestamp:null,
  googleCanonical:short(result.googleCanonical,500)||null,
  userCanonical:short(result.userCanonical,500)||null,
  sitemaps:Array.isArray(result.sitemap)?result.sitemap.slice(0,5).map(v=>short(v,500)).filter(Boolean):[],
  note:'Resultado de la versión guardada por Google en Search Console. No es una prueba de la página publicada en tiempo real, ni una solicitud de indexación.'
 };
}
function base64url(value){return Buffer.from(value).toString('base64url');}
function assertion(config,epoch=Math.floor(Date.now()/1000)){
 const claims={
  iss:config.email,scope:SCOPE,aud:TOKEN_URL,iat:epoch,exp:epoch+900
 };
 const head=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const payload=base64url(JSON.stringify(claims));
 const signingInput=head+'.'+payload;
 let signature;
 try{
  signature=crypto.sign('RSA-SHA256',Buffer.from(signingInput),config.privateKey);
 }catch(_){throw new GscError('gsc_invalid_service_account_key',503);}
 return signingInput+'.'+signature.toString('base64url');
}
async function jsonRequest(url,options,request=globalThis.fetch){
 let response;
 try{
  response=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
 }catch(_){throw new GscError('gsc_network_unavailable',503);}
 if(response?.status===429)throw new GscError('gsc_quota_exceeded',429);
 if(response?.status===401||response?.status===403)throw new GscError('gsc_access_denied',502);
 if(!response?.ok)throw new GscError('gsc_remote_error',502);
 let payload;
 try{payload=await response.json();}catch(_){throw new GscError('gsc_invalid_response',502);}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new GscError('gsc_invalid_response',502);
 return payload;
}
async function inspect({id,row,config=serviceConfig(),request=globalThis.fetch,listingPath}={}){
 if(!config.configured)throw new GscError('gsc_not_configured',503);
 if(!safeListingId(String(id))||!row||String(row.id)!==String(id)||typeof listingPath!=='function')
  throw new GscError('gsc_invalid_public_listing',400);
 // The target is built on the server from a PUBLIC listing, never from
 // client-supplied URLs, site property, path, filename or Google response.
 const path=listingPath(row);
 if(!/^\/marketplace\/p\/[1-9][0-9]{0,15}\/[a-z0-9-]+$/.test(path))
  throw new GscError('gsc_invalid_public_listing',400);
 const url=ORIGIN+path;
 const credentials=await jsonRequest(TOKEN_URL,{
  method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
   assertion:assertion(config)
  }).toString()
 },request);
 const token=credentials.access_token;
 if(typeof token!=='string'||token.length<10||token.length>8192)
  throw new GscError('gsc_invalid_token_response',502);
 const inspected=await jsonRequest(INSPECTION_URL,{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
  body:JSON.stringify({inspectionUrl:url,siteUrl:config.siteUrl,languageCode:'es-ES'})
 },request);
 return sanitizeInspection(inspected,url);
}
module.exports={
 ORIGIN,SCOPE,TOKEN_URL,INSPECTION_URL,PROPERTY_OPTIONS,PUBLIC_LISTING_SQL,
 GscError,serviceConfig,status,safeListingId,sanitizeInspection,assertion,inspect
};
