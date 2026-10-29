'use strict';
// V3.4.6.3: los precios válidos no desaparecen de Google por el mero encolado.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const compare=require('../src/routes/marketplace-comparador-v32132');
const HOUR=3600000;
const offer=(shop,price)=>({title:'Apple iPhone 12 128 GB Negro',shop,price_cents:price,
 price_currency:'EUR',condition:'Nuevo',internal:false,
 href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/iphone-12'});
const offers=[offer('Tienda A',24000),offer('Tienda B',25000),offer('Tienda C',26500)];
function page(status='queued',hours=26,extra={}){
 const query='iphone 12 128 GB negro';
 return {id:3463,slug:compare.slugFor(query),query_text:query,
  external_results:offers,provider_status:status,index_approved:false,seo_blocked:false,
  last_checked_at:new Date(Date.now()-hours*HOUR).toISOString(),
  updated_at:new Date(Date.now()-hours*HOUR).toISOString(),editorial_summary:'',...extra};
}
test('SEO conserva última instantánea real durante cola y comprobación',()=>{
 for(const status of ['queued','checking']){
  const p=page(status);
  const snapshot=seo.stableSnapshot(p);
  assert.equal(snapshot.provider_status,'ok');
  assert.equal(p.provider_status,status,'no modifica el estado de la base');
  assert.equal(seo.indexEligible(p,offers),true);
  assert.ok(seo.structuredData(p,offers,true,'/comparar/'+p.slug)['@graph']
   .some(x=>x['@type']==='Product'));
 }
});
test('no recupera fichas antiguas, vacías, dañadas ni fallidas',()=>{
 for(const status of ['unavailable','limit_reached','not_configured']){
  assert.equal(seo.indexEligible(page(status),offers),false,status);
 }
 for(const extra of [
  {seo_blocked:true},{external_results:[]},
  {last_checked_at:null},{last_checked_at:'2020-01-01T00:00:00Z'},
  {last_checked_at:new Date(Date.now()+HOUR).toISOString()},
  {query_text:'iphone'}, {external_results:[offers[0]]}
 ]){
  assert.equal(seo.indexEligible(page('checking',26,extra),extra.external_results||offers),false);
 }
 for(const status of ['queued','checking']){
  assert.equal(seo.indexEligible(page(status,24*8),offers),false);
  assert.equal(seo.indexEligible(page(status,26),[offers[0]]),false);
 }
});
test('la instantánea antigua no anuncia Product enriquecido actual',()=>{
 const p=page('checking',52);
 assert.equal(seo.indexEligible(p,offers),true);
 const graph=seo.structuredData(p,offers,true,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(x=>x['@type']==='Product'),false);
 assert.match(graph.find(x=>x['@type']==='WebPage').description,/precios históricos|precios guardados|Ofertas guardadas/i);
});
async function render(p,url){
 const old=db.query,oldConfig=provider.configured,sql=[];
 try{
  provider.configured=()=>false;
  db.query=async text=>{
   sql.push(text);
   if(text.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[p]};
   if(text.startsWith('SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at'))
    return {rowCount:1,rows:[p]};
   if(text.startsWith('SELECT slug,query_text,external_results,provider_status,last_checked_at,index_approved'))
    return {rowCount:1,rows:[p]};
   if(text.startsWith('SELECT slug,query_text,jsonb_array_length(external_results) AS offer_count'))
    return {rowCount:1,rows:[{...p,offer_count:3}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
  try{const res=await fetch('http://127.0.0.1:'+server.address().port+url);
   return {body:await res.text(),status:res.status,sql};}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfig;}
}
test('HTML, sitemap y portada admiten la actualización sin desindexación temporal',async()=>{
 const p=page('queued',26);
 const html=await render(p,'/comparar/'+p.slug);
 const map=await render(p,'/sitemap-comparador.xml');
 const home=await render(p,'/comparar');
 assert.equal(html.status,200);
 assert.match(html.body,/<meta name="robots" content="index,follow">/);
 assert.match(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 assert.match(home.body,/Comparaciones seleccionadas/);
 assert.ok(map.sql.some(q=>q.includes("provider_status IN ('ok','queued','checking')")));
 assert.ok(home.sql.some(q=>q.includes("last_checked_at>now()-interval '7 days'")));
 const admin=compare.seoAdminView([p],'b'.repeat(48),'todas');
 assert.match(admin,/Apta para Google/);
 assert.ok(html.sql.every(q=>!/INSERT INTO marketplace_compare_provider_usage|serpapi/i.test(q)));
});
test('los fallos del proveedor y las ofertas caducadas siguen sin indexarse',async()=>{
 for(const p of [page('unavailable'),page('limit_reached'),page('checking',8*24)]){
  const html=await render(p,'/comparar/'+p.slug);
  const map=await render(p,'/sitemap-comparador.xml');
  assert.match(html.body,/<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 }
});
test('no añade búsquedas, modifica cuotas ni permite indexaciones masivas',()=>{
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(route,/seo\.stableSnapshot\(page\)/);
 assert.match(route,/provider_status IN \('ok','queued','checking'\)/);
 assert.match(route,/seo\.indexEligible\(p,p\.external_results\)/);
});
