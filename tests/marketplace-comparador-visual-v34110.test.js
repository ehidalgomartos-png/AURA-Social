'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');
test('ficha compacta sin dos títulos repetidos, con buscador desplegable y formulario funcional',async()=>{
 const query='iphone 12 128 GB',slug=compare.slugFor(query);
 const original=db.query,configured=provider.configured;
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {rowCount:1,rows:[{
    id:332,slug,query_text:query,seo_blocked:false,index_approved:false,
    provider_status:'ok',last_checked_at:new Date().toISOString(),editorial_summary:'',
    external_results:[{title:'iPhone 12 128 GB Negro',shop:'Tienda A',condition:'Usado',
    href:'https://tienda.example/iphone',image:'https://images1.gstatic.com/iphone.png',price_currency:'EUR',price_cents:9000}]
   }]};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/<h1 class="cmp-detail-page-title">Comparador de precios<\/h1>/);
   assert.match(html,/<h2 id="cmp-detail-name">iPhone 12 128 GB Negro<\/h2>/);
   assert.match(html,/<details class="cmp-change-search"><summary>Cambiar de producto<\/summary>/);
   assert.match(html,/<form class="compare-search" action="\/comparar\/buscar" method="post">/);
   assert.match(html,/name="_csrf"/);
   assert.match(html,/href="#precios-y-tiendas"/);
   assert.match(html,/name="robots" content="noindex,follow"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=configured;}
});
test('diseño móvil mantiene fechas legibles y búsqueda accesible',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/cmp-change-search>summary:focus-visible/);
 assert.match(css,/cmp-detail-page-title/);
 assert.match(css,/offer-price-date\{white-space:normal/);
 assert.match(css,/@media\(max-width:540px\)/);
});
