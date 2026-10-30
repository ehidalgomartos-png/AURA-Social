'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.37: only admin can read the private seven-day activity',()=>{
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(routes,/router\.get\('\/admin\/activity-7d',requireAuth/);
 assert.match(routes,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 assert.match(routes,/service\.adminActivity7d\(\)/);
 assert.match(routes,/res\.json\(\{ok:true,days,asOf:new Date\(\)\.toISOString\(\)\}\)/);
});
test('V3.5.37: figures count real visible activity, not arbitrary usage or private identities',()=>{
 const service=read('src/services/resuelve-v350.js');
 const block=service.slice(service.indexOf('async function adminActivity7d()'),
  service.indexOf('// V3.5.18 — impacto'));
 assert.match(block,/generate_series\(0,6\)/);
 assert.match(block,/q\.status<>'hidden'/);
 assert.match(block,/a\.status='visible'/);
 assert.match(block,/author.status='active'/);
 assert.match(block,/respondent.status='active'/);
 assert.match(block,/q\.status='resolved'/);
 assert.match(block,/a.id=q.accepted_answer_id/);
 assert.match(block,/ORDER BY days.day ASC/);
 assert.doesNotMatch(block,/author.email|respondent.email|a.body|q.body|notify|INSERT|UPDATE|DELETE/);
});
test('V3.5.37: seven-day aggregates are integers and invalid stats fail safely',async()=>{
 const db=require('../src/db'),original=db.query;
 db.query=async(sql)=>{
  if(sql.includes('generate_series(0,6)'))return {rows:[
   {day:'2026-10-24',questions:'1',answers:'2',resolutions:'0'},
   {day:'2026-10-25',questions:'0',answers:'3',resolutions:'1'}
  ]};
  return {rows:[]};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  let x=await service.adminActivity7d();
  assert.deepEqual(x,[{day:'2026-10-24',questions:1,answers:2,resolutions:0},{day:'2026-10-25',questions:0,answers:3,resolutions:1}]);
  db.query=async(sql)=>sql.includes('generate_series(0,6)')?
   {rows:[{day:'2026-10-24',questions:-4,answers:0,resolutions:0}]}:{rows:[]};
  await assert.rejects(service.adminActivity7d(),/metricas_invalidas/);
 }finally{db.query=original;}
});
test('V3.5.37: administrator table is accessible, mobile-first, no automatic moderation',()=>{
 const html=read('src/views/resuelve-admin-v3519.html'),
  js=read('public/resuelve-admin-v3519.js'),
  css=read('public/resuelve-admin-v3519.css');
 assert.match(html,/id="actividad"/);
 assert.match(html,/id="activity7dRows"/);
 assert.match(html,/id="refreshActivity7d"/);
 assert.match(html,/scope="col">Peticiones/);
 assert.match(js,/async function activity7d\(\)/);
 assert.match(js,/api\('\/api\/resuelve\/admin\/activity-7d'\)/);
 assert.match(js,/await Promise\.all\(\[impact\(\),solutions\(\),reports\(\),trustSummary\(\),activity7d\(\)\]\)/);
 assert.match(js,/tbody.replaceChildren\(\.\.\.rows\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(css,/\.resuelve-activity-table-wrap/);
 assert.match(css,/@media\(max-width:650px\)/);
});