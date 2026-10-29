'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const recovery=require('../src/services/marketplace-comparador-recovery-v3464');
const {router,seoAdminView}=require('../src/routes/marketplace-comparador-v32132');
const DAY=24*3600000;
const now=Date.now(),recent=new Date(now-DAY).toISOString(),old=new Date(now-9*DAY).toISOString();
const offer=(shop,price=22000,title='Apple iPhone 12 128 GB Negro')=>({
 title,shop,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 internal:false,href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/producto'
});
const offers=[offer('Tienda A',22000),offer('Tienda B',23500),offer('Tienda C',24500)];
function page(id,extra={}){
 return {id,slug:'iphone-12-128-'+id,query_text:'iphone 12 128 GB negro',
  provider_status:'ok',last_checked_at:recent,external_results:offers,
  index_approved:false,seo_blocked:false,editorial_summary:'',...extra};
}
test('clasifica aptas, bloqueadas, actualizaciones activas y fallos sin modificar registros',()=>{
 const p=page(1);
 assert.equal(recovery.inspect(p).category,'apta');
 assert.equal(recovery.inspect(page(2,{seo_blocked:true})).category,'bloqueada');
 const inProgress=page(3,{provider_status:'queued',job_status:'running',
  external_results:[],last_checked_at:null});
 assert.equal(recovery.inspect(inProgress).category,'en-curso');
 assert.equal(inProgress.provider_status,'queued');
 assert.equal(recovery.inspect(page(4,{provider_status:'unavailable',
  failure_code:'provider_timeout'})).category,'incidencia');
 assert.equal(recovery.inspect(page(5,{provider_status:'limit_reached'})).category,'pausada');
});
test('prioriza caducadas, sin ofertas y búsquedas demasiado generales sin crear datos',()=>{
 assert.equal(recovery.inspect(page(6,{last_checked_at:old})).category,'caducada');
 assert.equal(recovery.inspect(page(7,{external_results:[]})).category,'sin-ofertas');
 const generic=page(8,{query_text:'portatil asus',external_results:[
  offer('Tienda A',85000,'Portatil Asus Rog Strix G16'),
  offer('Tienda B',88000,'Portatil Asus Rog Strix G17')
 ]});
 assert.equal(recovery.inspect(generic).category,'precisar');
 const review=page(9,{external_results:offers.slice(0,1)});
 assert.equal(recovery.inspect(review).category,'revisar');
 const queue=recovery.queue([page(1),page(2,{seo_blocked:true}),review,
  page(6,{last_checked_at:old}),page(7,{external_results:[]})],'accionables');
 assert.equal(queue.counts.todas,5);
 assert.equal(queue.counts.accionables,3);
 assert.deepEqual(queue.rows.map(x=>x.page.id),[9,6,7]);
 assert.equal(queue.rows[0].offerCount,1);
});
test('respetar cuota pausada y el diagnóstico sanitizado sin sugerir reintentos automáticos',()=>{
 const quota={available:false,reason:'daily',daily:20,monthly:250,dailyUsed:20,monthlyUsed:85};
 const paused=recovery.inspect(page(10,{provider_status:'unavailable',failure_code:'provider_timeout'}),quota);
 assert.equal(paused.category,'pausada');
 assert.match(paused.action,/medianoche/);
 const rejected=recovery.inspect(page(11,{provider_status:'unavailable',
  failure_code:'provider_invalid_key'}));
 assert.equal(rejected.category,'pausada');
 assert.doesNotMatch(JSON.stringify(rejected),/api_key|https:\/\/serpapi\.com/);
 const work=recovery.queue([page(12,{provider_status:'checking',job_status:'running',external_results:[]}),
  page(13,{provider_status:'limit_reached'}),page(14)],'en-curso',quota);
 assert.deepEqual(work.rows.map(x=>x.page.id),[12]);
 assert.equal(work.counts.pausadas,1);
 assert.equal(work.counts.aptas,1,'no se degrada una ficha indexable solo porque no haya cuota');
 assert.equal(recovery.queue([], 'invalid').selected,'todas');
});
test('la ruta de recuperación exige autenticación antes de ejecutar consultas',async()=>{
 let calls=0;const old=db.query;
 db.query=async()=>{calls++;throw Error('No debe consultar DB sin sesión');};
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/recuperacion');
  assert.equal(res.status,401);
  assert.equal(calls,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.query=old;}
});
test('la vista privada solo lee una muestra y protege filtros, HTML y presupuesto',async()=>{
 const layer=router.stack.find(x=>x.route?.path==='/admin/comparador/recuperacion');
 assert.ok(layer);
 assert.equal(layer.route.stack.length,2);
 const handler=layer.route.stack[1].handle;
 const oldQuery=db.query,oldEnsure=worker.ensureSchema,oldQuota=worker.quotaStatus;
 const sql=[];
 try{
  worker.ensureSchema=async()=>{};
  worker.quotaStatus=async()=>({available:true,daily:20,monthly:250,dailyUsed:2,monthlyUsed:9});
  db.query=async(query,...args)=>{
   sql.push([query,args]);
   if(query.includes('LEFT JOIN marketplace_compare_jobs'))
    return {rowCount:2,rows:[page(21,{external_results:[]}),
     page(22,{query_text:'<script>alert(1)</script>',provider_status:'unavailable',
      external_results:[],failure_code:'provider_timeout'})]};
   throw Error('Consulta inesperada');
  };
  const headers={};
  const res={set(k,v){headers[k]=v;return this;},send(v){this.html=v;return this;}};
  let err=null;
  await handler({query:{estado:'accionables'}},res,e=>{err=e;});
  assert.equal(err,null);
  assert.equal(sql.length,1);
  assert.match(sql[0][0],/^SELECT p.id,/);
  assert.match(sql[0][0],/LIMIT 80$/);
  assert.doesNotMatch(sql[0][0],/\bINSERT\b|\bUPDATE\b|\bDELETE\b|serpapi/i);
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.equal(headers['Cache-Control'],'private,no-store');
  assert.match(res.html,/Recuperar comparaciones con criterio/);
  assert.match(res.html,/Filtrar recuperación SEO/);
  assert.match(res.html,/Para revisar/);
  assert.match(res.html,/Auriculares|Errores guardados|Ver los errores guardados/);
  assert.match(res.html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(res.html,/<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(res.html,/form method="post"|name="action" value="approve"/);
  assert.match(res.html,/no consulta SerpApi/);
 }finally{db.query=oldQuery;worker.ensureSchema=oldEnsure;worker.quotaStatus=oldQuota;}
});
test('panel SEO enlaza la cola, CSS móvil accesible y servicio sin consultas externas',()=>{
 const route=fs.readFileSync(path.join(__dirname,
  '../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const src=fs.readFileSync(path.join(__dirname,
  '../src/services/marketplace-comparador-recovery-v3464.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../public/comparador-premium-v3431.css'),'utf8');
 assert.match(route,/href="\/admin\/comparador\/recuperacion"/);
 assert.match(seoAdminView([], 'a'.repeat(48),'todas'),/cola de recuperación SEO/);
 assert.doesNotMatch(src,/\bfetch\s*\(|db\.query|reserveQuota|worker\.enqueue|resend|stripe|setInterval/i);
 assert.match(css,/V3\.4\.6\.4/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/:focus-visible/);
});
