'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const landings=require('../src/services/marketplace-comparador-landing-pages-v34613');
const compare=require('../src/routes/marketplace-comparador-v32132');
function offer(shop,title,price){
 return {shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
  href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/p',
  internal:false,sponsored:false};
}
function page(q,offers=[],extra={}){
 return {id:34614,query_text:q,slug:compare.slugFor(q),external_results:offers,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),...extra};
}
async function render(p){
 const old=db.query,oldConfig=provider.configured,queries=[];
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rows:[p],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+p.slug);
   return {status:response.status,html:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfig;}
}
test('ficha PS5 Pro indexable enlaza desde su producto a la guía de consolas, sin alterar SEO',async()=>{
 const q='playstation 5 pro',offers=[
  offer('Comercio Uno','PlayStation 5 Pro Consola 2TB',75000),
  offer('Comercio Dos','Sony PS5 Pro consola 2 TB',78000)];
 const p=page(q,offers);
 assert.equal(seo.indexEligible(p,offers),true);
 const r=await render(p);
 assert.equal(r.status,200);
 assert.match(r.html,/meta name="robots" content="index,follow"/);
 assert.match(r.html,/href="\/comparar\/categorias\/consolas"/);
 assert.match(r.html,/Guías de compra relacionadas/);
 assert.match(r.html,/Comparar precios de consolas/);
 assert.match(r.html,/href="https:\/\/redlibertad.com\/comparar\/playstation-5-pro-/);
 assert.ok(r.queries.every(sql=>!/INSERT INTO marketplace_compare_provider_usage|serpapi\.com/i.test(sql)));
});
test('una comparación de otra categoría enlaza a su guía aunque permanezca noindex',async()=>{
 const p=page('zapatillas skechers mujer',[],{provider_status:'unavailable'});
 const r=await render(p);
 assert.equal(r.status,200);
 assert.match(r.html,/meta name="robots" content="noindex,follow"/);
 assert.match(r.html,/href="\/comparar\/categorias\/zapatillas"/);
 assert.ok(!r.html.includes('href="/comparar/categorias/consolas"'));
});
test('no se inventa una categoría para búsquedas que no coinciden con guías revisadas',async()=>{
 const p=page('producto sin categoria 123',[],{provider_status:'unavailable'});
 const r=await render(p);
 assert.equal(r.status,200);
 assert.doesNotMatch(r.html,/cmp-contextual-guide/);
});
test('todos los enlaces de guías son internos, escapados y no envían búsquedas externas',()=>{
 const sampleByCategory={
  moviles:'iphone 16 128 GB',portatiles:'portatil asus rog strix gaming',
  consolas:'playstation 5 pro',zapatillas:'zapatillas skechers mujer',
  'robots-aspiradores':'robot aspirador roborock s8',
  auriculares:'auriculares Apple AirPods Pro',
  smartwatches:'smartwatch samsung galaxy watch 7'
 };
 for(const guide of landings.PAGES){
  const url=landings.pathFor(guide.slug);
  assert.match(url,/^\/comparar\/categorias\/[a-z0-9-]+$/);
  assert.equal(landings.matches(guide,{query_text:sampleByCategory[guide.slug]}),true,guide.slug);
 }
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(route,/function comparisonTopicMarkup/);
 assert.match(route,/comparisonTopicMarkup\(page.query_text\)/);
 assert.match(css,/V3\.4\.6\.14/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:600px\)/);
});
