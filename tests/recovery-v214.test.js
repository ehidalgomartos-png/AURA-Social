'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createDependencyInspector,diskAssessment,withDeadline,CHECK_CACHE_MS}=require('../src/services/dependency-inspector-v214');
const root=path.resolve(__dirname,'..');

function harness({query,stat,access,statfs,push=false,mode='local'}={}){
  let clock=Date.UTC(2026,9,8,13,0,0),dbCount=0,accessCount=0;
  const db={pool:{waitingCount:0,totalCount:3,idleCount:2},query:async(...args)=>{
    dbCount++;
    return query?query(...args):{rows:[{'?column?':1}]};
  }};
  const disk={
    stat:stat|| (async()=>({isDirectory:()=>true})),
    access:async(...args)=>{accessCount++;return access?access(...args):undefined;},
    statfs:statfs===null?undefined:(statfs|| (async()=>({blocks:10000,bavail:7000,bsize:1048576})))
  };
  const inspector=createDependencyInspector({
    db,pool:db.pool,uploadsDir:'/private/path/that/must/not/be_returned',
    mediaMode:mode,pushConfigured:()=>push,disk,now:()=>clock,timeoutMs:30
  });
  return {inspector,db,disk,setTime:t=>{clock=t;},advance:ms=>{clock+=ms;},dbCount:()=>dbCount,accessCount:()=>accessCount};
}
test('healthy dependencies report safe status without raw paths or credentials',async()=>{
  const h=harness();
  const result=await h.inspector.snapshot();
  assert.equal(result.level,'ok');
  assert.equal(result.services[0].key,'database');
  assert.equal(result.services[1].status,'ok');
  assert.equal(result.services[1].freeMB,7000);
  assert.equal(result.scope,'current_instance');
  assert.equal(result.changesMade,false);
  for(const forbidden of ['/private/path','postgresql://','password','JWT_SECRET']){
    assert.equal(JSON.stringify(result).includes(forbidden),false);
  }
});
test('database down emits critical warning and recovery instructions, not raw error',async()=>{
  const h=harness({query:async()=>{throw Error('password hidden db-service.internal:5432')}});
  const result=await h.inspector.snapshot();
  assert.equal(result.level,'critical');
  assert.equal(result.services[0].status,'critical');
  assert.doesNotMatch(JSON.stringify(result),/password hidden|internal:5432/);
  assert.match(result.services[0].advice,/PostgreSQL/);
});
test('unmounted or nonwritable upload path is reported as critical without mutations',async()=>{
  const a=harness({stat:async()=>{throw Error('ENOENT')}});
  const b=harness({access:async()=>{throw Error('EACCES')}});
  assert.equal((await a.inspector.snapshot()).services[1].status,'critical');
  assert.equal((await b.inspector.snapshot()).services[1].status,'critical');
});
test('disk thresholds distinguish warning and critical conditions',()=>{
  assert.equal(diskAssessment(50*1048576,15),'critical');
  assert.equal(diskAssessment(700*1048576,2),'critical');
  assert.equal(diskAssessment(300*1048576,50),'warning');
  assert.equal(diskAssessment(4*1073741824,9),'warning');
  assert.equal(diskAssessment(2*1073741824,25),'ok');
});
test('optional push and external media are not falsely flagged as outages',async()=>{
  const h=harness({push:false,mode:'bunny'});
  const d=await h.inspector.snapshot();
  assert.equal(d.level,'ok');
  assert.equal(d.services[1].status,'disabled');
  assert.equal(d.services[2].status,'disabled');
  assert.equal(h.accessCount(),0);
});
test('low volume space reports actionable warnings for administrator',async()=>{
  const h=harness({statfs:async()=>({blocks:10000,bavail:300,bsize:1048576})});
  const d=await h.inspector.snapshot();
  assert.equal(d.level,'warning');
  assert.equal(d.services[1].freeMB,300);
  assert.match(d.services[1].advice,/espacio|volumen/i);
});
test('lack of statfs support does not render a writable directory unhealthy',async()=>{
  const h=harness({statfs:null});
  const d=await h.inspector.snapshot();
  assert.equal(d.level,'ok');
  assert.equal(d.services[1].freeMB,null);
});
test('normal checks reuse a short TTL, explicit checks force fresh access',async()=>{
  const h=harness();
  const a=await h.inspector.snapshot();
  const b=await h.inspector.snapshot();
  assert.equal(a,b);
  assert.equal(h.dbCount(),1);
  await h.inspector.snapshot({force:true});
  assert.equal(h.dbCount(),2);
  h.advance(CHECK_CACHE_MS+1);
  await h.inspector.snapshot();
  assert.equal(h.dbCount(),3);
});
test('parallel checks share a single in-flight database query',async()=>{
  let resolve;
  const promise=new Promise(r=>{resolve=r});
  const h=harness({query:async()=>promise});
  const requests=[h.inspector.snapshot(),h.inspector.snapshot(),h.inspector.snapshot()];
  resolve({rows:[{one:1}]});
  const responses=await Promise.all(requests);
  assert.equal(h.dbCount(),1);
  assert.equal(responses[0],responses[1]);
});
test('slow database checks respect a deadline and return degraded status',async()=>{
  const h=harness({query:()=>new Promise(()=>{})});
  const result=await h.inspector.snapshot();
  assert.equal(result.level,'critical');
  assert.equal(result.services[0].status,'critical');
});
test('connection pool saturation reports nonfatal warning',async()=>{
  const h=harness();
  h.db.pool.waitingCount=5;
  const d=await h.inspector.snapshot();
  assert.equal(d.level,'warning');
  assert.equal(d.services[0].waitingConnections,5);
});
test('the API is strictly admin-only, GET-only, no-store, and manual refresh is explicit',()=>{
  const js=fs.readFileSync(path.join(root,'src/routes/admin-recovery-v214.js'),'utf8');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(js,/router\.use\(requireAdmin\)/);
  assert.match(js,/router\.get\('\/ops\/dependencies'/);
  assert.match(js,/Cache-Control','no-store'/);
  assert.match(js,/req\.query\?\.refresh==='1'/);
  assert.doesNotMatch(js,/router\.(post|put|patch|delete)\(/);
  assert.match(server,/createRecoveryAdminRoutes\(createDependencyInspector/);
});
test('mobile administration includes recovery status, actionable hints and one-touch refresh',()=>{
  const html=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/admin.js'),'utf8');
  assert.match(html,/id="recoverySummary"/);
  assert.match(html,/id="recoveryServices"/);
  assert.match(html,/id="reloadRecovery"/);
  assert.match(js,/function recoveryStatusLabel\(/);
  assert.match(js,/api\('\/api\/admin\/ops\/dependencies'/);
  assert.match(js,/recoveryOverview\(\), runtimeOps\(\)/);
});
test('service checks never change the user database or media contents',()=>{
  const code=fs.readFileSync(path.join(root,'src/services/dependency-inspector-v214.js'),'utf8');
  assert.doesNotMatch(code,/INSERT INTO|DELETE FROM|DROP TABLE|ALTER TABLE|fs\.writeFile|disk\.writeFile|fs\.unlink|disk\.unlink/);
  assert.match(code,/SELECT 1/);
  assert.match(code,/disk\.access\(/);
});
test('server error logs do not include original URLs or arbitrary DB error messages',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const start=server.indexOf("app.use('/api',(error,req,res,next)=>{");
  const end=server.indexOf('function escapeHtml(',start);
  const handler=server.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(handler,/originalUrl|error\?\.message/);
  assert.match(handler,/classifyApiPath\(req\.path\)/);
});
