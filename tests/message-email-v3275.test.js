'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createMessageEmailService,emailConfig,emailPayload,messageLink,DELAY_MINUTES}=require('../src/services/message-email-v3275');
const read=p=>fs.readFileSync(p,'utf8');
const cfg={MESSAGE_EMAIL_ENABLED:'true',MESSAGE_EMAIL_FROM:'avisos@redlibertad.com',RESEND_API_KEY:'re_test_example_that_is_not_a_real_secret'};
function mockService({claim=[],recipient=null,fetchFn=async()=>({ok:true}),env=cfg}={}){
 const calls=[],sent=[];
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT enabled FROM message_email_preferences_v3275'))return {rows:[]};
  if(sql.startsWith('INSERT INTO message_email_jobs_v3275'))return {rows:[{recipient_id:2}]};
  if(sql.startsWith('WITH due AS'))return {rows:claim};
  if(sql.startsWith('SELECT u.email,u.status,cm.last_read_at'))return {rows:recipient?[recipient]:[]};
  return {rows:[],rowCount:0};
 }};
 const wrapped=async(url,options)=>{sent.push({url,options});return fetchFn(url,options);};
 const service=createMessageEmailService({db,env,fetchFn:wrapped,logger:{warn(){}},timers:{setInterval(){return {unref(){}};},clearInterval(){}}});
 return {service,calls,sent};
}
const job={conversation_id:11,recipient_id:2,latest_message_id:33,attempts:1};
const eligible={email:'recipient@example.com',status:'active',last_read_at:null,notifications_muted:false,
 message_created:'2026-10-16T09:00:00.000Z',sender_id:1,email_enabled:true,blocked:false};
