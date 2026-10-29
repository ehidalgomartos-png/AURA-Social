'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const {assess,summarize,safeCount}=require('../src/services/marketplace-comparador-admin-merchants-v3453');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');

const stores=[
 {id:101,name:'Comercio <script>alert(1)</script>',username:'comerciante',status:'pending',platform:'woocommerce',
  purchase_enabled:false,linked_count:0,available_count:0,stale_api_count:0,no_stock_count:0,connected:false,sync_enabled:false},
 {id:102,name:'Tienda aprobada',username:'vendedor',status:'approved',platform:'woocommerce',
  purchase_enabled:true,linked_count:3,available_count:2,stale_api_count:1,no_stock_count:1,connected:true,sync_enabled:false},
 {id:103,name:'Tienda lista',username:'otro',status:'approved',platform:'other',
  purchase_enabled:true,linked_count:2,available_count:2,stale_api_count:0,no_stock_count:0,connected:false,sync_enabled:false},
 {id:104,name:'Tienda suspendida',username:'otro2',status:'suspended',platform:'other',
  purchase_enabled:false,linked_count:1,available_count:0,stale_api_count:0,no_stock_count:0,connected:false,sync_enabled:false}
];

test('resumen diferencia solicitudes, tiendas aprobadas y problemas de catálogo sin inventar ventas',()=>{
 const s=summarize(stores);
 assert.equal(s.counts.sampled,4);
 assert.equal(s.counts.pending,1);
 assert.equal(s.counts.approved,2);
 assert.equal(s.counts.suspended,1);
 assert.equal(s.counts.attention,3);
 assert.equal(s.counts.stale,1);
 assert.equal(s.items[2].attention,false);
 assert.match(s.items[0].reasons.join(' '),/pendiente de revisión/);
 assert.match(s.items[1].reasons.join(' '),/sincronización antigua/);
 assert.match(s.items[1].reasons.join(' '),/sin sincronización automática/);
 assert.doesNotMatch(s.items.flatMap(item=>item.reasons).join(' '),/venta confirmada|compras realizadas/);
});
test('normaliza entradas extrañas y nunca presenta contadores negativos',()=>{
 assert.equal(safeCount('-20'),0);
 assert.equal(safeCount('4'),4);
 assert.equal(safeCount(Infinity),0);
 assert.equal(safeCount('3.25'),0);
 const row=assess({id:8,linked_count:-4,available_count:'7.8',stale_api_count:Infinity,status:'other'});
 assert.equal(row.linked,0);
 assert.equal(row.available,0);
 assert.equal(row.stale,0);
 assert.equal(row.attention,true);
});
test('una tienda sin conexión API no se anuncia como sincronizada',()=>{
 const row=assess({...stores[2],platform:'woocommerce',connected:false,sync_enabled:false});
 assert.equal(row.connected,false);
 assert.equal(row.syncing,false);
 assert.equal(row.reasons.some(reason=>reason.includes('sin sincronización')),false);
});

const routeLayer=router.stack.find(layer=>layer.route?.path==='/admin/comparador/comercios-panel'&&layer.route.methods.get);
test('ruta nueva está protegida por requireAdmin y no es pública',async()=>{
 assert.ok(routeLayer);
 assert.equal(routeLayer.route.stack.length,2);
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const old=db.query;let calls=0;
 db.query=async()=>{calls++;throw Error('No debe consultar datos para visitantes anónimos');};
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/comercios-panel');
  assert.equal(response.status,401);
  assert.equal(calls,0);
 }finally{db.query=old;await new Promise(resolve=>server.close(resolve));}
});

