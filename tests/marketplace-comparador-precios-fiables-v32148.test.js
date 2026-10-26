'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const {HOUR,DAY,SEO_MAX_AGE,freshness,priceNotice}=require('../src/services/marketplace-comparador-price-freshness-v32148');

const now=Date.parse('2026-10-26T15:00:00Z');
const at=ms=>new Date(now-ms).toISOString();
const product={title:'iPhone 12 128 GB morado - Reacondicionado',shop:'Pixmania',
 condition:'Reacondicionado',price_cents:25900,price_currency:'EUR',
 image:'https://images1.gstatic.com/iphone.png',
 href:'https://www.google.com/search?q=iphone12',internal:false};
const slug=compare.slugFor('iphone 12 128 GB');

test('clasifica el precio por edad con límites 24 horas, 48 horas y 7 días',()=>{
 assert.equal(freshness(at(0),now).code,'recent');
 assert.equal(freshness(at(DAY-1),now).code,'recent');
 assert.equal(freshness(at(DAY),now).code,'refresh_due');
 assert.equal(freshness(at(SEO_MAX_AGE-1),now).code,'refresh_due');
 assert.equal(freshness(at(SEO_MAX_AGE),now).code,'old');
 assert.equal(freshness(at(7*DAY),now).code,'historical');
 assert.equal(freshness(null,now).code,'unknown');
 assert.equal(freshness(at(-5000),now).code,'unknown');
 assert.equal(freshness(at(SEO_MAX_AGE+1),now).isStale,true);
 assert.equal(freshness(at(DAY-1),now).needsRefresh,false);
 assert.equal(freshness(at(DAY),now).needsRefresh,true);
 assert.equal(priceNotice(at(SEO_MAX_AGE+1),'ok',now).text.includes('Pueden estar desactualizados'),true);
 assert.equal(priceNotice(at(2000),'unavailable',now).text.includes('no se ha completado'),true);
 assert.equal(priceNotice(at(DAY+1000),'queued',now).text.includes('Actualizando'),true);
});

