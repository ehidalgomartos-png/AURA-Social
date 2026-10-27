'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const checker=require('../scripts/verify-production-deploy-v32101');
const sha='167ee327abb683d146cecf49a61e4cc249b00577';
function fakeFetch(values, calls){
 return async(url,init)=>{
  calls.push({url,init});
  const route=new URL(url).pathname;
  const val=values[route];
  if(val instanceof Error)throw val;
  if(typeof val==='number')return {ok:false,status:val};
  return {ok:true,json:async()=>val};
 };
}
function responseValues(commit=sha){
 return {
  '/api/health':{ok:true,version:'3.2.77',deployedCommit:commit},
  '/api/public-config':{version:'3.2.77',deployedCommit:commit},
  '/api/ready':{ok:true,database:'ready',version:'3.2.77'}
 };
}
test('matches exact deployed commit and checks HTTP, config and database readiness',async()=>{
 const calls=[];
 const result=await checker.verifyOnce(sha,{fetcher:fakeFetch(responseValues(),calls)});
 assert.deepEqual(result,{ok:true,observedCommit:sha,legacyVersion:'3.2.77'});
 assert.deepEqual(calls.map(x=>new URL(x.url).pathname),
  ['/api/health','/api/public-config','/api/ready']);
 for(const call of calls){
  assert.equal(new URL(call.url).origin,'https://redlibertad.com');
  assert.equal(call.init.method,'GET');
  assert.equal(call.init.redirect,'error');
  assert.equal(call.init.headers.Accept,'application/json');
 }
});
test('rejects missing, unknown or outdated commit before claiming success',async()=>{
 const cases=[
  [null,'commit_unavailable'],
  ['abcdef0123456789abcdef0123456789abcdef01','commit_mismatch'],
  ['main','commit_unavailable']
 ];
 for(const [commit,reason] of cases){
  const calls=[];
  const result=await checker.verifyOnce(sha,{fetcher:fakeFetch(responseValues(commit),calls)});
  assert.equal(result.ok,false);assert.equal(result.reason,reason);
  assert.equal(calls.length,1);
 }
 const invalid=await checker.verifyOnce('not-a-sha',{fetcher:async()=>{throw Error('must not fetch');}});
 assert.deepEqual(invalid,{ok:false,reason:'invalid_expected_commit'});
});
test('never treats missing DNS, 5xx or invalid JSON as a verified deployment',async()=>{
 const unreachable=await checker.verifyOnce(sha,{fetcher:fakeFetch({'/api/health':new Error('offline')},[])});
 assert.deepEqual(unreachable,{ok:false,reason:'health_network_unavailable'});
 const error=await checker.verifyOnce(sha,{fetcher:fakeFetch({'/api/health':503},[])});
 assert.deepEqual(error,{ok:false,reason:'health_http_error'});
 const malformed=await checker.verifyOnce(sha,{fetcher:fakeFetch({'/api/health':null},[])});
 assert.deepEqual(malformed,{ok:false,reason:'health_invalid_json'});
});
test('rejects inconsistency between public endpoints or unavailable database',async()=>{
 const inconsistent=responseValues();
 inconsistent['/api/public-config'].deployedCommit='a'.repeat(40);
 assert.equal((await checker.verifyOnce(sha,{fetcher:fakeFetch(inconsistent,[])})).reason,'commit_inconsistent');
 const dbDown=responseValues();
 dbDown['/api/ready']={ok:false,database:'unavailable'};
 assert.equal((await checker.verifyOnce(sha,{fetcher:fakeFetch(dbDown,[])})).reason,'application_not_ready');
 const db503=responseValues();db503['/api/ready']=503;
 assert.equal((await checker.verifyOnce(sha,{fetcher:fakeFetch(db503,[])})).reason,'readiness_http_error');
});
test('the checker performs no writes, Stripe API calls, or requests to other hosts',()=>{
 const source=fs.readFileSync('scripts/verify-production-deploy-v32101.js','utf8');
 assert.match(source,/const ORIGIN='https:\/\/redlibertad\.com'/);
 for(const forbidden of ['method:\x27POST\x27','api.stripe.com','/checkout','/portal',
  'INSERT INTO','DELETE FROM','UPDATE marketplace_','process.env.STRIPE_TEST_SECRET_KEY'])
  assert.equal(source.includes(forbidden),false,forbidden);
});
