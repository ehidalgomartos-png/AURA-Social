'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseWebhookConfig,formatAlertPayload,retryDelaySeconds,createAlertDeliveryService,MAX_ATTEMPTS}=require('../src/services/alert-delivery-v216');
const root=path.resolve(__dirname,'..');
const SLACK='https://hooks.slack.com/services/T000000000/B000000000/abcdefghijklmnopqrstuv';
const DISCORD='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz';

function mockService({url=SLACK,claimed=[],sender=async()=>({ok:true,status:200})}={}){
  const queries=[],requests=[],warnings=[],intervals=[];
  const db={query:async(sql,params=[])=>{
    queries.push({sql,params});
    if(sql.includes('SELECT locked.id'))return {rows:claimed};
    return {rows:[],rowCount:0};
  }};
  const service=createAlertDeliveryService({
    db,url,fetchFn:async(destination,opts)=>{
      requests.push({destination,opts});
      return sender(destination,opts);
    },logger:{warn:message=>warnings.push(message)},timers:{
      setInterval:(cb,ms)=>{const t={cb,ms,unref(){}};intervals.push(t);return t;},
      clearInterval:t=>{t.cleared=true;}
    }
  });
  return {service,queries,requests,warnings,intervals};
}
const critical={id:42,attempts:1,title:'Errores elevados en la API',severity:'critical',detail:'Revisar el panel de administración.'};

