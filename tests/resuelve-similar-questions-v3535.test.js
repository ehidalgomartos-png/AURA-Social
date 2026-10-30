'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.35: token matching ignores generic terms and avoids empty searches',()=>{
 const service=require('../src/services/resuelve-v350');
 assert.deepEqual(service.similarQueryTokens('Cómo necesito ayuda para hacer un trámite'),['trámite']);
 assert.deepEqual(service.similarQueryTokens('Necesito ayuda'),[]);
 assert.deepEqual(service.similarQueryTokens(''),[]);
 assert.deepEqual(service.similarQueryTokens('x'.repeat(126)),[]);
 assert.ok(service.similarQueryTokens('Ordenar archivos y fotos del teléfono').length<=5);
});

test('V3.5.35: only real public question titles are suggested; reviewed solutions prioritized',async()=>{
 const db=require('../src/db'),prior=db.query,calls=[];
 db.query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('unnest($1::text[])'))return {rows:[
   {id:'12',title:'Ayuda con trámite',status:'resolved',reviewed_solution:true},
   {id:'10',title:'Trámite del ayuntamiento',status:'open',reviewed_solution:false}
  ]};
  return {rows:[],rowCount:0};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  const results=await service.similarQuestions('Cómo necesito ayuda para hacer un trámite');
  assert.equal(results.length,2);
  const query=calls.find(c=>c.sql.includes('unnest($1::text[])'));
  assert.ok(query);
  assert.deepEqual(query.params,[['trámite']]);
  assert.match(query.sql,/JOIN users u ON u.id=q.author_id AND u.status='active'/);
  assert.match(query.sql,/WHERE \(q.status='open' OR \(q.status='resolved'/);
  assert.match(query.sql,/q.library_approved_answer_id=q.accepted_answer_id/);
  assert.match(query.sql,/q.library_opt_out=FALSE/);
  assert.match(query.sql,/a.status='visible'/);
  assert.match(query.sql,/AND EXISTS \(SELECT 1 FROM unnest\(\$1::text\[\]\) token/);
  assert.match(query.sql,/lower\(q.title\)/);
  assert.match(query.sql,/ORDER BY reviewed_solution DESC/);
  assert.match(query.sql,/LIMIT 5/);
  assert.doesNotMatch(query.sql,/q.body|a.body|u.email|password|reporter_id/);
  assert.equal((await service.similarQuestions('necesito ayuda')).length,0);
 }finally{db.query=prior;}
});

test('V3.5.35: public API validates length, excludes private fields and sits before dynamic ID route',()=>{
 const router=read('src/routes/resuelve-v350.js');
 assert.match(router,/router.get\('\/questions\/similar',wrap/);
 assert.match(router,/title.length>125\|\|title.trim\(\).length<8/);
 assert.match(router,/service.similarQuestions\(title\)/);
 assert.ok(router.indexOf("router.get('/questions/similar'")<router.indexOf("router.get('/questions/:id'"));
});

test('V3.5.35: draft stays editable; results are safe and optional',()=>{
 const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js'),css=read('public/resuelve-v350.css');
 for(const id of ['askSimilarPanel','askSimilarStatus','askSimilarList','askTitleInput']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/id="askSimilarPanel"[^>]+hidden/);
 assert.match(js,/addEventListener\('input'/);
 assert.match(js,/setTimeout\(\(\)=>\{similarTimer=null;void loadSimilarQuestions\(title,requestNumber\);\},450\)/);
 assert.match(js,/request\('\/api\/resuelve\/questions\/similar\?'/);
 assert.match(js,/link.target='_blank';link.rel='noopener noreferrer'/);
 assert.match(js,/requestNumber!==similarRequestNumber/);
 assert.match(js,/q.reviewed_solution\?/);
 assert.match(js,/clearSimilar\(\);message\('Tu petición se ha publicado/);
 assert.match(css,/\.resuelve-similar-panel/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});