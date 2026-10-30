'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {createPendingService,POLL_INTERVAL_MS}=require('../src/services/resuelve-pending-v362');

test('V3.6.2: pending list and reminder preferences are private and owner-only',()=>{
 const service=read('src/services/resuelve-pending-v362.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(service,/PRIMARY KEY\(user_id,question_id\)/);
 assert.match(service,/enabled BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(service,/REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(service,/REFERENCES resuelve_questions\(id\) ON DELETE CASCADE/);
 assert.match(service,/WHERE q.author_id=\$1 AND q.status='open'/);
 assert.match(service,/ORDER BY answer_count ASC,q.id DESC LIMIT 12/);
 assert.match(service,/respondent.status='active'/);
 assert.match(service,/q.id=\$2 AND q.author_id=\$1 AND q.status<>'hidden'/);
 assert.match(service,/WHERE q.id=\$2 AND q.author_id=\$1 AND q.status='open'/);
 assert.match(service,/DELETE FROM resuelve_question_reminders_v362 WHERE user_id=\$1 AND question_id=\$2/);
 assert.match(routes,/router.get\('\/questions\/mine\/pending',requireAuth,wrap/);
 assert.match(routes,/router.get\('\/questions\/:id\/reminder',requireAuth,wrap/);
 assert.match(routes,/router.post\('\/questions\/:id\/reminder',requireAuth,checkOrigin,limiter\(12\),wrap/);
 assert.match(routes,/typeof req.body\?\.enabled!=='boolean'/);
 assert.ok(routes.indexOf("router.get('/questions/mine/pending'")<routes.indexOf("router.get('/questions/:id'"));
});

test('V3.6.2: reminder SQL is atomic, weekly, and excludes resolved/hidden',()=>{
 const service=read('src/services/resuelve-pending-v362.js');
 const poll=service.slice(service.indexOf('async function poll('),service.indexOf('function start('));
 assert.match(poll,/p.enabled=TRUE AND q.status='open'/);
 assert.match(poll,/q.created_at<=now\(\)-interval '3 days'/);
 assert.match(poll,/p.created_at<=now\(\)-interval '1 day'/);
 assert.match(poll,/p.last_reminded_at<=now\(\)-interval '7 days'/);
 assert.match(poll,/FOR UPDATE OF p SKIP LOCKED LIMIT 25/);
 assert.match(poll,/UPDATE resuelve_question_reminders_v362 p SET last_reminded_at=now\(\)/);
 assert.match(poll,/INSERT INTO notifications\(user_id,actor_id,type,entity_type,entity_id,text\)/);
 assert.match(poll,/SELECT claimed.user_id,NULL,'system','resuelve',claimed.question_id/);
 assert.doesNotMatch(poll,/resend|fetch\(|sendEmail|u.email|phone/i);
 assert.equal(POLL_INTERVAL_MS,3600000);
 const server=read('server.js');
 assert.match(server,/resuelvePendingService\.start\(\)/);
 assert.match(server,/resuelvePendingService\.stop\(\)/);
});

test('V3.6.2: preference opt-in and revocation are independently saved',async()=>{
 const calls=[],db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('COALESCE(p.enabled,FALSE)'))return {rows:[{status:'resolved',enabled:true}],rowCount:1};
  if(sql.includes('RETURNING enabled'))return {rows:[{enabled:true}],rowCount:1};
  if(sql.includes('ORDER BY answer_count ASC'))return {rows:[{id:'30',title:'Pregunta real',answer_count:0}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const svc=createPendingService({db,ensureResuelve:async()=>{}});
 assert.deepEqual(await svc.listPending(7),[{id:'30',title:'Pregunta real',answer_count:0}]);
 assert.deepEqual(await svc.reminderPreference(7,'30'),{status:'resolved',enabled:true});
 assert.deepEqual(await svc.saveReminder(7,'30',true),{enabled:true});
 assert.deepEqual(await svc.saveReminder(7,'30',false),{enabled:false});
 assert.equal(await svc.saveReminder(7,'invalid',true),null);
 assert.equal(await svc.saveReminder(7,'30','true'),null);
 assert.ok(calls.some(q=>q.sql.includes('INSERT INTO resuelve_question_reminders_v362')&&q.args[0]===7));
 assert.ok(calls.some(q=>q.sql.includes('DELETE FROM resuelve_question_reminders_v362')&&q.args[1]==='30'));
});

test('V3.6.2: two concurrent poll calls create only one internal notification batch',async()=>{
 const calls=[],db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('INSERT INTO notifications'))return {rows:[{id:'22'}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 let tick=null,cleared=null;
 const svc=createPendingService({db,ensureResuelve:async()=>{},
  timers:{setInterval:fn=>{tick=fn;return {unref(){}};},clearInterval:t=>{cleared=t;}}});
 const [a,b]=await Promise.all([svc.poll(),svc.poll()]);
 assert.deepEqual(a,{sent:1});assert.deepEqual(b,{sent:1});
 assert.equal(calls.filter(q=>q.sql.includes('INSERT INTO notifications')).length,1);
 const notification=calls.find(q=>q.sql.includes('INSERT INTO notifications'));
 assert.match(notification.args[0],/respuestas pendientes de revisar/);
 assert.match(notification.args[1],/puedes aclararla o compartirla/);
 assert.ok(notification.args.every(v=>!v.includes('@')));
 svc.start();assert.equal(typeof tick,'function');
 svc.stop();assert.ok(cleared);
 assert.deepEqual(await svc.poll(),{skipped:'stopped'});
});

test('V3.6.2: private pending cards and opt-in button are accessible on mobile',()=>{
 const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js'),css=read('public/resuelve-v350.css');
 for(const id of ['myPendingPanel','myPendingTitle','myPendingList','myPendingStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="myPendingPanel"[^>]*hidden/);
 assert.match(js,/async function loadPendingMine\(\)/);
 assert.match(js,/request\('\/api\/resuelve\/questions\/mine\/pending'\)/);
 assert.match(js,/String\(state.user.id\)!==userId\|\|state.filter!=='mine'/);
 assert.match(js,/state.filter==='mine'\)void loadPendingMine\(\)/);
 assert.match(js,/if\(mine\)host.append\(questionTopicControls\(q\),ownerReminderControl\(q\)\)/);
 assert.match(js,/function ownerReminderControl\(q\)/);
 assert.match(js,/\/reminder',\{enabled\}\)/);
 assert.match(js,/action.setAttribute\('aria-pressed',String\(enabled\)\)/);
 assert.match(js,/panel.hidden=questionStatus!=='open'&&!enabled/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(css,/\.resuelve-pending-panel/);
 assert.match(css,/\.resuelve-owner-reminder/);
 assert.match(css,/@media\(max-width:650px\)/);
});