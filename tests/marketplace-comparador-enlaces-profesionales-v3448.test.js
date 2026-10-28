'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');
const access=require('../src/services/marketplace-comparador-direct-access-v3439');
const {enrichLocalOffers}=require('../src/services/marketplace-comparador-merchant-offers-v3421');

const listing={id:91,title:'iPhone 12 128 GB Negro',price_cents:15900,
 image_urls:['/uploads/imagen.jpg'],details:{condition:'used'},display_name:'Antonio',username:'antonio'};
const noPartner={...listing,id:92,title:'iPhone 12 128 GB Azul',price_cents:17900};
const partner={listing_id:91,store_id:12,store_name:'Tienda Ejemplo',store_url:'https://ejemplo.es/',
 store_status:'approved',purchase_enabled:true,stock_status:'in_stock',source:'manual',
 product_url:'https://ejemplo.es/producto/iphone',last_checked_at:null};

test('una tienda profesional aprobada y vinculada es acceso directo aunque la oferta sea interna',()=>{
 const [approved]=enrichLocalOffers([listing],[partner]);
 const [ordinary]=enrichLocalOffers([noPartner],[]);
 assert.equal(approved.internal,true);
 assert.equal(approved.partner_store,true);
 assert.equal(access.isDirectStore(approved),true);
 assert.equal(access.isDirectStore(ordinary),false);
 assert.deepEqual(access.summary([approved,ordinary]),{direct:1,other:1,total:2});
});

test('la etiqueta de compra directa exige HTTPS externo y nunca confía en un vínculo inválido',()=>{
 const [approved]=enrichLocalOffers([listing],[partner]);
 for(const href of ['javascript:alert(1)','http://ejemplo.es/producto/iphone',
   'https://www.google.com/shopping/product/123','https://127.0.0.1/admin']){
  assert.equal(access.isDirectStore({...approved,href}),false,href);
 }
 assert.equal(access.isDirectStore({...approved,partner_store:false}),false);
 assert.equal(access.isDirectStore({...approved,internal:false}),true);
});

test('catálogo real aprobado muestra Ver oferta en tienda, filtro directo y seguimiento de clic',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldSecret=process.env.JWT_SECRET;
 const sql=[],q='iphone 12 128 GB',slug=compare.slugFor(q);
 try{
  process.env.JWT_SECRET='v3448-professional-direct-link-test';
  provider.configured=()=>false;
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1')){
    return {rowCount:1,rows:[{id:99,slug,query_text:q,provider_status:'ok',
      last_checked_at:new Date().toISOString(),external_results:[],index_approved:false,
      seo_blocked:false,editorial_summary:''}]};
   }
   if(statement.startsWith('SELECT l.id,l.title,l.price_cents,l.image_urls,l.details')){
    return {rowCount:2,rows:[listing,noPartner]};
   }
   if(statement.startsWith('SELECT x.listing_id,x.store_id,x.product_url')){
    return {rowCount:1,rows:[partner]};
   }
   return {rowCount:0,rows:[]};
  };
  const app=express();
  app.use(cookieParser());
  app.use(express.urlencoded({extended:true}));
  app.use(compare.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   const direct=html.match(/<li class="offer" data-offer-access="direct"[\s\S]*?<\/li>/)?.[0];
   const local=html.match(/<li class="offer" data-offer-access="alternate"[\s\S]*?<\/li>/)?.[0];
   assert.ok(direct,'la tienda aparece como acceso directo');
   assert.ok(local,'el anuncio sin tienda sigue siendo interno');
   assert.match(html,/1 oferta con enlace directo/);
   assert.match(html,/1 oferta sin enlace directo/);
   assert.match(direct,/Acceso directo a tienda/);
   assert.match(direct,/href="https:\/\/ejemplo\.es\/producto\/iphone"/);
   assert.match(direct,/>Ver oferta en tienda<\/a>/);
   assert.match(direct,/data-comparison-merchant-click="1"/);
   assert.match(direct,/data-store-id="12"/);
   assert.match(direct,/data-listing-id="91"/);
   assert.match(direct,/data-proof="[a-f0-9]{64}"/);
   assert.match(direct,/target="_blank" rel="noopener noreferrer nofollow"/);
   assert.doesNotMatch(direct,/>Buscar en Google<\/a>/);
   assert.match(local,/>Ver anuncio<\/a>/);
   assert.match(local,/href="\/marketplace\/p\/92\//);
   assert.match(html,/Desde 159,00/);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.equal(sql.some(x=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(x)),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=oldQuery;
  provider.configured=oldConfigured;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET=oldSecret;
 }
});
