'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createReleaseVerifier,CHECKS,validatePort,CACHE_MS}=require('../src/services/release-verifier-v217');
const root=path.resolve(__dirname,'..');

function response(status=200,body={}){
  return {ok:status>=200&&status<300,status,
    json:async()=>body};
}
function harness({statuses={},version='2.17.0',fetcher=null,timeoutMs=100}={}){
  const calls=[];
  let timestamp=Date.UTC(2026,9,8,16,0,0);
  const fetchFn=async(url,opts)=>{
    calls.push({url,opts});
    if(fetcher)return fetcher(url,opts);
    const pathname=new URL(url).pathname;
    if(pathname==='/api/health')return response(200,{ok:true,version});
    if(pathname==='/api/ready')return response(200,{ok:true,database:'ready',version});
    return response(statuses[pathname]??200);
  };
  const verifier=createReleaseVerifier({port:3000,version:'2.17.0',
    fetchFn,now:()=>timestamp,timeoutMs});
  return {verifier,calls,advance:ms=>{timestamp+=ms;}};
}

test('only seven fixed, read-only internal routes are checked',async()=>{
  const h=harness();
  const result=await h.verifier.snapshot();
  assert.equal(result.checks.length,7);
  assert.equal(h.calls.length,7);
  assert.deepEqual(h.calls.map(x=>new URL(x.url).pathname),CHECKS.map(x=>x.path));
  for(const call of h.calls){
    assert.equal(new URL(call.url).hostname,'127.0.0.1');
    assert.equal(new URL(call.url).port,'3000');
    assert.ok(['HEAD','GET'].includes(call.opts.method));
    assert.equal(call.opts.redirect,'manual');
    assert.ok(call.opts.signal);
  }
});
test('healthy health, PostgreSQL, public SEO and PWA produce OK',async()=>{
  const report=await harness().verifier.snapshot();
  assert.equal(report.level,'ok');
  assert.equal(report.passed,7);
  assert.equal(report.total,7);
  assert.equal(report.expectedVersion,'2.17.0');
  assert.equal(report.scope,'local_instance');
  assert.equal(report.externalProductionVerified,false);
  assert.equal(report.changesMade,false);
});
test('mismatched version is critical even when HTTP is 200',async()=>{
  const result=await harness({version:'2.16.0'}).verifier.snapshot();
  assert.equal(result.level,'critical');
  assert.equal(result.checks[0].status,'critical');
  assert.equal(result.checks[0].reason,'wrong_version');
});
test('unready PostgreSQL is critical and does not leak DB credentials',async()=>{
  const h=harness({fetcher:async(url)=>{
    if(url.endsWith('/api/health'))return response(200,{ok:true,version:'2.17.0'});
    if(url.endsWith('/api/ready'))return response(503,{ok:false,version:'2.17.0',database:'unavailable',detail:'password=hidden'});
    return response();
  }});
  const result=await h.verifier.snapshot();
  assert.equal(result.level,'critical');
  assert.equal(result.checks.find(x=>x.key==='ready').status,'critical');
  assert.ok(!JSON.stringify(result).includes('password=hidden'));
});
test('SEO and PWA failures warn without masking application health',async()=>{
  const report=await harness({statuses:{'/robots.txt':404,'/sw.js':503}}).verifier.snapshot();
  assert.equal(report.level,'warning');
  assert.equal(report.passed,5);
  assert.equal(report.checks.find(c=>c.key==='robots').httpStatus,404);
  assert.equal(report.checks.find(c=>c.key==='worker').httpStatus,503);
});
test('unreachable check returns safe category without logging exception',async()=>{
  const h=harness({fetcher:async()=>{throw Error('internal 127.0.0.1:3000 secret=ABC');}});
  const result=await h.verifier.snapshot();
  assert.equal(result.level,'critical');
  assert.equal(result.checks[0].reason,'unreachable');
  assert.ok(!JSON.stringify(result).includes('secret=ABC'));
});
test('JSON parsing failure on health is a release blocker',async()=>{
  const h=harness({fetcher:async(url)=>url.endsWith('/api/health')
    ?{ok:true,status:200,json:async()=>{throw Error('invalid')}}
    :url.endsWith('/api/ready')
      ?response(200,{ok:true,database:'ready',version:'2.17.0'})
      :response()});
  const report=await h.verifier.snapshot();
  assert.equal(report.level,'critical');
  assert.equal(report.checks[0].reason,'invalid_json');
});
test('checks honor timeouts, including unavailable local endpoints',async()=>{
  const h=harness({timeoutMs:15,fetcher:(_url,opts)=>new Promise((resolve,reject)=>{
    opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  })});
  const report=await h.verifier.snapshot();
  assert.equal(report.level,'critical');
  assert.equal(report.checks.length,7);
  assert.ok(report.checks.every(x=>x.reason==='timeout'));
});
test('cache prevents redundant bursts and manual refresh fetches fresh',async()=>{
  const h=harness();
  const first=await h.verifier.snapshot();
  const cached=await h.verifier.snapshot();
  assert.equal(first,cached);
  assert.equal(h.calls.length,7);
  await h.verifier.snapshot({refresh:true});
  assert.equal(h.calls.length,14);
  h.advance(CACHE_MS+1);
  await h.verifier.snapshot();
  assert.equal(h.calls.length,21);
});
test('concurrent checks reuse one in-flight run',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=harness({fetcher:async(url)=>{
    await gate;
    if(url.endsWith('/api/health'))return response(200,{ok:true,version:'2.17.0'});
    if(url.endsWith('/api/ready'))return response(200,{ok:true,version:'2.17.0',database:'ready'});
    return response();
  }});
  const first=h.verifier.snapshot(),second=h.verifier.snapshot({refresh:true});
  release();
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a,b);
  assert.equal(h.calls.length,7);
});
test('startup accepts the active four-segment maintenance version without weakening invalid-version checks',async()=>{
  const {version}=require('../package.json');
  const fetchFn=async(url)=>{
    if(url.endsWith('/api/health'))return response(200,{ok:true,version});
    if(url.endsWith('/api/ready'))return response(200,{ok:true,version,database:'ready'});
    return response();
  };
  const verifier=createReleaseVerifier({port:3000,version,fetchFn});
  const report=await verifier.snapshot();
  assert.equal(report.expectedVersion,version);
  assert.equal(report.level,'ok');
  assert.equal(report.passed,7);
  for(const accepted of ['3.2.17','3.2.17.1','12.34.56.78']){
    assert.doesNotThrow(()=>createReleaseVerifier({port:3000,version:accepted,fetchFn}));
  }
  for(const bad of ['', 'latest', '3.2', '3.2.17.1.1', '3.2.17-beta',
    '3.2.17.1/extra', '3.2.17.1-rc1', ' 3.2.17.1']){
    assert.throws(()=>createReleaseVerifier({port:3000,version:bad,fetchFn}),TypeError);
  }
});
test('port is validated, and not taken from incoming request',()=>{
  for(const bad of [0,-2,65536,'abc','3000/path','1.5'])assert.throws(()=>validatePort(bad));
  assert.equal(validatePort(3000),3000);
  assert.equal(validatePort('8080'),8080);
  assert.throws(()=>createReleaseVerifier({port:3000,version:'latest',fetchFn:async()=>response()}));
});
test('read-only API is admin-protected and cannot accept custom target URLs',()=>{
  const code=fs.readFileSync(path.join(root,'src/routes/admin-release-verification-v217.js'),'utf8');
  assert.match(code,/router\.use\(requireAdmin\)/);
  assert.match(code,/router\.get\('\/ops\/release-verification'/);
  assert.match(code,/Cache-Control','no-store'/);
  assert.match(code,/req\.query\?\.refresh==='1'/);
  assert.doesNotMatch(code,/req\.(query|body)\.(url|host|port|path)/);
  assert.doesNotMatch(code,/router\.(post|delete|patch|put)\(/);
});
test('admin mobile screen offers release checklist without claiming production verification',()=>{
  const html=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/admin.js'),'utf8');
  for(const id of ['releaseVerificationTitle','releaseVerificationSummary','releaseVerificationChecks','reloadReleaseVerification']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(js,/async function releaseVerification\(/);
  assert.match(js,/Coolify/); // UI explicitly describes the external-verification limitation.
  assert.match(js,/releaseVerification\(\), alertDeliveries\(\)/);
});
test('server mounts safe release checks and shares declared version with package',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const declared=require('../package.json').version;
  assert.match(server,new RegExp("const APP_VERSION='"+declared.replace(/\./g,'\\.')+"'"));
  assert.match(server,/const releaseVerifier=createReleaseVerifier\(\{port:PORT,version:APP_VERSION\}\)/);
  assert.match(server,/createReleaseVerificationRoutes\(releaseVerifier\)/);
});
test('service does not mutate database, user content or multimedia',()=>{
  const service=fs.readFileSync(path.join(root,'src/services/release-verifier-v217.js'),'utf8');
  assert.doesNotMatch(service,/\b(?:db\.query|INSERT INTO|DELETE FROM|UPDATE users|CREATE TABLE|unlink|writeFile)\b/);
  assert.match(service,/127\.0\.0\.1/);
});
