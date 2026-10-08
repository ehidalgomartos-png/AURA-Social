'use strict';

// External *read-only* acceptance tests. Never send cookies or modify data.
// Run after Coolify deployment: npm run gate:public -- https://redlibertad.com
const {version:packageVersion}=require('../package.json');
const ORIGIN='https://redlibertad.com';
const TIMEOUT_MS=8000;

const CHECKS=Object.freeze([
  {key:'health',path:'/api/health',status:200,kind:'health'},
  {key:'database',path:'/api/ready',status:200,kind:'ready'},
  {key:'app',path:'/app',status:200,kind:'html'},
  {key:'robots',path:'/robots.txt',status:200,kind:'robots'},
  {key:'sitemaps',path:'/sitemap-index.xml',status:200,kind:'sitemap-index'},
  {key:'guide_sitemap',path:'/sitemap-guias.xml',status:200,kind:'guide-sitemap'},
  {key:'guide_hub',path:'/guias',status:200,kind:'guides'},
  {key:'guide_detail',path:'/guias/como-empezar',status:200,kind:'guide-detail'},
  {key:'manifest',path:'/manifest.webmanifest',status:200,kind:'manifest'},
  {key:'service_worker',path:'/sw.js',status:200,kind:'worker'},
  {key:'private_account',path:'/api/auth/account',status:401,kind:'denied'},
  {key:'private_legal_export',path:'/api/auth/account/legal-consent/receipt',status:401,kind:'denied'},
  {key:'private_growth',path:'/api/admin/growth-center',status:401,kind:'denied'},
  {key:'private_retention',path:'/api/growth/retention/communities',status:401,kind:'denied'}
]);

function parsePublicOrigin(input){
  const v=new URL(String(input||''));
  if(v.protocol!=='https:'||v.hostname!=='redlibertad.com'||v.port||
     v.username||v.password||v.pathname!=='/'||v.search||v.hash){
    throw new TypeError('Only the canonical HTTPS origin https://redlibertad.com is supported.');
  }
  return ORIGIN;
}
function validatePublicBody(kind,content,version,origin=ORIGIN){
  if(kind==='health'||kind==='ready'){
    let v;
    try{v=JSON.parse(content);}catch(_){return 'invalid_json';}
    if(!v||v.ok!==true)return 'unhealthy';
    if(v.version!==version)return 'wrong_version';
    if(kind==='health'&&v.configuration?.criticalReady!==true)return 'configuration_incomplete';
    if(kind==='ready'&&v.database!=='ready')return 'database_unavailable';
    return null;
  }
  if(kind==='robots'){
    return content.includes('Disallow: /api/')&&content.includes('Disallow: /uploads/')&&
      content.includes(origin+'/sitemap-index.xml')&&content.includes(origin+'/sitemap-guias.xml')?null:'unexpected_robots';
  }
  if(kind==='sitemap-index'){
    return content.includes(origin+'/sitemap-guias.xml')&&content.includes('<sitemapindex')?null:'missing_guide_sitemap';
  }
  if(kind==='guide-sitemap'){
    return content.includes('<urlset')&&content.includes(origin+'/guias/como-empezar')?null:'missing_guide_urls';
  }
  if(kind==='guides'||kind==='guide-detail'){
    const path=kind==='guides'?'/guias':'/guias/como-empezar';
    return content.includes('<html lang="es">')&&
      content.includes('<link rel="canonical" href="'+origin+path+'">')&&
      !/<meta\s+name="robots"\s+content="noindex/i.test(content)?null:'unexpected_guide_html';
  }
  if(kind==='manifest'){
    try{const data=JSON.parse(content);return data.name||data.short_name?null:'invalid_manifest';}
    catch(_){return 'invalid_manifest';}
  }
  if(kind==='worker')return content.includes('self.')||content.includes('addEventListener')?null:'invalid_worker';
  if(kind==='html')return content.toLowerCase().includes('<!doctype html')?null:'unexpected_html';
  if(kind==='denied'){
    try{const data=JSON.parse(content);return data.error==='authentication_required'?null:'not_authentication_denied';}
    catch(_){return 'not_authentication_denied';}
  }
  return 'unknown_check';
}

async function verifyPublicRelease({
  origin=ORIGIN,fetchFn=globalThis.fetch,version=packageVersion,
  timeoutMs=TIMEOUT_MS
}={}){
  const base=parsePublicOrigin(origin);
  if(typeof fetchFn!=='function')throw new TypeError('Fetch required');
  const results=[];
  for(const item of CHECKS){
    const started=Date.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchFn(base+item.path,{
        method:'GET',redirect:'manual',signal:controller.signal,
        headers:{Accept:item.kind==='health'||item.kind==='ready'||item.kind==='denied'?'application/json':'*/*'},
        cache:'no-store'
      });
      const status=Number(response.status)||0;
      let reason=status===item.status?null:'unexpected_http_status';
      if(!reason){
        const body=await response.text();
        reason=validatePublicBody(item.kind,body,version,base);
      }
      results.push({key:item.key,status:reason?'failed':'passed',httpStatus:status,
        reason:reason||null,elapsedMs:Date.now()-started});
    }catch(e){
      results.push({key:item.key,status:'failed',httpStatus:null,
        reason:e?.name==='AbortError'?'timeout':'network_failure',
        elapsedMs:Date.now()-started});
    }finally{clearTimeout(timer);}
  }
  const pass=results.every(c=>c.status==='passed');
  return {
    version,origin:base,checkedAt:new Date().toISOString(),
    status:pass?'passed':'blocked',
    total:results.length,passed:results.filter(c=>c.status==='passed').length,checks:results,
    externalHttpVerified:pass,coolifyVerified:false,
    backupRestorationVerified:false,authenticatedSocialJourneysVerified:false,
    releaseApproved:false
  };
}
async function cli(args=process.argv.slice(2)){
  const origin=args[0];
  if(!origin)throw Error('Usage: npm run gate:public -- https://redlibertad.com');
  const result=await verifyPublicRelease({origin});
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='passed')process.exitCode=1;
}
if(require.main===module)cli().catch(_=>{
  console.error('Release check could not run; use the canonical HTTPS origin.');
  process.exitCode=1;
});
module.exports={verifyPublicRelease,parsePublicOrigin,validatePublicBody,CHECKS,TIMEOUT_MS,ORIGIN};
