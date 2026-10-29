'use strict';
// V3.4.6.9: nombres exactos de consolas sin páginas genéricas ni ofertas inventadas.
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const consoleModels=require('../src/services/marketplace-comparador-console-models-v3469');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const modelSuggestions=require('../src/services/marketplace-comparador-model-suggestions-v3462');
const compare=require('../src/routes/marketplace-comparador-v32132');
const offer=(shop,title,price=49900,extra={})=>({
 shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 internal:false,sponsored:false,
 href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/producto',
 ...extra
});
const page=(query,offers,extra={})=>({
 id:3469,slug:compare.slugFor(query),query_text:query,external_results:offers,
 provider_status:'ok',index_approved:false,seo_blocked:false,editorial_summary:'',
 last_checked_at:new Date(Date.now()-3600000).toISOString(),
 updated_at:new Date(Date.now()-3600000).toISOString(),...extra
});
const ps5=[
 offer('Tienda Uno','Sony PlayStation 5 Pro consola 2 TB',76000),
 offer('Tienda Dos','PS5 Pro 2TB consola Sony',78500)
];
const switchOffers=[
 offer('Tienda Tres','Nintendo Switch OLED Blanca 64GB Consola',29500),
 offer('Tienda Cuatro','Consola Nintendo Switch modelo OLED Joy Con Neon 64 GB',30500)
];
test('identifica dos modelos de consola sin inferir que todo gaming es indexable',()=>{
 assert.equal(consoleModels.consoleModel('playstation 5 pro'),'ps5-pro');
 assert.equal(consoleModels.consoleModel('sony ps5 pro'),'ps5-pro');
 assert.equal(consoleModels.consoleModel('Nintendo Switch OLED'),'switch-oled');
 assert.equal(consoleModels.consoleModel('Nintendo Switch modelo OLED 64 GB'),'switch-oled');
 for(const search of ['ps5','playstation 5','playstation 5 slim','playstation 5 digital',
  'nintendo switch','nintendo switch lite','nintendo switch 2','consolas',
  'playstation 5 pro con juego','nintendo switch oled mario kart bundle']){
  assert.equal(consoleModels.consoleModel(search),null,search);
 }
 assert.equal(seo.discovery.classifyQuery('playstation 5 pro'),'exact');
 assert.equal(seo.discovery.classifyQuery('nintendo switch oled'),'exact');
 assert.equal(seo.discovery.classifyQuery('nintendo switch'),null);
 assert.equal(seo.discovery.classifyQuery('consolas'),null);
});
test('PS5 Pro y PlayStation 5 Pro son alias seguros; sin confundir otros modelos o packs',()=>{
 assert.equal(provider.titleMatches('playstation 5 pro','PS5 Pro 2TB Consola Sony'),true);
 assert.equal(provider.titleMatches('ps5 pro','Sony PlayStation 5 Pro 2TB'),true);
 for(const title of ['PlayStation 5 Slim','PS5 digital edition','PlayStation 5',
  'PS5 Pro Slim','PS5 Pro + juego incluido','PS5 Pro bundle 2TB',
  'Funda para PS5 Pro','Sony PS5 Pro Disc Drive','PS5 Pro 1 TB','PS5 Pro usado para piezas']){
  assert.equal(provider.titleMatches('playstation 5 pro',title),false,title);
 }
 const p=page('playstation 5 pro',ps5);
 assert.equal(seo.indexEligible(p,ps5),true);
 const checked=seo.discovery.evaluate(p,ps5);
 assert.equal(checked.sellerCount,2);
 assert.equal(checked.eligible,true);
 assert.equal(audit.audit([p],[p]).counts['en-sitemap'],1);
 assert.equal(seo.structuredData(p,ps5,true,'/comparar/'+p.slug)['@graph'].some(x=>x['@type']==='Product'),false);
 assert.equal(compare.seoRefinementSuggestions(p).length,0);
 assert.equal(modelSuggestions.models(p).length,0);
});
test('Nintendo Switch OLED permite variantes de color, no Switch Lite/2 ni kits de accesorios',()=>{
 const q='nintendo switch oled',p=page(q,switchOffers);
 assert.equal(provider.titleMatches(q,switchOffers[0].title),true);
 assert.equal(provider.titleMatches(q,switchOffers[1].title),true);
 assert.equal(seo.discovery.evaluate(p,switchOffers).eligible,true);
 assert.equal(seo.indexEligible(p,switchOffers),true);
 assert.equal(audit.audit([p],[p]).sitemapExpected,1);
 assert.equal(seo.structuredData(p,switchOffers,true,'/comparar/'+p.slug)['@graph'].some(x=>x['@type']==='Product'),false);
 for(const title of [
  'Nintendo Switch Lite','Nintendo Switch 2 Consola','Nintendo Switch V2',
  'Nintendo Switch OLED pack Mario Kart','Nintendo Switch OLED 128GB bundle',
  'Funda Nintendo Switch OLED','Nintendo Switch OLED con juego incluido',
  'Nintendo Switch OLED microSD 256 GB','Pantalla Nintendo Switch OLED para repuesto',
  'Nintendo Switch OLED solo pantalla','Nintendo Switch OLED para piezas'
 ])assert.equal(provider.titleMatches(q,title),false,title);
 assert.equal(compare.seoRefinementSuggestions(p).length,0);
 assert.equal(modelSuggestions.models(p).length,0);
});
test('las fichas solo pasan con varios vendedores y sin artículos irrelevantes',()=>{
 for(const [q,good,bad] of [
  ['playstation 5 pro',ps5,['Sony PlayStation 5 Pro funda','Sony PlayStation 5 Slim']],
  ['nintendo switch oled',switchOffers,['Nintendo Switch Lite','Nintendo Switch OLED bundle Mario']]
 ]){
  assert.equal(seo.indexEligible(page(q,good.slice(0,1)),good.slice(0,1)),false);
  const wrong=[good[0],offer('Tienda Diferente',bad[0],28000)];
  assert.equal(seo.indexEligible(page(q,wrong),wrong),false);
  const other=[good[0],offer('Tienda Diferente',bad[1],28000)];
  assert.equal(seo.indexEligible(page(q,other),other),false);
  for(const extra of [
   {seo_blocked:true},{provider_status:'unavailable'},
   {provider_status:'limit_reached'},
   {last_checked_at:'2020-01-01T00:00:00Z'}
  ])assert.equal(seo.indexEligible(page(q,good,extra),good),false);
  const paid=[good[0],{...good[1],sponsored:true}];
  assert.equal(seo.indexEligible(page(q,paid),paid),false);
  const used=[good[0],{...good[1],condition:'Usado'}];
  assert.equal(seo.indexEligible(page(q,used),used),false);
  const currency=[good[0],{...good[1],price_currency:'USD'}];
  assert.equal(seo.indexEligible(page(q,currency),currency),false);
  const broken=[good[0],{...good[1],href:'javascript:alert(1)'}];
  assert.equal(seo.indexEligible(page(q,broken),broken),false);
  const exaggerated=[good[0],{...good[1],price_cents:good[0].price_cents*4}];
  assert.equal(seo.indexEligible(page(q,exaggerated),exaggerated),false);
 }
});
async function fetchPage(p,url){
 const old=db.query,oldConfig=provider.configured;
 const queries=[];
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[p]};
   if(sql===audit.SITEMAP_CANDIDATES_SQL)
    return {rowCount:1,rows:[p]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const srv=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+srv.address().port+url);
   return {status:res.status,body:await res.text(),queries};
  }finally{await new Promise(resolve=>srv.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfig;}
}
test('página pública y sitemap comparten criterios y no anuncian Product falso',async()=>{
 for(const [q,rows] of [['playstation 5 pro',ps5],['nintendo switch oled',switchOffers]]){
  const p=page(q,rows);
  const html=await fetchPage(p,'/comparar/'+p.slug);
  const xml=await fetchPage(p,'/sitemap-comparador.xml');
  assert.equal(html.status,200);
  assert.match(html.body,/<meta name="robots" content="index,follow">/);
  assert.doesNotMatch(html.body,/"@type":"Product"/);
  assert.match(xml.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
  const wrong=page(q,[rows[0],offer('Tienda Ajena','Nintendo Switch Lite consola',70000)]);
  const wrongHtml=await fetchPage(wrong,'/comparar/'+wrong.slug);
  const wrongXml=await fetchPage(wrong,'/sitemap-comparador.xml');
  assert.match(wrongHtml.body,/<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(wrongXml.body,new RegExp('<loc>https://redlibertad.com/comparar/'+wrong.slug+'</loc>'));
  assert.ok(html.queries.every(sql=>!/https:\/\/serpapi\.com/i.test(sql)));
 }
});
test('panel y servicios no generan sugerencias redundantes, coste ni indexación automática',()=>{
 const p=page('playstation 5 pro',ps5),s=page('nintendo switch oled',switchOffers);
 for(const current of [p,s]){
  assert.equal(compare.seoRefinementSuggestions(current).length,0);
  assert.equal(modelSuggestions.models(current).length,0);
 }
 const admin=compare.seoAdminView([p,s],'a'.repeat(48),'todas');
 assert.doesNotMatch(admin,/playstation 5 pro PS5/);
 assert.doesNotMatch(admin,/nintendo switch oled 64 GB/);
 const code=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-console-models-v3469.js'),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|db\.query|reserveQuota|setInterval|serpapi\.com/i);
});