async function privateRender(filter='todas',{noClicks=false}={}){
 const original=db.query;
 const calls=[];
 db.query=async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT s.id,s.name,s.status,s.platform,s.purchase_enabled,u.username'))
   return {rowCount:stores.length,rows:stores};
  if(sql.startsWith('SELECT store_id,COALESCE(SUM(click_count),0)::bigint AS clicks')){
   if(noClicks){const error=new Error('table missing');error.code='42P01';throw error;}
   return {rowCount:2,rows:[{store_id:101,clicks:'2'},{store_id:102,clicks:'15'}]};
  }
  throw Error('Unexpected SQL: '+sql);
 };
 const req={query:{estado:filter}},headers={};
 const res={set(k,v){headers[k]=v;return this;},send(html){this.body=html;return this;}};
 let error=null;
 try{
  await routeLayer.route.stack.at(-1).handle(req,res,err=>{error=err;});
  if(error)throw error;
  return {html:res.body,calls,headers};
 }finally{db.query=original;}
}
test('panel privado muestra métricas reales agregadas, historial y enlaces a herramientas existentes',async()=>{
 const r=await privateRender();
 assert.match(r.html,/Administración de comercios/);
 assert.match(r.html,/4<\/strong><span>Comercios revisados/);
 assert.match(r.html,/1<\/strong><span>Solicitudes pendientes/);
 assert.match(r.html,/3<\/strong><span>Con incidencias/);
 assert.match(r.html,/Clics registrados \(30 días\): 15/);
 assert.match(r.html,/Clics registrados \(30 días\): 0/);
 assert.match(r.html,/no son ventas, ingresos ni visitantes únicos/);
 assert.match(r.html,/href="\/admin\/comparador\/comercios-estadisticas"/);
 assert.match(r.html,/href="\/admin\/comparador\/diagnostico"/);
 assert.match(r.html,/href="\/admin\/comparador"/);
 assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!r.html.includes('<script>alert(1)</script>'));
 assert.equal(r.headers['Cache-Control'],'private,no-store');
 assert.equal(r.headers['X-Robots-Tag'],'noindex,nofollow');
});
test('filtros no consultan otras filas: usan la muestra de 80 tiendas',async()=>{
 const r=await privateRender('pendientes');
 assert.match(r.html,/Comercio &lt;script&gt;/);
 assert.doesNotMatch(r.html,/<h2>Tienda aprobada<\/h2>/);
 assert.doesNotMatch(r.html,/<h2>Tienda suspendida<\/h2>/);
 assert.match(r.html,/aria-current="page">Pendientes \(1\)/);
 assert.equal(r.calls.length,2);
 assert.equal(r.calls[0].params,undefined);
 assert.match(r.calls[0].sql,/ORDER BY s.created_at DESC,s.id DESC LIMIT 80$/);
 assert.match(r.calls[0].sql,/JOIN users u ON u.id=s.seller_id/);
 assert.match(r.calls[0].sql,/x.seller_id=s.seller_id/);
 assert.match(r.calls[0].sql,/c.store_id=s.id/);
 assert.deepEqual(r.calls[1].params,[['101','102','103','104']]);
 assert.match(r.calls[1].sql,/clicked_day>=CURRENT_DATE-INTERVAL '29 days'/);
 assert.match(r.calls[1].sql,/LIMIT 80$/);
 assert.ok(r.calls.every(item=>item.sql.startsWith('SELECT')));
});
test('si falta el registro histórico de clics no inventa cifras ni modifica el sistema',async()=>{
 const r=await privateRender('incidencias',{noClicks:true});
 assert.match(r.html,/Clics registrados \(30 días\): Datos no disponibles/);
 assert.doesNotMatch(r.html,/<h2>Tienda lista<\/h2>/);
 assert.equal(r.calls.length,2);
});
test('CSS móvil accesible y sin formularios de aprobación o pagos',()=>{
 assert.match(source,/router\.get\('\/admin\/comparador\/comercios-panel',requireAdmin/);
 assert.match(source,/Supervisar solicitudes y catálogos de comercios/);
 const block=source.split('// V3.4.5.3 — una vista de administración')[1].split("router.get('/admin/comparador/comercios-estadisticas'")[0];
 assert.ok(block);
 assert.doesNotMatch(block,/\bINSERT\b|\bUPDATE\b|\bDELETE\b|serpapi|stripe\.|fetch\(|method="post"/i);
 const styles=css.split('/* V3.4.5.3 — supervisión privada de comercios')[1];
 assert.ok(styles);
 assert.match(styles,/:focus-visible/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/@media\(max-width:390px\)/);
 assert.match(styles,/min-height:46px/);
 assert.doesNotMatch(styles,/position:\s*fixed|pointer-events:\s*none|@import/);
});
