'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const guides=require('../src/services/marketplace-comparador-model-guides-v34616');
const render=require('../src/services/marketplace-comparador-model-guide-render-v34616');
const landings=require('../src/services/marketplace-comparador-landing-pages-v34613');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const {router,slugFor}=require('../src/routes/marketplace-comparador-v32132');
const offer=(shop,title,price)=>({
 shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/p',
 internal:false,sponsored:false
});
const good={
 id:34616,query_text:'playstation 5 pro',slug:slugFor('playstation 5 pro'),
 external_results:[offer('Tienda A','Sony PlayStation 5 Pro 2 TB consola',75500),
  offer('Tienda B','PS5 Pro Sony 2TB consola',78000)],
 provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
 last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()
};
const bad={
 ...good,slug:slugFor('playstation 5 pro no ofertas'),
 external_results:[],provider_status:'unavailable'
};
async function withApp(action){
 const old=db.query,sql=[];
 try{
  db.query=async q=>{
   sql.push(q);
   if(q===audit.SITEMAP_CANDIDATES_SQL)return {rows:[good,bad],rowCount:2};
   if(q.includes('ORDER BY updated_at DESC LIMIT 220'))return {rows:[good,bad],rowCount:2};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const get=async uri=>{
   const response=await fetch('http://127.0.0.1:'+server.address().port+uri);
   return {code:response.status,html:await response.text(),headers:response.headers};
  };
  try{return await action(get,sql);}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;}
}
test('hay cinco guías de modelos originales con criterios y búsquedas diferenciadas',()=>{
 assert.equal(guides.GUIDES.length,5);
 assert.equal(new Set(guides.GUIDES.map(g=>g.slug)).size,5);
 assert.equal(guides.urlPaths().length,6);
 for(const g of guides.GUIDES){
  assert.match(g.slug,/^[a-z0-9-]+$/);
  assert.ok(g.title.length>35&&g.description.length>80);
  assert.ok(g.intro.length>140);
  assert.equal(g.variants.length,3);
  assert.equal(g.checks.length,3);
  assert.ok(g.searches.length>=2);
  assert.equal(g.faq.length,2);
  assert.ok(landings.get(g.category));
  assert.equal(guides.get(g.slug),g);
  assert.equal(guides.matches(g,{query_text:'producto sin identificar'}),false);
  assert.equal(guides.matches(g,{query_text:g.terms[0]}),true);
 }
 assert.equal(guides.get('inventado'),null);
 assert.equal(guides.get('../admin'),null);
});
test('la guía especializada enlaza solo una ficha realmente indexable y nunca hace búsquedas externas',async()=>{
 assert.equal(seo.indexEligible(good,good.external_results),true);
 await withApp(async(get,queries)=>{
  const result=await get('/comparar/guias/playstation-5-pro');
  assert.equal(result.code,200);
  assert.match(result.html,/<meta name="robots" content="index,follow"/);
  assert.match(result.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar\/guias\/playstation-5-pro"/);
  assert.match(result.html,/<h1>PlayStation 5 Pro: comprar o alquilar y comparar ofertas<\/h1>/);
  assert.match(result.html,/Versiones y diferencias importantes/);
  assert.match(result.html,/Preguntas frecuentes/);
  assert.match(result.html,/PlayStation 5 Pro/);
  assert.match(result.html,/href="\/comparar\/categorias\/consolas"/);
  assert.match(result.html,/href="\/comparar\?q=PlayStation%205%20Pro#compareQ"/);
  assert.match(result.html,/"@type":"WebPage"/);
  assert.match(result.html,/"@type":"BreadcrumbList"/);
  assert.match(result.html,/"@type":"ItemList"/);
  assert.doesNotMatch(result.html,/"@type":"Product"/);
  assert.ok(result.html.includes('href="/comparar/'+good.slug+'"'));
  assert.ok(!result.html.includes('href="/comparar/'+bad.slug+'"'));
  assert.equal(queries.filter(q=>q.includes('LIMIT 220')).length,1);
  assert.ok(queries.every(q=>!/\b(?:INSERT|UPDATE|DELETE)\b|serpapi\.com/i.test(q)));
 });
});
test('hub SEO público carga sin base y enlaces a las cinco guías',async()=>{
 await withApp(async(get,queries)=>{
  const result=await get(guides.HUB);
  assert.equal(result.code,200);
  assert.match(result.html,/Guías para comparar marcas y modelos/);
  assert.match(result.html,/"@type":"CollectionPage"/);
  assert.match(result.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar\/guias"/);
  assert.match(result.html,/content="index,follow"/);
  for(const g of guides.GUIDES)assert.ok(result.html.includes('href="'+guides.pathFor(g.slug)+'"'));
  assert.equal(queries.length,0);
 });
});
test('todas las guías publicadas son distintas, no tienen productos ficticios y no generan rutas abiertas',async()=>{
 await withApp(async(get)=>{
  for(const g of guides.GUIDES){
   const response=await get(guides.pathFor(g.slug));
   assert.equal(response.code,200,g.slug);
   assert.ok(response.html.includes('href="https://redlibertad.com'+guides.pathFor(g.slug)+'"'));
   assert.match(response.html,/Versiones y diferencias importantes/);
   assert.match(response.html,/Qué comprobar antes de comprar/);
   assert.match(response.html,/Preparar una comparación específica/);
   assert.match(response.html,/No encontramos fichas|Comparaciones disponibles del modelo/);
   assert.match(response.html,/href="\/comparar\/categorias\//);
   assert.doesNotMatch(response.html,/"@type":"Product"/);
   assert.ok(!response.html.includes('<meta property="product:price:amount"'));
  }
  assert.equal((await get('/comparar/guias/una-marca-que-no-existe')).code,404);
 });
});
test('hub de categorías y comparación vinculan guías específicas',async()=>{
 await withApp(async(get)=>{
  const hub=await get('/comparar/categorias');
  assert.match(hub.html,/href="\/comparar\/guias"/);
  const consoles=await get('/comparar/categorias/consolas');
  assert.match(consoles.html,/href="\/comparar\/guias\/playstation-5-pro"/);
  const mobile=await get('/comparar/categorias/moviles');
  assert.match(mobile.html,/href="\/comparar\/guias\/xiaomi-redmi-note-14-pro"/);
 });
});
test('sitemap contiene las seis nuevas URLs sin duplicados ni URLs de búsqueda',async()=>{
 await withApp(async(get)=>{
  const {html,code}=await get('/sitemap-comparador.xml');
  assert.equal(code,200);
  for(const url of [...landings.urlPaths(),...guides.urlPaths()]){
   const loc='<loc>https://redlibertad.com'+url+'</loc>';
   assert.equal(html.split(loc).length-1,1,url);
  }
  assert.ok(!html.includes('/comparar?q='));
  assert.equal((html.match(/<url>/g)||[]).length,1+landings.urlPaths().length+guides.urlPaths().length+1);
 });
});
test('render y rutas no usan datos de mercado no verificados ni consumen cuota',()=>{
 const service=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-model-guide-render-v34616.js'),'utf8');
 const data=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-model-guides-v34616.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.doesNotMatch(service+data,/\bfetch\s*\(|\bdb\.query|reserveQuota|serpapi\.com|setInterval/i);
 assert.match(css,/V3\.4\.6\.16/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.doesNotMatch(render.hub(),/<script>/);
});