async function pageHtml(date,options={}){
 const oldQuery=db.query,oldConfigured=provider.configured;
 const offers=options.offers||[product];
 try{
  provider.configured=()=>false; // Rendering never contacts SerpApi.
  db.query=async(sql)=>{
   if(sql.includes('FROM marketplace_listings')&&offers.some(o=>o.internal))return {rows:[{
    id:4,title:'iPhone 12 128 GB morado - Reacondicionado',price_cents:25900,
    image_urls:[],details:{condition:'used'},display_name:'Autor',username:'autor'
   }],rowCount:1};
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {rowCount:1,rows:[{
    id:42,slug,query_text:'iphone 12 128 GB',last_checked_at:date,
    provider_status:options.status||'ok',
    external_results:offers,created_at:at(8*DAY),index_approved:true,seo_blocked:false,editorial_summary:''
   }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:res.status,html:await res.text()};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}

test('precios recientes muestran fecha precisa y ficha normal, sin fingir datos de otra tienda',async()=>{
 const {status,html}=await pageHtml(new Date(Date.now()-2*HOUR).toISOString());
 assert.equal(status,200);
 assert.match(html,/Oferta encontrada/);
 assert.match(html,/Precio consultado:/);
 assert.match(html,/Precios consultados:/);
 assert.match(html,/259,00/);
 assert.match(html,/Ver oferta en tienda|Buscar en Google/);
 assert.doesNotMatch(html,/Consulta histórica|Último precio guardado:/);
});

test('después de 48 horas conserva la oferta pero indica precio antiguo y nunca lo indexa',async()=>{
 const {status,html}=await pageHtml(new Date(Date.now()-5*DAY).toISOString());
 assert.equal(status,200);
 assert.match(html,/Oferta guardada/);
 assert.match(html,/Último precio guardado:/);
 assert.match(html,/Pueden estar desactualizados/);
 assert.match(html,/compare-price-age-old/);
 assert.match(html,/259,00/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/"@type":"AggregateOffer"/);
});

test('precios históricos de más de una semana nunca se presentan como actuales',async()=>{
 const {html}=await pageHtml(new Date(Date.now()-9*DAY).toISOString());
 assert.match(html,/Consulta histórica/);
 assert.match(html,/Último precio guardado:/);
 assert.match(html,/259,00/);
});

test('si falla el refresco, conserva ofertas y muestra última consulta realmente válida',async()=>{
 const {html}=await pageHtml(new Date(Date.now()-3*DAY).toISOString(),{status:'unavailable'});
 assert.match(html,/La actualización no se ha completado/);
 assert.match(html,/Último precio guardado:/);
 assert.match(html,/259,00/);
});

test('vistas multi-tienda antiguas no anuncian precio mínimo como oferta actual',async()=>{
 const offers=[product,{...product,shop:'Tienda B',title:'iPhone 12 128GB negro - Reacondicionado',price_cents:26900}];
 const {html}=await pageHtml(new Date(Date.now()-4*DAY).toISOString(),{offers});
 assert.match(html,/Último mínimo registrado:/);
 assert.match(html,/Mínimo de la consulta anterior/);
 assert.doesNotMatch(html,/Precio más bajo mostrado/);
 assert.equal((html.match(/class="offer"/g)||[]).length,2);
});

test('solo hay una fecha para precios externos, los anuncios locales no fingen consultas SerpApi',async()=>{
 const local={...product,internal:true,shop:'RedLibertad · Autor',
  href:'/marketplace/p/4/iphone-12-128gb',image:'/marketplace/imagen/4/0'};
 const {html}=await pageHtml(new Date(Date.now()-5*DAY).toISOString(),{offers:[local]});
 assert.match(html,/Ver anuncio/);
 assert.doesNotMatch(html,/Sin fecha de precio externo|Último precio guardado|Precios consultados:/);
});

test('fallo de proveedor no actualiza last_checked_at ni destruye resultados anteriores',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldFetch=provider.fetchOffers,oldConnect=db.pool.connect;
 const writes=[],last=at(3*DAY);
 try{
  provider.configured=()=>true;
  provider.fetchOffers=async()=>{throw Error('simulated outage');};
  db.pool.connect=async()=>({query:async()=>({rowCount:1}),release(){}});
  db.query=async(sql,args=[])=>{
   writes.push([sql,args]);
   if(sql.startsWith("UPDATE marketplace_compare_jobs SET status='running'"))return {rowCount:1,rows:[{page_id:42,attempts:1}]};
   if(sql.startsWith('SELECT id,query_text,last_checked_at,provider_status,external_results'))
    return {rowCount:1,rows:[{id:42,query_text:'iphone 12 128 GB',last_checked_at:last,provider_status:'queued',external_results:[product]}]};
   return {rowCount:1,rows:[]};
  };
  const oldWarn=console.warn;console.warn=()=>{};
  try{assert.equal(await worker.processOne(),true);}finally{console.warn=oldWarn;}
  const failure=writes.find(([sql,args])=>sql.startsWith('UPDATE marketplace_compare_pages SET provider_status=$2')&&args[1]==='unavailable');
  assert.ok(failure,'provider error should only set status');
  assert.doesNotMatch(failure[0],/last_checked_at/);
  assert.ok(!writes.some(([sql])=>sql.includes('SET external_results=')),'old offers cannot be overwritten on failure');
  assert.ok(writes.some(([sql])=>sql.includes("finished_at=now()")));
 }finally{db.query=oldQuery;provider.configured=oldConfigured;provider.fetchOffers=oldFetch;db.pool.connect=oldConnect;}
});

test('la cola sigue respetando caché 24h, cuota mensual y pausa tras un fallo',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;let sql='';
 try{
  provider.configured=()=>true;
  db.query=async(q)=>{if(q.startsWith('INSERT INTO marketplace_compare_jobs')){sql=q;return {rowCount:1,rows:[{page_id:42}]};}return {rowCount:0,rows:[]};};
  assert.equal(await worker.enqueue({id:42,external_results:[product],provider_status:'unavailable',last_checked_at:at(2*DAY)},async()=>{}),true);
  assert.match(sql,/last_checked_at<now\(\)-interval '24 hours'/);
  assert.match(sql,/marketplace_compare_jobs.finished_at<now\(\)-interval '2 hours'/);
  assert.match(sql,/marketplace_compare_jobs.status!='failed'/);
  assert.doesNotMatch(sql,/serpapi\.com/);
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});

test('SEO y sitemap excluyen cifras externas anteriores a 48 horas',()=>{
 const date=new Date(Date.now()-3*DAY).toISOString();
 const fakePage={query_text:'iphone 12 128 GB',last_checked_at:date,provider_status:'ok',
  index_approved:true,seo_blocked:false,editorial_summary:'Evaluación editorial con detalles originales sobre los vendedores y el estado de este modelo. Información independiente para decidir antes de comprar.'};
 const offers=[
  {...product,shop:'Tienda A',href:'https://tienda-a.example/producto'},
  {...product,shop:'Tienda B',href:'https://tienda-b.example/producto'}
 ];
 assert.equal(seo.indexEligible(fakePage,offers),false);
 const data=seo.structuredData(fakePage,offers,false,'/comparar/iphone-12');
 assert.equal(data['@graph'].some(x=>x['@type']==='Product'),false);
 assert.match(seo.APPROVED_SQL,/48 hours/);
});

test('la UI de alerta se puede seguir desde móvil y se actualiza con el sondeo existente',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(css,/compare-price-age-historical/);
 assert.match(css,/offer-price-date/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(js,/root\.innerHTML=status\.innerHTML/);
});
