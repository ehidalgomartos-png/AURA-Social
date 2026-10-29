'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const landings=require('../src/services/marketplace-comparador-landing-pages-v34613');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const compare=require('../src/routes/marketplace-comparador-v32132');

function offer(shop,title,price=55000,extra={}){
 return {shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
  href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/p',
  internal:false,sponsored:false,...extra};
}
function page(query,external_results,extra={}){
 return {id:34613,slug:compare.slugFor(query),query_text:query,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  external_results,...extra};
}
const consolePage=page('playstation 5 pro',[
 offer('Tienda A','Sony PlayStation 5 Pro 2 TB consola',74000),
 offer('Tienda B','PS5 Pro 2 TB consola Sony',77000)
]);
const excludedPage=page('xiaomi redmi note 14 pro',[
 offer('Tienda C','Xiaomi Redmi Note 14 Pro 128 GB Negro',25000),
 offer('Tienda D','Xiaomi Redmi Note 14 Pro 256 GB Azul',27000)
]);
async function withWeb(callback){
 const original=db.query,queryLog=[];
 try{
  db.query=async (sql)=>{
   queryLog.push(sql);
   if(sql===audit.SITEMAP_CANDIDATES_SQL)return {rowCount:2,rows:[consolePage,excludedPage]};
   if(sql.includes('ORDER BY updated_at DESC LIMIT 220'))return {rowCount:2,rows:[consolePage,excludedPage]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  async function get(pathname){
   const response=await fetch('http://127.0.0.1:'+server.address().port+pathname,{redirect:'manual'});
   return {code:response.status,headers:response.headers,body:await response.text()};
  }
  try{return await callback(get,queryLog);}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;}
}
test('hay siete landings distintas, con preguntas y verificaciones propias, sin generar URLs automáticas',()=>{
 assert.equal(landings.PAGES.length,7);
 assert.equal(new Set(landings.PAGES.map(x=>x.slug)).size,7);
 assert.equal(landings.urlPaths().length,8);
 const descriptions=new Set(),headings=new Set();
 for(const p of landings.PAGES){
  assert.match(p.slug,/^[a-z0-9-]+$/);
  assert.ok(p.description.length>85&&p.description.length<170,p.slug);
  assert.ok(p.lead.length>95,p.slug);
  assert.equal(p.checks.length,4);
  assert.equal(p.searches.length,3);
  assert.equal(p.faq.length,2);
  assert.ok(!descriptions.has(p.description),p.slug);
  assert.ok(!headings.has(p.title),p.slug);
  headings.add(p.title);descriptions.add(p.description);
  assert.equal(landings.get(p.slug),p);
  assert.equal(landings.matches(p,{query_text:'some other product'}),false);
 }
 assert.equal(landings.get('../admin'),null);
 assert.equal(landings.get('moviles?next=foo'),null);
});
test('hub editorial es público, indexable, enlaza las siete páginas y no consulta la base ni SerpApi',async()=>{
 await withWeb(async(get,log)=>{
  const r=await get('/comparar/categorias');
  assert.equal(r.code,200);
  assert.match(r.body,/content="index,follow"/);
  assert.match(r.body,/<h1>Explora categorías y aprende a comparar precios<\/h1>/);
  assert.match(r.body,/rel="canonical" href="https:\/\/redlibertad.com\/comparar\/categorias"/);
  assert.match(r.body,/"@type":"CollectionPage"/);
  assert.match(r.body,/"@type":"BreadcrumbList"/);
  assert.match(r.body,/Guías por tipo de producto/);
  for(const p of landings.PAGES)assert.ok(r.body.includes('href="'+landings.pathFor(p.slug)+'"'),p.slug);
  assert.equal(log.length,0);
  assert.match(r.headers.get('cache-control'),/public/);
 });
});
test('landing de consolas enlaza solo comparaciones realmente aptas; noindex no aparece como recomendación',async()=>{
 assert.equal(seo.indexEligible(consolePage,consolePage.external_results),true);
 assert.equal(seo.indexEligible(excludedPage,excludedPage.external_results),false);
 await withWeb(async(get,log)=>{
  const r=await get('/comparar/categorias/consolas');
  assert.equal(r.code,200);
  assert.match(r.body,/content="index,follow"/);
  assert.match(r.body,/rel="canonical" href="https:\/\/redlibertad.com\/comparar\/categorias\/consolas"/);
  assert.match(r.body,/Comparaciones disponibles de esta categoría/);
  assert.ok(r.body.includes('href="/comparar/'+consolePage.slug+'"'));
  assert.ok(!r.body.includes('href="/comparar/'+excludedPage.slug+'"'));
  assert.match(r.body,/"@type":"ItemList"/);
  assert.match(r.body,/No confundas alquiler con compra/);
  assert.match(r.body,/Preguntas frecuentes/);
  assert.match(r.body,/href="\/comparar\?q=PlayStation%205%20Pro"/);
  assert.ok(log.length===1 && log[0].includes('LIMIT 220'));
  assert.ok(log.every(q=>!/\b(?:INSERT|UPDATE|DELETE)\b|serpapi\.com|marketplace_compare_provider_usage/i.test(q)));
 });
});
test('cada una de las siete landings tiene contenido genuino, enlaces a otras categorías y su URL canónica',async()=>{
 await withWeb(async(get)=>{
  for(const p of landings.PAGES){
   const r=await get(landings.pathFor(p.slug));
   assert.equal(r.code,200,p.slug);
   assert.ok(r.body.includes('href="https://redlibertad.com'+landings.pathFor(p.slug)+'"'),p.slug);
   assert.match(r.body,/<h1>/);
   assert.ok(r.body.includes(p.title),p.slug);
   assert.match(r.body,/"@type":"BreadcrumbList"/);
   assert.match(r.body,/Qué revisar antes de comprar/);
   assert.match(r.body,/Preguntas frecuentes/);
   assert.match(r.body,/No hay comparaciones recientes|Comparaciones disponibles de esta categoría/);
   for(const related of landings.PAGES.filter(x=>x.slug!==p.slug))
    assert.ok(r.body.includes('href="'+landings.pathFor(related.slug)+'"'),related.slug);
   assert.doesNotMatch(r.body,/"@type":"Product"/);
  }
  const invalid=await get('/comparar/categorias/una-pagina-inexistente');
  assert.equal(invalid.code,404);
 });
});
test('sitemap indexa exactamente hub + landings estáticas y solo fichas dinámicas válidas',async()=>{
 await withWeb(async(get)=>{
  const r=await get('/sitemap-comparador.xml');
  assert.equal(r.code,200);
  assert.match(r.headers.get('content-type'),/xml/);
  const paths=['/comparar',...landings.urlPaths(),'/comparar/'+consolePage.slug];
  for(const p of paths){
   assert.ok(r.body.includes('<loc>https://redlibertad.com'+p+'</loc>'),p);
   assert.equal(r.body.split('<loc>https://redlibertad.com'+p+'</loc>').length-1,1,p);
  }
  assert.ok(!r.body.includes('/comparar/'+excludedPage.slug+'</loc>'));
  assert.equal((r.body.match(/<url>/g)||[]).length,paths.length);
  assert.doesNotMatch(r.body,/<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/lastmod><\/url><url><loc>https:\/\/redlibertad.com\/comparar\/categorias/);
 });
});
test('las guías nunca alteran contador de comparaciones ni gastan consultas al abrir enlaces GET',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-landing-pages-v34613.js'),'utf8');
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|\bdb\.query|reserveQuota|SerpApi\s*\(/i);
 assert.match(route,/router\.get\('\/comparar\/categorias'/);
 assert.match(route,/landingComparisons/);
 assert.match(route,/landingPages\.urlPaths\(\)/);
 assert.match(css,/V3\.4\.6\.13/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/:focus-visible/);
});
