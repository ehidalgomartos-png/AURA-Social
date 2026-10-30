'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {cleanFollowup,createAnswerFollowupsService}=require('../src/services/resuelve-answer-followups-v363');

test('V3.6.3: public clarifications are validated and not accepted as empty filler',()=>{
 assert.equal(cleanFollowup(null),null);
 assert.equal(cleanFollowup('demasiado breve'),null);
 assert.equal(cleanFollowup('x'.repeat(601)),null);
 assert.equal(cleanFollowup('  Esto es una aclaración pública de ayuda para la pregunta.  '),
  'Esto es una aclaración pública de ayuda para la pregunta.');
});

test('V3.6.3: only original participants can clarify visible answers in open questions',()=>{
 const source=read('src/services/resuelve-answer-followups-v363.js');
 assert.match(source,/CREATE TABLE IF NOT EXISTS resuelve_answer_followups_v363/);
 assert.match(source,/CHECK\(status IN \('visible','hidden'\)\)/);
 assert.match(source,/REFERENCES resuelve_answers\(id\) ON DELETE CASCADE/);
 assert.match(source,/REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(source,/JOIN resuelve_questions q ON q.id=a.question_id AND q.status='open'/);
 assert.match(source,/AND \(\$2=q.author_id OR \$2=a.author_id\)/);
 assert.match(source,/a.status='visible'/);
 assert.match(source,/author.status='active'/);
 assert.match(source,/respondent.status='active'/);
 assert.match(source,/WHERE f.answer_id=a.id AND f.author_id=\$2\)<5/);
 assert.match(source,/RETURNING id,answer_id/);
});

test('V3.6.3: reading clarifications never includes hidden content or inactive accounts',()=>{
 const s=read('src/services/resuelve-answer-followups-v363.js');
 const block=s.slice(s.indexOf('async function list('),s.indexOf('async function add('));
 assert.match(block,/q.status<>'hidden'/);
 assert.match(block,/f.status='visible'/);
 assert.match(block,/a.status='visible'/);
 assert.match(block,/u.status='active'/);
 assert.match(block,/author.status='active'/);
 assert.match(block,/respondent.status='active'/);
 assert.match(block,/ORDER BY f.id ASC LIMIT 100/);
 assert.doesNotMatch(block,/email|phone|password|reporter_id|SELECT \*/i);
});

test('V3.6.3: API is public read, authenticated POST, and manual admin moderation',()=>{
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(routes,/router.get\('\/questions\/:id\/followups',wrap/);
 assert.match(routes,/router.post\('\/answers\/:id\/followups',requireAuth,checkOrigin,limiter\(8\),wrap/);
 assert.match(routes,/router.post\('\/admin\/followup\/:id\/hide',requireAuth,checkOrigin,limiter\(50\),wrap/);
 assert.match(routes,/if\(!req.user.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 assert.match(routes,/resuelveAnswerFollowups.add\(req.user.id,req.params.id,req.body\?\.body\)/);
 assert.match(routes,/resuelveAnswerFollowups.hide\(req.params.id\)/);
});

test('V3.6.3: participant insertion and moderation work without changing original answer',async()=>{
 const seen=[];
 const db={query:async(sql,args=[])=>{
  seen.push({sql,args});
  if(sql.includes('RETURNING id,answer_id'))return {rows:[{id:'32',answer_id:'14'}],rowCount:1};
  if(sql.includes("status='hidden'"))return {rows:[{id:'32'}],rowCount:1};
  if(sql.includes('ORDER BY f.id ASC'))return {rows:[{id:'32',answer_id:'14',body:'Explicación útil',author_username:'sara'}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const service=createAnswerFollowupsService({db,ensureBase:async()=>{}});
 assert.deepEqual(await service.add(7,'14','Esta es una aclaración suficientemente larga y útil.'),
  {id:'32',answer_id:'14'});
 assert.equal(await service.add(7,'14','corto'),null);
 assert.equal(await service.add(7,'x','Texto suficiente para ayudar a otra persona.'),null);
 assert.equal((await service.list('1')).length,1);
 assert.deepEqual(await service.hide('32'),{id:'32'});
 assert.equal(await service.hide('invalid'),null);
 assert.deepEqual(seen.find(q=>q.sql.includes('RETURNING id,answer_id')).args,
  ['14',7,'Esta es una aclaración suficientemente larga y útil.']);
 assert.ok(seen.every(q=>!q.sql.includes('UPDATE resuelve_answers')));
});

test('V3.6.3: UI keeps author and helper clarifications separate from original replies',()=>{
 const js=read('public/resuelve-v350.js'),css=read('public/resuelve-v350.css');
 assert.match(js,/async function loadAnswerFollowups\(questionId\)/);
 assert.match(js,/request\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(questionId\)\+'\/followups'\)/);
 assert.match(js,/resuelve-followups-'\+a.id/);
 assert.match(js,/if\(state.user&&!solved&&\(mine\|\|String\(state.user.id\)===String\(a.author_id\)\)\)/);
 assert.match(js,/write\('\/api\/resuelve\/answers\/'\+encodeURIComponent\(a.id\)\+'\/followups',\{body:input.value.trim\(\)\}\)/);
 assert.match(js,/void loadAnswerFollowups\(q.id\)/);
 assert.match(js,/resuelve\/admin\/followup\//);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(css,/\.resuelve-answer-followups/);
 assert.match(css,/\.resuelve-followup-form-panel/);
 assert.match(css,/@media\(max-width:650px\)/);
});