'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');

const query='iphone 12 128 GB';
const offer=(shop,price,condition)=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents:price,
 price_currency:'EUR',condition,internal:false,image:null,
 href:'https://ejemplo-tienda.test/iphone-12'
});
async function render(offers){
 const originalQuery=db.query,configured=provider.configured,quota=worker.quotaStatus;
 const sql=[],slug=compare.slugFor(query);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{
     id:882,slug,query_text:query,external_results:offers,
     last_checked_at:new Date().toISOString(),provider_status:'ok',
     index_approved:false,seo_blocked:false,editorial_summary:''
    }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=originalQuery;provider.configured=configured;worker.quotaStatus=quota;}
}
const sample=[offer('Tienda A',18000,'Usado'),offer('Tienda B',21900,'Nuevo')];
test('comparación con varias ofertas incorpora una sola explicación plegada',async()=>{
 const r=await render(sample);
 assert.equal(r.status,200);
 assert.equal((r.html.match(/class="cmp-price-legend"/g)||[]).length,1);
 assert.match(r.html,/<details class="cmp-price-legend"><summary>Cómo leer estos precios<\/summary>/);
 assert.match(r.html,/El precio final, la disponibilidad y el envío se confirman con cada tienda/);
});
test('ficha de oferta única muestra la misma guía sin repetirla',async()=>{
 const r=await render(sample.slice(0,1));
 assert.equal(r.status,200);
 assert.match(r.html,/class="compare-single-product"/);
 assert.equal((r.html.match(/class="cmp-price-legend"/g)||[]).length,1);
});
test('comparación sin precios comparables no añade instrucciones fuera de contexto',async()=>{
 const r=await render([]);
 assert.equal(r.status,200);
 assert.doesNotMatch(r.html,/class="cmp-price-legend"/);
});
test('el texto distingue datos declarados y búsquedas alternativas de ofertas reales',async()=>{
 const r=await render(sample);
 assert.match(r.html,/El estado del producto es el declarado en el anuncio/);
 assert.match(r.html,/«Buscar en Google» muestra otras opciones/);
 assert.match(r.html,/no garantiza llegar a esta misma oferta/);
});
test('el desplegable no requiere JS ni altera los enlaces existentes',async()=>{
 const r=await render(sample);
 assert.match(r.html,/<details class="cmp-price-legend"><summary/);
 assert.match(r.html,/class="offer-link/);
 assert.match(r.html,/data-offer-price-cents="18000"/);
 assert.match(r.html,/Desde 180,00/);
});
test('no añade consultas a proveedores ni escrituras en PostgreSQL',async()=>{
 const r=await render(sample);
 assert.equal(r.sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});
test('guía discreta, táctil, responsive y accesible por teclado',()=>{
 const section=css.split('/* V3.4.4.21 — guía de lectura plegada')[1];
 assert.ok(section);
 assert.match(section,/>summary:focus-visible/);
 assert.match(section,/min-height:44px/);
 assert.match(section,/min-height:46px/);
 assert.match(section,/@media\(max-width:620px\)/);
 assert.match(section,/line-height:1.5/);
 assert.doesNotMatch(section,/display:\s*none|pointer-events:\s*none/);
});
