'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const adminMerchants=require('../src/services/marketplace-comparador-admin-merchants-v3453');
const growth=require('../src/services/marketplace-comparador-merchant-growth-v3454');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');

function makeStore(id,changes={}){
 return {id,name:'Tienda '+id,username:'comercio'+id,status:'approved',platform:'woocommerce',
  linked_count:3,available_count:2,stale_api_count:0,no_stock_count:0,
  purchase_enabled:true,connected:true,sync_enabled:true,...changes};
}
test('etapas de incorporación con pasos reales y ninguna aprobación automática',()=>{
 const rows=[
  makeStore(1,{status:'pending',linked_count:0,available_count:0,purchase_enabled:false}),
  makeStore(2,{status:'draft',linked_count:0,available_count:0,purchase_enabled:false}),
  makeStore(3,{status:'approved',linked_count:0,available_count:0}),
  makeStore(4,{status:'approved',purchase_enabled:false}),
  makeStore(5,{status:'approved',available_count:0}),
  makeStore(6,{status:'approved',stale_api_count:2}),
  makeStore(7,{status:'suspended',purchase_enabled:false}),
  makeStore(8)
 ];
 const report=adminMerchants.summarize(rows);
 assert.deepEqual(growth.overview(report.items).rows.map(x=>x.key),
  ['review','draft','catalog','checkout','offers','sync','paused','ready']);
 assert.equal(growth.overview(report.items).needsAction,7);
 assert.equal(growth.overview(report.items).ready,1);
 assert.match(growth.nextStep(report.items[0]).action,/dominio y titularidad/);
 assert.match(growth.nextStep(report.items[7]).action,/no se garantiza posicionamiento/);
});
test('la cohorte muestra como máximo 20 tiendas de la muestra, nunca totales globales',()=>{
 const reports=adminMerchants.summarize(Array.from({length:30},(_,i)=>makeStore(i+1))).items;
 const pilot=growth.overview(reports);
 assert.equal(pilot.sampled,20);
 assert.equal(pilot.rows.at(0).id,'1');
 assert.equal(pilot.rows.at(-1).id,'20');
 assert.equal(pilot.ready,20);
 assert.throws(()=>growth.overview(reports,100),/invalid_cohort_limit/);
});
test('sesión anónima no puede consultar la cohorte ni PostgreSQL',async()=>{
 let count=0;const old=db.query;
 db.query=async()=>{count++;throw Error('No consulta sin sesión');};
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
 try{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/comercios-panel');
  assert.equal(r.status,401);
  assert.equal(count,0);
 }finally{db.query=old;await new Promise(resolve=>server.close(resolve));}
});
test('el panel ofrece checklist e invitación manual con escape XSS y sin emails automáticos',async()=>{
 const target=router.stack.find(layer=>layer.route?.path==='/admin/comparador/comercios-panel');
 assert.ok(target);
 const old=db.query;const calls=[];
 db.query=async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT s.id,s.name,s.status,s.platform,s.purchase_enabled,u.username'))
   return {rowCount:2,rows:[
    makeStore(1,{name:'Tienda <script>alert(1)</script>',status:'pending',linked_count:0,available_count:0,purchase_enabled:false}),
    makeStore(2)
   ]};
  if(sql.startsWith('SELECT store_id,COALESCE(SUM(click_count),0)::bigint AS clicks'))
   return {rowCount:0,rows:[]};
  throw Error('Unexpected SQL: '+sql);
 };
 const headers={};
 const res={set(name,val){headers[name]=val;return this;},send(body){this.body=body;return this;}};
 let error=null;
 try{await target.route.stack.at(-1).handle({query:{}},res,e=>{error=e;});}
 finally{db.query=old;}
 assert.equal(error,null);
 assert.equal(headers['Cache-Control'],'private,no-store');
 assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
 assert.match(res.body,/Cohorte piloto: 20 tiendas recientes/);
 assert.match(res.body,/2<\/strong><span>En la muestra piloto/);
 assert.match(res.body,/1<\/strong><span>Necesitan una revisión o un paso/);
 assert.match(res.body,/1<\/strong><span>Con ofertas preparadas/);
 assert.match(res.body,/Pendiente de revisión/);
 assert.match(res.body,/Ofertas preparadas/);
 assert.match(res.body,/Invitación para nuevos comercios \(envío manual\)/);
 assert.match(res.body,/readonly rows="5"/);
 assert.match(res.body,/https:\/\/redlibertad\.com\/comparar\/comercios/);
 assert.doesNotMatch(res.body,/<script>alert\(1\)<\/script>/);
 assert.match(res.body,/Tienda &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.sql.startsWith('SELECT')));
 assert.ok(!calls.some(x=>/UPDATE|INSERT|DELETE|serpapi/i.test(x.sql)));
});
test('no modifica el sistema de aprobaciones, mensajería ni pagos',()=>{
 const region=source.split('// V3.4.5.3 — una vista de administración')[1]
  .split("router.get('/admin/comparador/comercios-estadisticas'")[0];
 assert.ok(region);
 assert.match(region,/merchantGrowth\.overview\(report\.items\)/);
 assert.doesNotMatch(region,/method="post"|sendEmail|resend\.|stripe\.|INSERT INTO|UPDATE marketplace_professional_stores/i);
 assert.match(region,/la ausencia de enlace directo no demuestra falta de stock/);
});
test('el checklist tiene controles accesibles y distribución móvil sin overlays',()=>{
 const part=css.split('/* V3.4.5.4 — cohorte piloto de 20 comercios')[1];
 assert.ok(part);
 assert.match(part,/@media\(max-width:760px\)/);
 assert.match(part,/@media\(max-width:420px\)/);
 assert.match(part,/:focus-visible/);
 assert.match(part,/min-height:48px/);
 assert.doesNotMatch(part,/display:\s*none|position:\s*fixed|pointer-events:\s*none/);
});
