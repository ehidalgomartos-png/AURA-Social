'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');
const seo=require('../src/services/marketplace-comparador-seo-v32132');

const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const offer=(shop,price)=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents:price,
 price_currency:'EUR',condition:'Nuevo',internal:false,
 href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/producto/iphone12'
});
const page={
 id:384,slug:compare.slugFor('iphone 12 128 GB negro'),query_text:'iphone 12 128 GB negro',
 external_results:[offer('Tienda A',19900),offer('Tienda B',20500),offer('Tienda C',21500)],
 index_approved:false,seo_blocked:false,editorial_summary:'',
 last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),provider_status:'ok'
};

async function render(current,pathname){
 const origQuery=db.query,origConfigured=provider.configured,origQuota=worker.quotaStatus;
 const queries=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async(sql)=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[current]};
   if(sql.startsWith('SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at'))
    return {rowCount:1,rows:[current]};
   return {rowCount:0,rows:[]};
  };
  const app=express();
  app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+pathname);
   return {status:response.status,html:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=origQuery;provider.configured=origConfigured;worker.quotaStatus=origQuota;}
}
test('sitemap lastmod uses stored valid dates, not future or malformed values',()=>{
 const now=Date.parse('2026-10-29T10:00:00.000Z');
 assert.equal(seo.sitemapLastmod({
  last_checked_at:'2026-10-28T12:30:00Z',updated_at:'2026-10-29T08:00:00Z'
 },now),'2026-10-29T08:00:00.000Z');
 assert.equal(seo.sitemapLastmod({
  last_checked_at:'2026-10-28T12:30:00Z',updated_at:'definitely not a date'
 },now),'2026-10-28T12:30:00.000Z');
 assert.equal(seo.sitemapLastmod({
  last_checked_at:'2026-10-28T12:30:00Z',updated_at:'2026-11-29T00:00:00Z'
 },now),'2026-10-28T12:30:00.000Z');
 assert.equal(seo.sitemapLastmod({last_checked_at:null,updated_at:'invalid'},now),null);
});
test('fichas indexables mantienen Product estructurado unido a WebPage y BreadcrumbList',()=>{
 const approved=seo.indexEligible(page,page.external_results);
 assert.equal(approved,true,'solo producto exacto con tres comercios y enlaces reales');
 const data=seo.structuredData(page,page.external_results,approved,'/comparar/'+page.slug);
 const graph=data['@graph'];
 const web=graph.find(x=>x['@type']==='WebPage');
 const product=graph.find(x=>x['@type']==='Product');
 const bread=graph.find(x=>x['@type']==='BreadcrumbList');
 assert.ok(product);
 assert.deepEqual(web.breadcrumb,{'@id':bread['@id']});
 assert.deepEqual(web.mainEntity,{'@id':product['@id']});
 assert.equal(product.offers.offerCount,3);
 assert.equal(product.offers.lowPrice,'199.00');
});
test('ficha no indexable jamás anuncia un Product verificable como si lo fuera',()=>{
 const p={...page,last_checked_at:'2020-01-01T00:00:00Z'};
 assert.equal(seo.indexEligible(p,p.external_results),false);
 const graph=seo.structuredData(p,p.external_results,false,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(x=>x['@type']==='Product'),false);
 assert.equal(graph.some(x=>x['@type']==='BreadcrumbList'),true);
 assert.equal('mainEntity' in graph.find(x=>x['@type']==='WebPage'),false);
});
test('metadata social corresponde al título, descripción y canonical de la ficha',async()=>{
 const r=await render(page,'/comparar/'+page.slug);
 assert.equal(r.status,200);
 const canonical='https://redlibertad.com/comparar/'+page.slug;
 assert.match(r.html,/<meta property="og:locale" content="es_ES">/);
 assert.match(r.html,/<meta property="og:site_name" content="RedLibertad">/);
 assert.match(r.html,/<meta name="twitter:card" content="summary">/);
 assert.match(r.html,/<meta name="twitter:title" content="Comparar iphone 12 128 GB negro \| RedLibertad">/);
 assert.match(r.html,new RegExp('<meta name="twitter:url" content="'+canonical+'">'));
 const description=r.html.match(/<meta name="description" content="([^"]+)"/)?.[1];
 assert.ok(description);
 assert.ok(r.html.includes('<meta name="twitter:description" content="'+description+'">'));
 assert.ok(r.html.includes('<link rel="canonical" href="'+canonical+'">'));
 assert.ok(r.html.includes('<meta property="og:url" content="'+canonical+'">'));
});
test('sitemap y HTML usan las mismas reglas de indexación y lastmod válido',async()=>{
 const r=await render(page,'/sitemap-comparador.xml');
 assert.equal(r.status,200);
 assert.match(r.html,/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
 assert.match(r.html,new RegExp('<loc>https://redlibertad.com/comparar/'+page.slug+'</loc>'));
 assert.match(r.html,/<lastmod>20\d\d-\d\d-\d\dT/);
 assert.doesNotMatch(r.html,/Invalid Date|NaN|undefined/);
});
test('sitemap no inventa indexación para resultados antiguos o ambiguos',async()=>{
 const old={...page,last_checked_at:'2020-01-01T00:00:00Z'};
 const r=await render(old,'/sitemap-comparador.xml');
 assert.equal(r.status,200);
 assert.doesNotMatch(r.html,new RegExp('<loc>https://redlibertad.com/comparar/'+page.slug+'</loc>'));
 assert.match(r.html,/<loc>https:\/\/redlibertad\.com\/comparar<\/loc>/);
});
test('las etiquetas JSON-LD conservan protección XSS y el cambio no consulta SerpApi',async()=>{
 const r=await render(page,'/comparar/'+page.slug);
 assert.equal(r.queries.some(sql=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(sql)),false);
 const data=seo.jsonLd({'@context':'https://schema.org',name:'<script>&\u2028'});
 assert.doesNotMatch(data,/<script>|&/);
 assert.match(data,/\\u003c/);
 assert.match(data,/\\u0026/);
 assert.match(route,/seo\.sitemapLastmod\(p\)/);
 assert.match(route,/seo\.indexEligible\(p,p\.external_results\)/);
});
