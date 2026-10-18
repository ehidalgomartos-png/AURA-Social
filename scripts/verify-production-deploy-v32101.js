'use strict';
// V3.2.101: read-only, fixed-host production verification. Never deploys or charges.
const ORIGIN='https://redlibertad.com';
const SHA=/^[a-f0-9]{40}$/i;
async function getPublicJson(path,{fetcher=fetch}={}){
 const url=ORIGIN+path;
 let response;
 try{
  response=await fetcher(url,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(8000),
   headers:{Accept:'application/json','Cache-Control':'no-cache'}});
 }catch(_){return {ok:false,reason:'network_unavailable'};}
 if(!response||response.ok!==true)return {ok:false,reason:'http_error'};
 try{
  const value=await response.json();
  if(!value||typeof value!=='object'||Array.isArray(value))
   return {ok:false,reason:'invalid_json'};
  return {ok:true,value};
 }catch(_){return {ok:false,reason:'invalid_json'};}
}
async function verifyOnce(expectedCommit,{fetcher=fetch}={}){
 if(typeof expectedCommit!=='string'||!SHA.test(expectedCommit))
  return {ok:false,reason:'invalid_expected_commit'};
 const expected=expectedCommit.toLowerCase();
 const health=await getPublicJson('/api/health',{fetcher});
 if(!health.ok)return {ok:false,reason:'health_'+health.reason};
 if(health.value.ok!==true)return {ok:false,reason:'health_not_ok'};
 const observed=typeof health.value.deployedCommit==='string'
  &&SHA.test(health.value.deployedCommit)?health.value.deployedCommit.toLowerCase():null;
 if(observed===null)return {ok:false,reason:'commit_unavailable'};
 if(observed!==expected)return {ok:false,reason:'commit_mismatch',observedCommit:observed};
 const publicConfig=await getPublicJson('/api/public-config',{fetcher});
 if(!publicConfig.ok)return {ok:false,reason:'public_config_'+publicConfig.reason};
 if(publicConfig.value.deployedCommit!==observed)
  return {ok:false,reason:'commit_inconsistent'};
 const readiness=await getPublicJson('/api/ready',{fetcher});
 if(!readiness.ok)return {ok:false,reason:'readiness_'+readiness.reason};
 if(readiness.value.ok!==true||readiness.value.database!=='ready')
  return {ok:false,reason:'application_not_ready'};
 return {ok:true,observedCommit:observed,legacyVersion:health.value.version||null};
}
async function main(){
 const expected=String(process.env.EXPECTED_COMMIT||'').trim();
 if(!SHA.test(expected)){
  console.error('Cannot verify deployment: invalid expected Git SHA.');
  process.exitCode=1;return;
 }
 const retries=10;
 for(let attempt=1;attempt<=retries;attempt++){
  const result=await verifyOnce(expected);
  if(result.ok){
   console.log('PRODUCTION VERIFIED: public health, config and database readiness agree.');
   console.log('Expected commit: '+expected.toLowerCase());
   console.log('Deployed commit: '+result.observedCommit);
   return;
  }
  console.log('Production verification attempt '+attempt+'/'+retries+': '+result.reason+
   (result.observedCommit?' (observed '+result.observedCommit+')':''));
  if(attempt!==retries)await new Promise(resolve=>setTimeout(resolve,15000));
 }
 console.error('DEPLOYMENT NOT VERIFIED. Check Coolify deployment logs and SOURCE_COMMIT. No production changes were made.');
 process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Verification failed unexpectedly.');process.exitCode=1;});
module.exports={ORIGIN,getPublicJson,verifyOnce};