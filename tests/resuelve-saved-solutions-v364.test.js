'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {createSavedSolutionsService}=require('../src/services/resuelve-saved-v364');

test('V3.6.4: only individually selected solutions can be saved by their owner',()=>{
 const sql=read('src/services/resuelve-saved-v364.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS resuelve_saved_solutions_v364/);
 assert.match(sql,/PRIMARY KEY\(user_id,question_id\)/);
 assert.match(sql,/REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(sql,/REFERENCES resuelve_questions\(id\) ON DELETE CASCADE/);
 assert.match(routes,/router.get\('\/solutions\/saved',requireAuth,wrap/);
 assert.match(routes,/router.post\('\/solutions\/:id\/save',requireAuth,checkOrigin,limiter\(25\),wrap/);
 assert.match(routes,/resuelveSavedSolutions\.list\(req.user.id\)/);
 assert.match(routes,/resuelveSavedSolutions\.save\(req.user.id,req.params.id,req.body.enabled\)/);
 assert.match(routes,/typeof req.body\?\.enabled!=='boolean'/);
});

test('V3.6.4: saved solutions always remain manually approved, visible and noncommercial',()=>{
 const sql=read('src/services/resuelve-saved-v364.js');
 assert.match(sql,/q.status='resolved'/);
 assert.match(sql,/q.library_opt_out=FALSE AND q.library_approved_answer_id=q.accepted_answer_id/);
 assert.match(sql,/a.status='visible'/);
 assert.match(sql,/author.status='active'/);
 assert.match(sql,/respondent.status='active'/);
 assert.match(sql,/split_part\(a.body,' Anuncio recomendado:',1\)/);
 assert.match(sql,/char_length\(trim\(q.body\)\)>=50/);
 assert.match(sql,/ORDER BY s.created_at DESC LIMIT 50/);
 assert.match(sql,/WHERE user_id=\$1\)<50/);
 assert.match(sql,/DELETE FROM resuelve_saved_solutions_v364 WHERE user_id=\$1 AND question_id=\$2/);
 assert.doesNotMatch(sql,/seo_public_opt_in=TRUE|email|reporter_id|password|ratingValue/i);
});

test('V3.6.4: bookmarks cannot expose another users list',async()=>{
 const calls=[],db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('ORDER BY s.created_at DESC'))return {rows:[{id:'14',title:'Una solución útil',solution:'Experiencia',category:'ayuda'}],rowCount:1};
  if(sql.includes('RETURNING question_id'))return {rows:[{question_id:'14'}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const svc=createSavedSolutionsService({db,ensureBase:async()=>{}});
 const list=await svc.list(3);
 assert.equal(list.length,1);
 assert.deepEqual(calls.find(q=>q.sql.includes('ORDER BY s.created_at DESC')).args,[3]);
 assert.deepEqual(await svc.save(3,'14',true),{enabled:true});
 assert.deepEqual(await svc.save(3,'14',false),{enabled:false});
 assert.equal(await svc.save(3,'not-an-id',true),null);
 assert.equal(await svc.save(3,'14','true'),null);
 assert.ok(calls.some(q=>q.sql.includes('RETURNING question_id')&&q.args[0]===3));
 assert.ok(calls.some(q=>q.sql.includes('DELETE FROM resuelve_saved_solutions_v364')&&q.args[0]===3));
});

test('V3.6.4: mobile bookmark controls do not generate ratings or publish posts',()=>{
 const html=read('public/resuelve.html');
 const js=read('public/resuelve-v350.js');
 const css=read('public/resuelve-v350.css');
 for(const id of ['savedSolutionsPanel','savedSolutionsList','savedSolutionsStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="savedSolutionsPanel"[^>]*hidden/);
 assert.match(js,/savedSolutionIds:new Set\(\)/);
 assert.match(js,/async function loadSavedSolutions\(\)/);
 assert.match(js,/request\('\/api\/resuelve\/solutions\/saved'\)/);
 assert.match(js,/function savedSolutionButton\(q\)/);
 assert.match(js,/write\('\/api\/resuelve\/solutions\/'\+encodeURIComponent\(q.id\)\+'\/save',\{enabled\}\)/);
 assert.match(js,/article.append\(savedSolutionButton\(q\)\)/);
 assert.match(js,/if\(guest\)state.savedSolutionIds.clear\(\)/);
 assert.match(js,/aria-pressed/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(css,/\.resuelve-saved-panel/);
 assert.match(css,/@media\(max-width:650px\)/);
});