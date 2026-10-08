'use strict';
// Read-only public smoke check, to run AFTER the Coolify deployment.
// Usage: npm run smoke:production -- https://redlibertad.com
const {version}=require('../package.json');

async function run(url){
  if(!url)throw Error('Usage: node scripts/smoke-http.js https://your-domain');
  const base=new URL(url);
  if(!['https:','http:'].includes(base.protocol))throw Error('HTTP(S) origin required');
  if(base.protocol!=='https:' && !['localhost','127.0.0.1'].includes(base.hostname))
    throw Error('Public domain must use HTTPS');
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/')
    throw Error('Provide only a clean origin URL, without credentials or paths');
  const origin=base.origin;
  const checks=[
    {path:'/api/health',status:200,label:'Process health',json:true,verify:data=>data.version===version},
    {path:'/api/ready',status:200,label:'Database readiness',json:true,verify:data=>data.ok===true && data.database==='ready'},
    {path:'/app',status:200,label:'Signed-in page shell'},
    {path:'/robots.txt',status:200,label:'SEO robots'},
    {path:'/sitemap.xml',status:200,label:'SEO sitemap'},
    {path:'/api/auth/account',status:401,label:'Unauthenticated account denial'},
    {path:'/api/auth/account/legal-consent/receipt',status:401,label:'Unauthenticated legal export denial'}
  ];
  let failures=0;
  for(const item of checks){
    try{
      const response=await fetch(origin+item.path,{
        method:'GET',redirect:'manual',
        headers:{Accept:item.json?'application/json':'*/*'},
        signal:AbortSignal.timeout(8000)
      });
      let data={};
      if(item.json && response.ok){
        try{data=await response.json();}catch(_){data={};}
      }
      const valid=response.status===item.status && (!item.verify || item.verify(data));
      if(!valid)failures++;
      console.log((valid?'PASS':'FAIL')+' '+item.label+' ('+item.path+') HTTP '+response.status+
        (item.path==='/api/health'?' · '+String(data.version||'unknown'):''));
    }catch(error){
      failures++;
      console.error('FAIL '+item.label+' ('+item.path+'): '+(error.name||'network error'));
    }
  }
  console.log((failures?'Smoke checks failed: '+failures:'Smoke checks passed: '+checks.length));
  if(failures)process.exitCode=1;
}

if(require.main===module)run(process.argv[2]).catch(error=>{
  console.error(error.message);process.exitCode=1;
});
module.exports={run};
