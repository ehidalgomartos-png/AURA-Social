'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.28: facets only count approved visible solutions from active real people',()=>{
 const service=read('src/services/resuelve-v350.js');
 const api=read('src/routes/resuelve-v350.js');
 const scope=service.slice(service.indexOf('async function librarySummary('),service.indexOf('// V3.5.8: cola privada'));
 assert.match(scope,/JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'/);
 assert.match(scope,/u.status='active'/);
 assert.match(scope,/respondent.status='active'/);
 assert.match(scope,/q.status='resolved' AND q.library_opt_out=FALSE/);
 assert.match(scope,/q.library_approved_answer_id=q.accepted_answer_id/);
 assert.match(scope,/char_length\(trim\(split_part\(a.body/);
 assert.match(scope,/char_length\(trim\(q.body\)\)>=50/);
 assert.match(scope,/GROUP BY q.category/);
 assert.doesNotMatch(scope,/reporter_id|password|email|UPDATE|DELETE|INSERT/);
 assert.match(api,/router.get\('\/solutions\/summary',wrap/);
 assert.match(api,/query.length>80\|\|query.trim\(\).length===1/);
});

test('V3.5.28: counts are grounded, stable and discard unknown categories',async()=>{
 const db=require('../src/db'),prior=db.query;
 const calls=[];
 db.query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('GROUP BY q.category'))return {rows:[
   {category:'ayuda',approved_count:5},{category:'consejo',approved_count:3},
   {category:'desconocida',approved_count:999}],rowCount:3};
  return {rows:[],rowCount:0};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  const x=await service.librarySummary({query:'tubería'});
  assert.equal(x.total,8);
  assert.deepEqual(x.byCategory,{consejo:3,busco:0,ayuda:5,experiencia:0});
  assert.deepEqual(calls.find(c=>c.sql.includes('GROUP BY q.category')).args,['tubería']);
 }finally{db.query=prior;}
});

test('V3.5.28: categories are accessible and keep the active search term',()=>{
 const js=read('public/resuelve-v350.js');
 const html=read('public/resuelve.html');
 const css=read('public/resuelve-v350.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/id="solutionCategoryShortcuts"/);
 assert.match(html,/id="solutionSummaryStatus"/);
 assert.match(js,/async function loadSolutionSummary\(\)/);
 assert.match(js,/\/api\/resuelve\/solutions\/summary\?/);
 assert.match(js,/params.set\('q',state.solutionSearch\)/);
 assert.match(js,/setAttribute\('aria-pressed',chosen\?'true':'false'\)/);
 assert.match(js,/el\('solutionCategory'\).value=category/);
 assert.match(js,/if\(!more\)await loadSolutionSummary\(\)/);
 assert.match(css,/\.resuelve-solution-shortcuts/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});