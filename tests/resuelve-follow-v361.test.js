'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.1: following a question requires explicit authentication and protects POST origin',()=>{
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(routes,/router\.get\('\/questions\/:id\/follow',requireAuth,wrap/);
 assert.match(routes,/router\.post\('\/questions\/:id\/follow',requireAuth,checkOrigin,limiter\(12\),wrap/);
 assert.match(routes,/typeof req\.body\?\.enabled!=='boolean'/);
 assert.match(routes,/service\.questionFollowPreference\(req\.user\.id,req\.params\.id\)/);
 assert.match(routes,/service\.setQuestionFollow\(req\.user\.id,req\.params\.id,req\.body\.enabled\)/);
});

test('V3.6.1: only public questions of other people can be followed; unfollow always allowed',()=>{
 const service=read('src/services/resuelve-v350.js');
 const block=service.slice(service.indexOf('async function questionFollowPreference('),service.indexOf('// No se envían emails ni se expone'));
 assert.match(service,/CREATE TABLE IF NOT EXISTS resuelve_question_follows_v361/);
 assert.match(service,/PRIMARY KEY\(user_id,question_id\)/);
 assert.match(service,/REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(service,/REFERENCES resuelve_questions\(id\) ON DELETE CASCADE/);
 assert.match(block,/q\.author_id<>\$1/);
 assert.match(block,/q\.status='open'/);
 assert.match(block,/author\.status='active'/);
 assert.match(block,/DELETE FROM resuelve_question_follows_v361 WHERE user_id=\$1 AND question_id=\$2/);
 assert.match(block,/ON CONFLICT\(user_id,question_id\) DO UPDATE SET enabled=TRUE/);
 assert.doesNotMatch(block,/email|u\.phone|profile|INSERT INTO notifications/i);
});

test('V3.6.1: real replies trigger at most one in-app alert per user per 24 hours',()=>{
 const service=read('src/services/resuelve-v350.js');
 const notification=service.slice(service.indexOf('async function notifyQuestionFollowers('),service.indexOf('async function answer('));
 assert.match(notification,/UPDATE resuelve_question_follows_v361 f SET last_notified_at=now\(\)/);
 assert.match(notification,/f\.enabled=TRUE AND f\.user_id<>\$2 AND f\.user_id<>q\.author_id/);
 assert.match(notification,/q\.status='open'/);
 assert.match(notification,/follower\.status='active'/);
 assert.match(notification,/last_notified_at<now\(\)-interval '24 hours'/);
 assert.match(notification,/INSERT INTO notifications\(user_id,actor_id,type,entity_type,entity_id,text\)/);
 assert.match(notification,/'system','resuelve'/);
 assert.doesNotMatch(notification,/sendEmail|resend|replyEmail|mail_queue/i);
 assert.match(service,/await notifyQuestionFollowers\(id,userId\)/);
});

test('V3.6.1: following and unfollowing use real server state',async()=>{
 const db=require('../src/db'),oldQuery=db.query;
 const seen=[];
 db.query=async(sql,args=[])=>{
  seen.push({sql,args});
  if(sql.includes('RETURNING enabled')&&sql.includes('INSERT INTO resuelve_question_follows_v361'))
   return {rows:[{enabled:true}],rowCount:1};
  if(sql.includes('COALESCE(f.enabled,FALSE)'))
   return {rows:[{enabled:true}],rowCount:1};
  return {rows:[],rowCount:0};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  assert.deepEqual(await service.setQuestionFollow(2,'17',true),{enabled:true});
  assert.deepEqual(await service.questionFollowPreference(2,'17'),{enabled:true});
  assert.deepEqual(await service.setQuestionFollow(2,'17',false),{enabled:false});
  assert.equal(await service.setQuestionFollow(2,'not-an-id',true),null);
  assert.equal(await service.setQuestionFollow(2,'17','yes'),null);
  assert.ok(seen.some(q=>q.sql.includes('INSERT INTO resuelve_question_follows_v361')));
  assert.ok(seen.some(q=>q.sql.includes('DELETE FROM resuelve_question_follows_v361')));
  assert.deepEqual(seen.find(q=>q.sql.includes('RETURNING enabled')).args,[2,'17']);
 }finally{db.query=oldQuery;}
});

test('V3.6.1: mobile control can be revoked after resolution, no automatic following',()=>{
 const js=read('public/resuelve-v350.js');
 const css=read('public/resuelve-v350.css');
 assert.match(js,/function questionFollowControl\(q\)/);
 assert.match(js,/request\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(q\.id\)\+'\/follow'\)/);
 assert.match(js,/write\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(q\.id\)\+'\/follow',\{enabled\}\)/);
 assert.match(js,/if\(state\.user&&!mine\)host\.append\(questionFollowControl\(q\)\)/);
 assert.match(js,/action\.disabled=q\.status!=='open'&&!enabled/);
 assert.match(js,/action\.setAttribute\('aria-pressed',String\(enabled\)\)/);
 assert.match(css,/\.resuelve-follow-control/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});