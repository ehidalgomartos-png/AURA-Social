'use strict';

// Fixed, public, read-only SEO diagnostics. Not a Google Search Console API.
// This verifies the HTTP/XML shape, not crawl ranking or actual indexing.
const {version}=require('../package.json');
const {parsePublicOrigin,ORIGIN}=require('./release-gate-v300');
const SITEMAPS=Object.freeze([
  '/sitemap.xml',
  '/sitemap-profiles.xml',
  '/sitemap-hashtags.xml',
  '/sitemap-communities.xml',
  '/sitemap-events.xml',
  '/sitemap-reels.xml',
  '/sitemap-topics.xml',
  '/sitemap-guias.xml'
]);
const CHECKS=Object.freeze(['/sitemap-index.xml',...SITEMAPS]);
const TIMEOUT_MS=8000;

function count(text,regex){return (String(text).match(regex)||[]).length;}
function validSitemapXml(xml,{index=false}={}){
  const body=String(xml);
  if(/<!DOCTYPE|<!ENTITY/i.test(body))return 'forbidden_doctype';
  if(!body.trim().startsWith('<?xml'))return 'missing_xml_declaration';
  const root=index?'sitemapindex':'urlset',child=index?'sitemap':'url';
  const rootOpening=new RegExp('<'+root+'\\b[^>]*xmlns=["\\x27]http://www\\.sitemaps\\.org/schemas/sitemap/0\\.9["\\x27][^>]*>');
  if(!rootOpening.test(body)||!body.includes('</'+root+'>'))return 'invalid_xml_root';
  const opened=count(body,new RegExp('<'+child+'(?:\\s[^>]*)?>','g'));
  const closed=count(body,new RegExp('</'+child+'\\s*>','g'));
  if(opened===0)return 'missing_required_'+child;
  if(opened!==closed)return 'unbalanced_entries';
  const locations=[...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim());
  if(locations.length!==opened)return 'invalid_location_count';
  if(locations.some(loc=>!loc.startsWith(ORIGIN+'/')||/[<>"']/.test(loc)))return 'unexpected_url_origin';
  if(index){
    for(const path of SITEMAPS)if(!locations.includes(ORIGIN+path))return 'sitemap_missing_from_index';
  }
  return null;
}

async function auditSitemaps({origin=ORIGIN,fetchFn=globalThis.fetch,timeoutMs=TIMEOUT_MS}={}){
  const base=parsePublicOrigin(origin);
  const checks=[];
  for(const path of CHECKS){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchFn(base+path,{method:'GET',redirect:'manual',
        headers:{Accept:'application/xml'},signal:controller.signal,cache:'no-store'});
      let reason=null;
      const status=Number(response.status)||0;
      if(status!==200)reason='http_error';
      const contentType=String(response.headers?.get('content-type')||'');
      if(!reason&&!/\b(?:application|text)\/xml\b/i.test(contentType))reason='unexpected_content_type';
      if(!reason)reason=validSitemapXml(await response.text(),{index:path==='/sitemap-index.xml'});
      checks.push({path,status:reason?'failed':'passed',httpStatus:status,reason:reason||null});
    }catch(error){
      checks.push({path,status:'failed',httpStatus:null,
        reason:error?.name==='AbortError'?'timeout':'network_failure'});
    }finally{clearTimeout(timer);}
  }
  return {
    version,origin:base,checkedAt:new Date().toISOString(),
    status:checks.every(c=>c.status==='passed')?'passed':'blocked',
    passed:checks.filter(c=>c.status==='passed').length,total:checks.length,checks,
    searchConsoleVerified:false,indexationVerified:false,coolifyVerified:false
  };
}
async function cli(){
  const origin=process.argv[2];
  if(!origin)throw Error('Use: npm run gate:seo -- https://redlibertad.com');
  const result=await auditSitemaps({origin});
  console.log(JSON.stringify(result,null,2));
  if(result.status==='blocked')process.exitCode=1;
}
if(require.main===module)cli().catch(_=>{
  console.error('No se pudo ejecutar la auditoría: utiliza el dominio HTTPS canónico.');
  process.exitCode=1;
});
module.exports={auditSitemaps,validSitemapXml,SITEMAPS,CHECKS,ORIGIN,TIMEOUT_MS};
