'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const auto=require('../src/services/marketplace-comparador-auto-seo-v32138');
const compare=require('../src/routes/marketplace-comparador-v32132');

// Use a fresh clock-relative fixture; fixed dates become stale after 48 hours.
const NOW=new Date().toISOString();
const STALE=new Date(Date.parse(NOW)-72*60*60*1000).toISOString();
function fixture(overrides={}){
 const page={id:74,query_text:'iPhone 17 Pro 256 GB',slug:compare.slugFor('iPhone 17 Pro 256 GB'),index_approved:false,
   seo_blocked:false,provider_status:'ok',last_checked_at:NOW,updated_at:NOW,
   created_at:'2026-10-24T09:00:00.000Z',editorial_summary:'',external_results:[],...overrides};
 const offers=['Tienda A','Tienda B','Tienda C'].map((shop,i)=>({
  title:'Apple iPhone 17 Pro 256 GB Negro',shop,price_cents:90000+i*1200,price_currency:'EUR',condition:'Consultar estado',
  internal:false,sponsored:false,href:'https://shop'+(i+1)+'.example/iphone-17-pro-256gb'
 }));
 page.external_results=overrides.external_results||offers;
 return page;
}
test('solo modelos específicos y variantes coherentes con 3 tiendas reales',()=>{
 const page=fixture();
 assert.equal(auto.capacity('iPhone 17 Pro 256GB'),'256gb');
 assert.equal(auto.capacity('Apple iPhone 17 Pro 256 GB Negro'),'256gb');
 assert.equal(auto.family('iPhone 17 Pro'),'pro');
 assert.equal(auto.color('iPhone 17 Pro Azul'),'azul');
 const result=auto.eligibleOffers(page,page.external_results,Date.parse(NOW));
 assert.equal(result.eligible,true);
 assert.equal(result.sellerCount,3);
 assert.equal(result.lowPriceCents,90000);
 assert.match(auto.autoSummary(page,result),/3 tiendas/);
 assert.match(auto.autoSummary(page,result),/900,00/);
 assert.equal(seo.indexEligible(page,page.external_results,Date.parse(NOW)),true,'sin aprobación manual');
 const graph=seo.structuredData(page,page.external_results,true,'/comparar/'+page.slug);
 const product=graph['@graph'].find(x=>x['@type']==='Product');
 assert.equal(product.offers.offerCount,3);
 assert.equal(product.offers.lowPrice,'900.00');
 assert.equal(product.offers.priceCurrency,'EUR');
});
test('no indexar búsquedas generales, mezclas, usados, anuncios ni enlaces a Google',()=>{
 const p=fixture(), now=Date.parse(NOW);
 const altered=(newPage,newOffers)=>auto.eligibleOffers(newPage||p,newOffers||p.external_results,now);
 assert.equal(altered({...p,query_text:'iphone 17 pro'}).eligible,false);
 assert.equal(altered({...p,query_text:'iphone 17 pro 256gb azul'}).eligible,false);
 assert.equal(altered({...p,query_text:'iphone 17 pro 256gb',seo_blocked:true}).eligible,false);
 assert.equal(altered({...p,provider_status:'queued'}).eligible,false);
 assert.equal(altered({...p,last_checked_at:STALE}).eligible,false);
 assert.equal(altered(p,p.external_results.slice(0,2)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===2?{...o,shop:'Tienda B'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===2?{...o,title:'Apple iPhone 17 Pro Max 256 GB Negro'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,title:'Apple iPhone 17 Pro 128 GB Negro'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,title:'Apple iPhone 17 Pro 256 GB Azul'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,title:'Apple iPhone 17 Pro 256 GB Negro Reacondicionado',condition:'Reacondicionado'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,href:'https://www.google.com/shopping/product/123'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,sponsored:true}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,price_currency:'USD'}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,price_cents:400000}:o)).eligible,false);
 assert.equal(altered(p,p.external_results.map((o,i)=>i===1?{...o,resolved_href:'https://shopgood.example/p',href:'https://www.google.com/shopping/product/100'}:o)).eligible,false);
});

test('SEO automático consistente en HTML, JSON-LD y sitemap XML sin solicitudes a SerpApi',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldEnv=process.env.COMPARADOR_SERPAPI_KEY;
 const now=new Date().toISOString(),page=fixture({last_checked_at:now,updated_at:now});
 const broad=fixture({id:88,slug:compare.slugFor('iphone'),query_text:'iphone',last_checked_at:now,updated_at:now});
 let externalCalls=0;
 try{
  delete process.env.COMPARADOR_SERPAPI_KEY;
  provider.configured=()=>false;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[page]};
   if(sql.startsWith('SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results'))return {rowCount:2,rows:[page,broad]};
   if(sql.startsWith('SELECT slug,query_text,external_results,provider_status'))return {rowCount:2,rows:[page,broad]};
   if(sql.startsWith('SELECT slug,query_text,jsonb_array_length'))return {rowCount:2,rows:[{...page,offer_count:3},{...broad,offer_count:3}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
  try{
   const origin='http://127.0.0.1:'+server.address().port;
   const pageResponse=await fetch(origin+'/comparar/'+page.slug),html=await pageResponse.text();
   assert.equal(pageResponse.status,200);
   assert.match(html,/name="robots" content="index,follow"/);
   assert.match(html,/<script type="application\/ld\+json">/);
   assert.match(html,/AggregateOffer/);
   assert.match(html,/Comparación de precios/);
   const sitemap=await fetch(origin+'/sitemap-comparador.xml');
   const xml=await sitemap.text();
   assert.equal(sitemap.status,200);
   assert.match(xml,new RegExp(page.slug));
   assert.ok(!xml.includes(broad.slug));
   const home=await fetch(origin+'/comparar'),homeHtml=await home.text();
   assert.match(homeHtml,/Comparaciones seleccionadas/);
   assert.match(homeHtml,new RegExp(page.slug));
   assert.equal(externalCalls,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=oldQuery;provider.configured=oldConfigured;
  if(oldEnv===undefined)delete process.env.COMPARADOR_SERPAPI_KEY;else process.env.COMPARADOR_SERPAPI_KEY=oldEnv;
 }
});

test('administrador puede bloquear URL y deja de ser indexable en el siguiente render',()=>{
 const page=fixture(),now=Date.parse(NOW);
 assert.equal(seo.indexEligible(page,page.external_results,now),true);
 assert.equal(seo.indexEligible({...page,seo_blocked:true},page.external_results,now),false);
 assert.equal(auto.eligibleOffers({...page,seo_blocked:true},page.external_results,now).reason,'Bloqueada por administración');
 const graph=seo.structuredData({...page,seo_blocked:true},page.external_results,false,'/comparar/'+page.slug);
 assert.equal(graph['@graph'].some(x=>x['@type']==='Product'),false);
});

test('la caducidad de 48 horas sigue bloqueando precios y fichas enriquecidas',()=>{
 const page=fixture({last_checked_at:STALE});
 const result=auto.eligibleOffers(page,page.external_results,Date.parse(NOW));
 assert.equal(result.eligible,false);
 assert.equal(result.reason,'Precios sin actualizar');
 assert.equal(seo.indexEligible(page,page.external_results,Date.parse(NOW)),false);
 const graph=seo.structuredData(page,page.external_results,true,'/comparar/'+page.slug);
 assert.equal(graph['@graph'].some(entry=>entry['@type']==='Product'),false);
});
