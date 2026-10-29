'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const compare=require('../src/routes/marketplace-comparador-v32132');
const diagnostics=require('../src/services/marketplace-comparador-admin-quality-v34427');

const routeSource=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const good=(title='Apple iPhone 12 128GB Negro',shop='Tienda A',price=22000)=>({
 title,shop,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 href:'https://ejemplo-comercio.test/iphone12',internal:false
});
const now=Date.now();
const fresh=new Date(now-3*60*60*1000).toISOString();
const old=new Date(now-9*24*60*60*1000).toISOString();
function page(id,opts={}){
 return {id,slug:'iphone-12-128gb-'+id,query_text:'iphone 12 128 GB',
  last_checked_at:fresh,provider_status:'ok',seo_blocked:false,index_approved:false,
  external_results:[good()],...opts};
}
const info=()=>diagnostics.summarize([
 page(1),page(2,{last_checked_at:old,provider_status:'unavailable'}),
 page(3,{external_results:[good('Funda compatible con iPhone 12','Tienda Accesorios',1500),good()]}),
 page(4,{external_results:[],provider_status:'queued'})
],now);

test('métricas identifican precios guardados y búsquedas fallidas sin declarar agotamientos',()=>{
 const r=info();
 assert.equal(r.counts.reviewed,4);
 assert.equal(r.counts.stale,1);
 assert.equal(r.counts.attention,2);
 assert.equal(r.counts.noIssues,2);
 assert.equal(r.items[0].direct,1);
 assert.equal(r.items[1].attention,true);
 assert.match(r.items[1].issues.join(' '),/más de 48 horas/);
 assert.match(r.items[1].issues.join(' '),/no terminó correctamente/);
 assert.doesNotMatch(r.items.map(i=>i.issues.join(' ')).join(' '),/Sin stock|Agotado/);
});

test('distingue accesorios que se separan de los productos comparables',()=>{
 const r=info();
 const item=r.items[2];
 assert.equal(item.total,2);
 assert.equal(item.comparable,1);
 assert.equal(item.excluded,1);
 assert.match(item.issues.join(' '),/accesorios/);
});

test('búsqueda pendiente sin ofertas externas no se convierte en falsa incidencia',()=>{
 const r=info();
 assert.equal(r.items[3].status,'queued');
 assert.equal(r.items[3].attention,false);
});

test('nunca cuenta anuncios publicitarios como ofertas independientes',()=>{
 const r=diagnostics.assessPage(page(5,{
  external_results:[{...good(),sponsored:true},good('Apple iPhone 12 128GB Negro','Tienda B',24000)]
 }),now);
 assert.equal(r.total,1);
 assert.equal(r.comparable,1);
 assert.equal(r.direct,1);
});

test('la ruta admin requiere sesión antes de consultar la base de datos',async()=>{
 let queries=0;
 const original=db.query;
 db.query=async()=>{queries++;throw Error('La ruta sin sesión no debería consultar PostgreSQL');};
 const app=express();app.use(compare.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/diagnostico');
  assert.equal(response.status,401);
  const data=await response.json();
  assert.equal(data.error,'authentication_required');
  assert.equal(queries,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.query=original;}
});

test('panel admin real usa exclusivamente una SELECT acotada y no publica datos privados',async()=>{
 const layer=compare.router.stack.find(layer=>layer.route?.path==='/admin/comparador/diagnostico'&&layer.route.methods.get);
 assert.ok(layer);
 assert.equal(layer.route.stack.length,2,'auth admin y manejador de solo lectura');
 const handler=layer.route.stack[1].handle;
 const original=db.query,seen=[];
 db.query=async sql=>{seen.push(sql);return {rowCount:2,rows:[
  page(8,{query_text:'<script>alert(1)</script>'}),
  page(9,{last_checked_at:old})
 ]};};
 const headers={};
 const res={set(name,value){headers[name]=value;return this;},send(body){this.body=body;return this;}};
 let error=null;
 try{await handler({query:{estado:'revisar'}},res,err=>{error=err;});}
 finally{db.query=original;}
 assert.equal(error,null);
 assert.equal(seen.length,1);
 assert.match(seen[0],/^SELECT id,slug,query_text,/);
 assert.match(seen[0],/LIMIT 80$/);
 assert.doesNotMatch(seen[0],/\bINSERT\b|\bUPDATE\b|\bDELETE\b|serpapi/i);
 assert.equal(headers['Cache-Control'],'private,no-store');
 assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
 assert.match(res.body,/Calidad del comparador/);
 assert.match(res.body,/muestra de las últimas 2 comparaciones/);
 assert.match(res.body,/Con incidencias/);
 assert.ok(res.body.includes('href="/admin/comparador?estado=todas#comparacion-9"'));
 assert.ok(!res.body.includes('<script>alert(1)</script>'));
});

test('navegación del panel SEO, filtro móvil y accesibilidad tienen cobertura',()=>{
 assert.match(routeSource,/href="\/admin\/comparador\/diagnostico"/);
 assert.match(routeSource,/router\.get\('\/admin\/comparador\/diagnostico',requireAdmin,/);
 assert.match(routeSource,/aria-label="Filtrar diagnósticos"/);
 assert.match(routeSource,/data-comparison-merchant-click/);
 const styles=css.split('/* V3.4.4.27 — panel privado de diagnóstico')[1];
 assert.ok(styles);
 assert.match(styles,/:focus-visible/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/@media\(max-width:390px\)/);
 assert.match(styles,/min-height:46px/);
 assert.doesNotMatch(styles,/position:\s*fixed|display:\s*none|pointer-events:\s*none/);
});
