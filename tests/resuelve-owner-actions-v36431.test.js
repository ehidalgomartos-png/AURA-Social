'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/resuelve-v350.js');
const html=read('public/resuelve.html');
const css=read('public/resuelve-owner-actions-v36431.css');
const start=source.indexOf('async function openPendingOwnerAction(id,action){');
const end=source.indexOf('async function loadPendingMine(){',start);
const helper=source.slice(start,end);

async function run({mode='clarify',question=null,user={id:9},details=true,answerCount=2}={}){
 const observed={scroll:0,focus:0,opened:false,visits:0};
 const panel={hidden:false};
 const textarea={focus:()=>{observed.focus++;}};
 const detailsElement=details?{
  open:false,scrollIntoView:()=>{observed.scroll++;},
  querySelector:()=>textarea
 }:null;
 const owner={querySelector:()=>detailsElement};
 const answers={childElementCount:answerCount,scrollIntoView:()=>{observed.scroll++;}};
 const context={
  state:{user,question},
  openDetail:async()=>{observed.visits++;context.state.question=context.state.question||{id:7,author_id:9,status:'open'};},
  el:key=>({'questionDetail':owner,'answerList':answers}[key]),
  String
 };
 vm.createContext(context);
 vm.runInContext(helper,context);
 await vm.runInContext("openPendingOwnerAction(7,'"+mode+"')",context);
 observed.opened=!!detailsElement?.open;
 return observed;
}
test('V3.6.43.1: abre aclaración en petición realmente abierta y propia',async()=>{
 const result=await run();
 assert.deepEqual(result,{scroll:1,focus:1,opened:true,visits:1});
});
test('V3.6.43.1: permite revisar respuestas existentes sin inventar alertas',async()=>{
 const result=await run({mode:'answers',answerCount:3});
 assert.equal(result.scroll,1);
 assert.equal(result.focus,0);
 assert.equal(result.opened,false);
 assert.equal((await run({mode:'answers',answerCount:0})).scroll,0);
});
test('V3.6.43.1: no abre una aclaración sin permisos ni en pregunta resuelta',async()=>{
 for(const opts of [
  {question:{id:7,author_id:18,status:'open'}},
  {question:{id:7,author_id:9,status:'resolved'}},
  {question:{id:19,author_id:9,status:'open'}},
  {user:null},
  {details:false}
 ]){
  const result=await run(opts);
  assert.equal(result.scroll,0);
  assert.equal(result.focus,0);
 }
});
test('V3.6.43.1: usa API privada, cifras reales y controles de la vista detalle existente',()=>{
 const service=read('src/services/resuelve-v350.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(source,/request\('\/api\/resuelve\/questions\/mine\/pending'\)/);
 assert.match(routes,/router\.get\('\/questions\/mine\/pending',requireAuth/);
 assert.match(source,/!Number\.isSafeInteger\(count\)\|\|count<0/);
 assert.match(source,/void openPendingOwnerAction\(q\.id,count\?'answers':'clarify'\)/);
 assert.match(source,/count\?'Leer respuestas':'Añadir una aclaración'/);
 assert.match(source,/no indica mensajes nuevos/);
 assert.match(source,/details\.querySelector\('textarea'\)/);
 assert.match(source,/field\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/if\(answers\.childElementCount\)answers\.scrollIntoView/);
 assert.match(routes,/resuelvePendingService\.listPending\(req\.user\.id\)/);
 assert.match(html,/id="myPendingPanel"[^>]*hidden/);
 assert.match(html,/Compartir sigue siendo voluntario/);
 assert.match(html,/resuelve-owner-actions-v36431\.css\?v=3\.6\.43\.1/);
 assert.doesNotThrow(()=>new Function(source));
});
test('V3.6.43.1: móvil accesible sin overlays, avisos automáticos ni venta',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/position:fixed|pointer-events:none|outline:none/);
 assert.doesNotMatch(helper,/sendEmail|POST|setTimeout|notify|localStorage|sessionStorage/);
});
