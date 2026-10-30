'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.22 private activity and own answered questions are authenticated and paginated',()=>{
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(routes,/router\.get\('\/my-activity',requireAuth/);
 assert.match(routes,/service\.myActivityStats\(req\.user\.id\)/);
 assert.match(routes,/router\.get\('\/questions\/answered-by-me',requireAuth/);
 assert.match(routes,/service\.listMyContributions\(req\.user\.id/);
 assert.match(routes,/next:items\.length===24\?items\[items\.length-1\]\.my_answer_id:null/);
 assert.ok(routes.indexOf("router.get('/questions/answered-by-me'")<routes.indexOf("router.get('/questions/:id'"));
});

test('V3.5.22 queries stay scoped to actual user and never expose identities or guesses',async()=>{
 const db=require('../src/db');
 const original=db.query;
 const calls=[];
 db.query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.trim().startsWith('SELECT')||sql.trim().startsWith('WITH')){
   return {rowCount:1,rows:[{open_questions:0,questions_with_answers:0,resolved_questions:0,contributed_questions:0}]};
  }
  return {rowCount:0,rows:[]};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  await service.myActivityStats(42);
  await service.listMyContributions(42,{before:'123'});
  const sum=calls.find(c=>c.sql.includes('AS contributed_questions'));
  const contributions=calls.find(c=>c.sql.includes('WITH mine AS'));
  assert.ok(sum&&contributions);
  assert.deepEqual(sum.params,[42]);
  assert.deepEqual(contributions.params,[42,'123']);
  assert.match(sum.sql,/q\.author_id=\$1/);
  assert.match(contributions.sql,/a\.author_id=\$1/);
  assert.match(contributions.sql,/q\.status<>'hidden'/);
  assert.match(contributions.sql,/a\.status='visible'/);
  assert.match(contributions.sql,/ORDER BY m\.last_answer_id DESC LIMIT 24/);
  assert.doesNotMatch(sum.sql,/email|password|token/i);
 }finally{db.query=original;}
});

test('V3.5.22 the UI uses real private counts and distinguishes answered vs chosen',()=>{
 const html=read('public/resuelve.html');
 const js=read('public/resuelve-v350.js');
 const css=read('public/resuelve-v350.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/data-filter="contributed"/);
 for(const id of ['myHelpDashboard','myHelpMetrics','myHelpStatus'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/request\('\/api\/resuelve\/my-activity'\)/);
 assert.match(js,/\/api\/resuelve\/questions\/answered-by-me/);
 assert.match(js,/my_answer_selected/);
 assert.match(js,/Number\.isSafeInteger\(value\)/);
 assert.match(js,/el\('myHelpDashboard'\)\.hidden=guest/);
 assert.match(css,/filters\.with-help\{overflow-x:auto/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});