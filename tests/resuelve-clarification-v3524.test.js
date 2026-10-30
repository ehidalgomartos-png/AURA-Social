'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.24: only author of open question can append an atomic bounded clarification',async()=>{
 const db=require('../src/db'),original=db.query,calls=[];
 db.query=async(sql,args=[])=>{
  calls.push({sql,args});
  return {rowCount:sql.includes('UPDATE resuelve_questions SET body=body||$3')?1:0,
   rows:sql.includes('UPDATE resuelve_questions SET body=body||$3')?[{id:'9',body:'pregunta'}]:[]};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  assert.equal(service.validateClarification('corto'),null);
  assert.equal(service.validateClarification('x'.repeat(301)),null);
  assert.equal(service.validateClarification('x'.repeat(20)),'x'.repeat(20));
  assert.equal(await service.clarifyQuestion('9',42,'x'.repeat(20))!=null,true);
  const update=calls.find(c=>c.sql.includes('UPDATE resuelve_questions SET body=body||$3'));
  assert.ok(update);
  assert.deepEqual(update.args.slice(0,2),['9',42]);
  assert.match(update.sql,/author_id=\$2/);
  assert.match(update.sql,/status='open'/);
  assert.match(update.sql,/char_length\(body\)\+char_length\(\$3\)<=1800/);
  assert.match(update.args[2],/Aclaración:/);
  assert.equal(await service.clarifyQuestion('invalid',42,'x'.repeat(20)),null);
 }finally{db.query=original;}
});

test('V3.5.24: endpoint validates content, requires auth, origin and hourly limit',()=>{
 const route=read('src/routes/resuelve-v350.js');
 assert.match(route,/router\.post\('\/questions\/:id\/clarify',requireAuth,checkOrigin,limiter\(5\)/);
 assert.match(route,/service\.validateClarification\(req\.body\?\.text\)/);
 assert.match(route,/service\.clarifyQuestion\(req\.params\.id,req\.user\.id,req\.body\.text\)/);
 assert.match(route,/return fail\(res,409,'no_se_puede_aclarar'\)/);
});

test('V3.5.24: the form is only shown to author before resolution, no HTML injection',()=>{
 const js=read('public/resuelve-v350.js'),css=read('public/resuelve-v350.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/if\(mine&&!solved\)/);
 assert.match(js,/resuelve-clarification-form/);
 assert.match(js,/event\.preventDefault\(\)/);
 assert.match(js,/form\.reportValidity\(\)/);
 assert.match(js,/send\.disabled=true/);
 assert.match(js,/Añadir una aclaración a mi pregunta/);
 assert.match(js,/no escribas teléfonos, direcciones ni datos privados/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});