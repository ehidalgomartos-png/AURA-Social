'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const details=require('../src/services/marketplace-comparador-indexation-details-v34610');
const compare=require('../src/routes/marketplace-comparador-v32132');
function offer(shop,cents,title='Sony PlayStation 5 Pro 2 TB consola',extra={}){
 return {shop,price_cents:cents,title,price_currency:'EUR',
  condition:'Consultar estado',href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/ps5',
  sponsored:false,internal:false,...extra};
}
function page(rows,extra={}){
 const query='playstation 5 pro';
 return {id:34611,slug:compare.slugFor(query),query_text:query,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  external_results:rows,...extra};
}
const rent=offer('Grover',7699,'Sony PlayStation 5 Pro Console',
 {href:'https://www.grover.com/es-es/products/sony-console-playstation-5-pro'});
const purchases=[
 offer('CeX',77000,'Sony PlayStation 5 Pro 2 TB'),
 offer('Electronues',87900,'PS5 Pro 2 TB consola'),
 offer('Wallapop',93000,'Sony Playstation 5 Pro 2TB blanca')
];
test('Grover es alquiler: no se compara una cuota mensual como compra ni se borra la oferta original',()=>{
 assert.match(quality.rentalReason(rent),/Grover/);
 assert.match(quality.rentalReason(offer('Comercio',7699,'PS5 Pro alquiler mensual')),/alquiler/i);
 assert.match(quality.rentalReason(offer('Tienda',7699,'PS5 Pro pago por mes')),/alquiler/i);
 assert.match(quality.rentalReason(offer('Comercio',7699,'Sony PS5 Pro',{href:rent.href})),/Grover/);
 for(const p of purchases)assert.equal(quality.rentalReason(p),null,p.shop);
 const original=JSON.stringify([rent,...purchases]);
 const result=quality.groupOffers('playstation 5 pro',[rent,...purchases]);
 assert.deepEqual(result.rentals.map(x=>x.price_cents),[7699]);
 assert.deepEqual(result.main.map(x=>x.price_cents),[77000,87900,93000]);
 assert.equal(result.review.length,0);
 assert.equal(JSON.stringify([rent,...purchases]),original);
});
test('precio de compra real y SEO usan el mismo grupo y excluyen la cuota sin perder vendedores reales',()=>{
 const rows=[rent,...purchases];
 const p=page(rows);
 const result=seo.discovery.evaluate(p,rows);
 assert.equal(result.eligible,true,result.reason);
 assert.equal(result.sellerCount,3);
 assert.equal(result.lowPriceCents,77000);
 assert.equal(seo.indexEligible(p,rows),true);
 const info=details.inspect(p);
 assert.equal(info.sellers,3);
 assert.equal(info.total,3);
 assert.equal(info.rentalCount,1);
 assert.equal(info.rentals[0].shop,'Grover');
 assert.equal(info.ratio,1.21);
 assert.equal(info.offers[0].priceCents,77000);
 assert.equal(audit.audit([p],[p]).sitemapExpected,1);
});
test('si solo hay alquileres o queda un solo comercio vendedor, nunca se indexa',()=>{
 for(const rows of [[rent],[rent,purchases[0]],
  [rent,{...rent,shop:'Grover España',href:rent.href}] ]){
  const p=page(rows);
  assert.equal(seo.indexEligible(p,rows),false);
  assert.equal(audit.audit([p],[p]).sitemapExpected,0);
 }
 const used=[rent,purchases[0],{...purchases[1],condition:'Usado'}];
 assert.equal(seo.indexEligible(page(used),used),false);
 for(const flags of [
  {seo_blocked:true},{provider_status:'unavailable'},
  {last_checked_at:'2021-01-01T00:00:00Z'}
 ])assert.equal(seo.indexEligible(page([rent,...purchases],flags),[rent,...purchases]),false);
});
test('una oferta de alquiler distinta de Grover con título explícito tampoco altera mínimos',()=>{
 const other=offer('Tienda Alquileres',4000,'PS5 Pro alquiler mensual 2TB');
 const results=quality.groupOffers('playstation 5 pro',[other,...purchases]);
 assert.equal(results.main.length,3);
 assert.equal(results.rentals.length,1);
 assert.equal(results.rentals[0].price_cents,4000);
});
async function render(p,url){
 const old=db.query,oldConfigured=provider.configured,queries=[];
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rows:[p],rowCount:1};
   if(sql===audit.SITEMAP_CANDIDATES_SQL)return {rows:[p],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+url);
   return {status:response.status,body:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfigured;}
}
test('HTML público identifica alquiler con precio fuera del mínimo y el sitemap solo incluye compras válidas',async()=>{
 const p=page([rent,...purchases]);
 const html=await render(p,'/comparar/'+p.slug);
 const map=await render(p,'/sitemap-comparador.xml');
 assert.equal(html.status,200);
 assert.match(html.body,/<meta name="robots" content="index,follow">/);
 assert.match(html.body,/Desde 770,00/);
 assert.doesNotMatch(html.body,/Desde 76,99/);
 assert.match(html.body,/Alquileres y cuotas \(no son precios de compra\)/);
 assert.match(html.body,/Cuota de alquiler anunciada/);
 assert.match(html.body,/Consultar condiciones de alquiler/);
 assert.match(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 assert.doesNotMatch(html.body,/"@type":"Product"/);
 const rentalOnly=page([rent]);
 const bad=await render(rentalOnly,'/comparar/'+rentalOnly.slug);
 assert.match(bad.body,/Solo hay ofertas de alquiler/);
 assert.match(bad.body,/<meta name="robots" content="noindex,follow">/);
 const badMap=await render(rentalOnly,'/sitemap-comparador.xml');
 assert.doesNotMatch(badMap.body,new RegExp('<loc>https://redlibertad.com/comparar/'+rentalOnly.slug+'</loc>'));
 assert.ok(html.queries.every(q=>!/https:\/\/serpapi\.com|INSERT INTO marketplace_compare_provider_usage/i.test(q)));
});
test('auditoría administrativa etiqueta Grover y no lo incluye como precio de compra',async()=>{
 const layer=compare.router.stack.find(x=>x.route?.path==='/admin/comparador/indexacion');
 assert.ok(layer);
 const handler=layer.route.stack.at(-1).handle;
 const p=page([rent,...purchases],{external_results:[rent,purchases[0]]});
 const old=db.query,queries=[];
 try{
  db.query=async sql=>{
   queries.push(sql);
   if(sql===audit.SITEMAP_CANDIDATES_SQL)return {rowCount:1,rows:[p]};
   if(sql===audit.SAMPLE_SQL)return {rowCount:1,rows:[p]};
   return {rowCount:0,rows:[]};
  };
  const headers={},res={set(k,v){headers[k]=v;return this;},send(html){this.html=html;return this;}};
  let error=null;
  await handler({query:{estado:'noindex'}},res,e=>{error=e;});
  assert.equal(error,null);
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.match(res.html,/1 oferta\(s\) de alquiler excluida\(s\) del precio de compra/);
  assert.match(res.html,/Grover · cuota publicada 76,99/);
  assert.match(res.html,/diferencia máximo\/mínimo de compra/);
  assert.doesNotMatch(res.html,/diferencia máximo\/mínimo: 26/);
  assert.equal(queries.filter(q=>/^SELECT/.test(q)).length,2);
 }finally{db.query=old;}
});
test('sin consumo de APIs, cuotas y sin exponer datos externos nuevos',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-offer-quality-v3419.js'),'utf8');
 const detail=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-indexation-details-v34610.js'),'utf8');
 assert.doesNotMatch(src+detail,/\bfetch\s*\(|\bdb\.query|reserveQuota|setInterval|stripe/i);
 assert.match(src,/rentalReason/);
 assert.match(detail,/rentalCount/);
});
