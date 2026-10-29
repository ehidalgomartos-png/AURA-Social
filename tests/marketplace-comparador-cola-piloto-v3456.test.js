'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const merchant=require('../src/services/marketplace-comparador-admin-merchants-v3453');
const growth=require('../src/services/marketplace-comparador-merchant-growth-v3454');

function store(id,extra={}){
 return {id,name:'Comercio '+id,username:'usuario'+id,status:'approved',
  platform:'woocommerce',purchase_enabled:true,linked_count:3,
  available_count:2,stale_api_count:0,no_stock_count:0,
  connected:true,sync_enabled:true,...extra};
}
const sample=[
 store(1,{status:'approved'}),
 store(2,{status:'pending',purchase_enabled:false,linked_count:0,available_count:0}),
 store(3,{status:'approved',linked_count:0,available_count:0,
  name:'Tienda <script>alert(1)</script>'}),
 store(4,{status:'suspended',purchase_enabled:false,linked_count:0,available_count:0})
];
test('clasifica la cohorte en solicitudes, catálogos, preparadas y pausadas',()=>{
 const pilot=growth.overview(merchant.summarize(sample).items);
 const queue=growth.queue(pilot);
 assert.deepEqual(queue.rows.map(item=>item.key),['review','catalog','ready','paused']);
 assert.deepEqual(queue.counts,{todas:4,solicitudes:1,catalogos:1,preparadas:1,pausadas:1});
 assert.equal(queue.rows[0].id,'2');
 assert.equal(queue.total,4);
 assert.equal(growth.queue(pilot,'catalogos').rows[0].id,'3');
 assert.deepEqual(growth.queue(pilot,'solicitudes').rows.map(item=>item.id),['2']);
 assert.deepEqual(growth.queue(pilot,'preparadas').rows.map(item=>item.id),['1']);
 assert.deepEqual(growth.queue(pilot,'pausadas').rows.map(item=>item.id),['4']);
});
test('el filtro inválido vuelve a todas, mantiene orden estable y top 20',()=>{
 const rows=Array.from({length:30},(_,i)=>store(i+1,{status:'pending'}));
 const pilot=growth.overview(merchant.summarize(rows).items);
 const queue=growth.queue(pilot,'../../borrar');
 assert.equal(queue.selected,'todas');
 assert.equal(queue.total,20);
 assert.equal(queue.rows[0].id,'1');
 assert.equal(queue.rows.at(-1).id,'20');
 assert.equal(growth.queue(null).total,0);
 assert.equal(growth.queue(pilot,'catalogos').rows.length,0);
});
async function adminPage(filter){
 const target=router.stack.find(layer=>layer.route?.path==='/admin/comparador/comercios-panel');
 assert.ok(target);
 const prev=db.query,calls=[];
 db.query=async(sql)=>{
  calls.push(sql);
  if(sql.startsWith('SELECT s.id,s.name,s.status,s.platform,s.purchase_enabled,u.username'))
   return {rowCount:sample.length,rows:sample};
  if(sql.startsWith('SELECT store_id,COALESCE(SUM(click_count),0)::bigint AS clicks'))
   return {rowCount:0,rows:[]};
  throw Error('SQL no esperado');
 };
 const headers={},res={
  set(key,value){headers[key]=value;return this;},
  send(value){this.body=value;return this;}
 };
 let caught=null;
 try{await target.route.stack.at(-1).handle({query:{paso:filter}},res,e=>{caught=e;});}
 finally{db.query=prev;}
 if(caught)throw caught;
 return {html:res.body,headers,calls};
}
test('panel admin muestra filtros y un comercio de catálogo, con enlace al diagnóstico',async()=>{
 const r=await adminPage('catalogos');
 const cohort=r.html.split('<section id="primeros-comercios"')[1].split('</section>')[0];
 assert.match(cohort,/Filtrar la cohorte por siguiente paso/);
 assert.match(cohort,/Catálogos \(1\)/);
 assert.match(cohort,/Solicitudes \(1\)/);
 assert.match(cohort,/Preparadas \(1\)/);
 assert.match(cohort,/Pausadas \(1\)/);
 assert.match(cohort,/paso=catalogos#primeros-comercios" aria-current="page"/);
 assert.equal((cohort.match(/class="cmp-growth-card"/g)||[]).length,1);
 assert.match(cohort,/comercios-panel\?estado=todas#comercio-3/);
 assert.match(r.html,/id="comercio-3"/);
 assert.match(cohort,/Tienda &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(cohort,/<script>alert\(1\)<\/script>/);
 assert.equal(r.headers['Cache-Control'],'private,no-store');
 assert.equal(r.headers['X-Robots-Tag'],'noindex,nofollow');
 assert.equal(r.calls.length,2);
 assert.ok(r.calls.every(sql=>sql.startsWith('SELECT')));
});
test('filtro vacío y valor arbitrario no filtran los diagnósticos generales',async()=>{
 const empty=await adminPage('desconocido');
 const cohort=empty.html.split('<section id="primeros-comercios"')[1].split('</section>')[0];
 assert.match(cohort,/paso=todas#primeros-comercios" aria-current="page"/);
 assert.equal((cohort.match(/class="cmp-growth-card"/g)||[]).length,4);
 const none=await adminPage('solicitudes');
 assert.equal((none.html.match(/class="cmp-merchant-admin-card"/g)||[]).length,4);
});
test('estilos móviles y enlaces accesibles, sin botones de aprobación ni nuevas escrituras',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const section=source.split('// V3.4.5.3 — una vista de administración')[1]
  .split("router.get('/admin/comparador/comercios-estadisticas'")[0];
 assert.match(section,/merchantGrowth\.queue\(cohort,req\.query\?\.paso\)/);
 assert.doesNotMatch(section,/method="post"|sendEmail|resend\.|INSERT INTO|UPDATE marketplace_professional_stores/);
 assert.match(css,/\/\* V3\.4\.5\.6/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/cmp-growth-filters a:focus-visible/);
 assert.match(css,/cmp-merchant-admin-card:target/);
 assert.match(css,/min-height:44px/);
});
