'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const compare=require('../src/routes/marketplace-comparador-v32132');
const discovery=seo.discovery;
const NOW=new Date().toISOString();
const DAY=24*60*60*1000;
function offer(shop,title,price=123900,extra={}){
 return {title,shop,price_cents:price,price_currency:'EUR',condition:'Consultar estado',
  internal:false,sponsored:false,href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/producto',...extra};
}
function page(query,offers,extra={}){
 return {id:731,slug:compare.slugFor(query),query_text:query,
  index_approved:false,seo_blocked:false,provider_status:'ok',
  last_checked_at:NOW,updated_at:NOW,external_results:offers,editorial_summary:'',...extra};
}
const asus='portatil asus rog strix gaming';
const asusOffers=[
 offer('Tienda A','Portatil ASUS ROG Strix Gaming G16',139999),
 offer('Tienda B','Portatil ASUS ROG Strix Gaming G17',148000),
 offer('Tienda C','Portatil ASUS ROG Strix Gaming G18',164999)
];
const iphoneOffers=[
 offer('Tienda A','Apple iPhone 12 128 GB Negro',24000),
 offer('Tienda B','Apple iPhone 12 128 GB Negro',25200)
];
test('una familia ASUS concreta con tres tiendas puede indexarse sin inventar un único SKU',()=>{
 const p=page(asus,asusOffers);
 const evaln=discovery.evaluate(p,p.external_results);
 assert.equal(evaln.eligible,true,evaln.reason);
 assert.equal(evaln.kind,'family');
 assert.equal(evaln.sellerCount,3);
 assert.equal(seo.indexEligible(p,p.external_results),true);
 const text=discovery.summary(p,evaln);
 assert.match(text,/Pueden corresponder a distintas versiones/);
 assert.match(text,/3 tiendas/);
 const graph=seo.structuredData(p,asusOffers,true,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(v=>v['@type']==='Product'),false);
 assert.match(graph.find(v=>v['@type']==='WebPage').description,/3 tiendas/);
});
test('dos tiendas independientes bastan para un modelo identificado y coherente',()=>{
 const p=page('iphone 12 128 GB negro',iphoneOffers);
 assert.equal(seo.auto.eligibleOffers(p,iphoneOffers).eligible,false);
 assert.equal(discovery.evaluate(p,iphoneOffers).eligible,true);
 assert.equal(seo.indexEligible(p,iphoneOffers),true);
 const graph=seo.structuredData(p,iphoneOffers,true,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(v=>v['@type']==='Product'),false,'no AggregateOffer sin prueba estricta');
});
test('siguen en noindex páginas vacías, genéricas, bloqueadas y mezcladas',()=>{
 const p=page(asus,asusOffers);
 assert.equal(seo.indexEligible(p,[]),false);
 assert.equal(seo.indexEligible({...p,seo_blocked:true},asusOffers),false);
 assert.equal(seo.indexEligible({...p,provider_status:'unavailable'},asusOffers),false);
 assert.equal(seo.indexEligible({...p,provider_status:'limit_reached'},asusOffers),false);
 assert.equal(seo.indexEligible({...p,query_text:'portatil'},asusOffers),false);
 assert.equal(seo.indexEligible({...p,query_text:'iphone'},iphoneOffers),false);
 assert.equal(seo.indexEligible({...p,last_checked_at:new Date(Date.now()-8*DAY).toISOString()},asusOffers),false);
 assert.equal(seo.indexEligible(p,asusOffers.slice(0,2)),false);
 assert.equal(seo.indexEligible(p,asusOffers.map(o=>({...o,sponsored:true}))),false);
 assert.equal(seo.indexEligible(p,asusOffers.map(o=>({...o,condition:'Usado'}))),false);
 assert.equal(seo.indexEligible(p,asusOffers.map(o=>({...o,price_currency:'USD'}))),false);
 assert.equal(seo.indexEligible(p,asusOffers.map(o=>({...o,href:'javascript:alert(1)'}))),false);
 assert.equal(seo.indexEligible(p,[asusOffers[0],asusOffers[0],asusOffers[0]]),false);
 assert.equal(seo.indexEligible(p,[...asusOffers.slice(0,2),offer('Tienda C','Portatil ASUS ROG Strix Gaming G18',999)]),false);
 const phone=page('iphone 12 128 GB negro',iphoneOffers);
 assert.equal(seo.indexEligible({...phone,query_text:'iphone 12'},iphoneOffers),false);
 assert.equal(seo.indexEligible(phone,[iphoneOffers[0],offer('Tienda B','iPhone 12 Pro 128 GB Negro',24000)]),false);
 assert.equal(seo.indexEligible(phone,[iphoneOffers[0],offer('Tienda B','iPhone 12 256 GB Negro',24000)]),false);
 assert.equal(seo.indexEligible(phone,[iphoneOffers[0],offer('Tienda B','iPhone 12 128 GB Azul',24000)]),false);
});
async function getWithDb(p,route){
 const old=db.query,oldConfig=provider.configured;
 provider.configured=()=>false;
 const queries=[];
 db.query=async sql=>{
  queries.push(sql);
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
   return {rowCount:1,rows:[p]};
  if(sql.startsWith('SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at'))
   return {rowCount:1,rows:[p]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+route);
  return {status:response.status,headers:response.headers,body:await response.text(),queries};
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=old;provider.configured=oldConfig;
 }
}
test('HTML y sitemap son consistentes y solo incluyen comparaciones aptas',async()=>{
 const p=page(asus,asusOffers);
 const html=await getWithDb(p,'/comparar/'+p.slug);
 assert.equal(html.status,200);
 assert.match(html.body,/<meta name="robots" content="index,follow">/);
 assert.match(html.body,/<link rel="canonical" href="https:\/\/redlibertad.com\/comparar\/portatil-asus-rog-strix/);
 assert.match(html.body,/Comparación de precios/);
 assert.match(html.body,/Pueden corresponder a distintas versiones/);
 assert.doesNotMatch(html.body,/"@type":"Product"/);
 assert.notEqual(html.headers.get('x-robots-tag'),'noindex');
 const map=await getWithDb(p,'/sitemap-comparador.xml');
 assert.match(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 assert.equal(map.headers.get('content-type').includes('xml'),true);
 const empty=page(asus,[]);
 const notIndex=await getWithDb(empty,'/comparar/'+empty.slug);
 assert.match(notIndex.body,/<meta name="robots" content="noindex,follow">/);
 const notMap=await getWithDb(empty,'/sitemap-comparador.xml');
 assert.doesNotMatch(notMap.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 assert.ok(html.queries.every(q=>!/INSERT INTO marketplace_compare_provider_usage|UPDATE marketplace_compare_provider_usage SET|https:\/\/serpapi\.com/i.test(q)));
});
test('panel de administración explica por qué está apta una familia y por qué falta contenido',()=>{
 const p=page(asus,asusOffers);
 const html=compare.seoAdminView([p], 'b'.repeat(48),'todas');
 assert.match(html,/Apta para Google/);
 assert.match(html,/Comparación válida de una familia de productos/);
 const generic=compare.seoAdminView([{...p,query_text:'portatil asus'}], 'b'.repeat(48),'todas');
 assert.match(generic,/Consulta demasiado genérica/);
 assert.match(generic,/Por mejorar/);
});
