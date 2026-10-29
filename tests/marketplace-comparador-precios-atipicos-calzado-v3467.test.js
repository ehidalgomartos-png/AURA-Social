'use strict';
// V3.4.6.7 — prueba de precios atípicos en familia de calzado identificable.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const compare=require('../src/routes/marketplace-comparador-v32132');
const offer=(shop,price,title='New Balance 530 Mujer Zapatillas')=>({
 title,shop,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/530',internal:false,sponsored:false
});
const page=(offers,more={})=>{
 const query='new balance 530 mujer';
 return {id:3467,query_text:query,slug:compare.slugFor(query),external_results:offers,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),...more};
};
const prices=[offer('Tienda A',8900),offer('Tienda B',9500),offer('Tienda C',10300)];
test('una anomalía extrema no elimina tres tiendas comparables New Balance ni altera el precio visible',()=>{
 const offers=[offer('Tienda D',550),...prices];
 const grouped=quality.groupOffers('new balance 530 mujer',offers);
 assert.equal(grouped.main.length,3);
 assert.equal(grouped.review.length,1);
 assert.equal(grouped.review[0].price_cents,550);
 assert.match(grouped.review[0].quality_reason,/Precio extremo/);
 assert.equal(Math.min(...grouped.main.map(x=>x.price_cents)),8900);
 const p=page(offers);
 const evaluation=seo.discovery.evaluate(p,offers);
 assert.equal(evaluation.eligible,true,evaluation.reason);
 assert.equal(evaluation.sellerCount,3);
 assert.equal(evaluation.lowPriceCents,8900);
 assert.equal(seo.indexEligible(p,offers),true);
 assert.equal(audit.audit([p],[p]).sitemapExpected,1);
 assert.equal(seo.structuredData(p,offers,true,'/comparar/'+p.slug)['@graph'].some(x=>x['@type']==='Product'),false);
 assert.match(seo.discovery.summary(p,evaluation),/3 tiendas, entre 89,00/);
});
test('un extremo al alza también se muestra para revisar, sin usarse como precio máximo',()=>{
 const offers=[...prices,offer('Tienda D',52000)];
 const result=quality.groupOffers('new balance 530 mujer',offers);
 assert.deepEqual(result.main.map(x=>x.price_cents),[8900,9500,10300]);
 assert.deepEqual(result.review.map(x=>x.price_cents),[52000]);
 assert.equal(seo.discovery.evaluate(page(offers),offers).eligible,true);
});
test('no se recuperan con solo dos tiendas coherentes, dos extremos o precios aún dispersos',()=>{
 const scenarios=[
  [prices[0],prices[1],offer('Tienda C',550)],
  [...prices.slice(0,2),offer('Tienda C',550),offer('Tienda D',600)],
  [offer('Tienda A',2000),offer('Tienda B',8900),offer('Tienda C',24000),offer('Tienda D',91000)],
  [offer('Tienda A',8900),offer('Tienda A',9500),offer('Tienda B',10300),offer('Tienda C',550)],
  [offer('Tienda A',8900),offer('Tienda B',9500),
   offer('Tienda C',550,'New Balance 530 Mujer Zapatillas',{sponsored:true})]
 ];
 for(const list of scenarios){
  const p=page(list);
  assert.equal(seo.indexEligible(p,list),false,JSON.stringify(list.map(x=>[x.shop,x.price_cents])));
 }
});
test('anuncios de otros modelos, hombre, estropeados o patrocinados no cuentan como tercera tienda',()=>{
 const fake=[
  offer('Tienda Uno',8900),
  offer('Tienda Dos',9900),
  offer('Tienda Tres',12000,'New Balance 574 Mujer'),
  offer('Tienda Cuatro',13000,'New Balance 530 Hombre')
 ];
 const grouped=quality.groupOffers('new balance 530 mujer',fake);
 assert.equal(grouped.main.length,2);
 assert.equal(grouped.review.length,2);
 assert.equal(seo.indexEligible(page(fake),fake),false);
 for(const bad of [
  {...prices[2],condition:'Averiado'},
  {...prices[2],sponsored:true},
  {...prices[2],price_currency:'USD'},
  {...prices[2],href:'javascript:alert(1)'}
 ]){
  const list=[prices[0],prices[1],bad,offer('Tienda D',400)];
  assert.equal(seo.indexEligible(page(list),list),false);
 }
});
test('los vetos y el comportamiento de otras categorías no cambian',()=>{
 const offers=[offer('Tienda D',550),...prices];
 for(const extra of [
  {seo_blocked:true},
  {provider_status:'unavailable'},
  {provider_status:'limit_reached'},
  {last_checked_at:'2020-01-01T00:00:00Z'}
 ]){
  assert.equal(seo.indexEligible(page(offers,extra),offers),false);
 }
 const asus=['ASUS ROG Strix Gaming G16','ASUS ROG Strix Gaming G17',
  'ASUS ROG Strix Gaming G18','ASUS ROG Strix Gaming G19'].map((title,i)=>
  offer('Tienda '+i,i===0?600:150000,title));
 const laptop=page(asus,{query_text:'portatil asus rog strix gaming'});
 assert.equal(seo.indexEligible(laptop,asus),false);
 assert.equal(seo.discovery.classifyQuery('zapatillas skechers mujer'),'category');
 // Reconocer la intención no permite indexar una categoría sin ofertas.
 assert.equal(seo.discovery.classifyQuery('zapatillas mujer'),null);
 assert.equal(seo.discovery.evaluate(page([],{query_text:'zapatillas skechers mujer'}),[]).eligible,false);
});
async function publicHtml(pageData){
 const original=db.query,originalConfigured=provider.configured,originalQuota=worker.quotaStatus,queries=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[pageData]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+pageData.slug);
   return {status:res.status,body:await res.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=originalConfigured;worker.quotaStatus=originalQuota;}
}
test('la ficha pública marca una oferta extrema para revisar y no anuncia su precio como mínimo',async()=>{
 const p=page([offer('Tienda D',550),...prices]);
 const rendered=await publicHtml(p);
 assert.equal(rendered.status,200);
 assert.match(rendered.body,/<meta name="robots" content="index,follow">/);
 assert.match(rendered.body,/Ofertas por verificar/);
 assert.match(rendered.body,/Precio extremo pendiente de confirmar/);
 assert.match(rendered.body,/Desde 89,00/);
 assert.doesNotMatch(rendered.body,/Desde 5,50/);
 assert.ok(rendered.queries.every(q=>!/INSERT INTO marketplace_compare_provider_usage|serpapi.com/i.test(q)));
});
test('la revisión SEO no consume llamadas externas ni automatiza la indexación',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-offer-quality-v3419.js'),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|\bdb\.query|reserveQuota|setInterval|stripe|resend/i);
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(source,/No forman parte del mínimo comparable/);
});
