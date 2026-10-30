'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function runImpactQuery(){
 const source=read('src/services/resuelve-v350.js');
 const start=source.indexOf('async function adminImpactStats(){');
 const end=source.indexOf('module.exports=',start);
 assert.ok(start>0&&end>start);
 const calls=[];
 const db={query:async sql=>{
  calls.push(sql);
  return {rows:[{
   public_questions:29,open_questions:16,open_without_answers:5,resolved_questions:13,
   questions_with_answers:24,unique_helpers:10,thanked_resolutions:7,questions_30d:12,resolved_30d:6
  }]};
 }};
 const context=vm.createContext({db,ensureSchema:async()=>{}});
 vm.runInContext(source.slice(start,end)+';globalThis.runImpact=adminImpactStats;',context);
 return {run:context.runImpact,calls};
}

test('V3.6.22: métrica de ayuda pendiente solo usa preguntas públicas y respuestas visibles',async()=>{
 const {run,calls}=runImpactQuery();
 const data=await run();
 assert.equal(calls.length,1);
 const sql=calls[0];
 assert.match(sql,/public_questions q WHERE q.status='open'/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM resuelve_answers a/);
 assert.match(sql,/a.question_id=q.id AND a.status='visible'/);
 assert.match(sql,/AS open_without_answers/);
 assert.match(sql,/JOIN users author ON author.id=q.author_id AND author.status='active'/);
 assert.equal(data.open_without_answers,5);
 assert.equal(data.open_questions,16);
 assert.equal(data.resolved_questions,13);
 assert.deepEqual(Object.keys(data).sort(),[
  'open_questions','open_without_answers','public_questions','questions_30d',
  'questions_with_answers','resolved_30d','resolved_questions','thanked_resolutions',
  'unique_helpers'
 ].sort());
 assert.doesNotMatch(sql,/messages|email|password|phone|INSERT|DELETE|UPDATE|recipient_id/i);
});

test('V3.6.22: administración representa cifras verificadas y no mezcla respuestas con resoluciones',async()=>{
 const code=read('public/resuelve-admin-v3519.js');
 const start=code.indexOf(' async function impact(){');
 const end=code.indexOf(' // V3.5.37',start);
 assert.ok(start>=0&&end>start);
 const metrics={
  public_questions:29,open_questions:16,open_without_answers:5,
  questions_with_answers:24,resolved_questions:13,unique_helpers:10,
  thanked_resolutions:7,questions_30d:12,resolved_30d:6
 };
 const grid={children:[],replaceChildren(...items){this.children=items;}};
 const status={textContent:''},refresh={disabled:false};
 const elements={adminImpactStatus:status,refreshAdminImpact:refresh,adminImpactMetrics:grid};
 const node=(tag,cls,value)=>({
  tag,cls,textContent:value===undefined?'':String(value),
  children:[],append(...items){this.children.push(...items);}
 });
 const context=vm.createContext({
  el:id=>elements[id],node,state:{impactBusy:false},
  api:async()=>({ok:true,metrics,asOf:'2026-10-30T20:00:00.000Z'})
 });
 vm.runInContext(code.slice(start,end)+';globalThis.renderImpact=impact;',context);
 await context.renderImpact();
 assert.equal(grid.children.length,9);
 const captions=grid.children.map(card=>card.children[1].textContent);
 assert.ok(captions.includes('Abiertas sin respuestas visibles'));
 const item=grid.children.find(card=>card.children[1].textContent==='Abiertas sin respuestas visibles');
 assert.equal(item.children[0].textContent,'5');
 assert.equal(refresh.disabled,false);
 assert.match(status.textContent,/Actualizado/);
});

test('V3.6.22: se conserva la autorización administrativa y la consulta de solo lectura',()=>{
 const route=read('src/routes/resuelve-v350.js');
 assert.match(route,/router\.get\('\/admin\/impact',requireAuth/);
 assert.match(route,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 const view=read('src/views/resuelve-admin-v3519.html');
 assert.match(view,/id="resuelveAdminContent" hidden/);
 assert.match(view,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(view,/Las peticiones abiertas sin respuestas visibles/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(service,/async function adminImpactStats\(\)/);
});
