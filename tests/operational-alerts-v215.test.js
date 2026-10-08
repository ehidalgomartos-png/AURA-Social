'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluateSignals,createOperationalAlertService,ALERT_KEYS,POLL_MS}=require('../src/services/operational-alerts-v215');
const root=path.resolve(__dirname,'..');
function healthy(){
  return {services:[{key:'database',status:'ok',waitingConnections:0},{key:'media',status:'ok'},{key:'push',status:'disabled'}]};
}
function runtime({requests=40,serverErrors=0,slow=0,errorRatePct=0,slowRatePct=0}={}){
  return {overall:{requests,serverErrors,slow,errorRatePct,slowRatePct}};
}
function fixtures({dependencies=healthy(),metrics=runtime()}={}){
  const queries=[],warns=[],timers=[];
  const db={query:async(sql,params=[])=>{queries.push({sql,params});return {rows:[],rowCount:0};}};
  const inspector={snapshot:async()=>dependencies};
  const monitor={snapshot:()=>metrics};
  const worker=createOperationalAlertService({
    db,runtimeMonitor:monitor,dependencyInspector:inspector,
    logger:{warn:x=>warns.push(x)},timers:{
      setInterval:(callback,ms)=>{let t={callback,ms,cleared:false,unref(){}};timers.push(t);return t;},
      clearInterval:t=>{t.cleared=true;}
    }
  });
  return {worker,queries,warns,timers};
}
test('monitoring ignores healthy and disabled optional push',()=>{
  assert.deepEqual(evaluateSignals({runtime:runtime(),dependencies:healthy()}),[]);
});
test('database critical produces a known alert without revealing connection details',()=>{
  const deps=healthy();
  deps.services[0]={key:'database',status:'critical',advice:'password=secret'};
  const alerts=evaluateSignals({runtime:runtime(),dependencies:deps});
  assert.equal(alerts[0].key,'database_unavailable');
  assert.equal(alerts[0].severity,'critical');
  assert.ok(!JSON.stringify(alerts).includes('secret'));
});
test('connection pool backlog has minimum threshold and warning severity',()=>{
  const deps=healthy();deps.services[0]={key:'database',status:'warning',waitingConnections:3};
  const alerts=evaluateSignals({dependencies:deps});
  assert.equal(alerts[0].key,'database_pool_backlog');
  assert.equal(alerts[0].severity,'warning');
  deps.services[0].waitingConnections=1;
  assert.equal(evaluateSignals({dependencies:deps}).length,0);
});
test('local media issues and low storage use distinct alert keys',()=>{
  const deps=healthy();deps.services[1].status='critical';
  assert.equal(evaluateSignals({dependencies:deps})[0].key,'media_unavailable');
  deps.services[1].status='warning';
  assert.equal(evaluateSignals({dependencies:deps})[0].key,'media_space_low');
  deps.services[1].status='disabled';
  assert.equal(evaluateSignals({dependencies:deps}).length,0);
});
test('API error alert needs volume, absolute failures and percentage',()=>{
  assert.deepEqual(evaluateSignals({dependencies:healthy(),runtime:runtime({requests:9,serverErrors:9,errorRatePct:100})}),[]);
  assert.deepEqual(evaluateSignals({dependencies:healthy(),runtime:runtime({requests:40,serverErrors:4,errorRatePct:10})}),[]);
  const alerts=evaluateSignals({dependencies:healthy(),runtime:runtime({requests:40,serverErrors:6,errorRatePct:15})});
  assert.equal(alerts[0].key,'api_error_spike');
  assert.equal(alerts[0].severity,'critical');
});
test('high latency needs a sample and no alerts for rare slow calls',()=>{
  assert.deepEqual(evaluateSignals({dependencies:healthy(),runtime:runtime({requests:100,slow:4,slowRatePct:4})}),[]);
  assert.equal(evaluateSignals({dependencies:healthy(),runtime:runtime({requests:20,slow:5,slowRatePct:25})})[0].key,'api_latency_spike');
});
test('alert keys are fixed and deduplicated by name',()=>{
  const deps=healthy();deps.services[1].status='warning';
  const alerts=evaluateSignals({dependencies:deps,runtime:runtime({requests:100,serverErrors:15,errorRatePct:15,slow:25,slowRatePct:25})});
  assert.equal(new Set(alerts.map(x=>x.key)).size,alerts.length);
  for(const alert of alerts)assert.ok(ALERT_KEYS.includes(alert.key));
});
test('poll creates schema and upserts without inserting user actions or media changes',async()=>{
  const f=fixtures({dependencies:{services:[{key:'database',status:'ok'},{key:'media',status:'warning'}]}});
  assert.deepEqual(await f.worker.poll(),{count:1});
  assert.ok(f.queries.some(x=>x.sql.includes('CREATE TABLE IF NOT EXISTS operational_alerts_v215')));
  const upsert=f.queries.find(x=>x.sql.includes('INSERT INTO operational_alerts_v215('));
  assert.ok(upsert.sql.includes('ON CONFLICT(alert_key)'));
  assert.deepEqual(upsert.params.slice(0,2),['media_space_low','warning']);
  assert.ok(f.queries.some(x=>x.sql.includes('SET is_active=FALSE,last_cleared_at=now()')));
  assert.ok(!JSON.stringify(f.queries).includes('DELETE FROM users'));
});
test('acknowledgment survives continued incident and resolved alerts reopen only after clearance',()=>{
  const code=fs.readFileSync(path.join(root,'src/services/operational-alerts-v215.js'),'utf8');
  assert.match(code,/WHEN operational_alerts_v215\.is_active=FALSE THEN 'open'/);
  assert.match(code,/ELSE operational_alerts_v215\.status END/);
  assert.match(code,/WHERE operational_alerts_v215\.is_active=FALSE/);
  assert.match(code,/last_seen_at < now\(\)-interval '5 minutes'/);
});
test('database outage skips persisted writes with a redacted operational warning',async()=>{
  const deps=healthy();deps.services[0].status='critical';
  const f=fixtures({dependencies:deps});
  assert.deepEqual(await f.worker.poll(),{skipped:'database_unavailable'});
  assert.equal(f.queries.length,0);
  assert.ok(!f.warns.join(' ').includes('password'));
});
test('worker timer runs every 2 minutes and is stopped gracefully',async()=>{
  const f=fixtures();
  assert.equal(POLL_MS,120000);
  f.worker.start();f.worker.start();
  assert.equal(f.timers.length,1);
  assert.equal(f.timers[0].ms,120000);
  assert.equal(f.worker.state().started,true);
  f.worker.stop();
  assert.equal(f.timers[0].cleared,true);
  assert.equal(await f.worker.poll(),null);
});
test('admin routes require authentication, validate state and audit atomically',()=>{
  const route=fs.readFileSync(path.join(root,'src/routes/admin-alerts-v215.js'),'utf8');
  assert.match(route,/router\.use\(requireAdmin\)/);
  assert.match(route,/router\.get\('\/ops\/alerts'/);
  assert.match(route,/router\.post\('\/ops\/alerts\/:id\/action'/);
  assert.match(route,/router\.get\('\/ops\/alerts\/:id\/history'/);
  assert.match(route,/WITH changed AS/);
  assert.match(route,/operational_alert_audit_v215/);
  assert.match(route,/resolution_note_required/);
  assert.doesNotMatch(route,/router\.delete\(/);
});
test('mobile administration has filter, note input, history and action buttons',()=>{
  const html=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/admin.js'),'utf8');
  for(const name of ['operationalAlertStatus','operationalAlertList','reloadOperationalAlerts'])assert.ok(html.includes('id="'+name+'"'));
  for(const name of ['data-operational-action','data-operational-history','data-operational-note','operationalAlerts()'])assert.ok(js.includes(name));
});
test('server installs alert routes and stops worker on shutdown',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(server,new RegExp("const APP_VERSION='"+require('../package.json').version.replace(/\./g,'\\.')+"'"));
  assert.match(server,/createOperationalAlertAdminRoutes\(\{db,service:operationalAlerts\}\)/);
  assert.match(server,/operationalAlerts\.start\(\)/);
  assert.match(server,/operationalAlerts\.stop\(\)/);
});
