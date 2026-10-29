'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const indexAudit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const priorities=require('../src/services/marketplace-comparador-seo-priorities-v3460');
const compare=require('../src/routes/marketplace-comparador-v32132');

function offer(shop,title,price=26500,rest={}){
 return {title,shop,price_cents:price,price_currency:'EUR',condition:'Nuevo',
  href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/producto',
  internal:false,sponsored:false,...rest};
}
function page(query,external_results,extra={}){
 return {id:3468,slug:compare.slugFor(query),query_text:query,external_results,
  last_checked_at:new Date(Date.now()-60*60*1000).toISOString(),
  updated_at:new Date(Date.now()-60*60*1000).toISOString(),
  provider_status:'ok',index_approved:false,seo_blocked:false,editorial_summary:'',...extra};
}
const q='xiaomi redmi note 14 pro 256 GB';
const colors=[
 offer('Tienda A','Xiaomi Redmi Note 14 Pro 256 GB Negro',24000),
 offer('Tienda B','Xiaomi Redmi Note 14 Pro 256GB Azul',25200),
 offer('Tienda C','Xiaomi Redmi Note 14 Pro 256 GB Gris',26500)
];
test('Redmi 256 GB sin color especificado puede comparar distintos acabados sin declarar un único SKU',()=>{
 const p=page(q,colors);
 const found=seo.discovery.evaluate(p,colors);
 assert.equal(found.eligible,true,found.reason);
 assert.equal(found.kind,'exact');
 assert.equal(found.sellerCount,3);
 assert.equal(seo.indexEligible(p,colors),true);
 assert.equal(seo.auto.eligibleOffers(p,colors).eligible,false,
  'AggregateOffer exige un único color, aquí existen varios');
 const graph=seo.structuredData(p,colors,true,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(x=>x['@type']==='Product'),false);
 assert.equal(indexAudit.audit([p],[p]).counts['en-sitemap'],1);
 assert.equal(seo.discovery.summary(p,found).includes('3 tiendas'),true);
});
test('si el usuario especifica color, todas las ofertas del SEO deben coincidir con él',()=>{
 const p=page(q+' negro',colors);
 assert.equal(seo.discovery.evaluate(p,colors).eligible,false);
 assert.equal(seo.indexEligible(p,colors),false);
 const two=[
  offer('Tienda A','Xiaomi Redmi Note 14 Pro 256 GB Negro',24000),
  offer('Tienda B','Xiaomi Redmi Note 14 Pro 256GB Negro',25000)
 ];
 assert.equal(seo.discovery.evaluate(page(q+' negro',two),two).eligible,true);
});
test('Redmi 4G/5G y títulos sin conectividad no se presentan como mismo modelo',()=>{
 for(const mixed of [
  [
   offer('Tienda A','Xiaomi Redmi Note 14 Pro 4G 256 GB Negro',21000),
   offer('Tienda B','Xiaomi Redmi Note 14 Pro 5G 256 GB Azul',27000)
  ],
  [
   offer('Tienda A','Xiaomi Redmi Note 14 Pro 5G 256 GB Negro',21000),
   offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Azul',24000)
  ]
 ]){
  const p=page(q,mixed);
  const result=seo.discovery.evaluate(p,mixed);
  assert.equal(result.eligible,false);
  assert.match(result.reason,/conectividad 4G\/5G/);
  assert.equal(seo.indexEligible(p,mixed),false);
  const guidance=priorities.plan(p,mixed,false,result);
  assert.match(guidance.title,/4G o 5G/);
 }
 const only5g=[
  offer('Tienda A','Xiaomi Redmi Note 14 Pro 5G 256 GB Negro',22500),
  offer('Tienda B','Xiaomi Redmi Note 14 Pro 5G 256 GB Azul',24800)
 ];
 assert.equal(seo.discovery.evaluate(page(q,only5g),only5g).eligible,true);
 assert.equal(seo.indexEligible(page(q+' 4G',only5g),only5g),false);
});
test('capacidad, modelos, estado, vendedor, precio o procedencia siguen siendo límites estrictos',()=>{
 const wrong=[
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 512 GB Azul',25200)],
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro Plus 256 GB Negro',26000)],
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Negro',25200,{condition:'Usado'})],
  [colors[0],{...colors[1],shop:'Tienda A'}],
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Azul',25200,{sponsored:true})],
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Azul',25200,{href:'javascript:alert(1)'})],
  [colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Azul',85000)]
 ];
 for(const offers of wrong)
  assert.equal(seo.indexEligible(page(q,offers),offers),false,offers.map(o=>o.title).join('|'));
 for(const data of [
  {provider_status:'unavailable'}, {provider_status:'limit_reached'},
  {seo_blocked:true},{last_checked_at:'2020-01-01T00:00:00Z'}
 ])assert.equal(seo.indexEligible(page(q,colors,data),colors),false);
 assert.equal(seo.indexEligible(page('xiaomi redmi note 14 pro',colors),colors),false);
});
async function renderPublic(p,url){
 const original=db.query,configured=provider.configured;
 const calls=[];
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   calls.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rows:[p],rowCount:1};
   if(sql===indexAudit.SITEMAP_CANDIDATES_SQL)
    return {rows:[p],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+url);
   return {status:response.status,body:await response.text(),calls};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=configured;}
}
test('HTML público y XML reflejan la misma aceptación, sin simular AggregateOffer',async()=>{
 const p=page(q,colors);
 const html=await renderPublic(p,'/comparar/'+p.slug);
 assert.equal(html.status,200);
 assert.match(html.body,/<meta name="robots" content="index,follow">/);
 assert.doesNotMatch(html.body,/"@type":"Product"/);
 const map=await renderPublic(p,'/sitemap-comparador.xml');
 assert.equal(map.status,200);
 assert.match(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 const mixed=page(q,[colors[0],offer('Tienda B','Xiaomi Redmi Note 14 Pro 5G 256 GB Azul')]);
 const forbidden=await renderPublic(mixed,'/comparar/'+mixed.slug);
 const excluded=await renderPublic(mixed,'/sitemap-comparador.xml');
 assert.match(forbidden.body,/<meta name="robots" content="noindex,follow">/);
 assert.doesNotMatch(excluded.body,new RegExp('<loc>https://redlibertad.com/comparar/'+mixed.slug+'</loc>'));
 assert.ok(html.calls.every(sql=>!/marketplace_compare_provider_usage|serpapi\.com/i.test(sql)));
});
test('no hay nuevas llamadas externas, ni cambios de cuota o indexaciones forzadas',()=>{
 const source=fs.readFileSync(path.join(__dirname,
  '../src/services/marketplace-comparador-index-discovery-v3458.js'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|db\.query|reserveQuota|setInterval/i);
 assert.match(source,/conectividad 4G\/5G diferente/);
});