test('sender is opt-in deployment configured; no credential or verified sender means disabled',()=>{
 assert.equal(emailConfig({}).enabled,false);
 assert.equal(emailConfig({...cfg,MESSAGE_EMAIL_ENABLED:'false'}).enabled,false);
 assert.equal(emailConfig({...cfg,MESSAGE_EMAIL_FROM:'bad <hello>'}).enabled,false);
 assert.equal(emailConfig(cfg).enabled,true);
 assert.equal(DELAY_MINUTES,15);
});
test('private template has no message text and uses only internal conversation URL',()=>{
 const value=emailPayload('avisos@redlibertad.com','recipient@example.com',11);
 assert.equal(messageLink(11),'https://redlibertad.com/app?view=messages&conversation=11');
 assert.equal(value.to[0],'recipient@example.com');
 assert.match(value.html,/Tienes mensajes sin leer/);
 assert.match(value.text,/No|desactivar estos avisos/i);
 assert.doesNotMatch(value.html,/body|media|contenido del mensaje enviado/i);
 assert.throws(()=>messageLink('//evil.test'));
});
test('no outgoing emails or queue writes when the feature switch is off',async()=>{
 const h=mockService({env:{...cfg,MESSAGE_EMAIL_ENABLED:'false'}});
 const r=await h.service.enqueue(11,1,33);
 assert.equal(r.skipped,'disabled');
 assert.equal(h.calls.length,0);
 assert.equal((await h.service.poll()).skipped,'disabled');
});
test('new messages queue per conversation with 15-min delay, mute, blocks, recipient preference and cooldown',async()=>{
 const h=mockService();
 const saved=await h.service.enqueue(11,1,33);
 assert.equal(saved.queued,1);
 const insert=h.calls.find(x=>x.sql.startsWith('INSERT INTO message_email_jobs_v3275'));
 assert.deepEqual(insert.args,[11,1,33]);
 for(const fragment of ["interval '15 minutes'","interval '60 minutes'","notifications_muted=false",
  "COALESCE(p.enabled,true)=true",'NOT EXISTS(SELECT 1 FROM blocks b','ON CONFLICT(conversation_id,recipient_id)'])assert.ok(insert.sql.includes(fragment),fragment);
 assert.equal(await h.service.preference(2),true);
});
test('user can turn off emails and outstanding pending emails are discarded',async()=>{
 const h=mockService();
 await h.service.savePreference(2,false);
 const change=h.calls.find(x=>x.sql.startsWith('INSERT INTO message_email_preferences_v3275'));
 assert.deepEqual(change.args,[2,false]);
 assert.ok(h.calls.some(x=>x.sql.includes("SET status='discarded'")));
});
test('worker sends one private notification only while message still unread',async()=>{
 const h=mockService({claim:[job],recipient:eligible});
 const result=await h.service.poll();
 assert.equal(result.processed,1);
 assert.equal(h.sent.length,1);
 assert.equal(h.sent[0].url,'https://api.resend.com/emails');
 assert.equal(h.sent[0].options.redirect,'error');
 assert.match(h.sent[0].options.headers['Idempotency-Key'],/redlibertad-msg-2-11-33/);
 const message=JSON.parse(h.sent[0].options.body);
 assert.equal(message.to[0],eligible.email);
 assert.match(message.text,/conversation=11/);
 const finish=h.calls.find(x=>x.sql.startsWith('UPDATE message_email_jobs_v3275 SET status=$4'));
 assert.equal(finish.args[3],'sent');
});
test('reading, mute, blocking, preference off and deleted membership all suppress email',async()=>{
 const invalid=[
  {...eligible,last_read_at:'2026-10-16T09:05:00.000Z'},
  {...eligible,notifications_muted:true},
  {...eligible,blocked:true},
  {...eligible,email_enabled:false},
  {...eligible,status:'suspended'},
  {...eligible,sender_id:2}
 ];
 for(const recipient of [...invalid,null]){
  const h=mockService({claim:[job],recipient});
  await h.service.poll();
  assert.equal(h.sent.length,0);
  assert.ok(h.calls.some(x=>x.sql.startsWith('UPDATE message_email_jobs_v3275 SET status=$4') && x.args[3]==='discarded'));
 }
});
test('failed provider retries instead of losing saved messages, then dead-letters after limit',async()=>{
 for(const attempts of [1,5]){
  const h=mockService({claim:[{...job,attempts}],recipient:eligible,fetchFn:async()=>({ok:false})});
  await h.service.poll();
  const last=h.calls.find(x=>x.sql.startsWith('UPDATE message_email_jobs_v3275 SET status=$4'));
  assert.equal(last.args[3],attempts===5?'failed':'pending');
  assert.equal(last.args[4],attempts===5?0:2);
 }
});
test('existing chat, push, account settings and deployment configuration are all wired',()=>{
 const msgs=read('src/routes/messages.js'),server=read('server.js'),ui=read('public/app.html'),social=read('public/social.js');
 assert.match(msgs,/router\.get\('\/email-preferences'/);
 assert.match(msgs,/router\.put\('\/email-preferences'/);
 assert.match(msgs,/void messageEmailService\.enqueue\(id,req\.user\.id,savedMessage\.id\)/);
 assert.match(msgs,/message:savedMessage/);
 assert.match(server,/messageEmailService\.start\(\)/);
 assert.match(server,/messageEmailService\.stop\(\)/);
 assert.match(ui,/id="messageEmailPreferencesForm"/);
 assert.match(social,/loadMessageEmailPreferencesV3275\(\)/);
 assert.match(social,/\/api\/messages\/email-preferences/);
 assert.match(read('.env.example'),/MESSAGE_EMAIL_ENABLED=false/);
 assert.match(read('.env.example'),/MESSAGE_EMAIL_FROM=avisos@redlibertad\.com/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.75');
 assert.match(server,/APP_VERSION='3\.2\.75'/);
});
test('Marketplace Professional remains a proposal, no live payments or Google feed are enabled',()=>{
 const doc=read('docs/marketplace-profesional-v3275-plan.md');
 assert.match(doc,/Stripe Connect/);
 assert.match(doc,/Google Merchant Center/);
 const source=read('src/services/marketplace-google-v3264.js');
 assert.match(source,/merchantReady:false/);
 assert.match(doc,/Sin cobros reales/);
});
