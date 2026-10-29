'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const compare=require('../src/routes/marketplace-comparador-v32132');
const HOUR=3600000,DAY=24*HOUR;
const offer=(shop,price,title='Apple iPhone 12 128 GB Negro')=>({
 title,shop,price_cents:price,price_currency:'EUR',condition:'Nuevo',internal:false,
 href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/iphone-12'
});
const offers=[offer('Tienda A',20000),offer('Tienda B',20800),offer('Tienda C',22100)];
function page(hours=52,more={}){
 const query='iphone 12 128 GB negro';
 return {id:2983,slug:compare.slugFor(query),query_text:query,external_results:offers,
  index_approved:false,seo_blocked:false,editorial_summary:'',provider_status:'ok',
  last_checked_at:new Date(Date.now()-hours*HOUR).toISOString(),
  updated_at:new Date(Date.now()-hours*HOUR).toISOString(),...more};
}
test('tras 48 horas una comparación de modelo exacto mantiene indexación provisional siete días',()=>{
 const current=page(52);
 assert.equal(seo.auto.eligibleOffers(current,offers).eligible,false);
 assert.equal(seo.indexEligible(current,offers),true);
 assert.equal(seo.FRESH_MS,48*HOUR);
 assert.equal(seo.STABLE_MS,7*DAY);
});
test('al superar siete días caduca el margen SEO, incluso si antes era válida',()=>{
 assert.equal(seo.indexEligible(page(8*24),offers),false);
 assert.equal(seo.indexEligible(page(7*24+1),offers),false);
});
test('rechaza ofertas insuficientes y excluye variantes o estados incorrectos antes de indexar',()=>{
 const p=page(54);
 assert.equal(seo.indexEligible(p,offers.slice(0,1)),false);
 assert.equal(seo.indexEligible(p,offers.slice(0,2)),true,'dos vendedores son suficientes para la nueva vía selectiva');
 assert.equal(seo.indexEligible(p,[offers[0],offers[1],offer('Tienda C',21000,'Apple iPhone 12 256 GB Negro')]),true,
  'la variante incompatible se excluye de las dos ofertas correctas, no arruina la ficha');
 assert.equal(seo.indexEligible(p,[offers[0],offer('Tienda C',21000,'Apple iPhone 12 256 GB Negro')]),false);
 assert.equal(seo.indexEligible(p,[offers[0],offers[1],offer('Tienda C',21000,'Apple iPhone 12 128 GB Usado')]),true,
  'solo las dos ofertas sin daños ni condición usada cuentan');
 assert.equal(seo.indexEligible(p,[offers[0],offer('Tienda C',21000,'Apple iPhone 12 128 GB Usado')]),false);
 assert.equal(seo.indexEligible(p,offers.map(o=>({...o,href:'javascript:alert(1)'}))),false);
 assert.equal(seo.indexEligible({...p,query_text:'samsung s26'},offers),false);
});
test('bloqueos editoriales y fallos del proveedor siguen prevaleciendo',()=>{
 const p=page(50);
 assert.equal(seo.indexEligible({...p,seo_blocked:true},offers),false);
 assert.equal(seo.indexEligible({...p,provider_status:'unavailable'},offers),false);
 assert.equal(seo.indexEligible({...p,last_checked_at:null},offers),false);
 assert.equal(seo.indexEligible({...p,last_checked_at:new Date(Date.now()+HOUR).toISOString()},offers),false);
});
test('la aprobación editorial no sustituye ofertas reales; la vía nueva se basa en ellas',()=>{
 const summary='Análisis editorial original del modelo exacto, con capacidad y características identificadas. Consulta el precio real en el comercio y verifica la disponibilidad y las condiciones del envío antes de decidir tu compra.';
 const p=page(50,{index_approved:true,editorial_summary:summary});
 assert.equal(seo.indexEligible(p,offers.slice(0,2)),true);
 assert.equal(seo.indexEligible({...p,editorial_summary:'Sin información suficiente'},offers.slice(0,2)),true,
  'la indexación basada en datos no exige un comentario editorial manual');
 assert.equal(seo.indexEligible({...p,editorial_summary:'Sin información suficiente'},offers.slice(0,1)),false);
 assert.equal(seo.indexEligible(page(8*24,{index_approved:true,editorial_summary:summary}),offers.slice(0,2)),false);
});
test('el margen de indexación no genera Product ni precios enriquecidos obsoletos',()=>{
 const p=page(52);
 const graph=seo.structuredData(p,offers,true,'/comparar/'+p.slug)['@graph'];
 assert.ok(graph.some(x=>x['@type']==='WebPage'));
 assert.equal(graph.some(x=>x['@type']==='Product'),false);
 assert.equal(graph.find(x=>x['@type']==='WebPage').mainEntity,undefined);
});
async function render(p,route){
 const original=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus,queries=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async sql=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[p]};
   if(sql.startsWith('SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at'))
    return {rowCount:1,rows:[p]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+route);
   return {status:response.status,body:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
}
test('HTML y sitemap coinciden en mantener la URL durante el margen temporal',async()=>{
 const p=page(52);
 const html=await render(p,'/comparar/'+p.slug);
 const map=await render(p,'/sitemap-comparador.xml');
 assert.equal(html.status,200);
 assert.match(html.body,/<meta name="robots" content="index,follow">/);
 assert.match(html.body,/Último precio guardado|Precios sin actualizar|precios (?:consultados|guardados)/i);
 assert.doesNotMatch(html.body,/"@type":"Product"/);
 assert.equal(map.status,200);
 assert.match(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
 assert.ok(map.queries.some(q=>q.includes("last_checked_at>now()-interval '7 days'")));
 assert.ok(html.queries.every(q=>!/INSERT INTO marketplace_compare_provider_usage|serpapi/i.test(q)));
});
test('una ficha caducada vuelve a noindex y desaparece del sitemap',async()=>{
 const p=page(8*24);
 const html=await render(p,'/comparar/'+p.slug);
 const map=await render(p,'/sitemap-comparador.xml');
 assert.match(html.body,/<meta name="robots" content="noindex,follow">/);
 assert.doesNotMatch(map.body,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
});
