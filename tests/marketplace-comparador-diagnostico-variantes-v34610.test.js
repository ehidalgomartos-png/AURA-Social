'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const details=require('../src/services/marketplace-comparador-indexation-details-v34610');
const compare=require('../src/routes/marketplace-comparador-v32132');
function offer(shop,price,title,other={}){
 return {shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
  href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/producto',
  internal:false,sponsored:false,...other};
}
function page(q,external_results,more={}){
 return {id:34610,slug:compare.slugFor(q),query_text:q,external_results,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),...more};
}
const ps5='playstation 5 pro';
const title='Sony PlayStation 5 Pro 2 TB consola';
const good=[
 offer('Tienda A',73000,title),
 offer('Tienda B',76500,'PS5 Pro 2 TB Sony consola'),
 offer('Tienda C',79900,'Sony PS5 Pro 2 TB consola')
];
test('una única oferta extrema con cuatro vendedores queda para revisar, no en el precio mínimo',()=>{
 const offers=[offer('Tienda D',10000,title),...good];
 const grouped=quality.groupOffers(ps5,offers);
 assert.equal(grouped.review.length,1);
 assert.equal(grouped.review[0].price_cents,10000);
 assert.match(grouped.review[0].quality_reason,/Precio extremo de consola/);
 assert.equal(grouped.main.length,3);
 const p=page(ps5,offers);
 const found=seo.discovery.evaluate(p,offers);
 assert.equal(found.eligible,true,found.reason);
 assert.equal(found.sellerCount,3);
 assert.equal(found.lowPriceCents,73000);
 assert.equal(seo.indexEligible(p,offers),true);
 assert.equal(audit.audit([p],[p]).sitemapExpected,1);
 assert.equal(seo.structuredData(p,offers,true,'/comparar/'+p.slug)['@graph']
  .some(x=>x['@type']==='Product'),false);
});
test('no se eliminan ofertas con solo dos/tres tiendas, dos extremos, precios aún incoherentes o tiendas repetidas',()=>{
 const cases=[
  [good[0],offer('Tienda B',10000,title)],
  [good[0],good[1],offer('Tienda C',10000,title)],
  [...good.slice(0,2),offer('Tienda C',10000,title),offer('Tienda D',11000,title)],
  [good[0],good[1],offer('Tienda C',200000,title),offer('Tienda D',120000,title)],
  [good[0],{...good[1],shop:'Tienda A'},good[2],offer('Tienda D',10000,title)]
 ];
 for(const offers of cases){
  assert.equal(seo.indexEligible(page(ps5,offers),offers),false,
   offers.map(o=>o.price_cents+':'+o.shop).join(' '));
 }
});
test('no se relajan bloqueos, fecha, moneda, variantes o accesos',()=>{
 const offers=[offer('Tienda D',10000,title),...good];
 for(const more of [
  {seo_blocked:true},{provider_status:'unavailable'},{provider_status:'limit_reached'},
  {last_checked_at:'2021-01-01T00:00:00Z'}
 ])assert.equal(seo.indexEligible(page(ps5,offers,more),offers),false);
 assert.equal(seo.indexEligible(page('playstation 5',offers),offers),false);
 assert.equal(seo.indexEligible(page('nintendo switch oled',offers),offers),false);
 for(const modified of [
  {...good[1],href:'javascript:alert(1)'},
  {...good[1],price_currency:'USD'},
  {...good[1],condition:'Reacondicionado'}
 ])assert.equal(seo.indexEligible(page(ps5,[good[0],modified]),[good[0],modified]),false);
});
test('auditoría de PS5 muestra precios guardados y vendedores, sin presentarlos como precios actuales certificados',()=>{
 const p=page(ps5,[good[0],offer('Tienda B',10000,title)]);
 assert.equal(seo.indexEligible(p,p.external_results),false);
 const info=details.inspect(p);
 assert.equal(info.kind,'price');
 assert.equal(info.sellers,2);
 assert.equal(info.total,2);
 assert.equal(info.excluded,0);
 assert.equal(info.ratio,7.3);
 assert.equal(info.offers[0].priceCents,10000);
 assert.match(info.note,/menos de cuatro comercios/);
});
test('Redmi distingue 4G, 5G y conectividad ausente y ofrece búsquedas solo con evidencia',()=>{
 const q='xiaomi redmi note 14 pro 256 GB';
 const offers=[
  offer('Tienda A',21000,'Xiaomi Redmi Note 14 Pro 5G 256 GB Negro'),
  offer('Tienda B',22000,'Xiaomi Redmi Note 14 Pro 5G 256GB Azul'),
  offer('Tienda C',19000,'Xiaomi Redmi Note 14 Pro 256 GB Negro'),
  offer('Tienda D',18000,'Xiaomi Redmi Note 14 Pro 4G 256 GB Negro'),
  offer('Tienda E',9999,'Xiaomi Redmi Note 14 Pro 5G 512 GB Azul')
 ];
 const p=page(q,offers);
 const info=details.inspect(p);
 assert.equal(info.kind,'network');
 assert.deepEqual(info.breakdown.map(x=>[x.key,x.sellers]),[['4g',1],['5g',2],['unknown',1]]);
 assert.deepEqual(info.suggestions,[q+' 5G']);
 assert.equal(seo.indexEligible(p,offers),false);
 assert.deepEqual(details.inspect(page(q+' 5G',offers)).suggestions,[]);
 const other=page('zapatillas skechers mujer',offers);
 assert.equal(details.inspect(other),null);
 assert.match(info.note,/no se convierte en 4G ni en 5G/);
});
test('diagnóstico en panel privado distingue precios y conectividad con escape HTML',async()=>{
 const r=compare.router.stack.find(layer=>layer.route?.path==='/admin/comparador/indexacion');
 assert.ok(r);
 const handler=r.route.stack.at(-1).handle;
 const p1=page(ps5,[good[0],offer('Tienda <img>',10000,title)]);
 const q='xiaomi redmi note 14 pro 256 GB';
 const p2=page(q,[
  offer('Tienda A',21000,'Xiaomi Redmi Note 14 Pro 5G 256 GB Negro'),
  offer('Tienda B',22000,'Xiaomi Redmi Note 14 Pro 5G 256 GB Azul'),
  offer('Tienda C',20000,'Xiaomi Redmi Note 14 Pro 256 GB Gris')
 ]);
 const original=db.query,sql=[];
 try{
  db.query=async query=>{
   sql.push(query);
   if(query===audit.SAMPLE_SQL)return {rows:[p1,p2],rowCount:2};
   if(query===audit.SITEMAP_CANDIDATES_SQL)return {rows:[p1,p2],rowCount:2};
   return {rows:[],rowCount:0};
  };
  const headers={},res={
   set(k,v){headers[k]=v;return this;},
   send(html){this.html=html;return this;}
  };
  let err=null;
  await handler({query:{estado:'noindex'}},res,e=>{err=e;});
  assert.equal(err,null);
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.equal(headers['Cache-Control'],'private,no-store');
  assert.match(res.html,/Ofertas y precios que requieren revisión/);
  assert.match(res.html,/Conectividad de las ofertas guardadas/);
  assert.match(res.html,/Sin identificar: 1 ofertas, 1 tiendas distintas/);
  assert.match(res.html,/xiaomi%20redmi%20note%2014%20pro%20256%20GB%205G/);
  assert.match(res.html,/Tienda &lt;img&gt;/);
  assert.doesNotMatch(res.html,/Tienda <img>/);
  assert.ok(sql.filter(q=>/^SELECT/.test(q)).length===2);
  assert.ok(sql.every(q=>!/serpapi\.com|INSERT INTO marketplace_compare_provider_usage/i.test(q)));
 }finally{db.query=original;}
});
test('servicio no puede hacer consultas externas ni mutar base; estilos mobile-first',()=>{
 const source=fs.readFileSync(path.join(__dirname,
  '../src/services/marketplace-comparador-indexation-details-v34610.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\bdb\.query|reserveQuota|enqueue|setInterval|serpapi\.com/i);
 assert.match(css,/V3\.4\.6\.10/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/:focus-visible/);
});
