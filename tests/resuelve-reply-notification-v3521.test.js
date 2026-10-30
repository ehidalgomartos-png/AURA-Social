'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {emailConfig,emailPayload,createResuelveReplyEmailService}=
 require('../src/services/resuelve-reply-email-v3521');

test('V3.5.21: email is disabled by default, requires valid sender and verified key',()=>{
 assert.equal(emailConfig({}).enabled,false);
 assert.equal(emailConfig({RESUELVE_EMAIL_ENABLED:'true',RESEND_API_KEY:'x'}).enabled,false);
 assert.equal(emailConfig({
  RESUELVE_EMAIL_ENABLED:'true',RESEND_API_KEY:'long-secret-value',RESUELVE_EMAIL_FROM:'avisos@example.test'
 }).enabled,true);
 const message=emailPayload('avisos@example.test','usuario@example.test',123);
 assert.equal(message.to[0],'usuario@example.test');
 assert.match(message.text,/\/resuelve\?id=123/);
 assert.doesNotMatch(message.text,/nombre|pregunta privada|contenido de la respuesta:/i);
 assert.throws(()=>emailPayload('a','b','1<script>'),/invalid_question_id/);
});

test('V3.5.21: no queued mail without opt-in and service feature flag',async()=>{
 const calls=[];
 const service=createResuelveReplyEmailService({env:{},db:{query:async(sql,args)=>{calls.push([sql,args]);return {rows:[],rowCount:0};}}});
 assert.equal(service.config.enabled,false);
 assert.deepEqual(await service.enqueue('1','2','3'),{skipped:'disabled'});
 assert.deepEqual(await service.poll(),{skipped:'disabled'});
 assert.equal(calls.length,0);
});

test('V3.5.21: only opted-in, verified, active owners receive delayed emails',()=>{
 const service=read('src/services/resuelve-reply-email-v3521.js');
 const answer=read('src/services/resuelve-v350.js');
 const routes=read('src/routes/resuelve-v350.js');
 const server=read('server.js');
 assert.match(service,/enabled BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(service,/p\.enabled=true/);
 assert.match(service,/ev\.verified_at IS NOT NULL/);
 assert.match(service,/status='visible'/);
 assert.match(service,/q\.status='open'/);
 assert.match(service,/u\.status='active'/);
 assert.match(service,/NOT EXISTS\(SELECT 1 FROM blocks/);
 assert.match(service,/NOT EXISTS\(SELECT 1 FROM mutes/);
 assert.match(service,/already_read/);
 assert.match(service,/FOR UPDATE SKIP LOCKED/);
 assert.match(service,/Idempotency-Key/);
 assert.match(service,/interval '15 minutes'/);
 assert.match(service,/COALESCE\(p\.enabled,false\)/);
 assert.match(answer,/await resuelveReplyEmailService\.enqueue\(id,saved\.id,userId\)/);
 assert.match(routes,/router\.get\('\/reply-email\/preference',requireAuth/);
 assert.match(routes,/router\.post\('\/reply-email\/preference',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(routes,/typeof req\.body\?\.enabled!=='boolean'/);
 assert.match(server,/resuelveReplyEmailService\.start\(\)/);
 assert.match(server,/resuelveReplyEmailService\.stop\(\)/);
});

test('V3.5.21: notifications open the real question in PWA, push and web',()=>{
 const push=read('src/services/push.js');
 const social=read('public/social.js');
 const html=read('public/resuelve.html');
 const js=read('public/resuelve-v350.js');
 assert.match(push,/entityType==='resuelve'/);
 assert.match(push,/return \`\/resuelve\?id=\$\{encodeURIComponent\(String\(entityId\)\)\}\`/);
 assert.match(social,/window\.location\.assign\('\/resuelve\?id='/);
 for(const id of ['resuelveReplyEmailSettings','resuelveReplyEmailToggle','resuelveReplyEmailStatus']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/loadReplyEmailPreference/);
 assert.match(js,/el\('resuelveReplyEmailSettings'\)\.hidden=guest/);
 assert.match(js,/write\('\/api\/resuelve\/reply-email\/preference'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});