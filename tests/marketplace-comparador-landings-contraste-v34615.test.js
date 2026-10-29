'use strict';
// V3.4.6.15 — regresiones del contraste visual y las búsquedas preparadas.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const compare=require('../src/routes/marketplace-comparador-v32132');
const landingPages=require('../src/services/marketplace-comparador-landing-pages-v34613');
async function withServer(fn){
 const old=db.query,statements=[];
 try{
  db.query=async(sql)=>{
   statements.push(sql);
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(compare.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const get=async url=>{
   const res=await fetch('http://127.0.0.1:'+server.address().port+url);
   return {status:res.status,headers:res.headers,html:await res.text()};
  };
  try{return await fn(get,statements);}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;}
}
test('en las siete guías hay tarjetas navegables con búsqueda explícita y sin envío automático',async()=>{
 await withServer(async(get,queries)=>{
  for(const page of landingPages.PAGES){
   const result=await get(landingPages.pathFor(page.slug));
   assert.equal(result.status,200,page.slug);
   assert.match(result.html,/Búsquedas recomendadas/);
   assert.match(result.html,/class="cmp-landing-search-grid"/);
   assert.match(result.html,/Preparar comparación/);
   assert.match(result.html,/No se consulta ninguna tienda al abrir estos enlaces/);
   for(const q of page.searches){
    assert.ok(result.html.includes('href="/comparar?q='+encodeURIComponent(q)+'#compareQ"'),
     page.slug+' / '+q);
    assert.ok(result.html.includes('aria-label="Preparar comparación de '+q+'"'),q);
   }
   assert.match(result.html,/<meta name="robots" content="index,follow"/);
   assert.match(result.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar\/categorias\//);
  }
  assert.ok(queries.every(sql=>!/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)));
  assert.ok(queries.every(sql=>!/serpapi\.com/i.test(sql)));
 });
});
test('la búsqueda sugerida llega a la portada con valor editable y sin consulta de precios',async()=>{
 const query='Xiaomi Redmi Note 14 Pro 256 GB 5G';
 await withServer(async(get,statements)=>{
  const result=await get('/comparar?q='+encodeURIComponent(query));
  assert.equal(result.status,200);
  assert.match(result.html,/Búsqueda preparada:/);
  assert.ok(result.html.includes(query));
  assert.match(result.html,/name="q" type="search"[^>]+value="Xiaomi Redmi Note 14 Pro 256 GB 5G"/);
  assert.match(result.html,/id="compareQ"/);
  assert.match(result.html,/Abrir este enlace no consume cuota/);
  assert.match(result.html,/method="post"/);
  assert.match(result.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar"/);
  assert.equal(result.headers.get('cache-control'),'private,no-store');
  assert.equal(statements.filter(sql=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)).length,0);
 });
});
test('el buscador sin término no muestra una búsqueda ficticia preparada',async()=>{
 await withServer(async(get)=>{
  const result=await get('/comparar');
  assert.equal(result.status,200);
  assert.doesNotMatch(result.html,/Búsqueda preparada:/);
 });
});
test('h1 de la cabecera azul tiene color explícito y prevalece sobre h1 genérico',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/body\.cmp-premium h1\{[^}]*color:#142c44/);
 assert.match(css,/body\.cmp-premium \.cmp-landings \.cmp-landings-hero h1\{color:#fff/);
 assert.match(css,/body\.cmp-premium \.cmp-landings \.cmp-landings-hero \.cmp-landing-subtitle\{color:#fff/);
 assert.match(css,/\.cmp-landing-search-grid\{display:grid/);
 assert.match(css,/\.cmp-landing-search-link:focus-visible/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
test('ningún enlace de búsqueda de la landing genera una URL indexable distinta de la portada',async()=>{
 await withServer(async(get,queries)=>{
  const guide=await get('/comparar/categorias/moviles');
  const prepared=await get('/comparar?q=Samsung%20Galaxy%20S25%20256%20GB');
  assert.match(guide.html,/content="index,follow"/);
  assert.match(prepared.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar"/);
  assert.ok(queries.every(sql=>!/\bINSERT\s+INTO\s+marketplace_compare_pages\b/i.test(sql)));
 });
});
