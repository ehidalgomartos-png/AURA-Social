'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('iPhone usado en Wallapop abre búsqueda web amplia y no la pestaña Shopping sin resultados',()=>{
 const saved={
  title:'iPhone 12 64GB Morado',shop:'Wallapop',price_cents:7800,
  href:'https://www.google.com/search?q=iPhone+12+64GB+Morado+Wallapop&udm=28&hl=es&gl=es',
  destination:'shopping-search',condition:'Usado',internal:false
 };
 const result=provider.resolveOfferLink(saved);
 assert.equal(result.destination,'shopping-search'); // Categoría interna heredada, salida web.
 const u=new URL(result.href);
 assert.equal(u.origin,'https://www.google.com');
 assert.equal(u.pathname,'/search');
 assert.equal(u.searchParams.get('udm'),null);
 assert.equal(u.searchParams.get('tbm'),null);
 assert.equal(u.searchParams.get('hl'),'es');
 assert.equal(u.searchParams.get('gl'),'es');
 assert.equal(u.searchParams.get('q'),'iPhone 12 64GB Wallapop');
 assert.ok(!u.searchParams.has('prds'));
});

test('búsqueda de Google simplifica títulos comerciales sin perder capacidad ni gama',()=>{
 const url=provider.shoppingSearchUrl('Apple iPhone 17 Pro 256GB Negro - Refurbished - Pago a plazos - 3 años de garantía incluida','Certideal.es');
 const q=new URL(url).searchParams.get('q');
 assert.match(q,/iPhone 17 Pro 256GB/);
 assert.match(q,/Certideal\.es/);
 assert.doesNotMatch(q,/refurbished|pago a plazos|garantía|negro/i);
 assert.equal(new URL(url).searchParams.get('udm'),null);
 assert.equal(provider.shoppingSearchUrl('   ', 'Wallapop'),null);
});

test('el destino HTTPS directo sigue ganando y no se confunde con una compra dentro de Google',()=>{
 assert.deepEqual(provider.resolveOfferLink({title:'iPhone 12',shop:'Vendedor',href:'https://vendedor.example/product/5'}),
  {href:'https://vendedor.example/product/5',destination:'store'});
 assert.deepEqual(provider.resolveOfferLink({internal:true,href:'/marketplace/p/1',title:'Producto'}),{href:'/marketplace/p/1',destination:'internal'});
 const corrected=provider.resolveOfferLink({title:'iPhone 12 64GB Morado',shop:'Wallapop',href:'https://www.google.com/shopping/product/100'});
 assert.equal(new URL(corrected.href).searchParams.get('udm'),null);
});

test('ofertas ya guardadas en PostgreSQL muestran la nueva salida sin llamar a SerpApi',async()=>{
 const origQuery=db.query,origConfigured=provider.configured,origQuota=worker.quotaStatus;
 const slug=compare.slugFor('iphone 12'),now=new Date().toISOString();
 const saved={
  title:'iPhone 12 64GB Morado',shop:'Wallapop',price_cents:7800,price_currency:'EUR',
  href:'https://www.google.com/search?q=iPhone+12+64GB+Morado+Wallapop&udm=28',condition:'Usado',
  product_id:'123456789012345678',internal:false
 };
 try{
  let queried=0;
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'daily',daily:5,monthly:100,dailyUsed:5,monthlyUsed:5});
  db.query=async sql=>{
   queried++;
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rows:[{
    id:5,slug,query_text:'iphone 12',created_at:now,last_checked_at:now,updated_at:now,
    provider_status:'ok',external_results:[saved],index_approved:false,seo_blocked:false
   }],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const a=app.listen(0,'127.0.0.1',()=>resolve(a));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/Buscar en Google/);
   assert.match(html,/q=iPhone\+12\+64GB\+Wallapop/);
   assert.doesNotMatch(html,/udm=28/);
   assert.doesNotMatch(html,/Buscar en Google Shopping/);
   assert.doesNotMatch(html,/Consultas externas agotadas por hoy/);
   assert.ok(queried>0,'la página utiliza datos ya guardados en PostgreSQL');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=origQuery;
  provider.configured=origConfigured;
  worker.quotaStatus=origQuota;
 }
});
