'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const {router,slugFor}=require('../src/routes/marketplace-comparador-v32132');
const query='samsung s26';
const offer=(title,price_cents,shop)=>({
 title,price_cents,shop,price_currency:'EUR',condition:'Consultar estado',
 href:'https://tienda-ejemplo.es/producto',image:null,internal:false
});
const cheap=offer('Samsung Galaxy S26 Smartphone 5G',3990,'Tienda de prueba barata');
const normal1=offer('Samsung Galaxy S26 Smartphone 5G',60000,'Comercio A');
const normal2=offer('Samsung Galaxy S26 Smartphone 5G',70000,'Comercio B');
const accessory=offer('Funda compatible con Samsung Galaxy S26',1299,'Fundas Ejemplo');

test('clasifica accesorios y precios atípicos sin descartarlos ni mezclar sus importes',()=>{
 const grouped=quality.groupOffers(query,[accessory,cheap,normal1,normal2]);
 assert.equal(grouped.main.length,2);
 assert.deepEqual(grouped.main.map(o=>o.price_cents),[60000,70000]);
 assert.equal(grouped.accessories.length,1);
 assert.match(grouped.accessories[0].quality_reason,/Funda/);
 assert.equal(grouped.review.length,1);
 assert.equal(grouped.review[0].price_cents,3990);
 assert.match(grouped.review[0].quality_reason,/atípico/);
 assert.equal(grouped.repair.length,0);
 assert.equal(grouped.main.concat(grouped.accessories,grouped.review).length,4);
});
test('sin pruebas de teléfono real no ofrece Samsung S26 barato como modelo completo',()=>{
 const weak=offer('Samsung S26',3990,'Tienda C');
 const classified=quality.groupOffers(query,[weak,normal1]);
 assert.equal(classified.main.length,1);
 assert.equal(classified.review.length,1);
 assert.equal(classified.review[0].price_cents,3990);
 assert.equal(quality.isPhoneSearch('armario'),false);
 assert.equal(quality.groupOffers('armario',[weak]).main.length,1);
});
test('no elimina teléfonos usados y conserva anuncios averiados por separado',()=>{
 const q='iphone 12 128 GB';
 const used=offer('iPhone 12 128 GB usado',9000,'Wallapop');
 const refurbished=offer('Apple iPhone 12 128 GB reacondicionado',16799,'Tienda D');
 const faulty=offer('iPhone 12 128 GB no funciona',5500,'Para reparar');
 const result=quality.groupOffers(q,[faulty,used,refurbished]);
 assert.deepEqual(result.main,[used,refurbished]);
 assert.equal(result.repair[0],faulty);
 assert.equal(result.review.length,0);
 assert.equal(result.accessories.length,0);
 assert.equal(quality.groupOffers('iphone 12 128 GB funda',[offer('Funda para iPhone 12 128 GB',900,'Fundas')]).main.length,1);
});
test('SEO filtra precios de accesorios, averiados y atípicos incluso sobre resultados sin depurar',()=>{
 const now=new Date().toISOString();
 const approved={
  query_text:'samsung s26 256 GB',provider_status:'ok',last_checked_at:now,
  index_approved:true,seo_blocked:false,
  editorial_summary:'Comparación editorial verificada del mismo modelo de smartphone con comercios diferentes y precios comprobados antes de publicarse.'
 };
 const high=offer('Samsung Galaxy S26 256 GB Smartphone Nuevo',80000,'Tienda Alta');
 const low=offer('Funda compatible con Samsung Galaxy S26 256 GB',1200,'Funda');
 const faulty=offer('Samsung Galaxy S26 256 GB no funciona',5000,'Averiado');
 const valid=offer('Samsung Galaxy S26 256 GB Smartphone',79000,'Tienda Media');
 const valid2=offer('Samsung Galaxy S26 256 GB Smartphone',82500,'Tienda C');
 const v=seo.auto.eligibleOffers(approved,[low,faulty,valid,high,valid2]);
 assert.equal(v.eligible,true);
 assert.equal(v.offers.length,3);
 assert.equal(v.lowPriceCents,79000);
 assert.equal(v.highPriceCents,82500);
 const seoRaw=seo.structuredData(approved,[low,faulty,valid,high,valid2],true,'/comparar/samsung-s26-256-gb');
 const product=seoRaw['@graph'].find(x=>x['@type']==='Product');
 assert.ok(product);
 assert.equal(product.offers.lowPrice,'790.00');
 assert.equal(product.offers.highPrice,'825.00');
 assert.equal(product.offers.offerCount,3);
});
test('ficha pública separa accesorios y anuncios dudosos sin inventar precio mínimo',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;
 const q=query,slug=slugFor(q),items=[accessory,cheap,normal1,normal2];
 try{
  provider.configured=()=>false;
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {rowCount:1,rows:[{
    id:99,slug,query_text:q,index_approved:false,seo_blocked:false,
    provider_status:'ok',last_checked_at:new Date().toISOString(),external_results:items,editorial_summary:''
   }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   const hero=html.match(/<section class="cmp-detail-hero"[\s\S]+?<\/section>/)?.[0];
   assert.ok(hero);
   assert.match(hero,/600,00/);
   assert.doesNotMatch(hero,/39,90|12,99/);
   assert.match(html,/Accesorios relacionados \(1\)/);
   assert.match(html,/Ofertas por verificar \(1\)/);
   assert.match(html,/39,90/);
   assert.match(html,/12,99/);
   assert.match(html,/Desde 600,00/);
   assert.match(html,/name="robots" content="noindex,follow"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});