test('external delivery stays disabled with no configuration or invalid input',()=>{
  assert.deepEqual(parseWebhookConfig(''),{enabled:false,provider:null});
  for(const u of [
    'http://hooks.slack.com/services/T00/B00/secret',
    'https://evil.example/webhook',
    'https://127.0.0.1/foo',
    'https://hooks.slack.com.evil.example/services/T000/B000/secret',
    'https://user:pass@hooks.slack.com/services/T000/B000/secret',
    'https://hooks.slack.com:8443/services/T000/B000/secret',
    'https://hooks.slack.com/services/T00/B00/secret?token=1',
    'https://discord.com/api/webhooks/abc/def',
    'file:///etc/passwd'
  ])assert.equal(parseWebhookConfig(u).enabled,false,u);
});
test('only valid Slack and Discord HTTPS webhooks can be configured',()=>{
  const slack=parseWebhookConfig(SLACK),discord=parseWebhookConfig(DISCORD);
  assert.equal(slack.enabled,true);
  assert.equal(slack.provider,'slack');
  assert.equal(discord.enabled,true);
  assert.equal(discord.provider,'discord');
});
test('notification payload contains fixed operational labels and disables mentions',()=>{
  const payload=formatAlertPayload(critical,'discord');
  assert.match(payload.content,/CRÍTICA/);
  assert.match(payload.content,/Errores elevados/);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  const slack=formatAlertPayload(critical,'slack');
  assert.equal(slack.unfurl_links,false);
  assert.equal(slack.unfurl_media,false);
  assert.ok(!JSON.stringify(payload).includes('https://hooks.slack.com/services/'));
});
test('backoff bounded across five delivery attempts',()=>{
  assert.deepEqual([1,2,3,4,5].map(retryDelaySeconds),[60,120,240,480,900]);
  assert.equal(MAX_ATTEMPTS,5);
});
test('disabled webhook creates neither tables nor network traffic',async()=>{
  const f=mockService({url:''});
  assert.deepEqual(await f.service.poll(),{skipped:'disabled'});
  f.service.start();
  assert.equal(f.intervals.length,0);
  assert.equal(f.queries.length,0);
  assert.equal(f.requests.length,0);
  assert.equal(f.service.status().enabled,false);
});
test('poll persists outbox keyed by incident activation and only critical open signals',async()=>{
  const f=mockService();
  assert.deepEqual(await f.service.poll(),{processed:0});
  assert.ok(f.queries.some(x=>x.sql.includes('CREATE TABLE IF NOT EXISTS operational_alert_deliveries_v216')));
  assert.ok(f.queries.some(x=>x.sql.includes('UNIQUE(alert_id,cycle_key)')));
  const enqueue=f.queries.find(x=>x.sql.startsWith('INSERT INTO operational_alert_deliveries_v216'));
  assert.ok(enqueue.sql.includes('COALESCE(last_cleared_at,first_seen_at)'));
  assert.ok(enqueue.sql.includes("severity='critical'"));
  assert.ok(enqueue.sql.includes('ON CONFLICT(alert_id,cycle_key) DO NOTHING'));
});
test('healthy successful delivery has no private account fields and is recorded',async()=>{
  const f=mockService({claimed:[critical]});
  assert.deepEqual(await f.service.poll(),{processed:1});
  assert.equal(f.requests.length,1);
  const request=f.requests[0];
  assert.equal(request.destination,SLACK);
  assert.equal(request.opts.redirect,'error');
  assert.equal(request.opts.headers['X-RedLibertad-Delivery'],'42');
  assert.equal(request.opts.method,'POST');
  const body=JSON.parse(request.opts.body);
  assert.ok(body.text.includes('https://redlibertad.com/admin'));
  for(const secret of ['username','user_id','password','message_body','ip_address'])
    assert.ok(!JSON.stringify(body).includes(secret),secret);
  assert.ok(f.queries.some(x=>x.sql.includes("status='sent'")));
  const status=f.service.status();
  assert.equal(status.enabled,true);
  assert.equal(status.provider,'slack');
  assert.ok(status.lastSuccessAt);
  assert.equal(JSON.stringify(status).includes('hooks.slack.com'),false);
});
test('HTTP failure is retried with safe error classification',async()=>{
  const f=mockService({claimed:[critical],sender:async()=>({ok:false,status:500})});
  await f.service.poll();
  const update=f.queries.find(x=>x.sql.includes('next_attempt_at=now()+'));
  assert.deepEqual(update.params,[42,'pending',60,'http_500']);
  assert.equal(f.warnings.length,0);
});
test('fifth failure stops automatic retry, without leaking webhook details',async()=>{
  const f=mockService({claimed:[{...critical,attempts:5}],sender:async()=>{throw Error('secret URL in exception')}});
  await f.service.poll();
  const update=f.queries.find(x=>x.sql.includes('next_attempt_at=now()+'));
  assert.deepEqual(update.params,[42,'failed',900,'network_error']);
  assert.equal(JSON.stringify(f.queries).includes('secret URL in exception'),false);
});
test('retired incidents are not sent; jobs require active unresolved alerts',async()=>{
  const f=mockService();
  await f.service.poll();
  const retire=f.queries.find(x=>x.sql.includes("last_error_code='incident_cleared'"));
  const claim=f.queries.find(x=>x.sql.includes('FOR UPDATE OF d SKIP LOCKED'));
  assert.ok(retire);
  assert.ok(claim);
  assert.match(claim.sql,/a\.is_active=TRUE/);
  assert.match(claim.sql,/a\.status='open'/);
});
test('start and stop schedule one worker, and stop suppresses new polls',async()=>{
  const f=mockService();
  f.service.start();f.service.start();
  assert.equal(f.intervals.length,1);
  assert.equal(f.intervals[0].ms,120000);
  f.service.stop();
  assert.equal(f.intervals[0].cleared,true);
  assert.equal((await f.service.poll()).skipped,'disabled');
});
test('admin delivery API protects secrets, only accepts audited failed-job retry',()=>{
  const src=fs.readFileSync(path.join(root,'src/routes/admin-delivery-v216.js'),'utf8');
  assert.match(src,/router\.use\(requireAdmin\)/);
  assert.match(src,/Cache-Control','no-store'/);
  assert.match(src,/router\.get\('\/ops\/alert-deliveries'/);
  assert.match(src,/router\.post\('\/ops\/alert-deliveries\/:id\/retry'/);
  assert.match(src,/operational_delivery_audit_v216/);
  assert.match(src,/status='failed'/);
  assert.match(src,/a\.is_active=TRUE/);
  assert.match(src,/retry_note_required/);
});
test('mobile admin displays deliveries and provides controlled retries',()=>{
  const html=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/admin.js'),'utf8');
  for(const id of ['alertDeliveryStatus','alertDeliveryList','reloadAlertDeliveries'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,/async function alertDeliveries/);
  assert.match(js,/data-delivery-retry/);
  assert.match(js,/reintento/i);
});
test('service integrates with V2.16 server lifecycle',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(server,new RegExp("const APP_VERSION='"+require('../package.json').version.replace(/\./g,'\\.')+"'"));
  assert.match(server,/const alertDelivery=createAlertDeliveryService\(\{db\}\)/);
  assert.match(server,/alertDelivery\.start\(\)/);
  assert.match(server,/alertDelivery\.stop\(\)/);
  assert.match(server,/createAlertDeliveryAdminRoutes\(\{db,delivery:alertDelivery\}\)/);
});
