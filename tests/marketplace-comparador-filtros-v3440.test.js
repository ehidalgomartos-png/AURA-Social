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
const filters=require('../src/services/marketplace-comparador-offer-filters-v3440');

const offers=[
 {title:'Apple iPhone 12 128 GB',condition:'Usado',price_cents:15000,price_currency:'EUR',shop:'Vendedor A',
  href:'https://www.google.com/search?q=iphone+12+128GB',image:null},
 {title:'Apple iPhone 12 256 GB',condition:'Reacondicionado',price_cents:21000,price_currency:'EUR',shop:'Tienda B',
  href:'https://tienda-b.es/iphone-12-256gb',image:null},
 {title:'Apple iPhone 12 256 GB',condition:'Nuevo',price_cents:23000,price_currency:'EUR',shop:'Tienda C',
  href:'https://tienda-c.es/iphone-12-256gb',image:null}
];
test('los atributos de oferta provienen del estado declarado y capacidad identificada',()=>{
 assert.deepEqual(filters.attributes(offers[0]),{condition:'usado',capacity:'128gb'});
 assert.deepEqual(filters.attributes(offers[1]),{condition:'reacondicionado',capacity:'256gb'});
 assert.deepEqual(filters.attributes(offers[2]),{condition:'nuevo',capacity:'256gb'});
 assert.deepEqual(filters.attributes({title:'Apple iPhone 12',condition:'Consultar estado'}),{
  condition:'sin-confirmar',capacity:'unknown'});
});
test('los menús solo aparecen con variantes realmente diferentes',()=>{
 const v=filters.choices(offers,{specificModel:true});
 assert.deepEqual(v.conditionOptions,['nuevo','reacondicionado','usado']);
 assert.deepEqual(v.capacityOptions,[{code:'128gb',label:'128 GB'},{code:'256gb',label:'256 GB'}]);
 assert.equal(filters.choices(offers,{specificModel:false}).capacityOptions.length,0);
 assert.equal(filters.choices([offers[0]],{specificModel:true}).conditionOptions.length,0);
 assert.deepEqual(filters.choices([]),{conditionOptions:[],capacityOptions:[]});
});
test('la página muestra estado, capacidad y acceso directo, sin cambiar mínimo ni enlaces',async()=>{
 const q='iphone 12',slug=compare.slugFor(q);
 const original=db.query,configured=provider.configured,quota=worker.quotaStatus;
 let queries=[];
 try{
  provider.configured=()=>false;worker.quotaStatus=async()=>({available:false});
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:44,slug,query_text:q,index_approved:false,seo_blocked:false,
      provider_status:'ok',last_checked_at:new Date().toISOString(),
      external_results:offers,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await res.text();assert.equal(res.status,200);
   assert.match(html,/data-condition-filter/);
   assert.match(html,/data-capacity-filter/);
   assert.match(html,/data-access-choice="direct"/);
   assert.match(html,/data-offer-condition="usado" data-offer-capacity="128gb"/);
   assert.match(html,/data-offer-condition="nuevo" data-offer-capacity="256gb"/);
   assert.match(html,/data-offer-condition="reacondicionado" data-offer-capacity="256gb"/);
   assert.match(html,/Todos los estados/);
   assert.match(html,/Todas las capacidades/);
   assert.match(html,/Desde 150,00/);
   assert.match(html,/href="https:\/\/tienda-b\.es\/iphone-12-256gb"/);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.equal(queries.some(x=>/INSERT INTO marketplace_compare_provider_usage/.test(x)),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=configured;worker.quotaStatus=quota;}
});
test('script combina filtros en vez de sobrescribir el filtro de acceso directo anterior',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(js,/function applyComparisonFilters/);
 assert.match(js,/data-condition-filter/);
 assert.match(js,/data-capacity-filter/);
 assert.match(js,/mode==='all'\|\|item\.dataset\.offerAccess==='direct'/);
 assert.match(js,/item\.hidden=!show/);
 assert.match(js,/data-filter-results/);
 assert.match(js,/role="status"|data-filter-results/);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/\.cmp-facet-group/);
 assert.match(css,/@media\(max-width:620px\)/);
});
