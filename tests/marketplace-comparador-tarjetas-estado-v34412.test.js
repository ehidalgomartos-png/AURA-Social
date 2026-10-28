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
const filters=require('../src/services/marketplace-comparador-offer-filters-v3440');

const query='iphone 12 128 GB';
const normal=(name,price,condition,more={})=>({
 title:'Apple iPhone 12 128 GB Negro',shop:name,price_cents:price,
 price_currency:'EUR',condition,internal:false,image:null,
 href:'https://'+name.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/iphone12',
 ...more
});
const used=normal('Usados',18000,'Usado');
const refurbished=normal('Reacondicionados',20500,'Reacondicionado');
const newItem=normal('Nuevos',23000,'Nuevo');
const uncertain=normal('No Indicado',24500,'Consultar estado');
const four=[used,refurbished,newItem,uncertain];

async function render(offers){
 const originalQuery=db.query,configured=provider.configured,quota=worker.quotaStatus;
 const sql=[],slug=compare.slugFor(query);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:612,slug,query_text:query,external_results:offers,
     last_checked_at:new Date().toISOString(),provider_status:'ok',
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=originalQuery;provider.configured=configured;worker.quotaStatus=quota;}
}

test('estados declarados separados del nombre de tienda en tarjetas y filtros coherentes',async()=>{
 const {status,html,sql}=await render(four);
 assert.equal(status,200);
 const label={
  nuevo:'Nuevo · según anuncio',
  usado:'Usado · según anuncio',
  reacondicionado:'Reacondicionado · según anuncio',
  'sin-confirmar':'Estado sin confirmar'
 };
 for(const [condition,text] of Object.entries(label)){
  assert.match(html,new RegExp('class="cmp-condition-chip cmp-condition-'+condition+'"[^>]*>'+text+'</span>'));
 }
 assert.equal((html.match(/class="cmp-offer-meta"/g)||[]).length,4);
 assert.equal((html.match(/class="cmp-offer-shop"/g)||[]).length,4);
 assert.match(html,/data-offer-condition="usado"/);
 assert.match(html,/data-offer-condition="reacondicionado"/);
 assert.match(html,/data-offer-condition="nuevo"/);
 assert.match(html,/data-offer-condition="sin-confirmar"/);
 assert.match(html,/Desde 180,00/);
 assert.equal((html.match(/<li class="offer"/g)||[]).length,4);
 assert.equal(sql.some(q=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(q)),false);
});

test('nunca etiqueta como nuevo un estado no declarado',async()=>{
 const without=normal('Desconocido',22000,'Consultar estado');
 assert.equal(filters.attributes(without).condition,'sin-confirmar');
 const {status,html}=await render([without]);
 assert.equal(status,200);
 assert.match(html,/Estado sin confirmar/);
 assert.doesNotMatch(html,/>Nuevo · según anuncio</);
 assert.match(html,/name="robots" content="noindex,follow"/);
});

test('nombre de vendedor escapado; las etiquetas de estado no interpretan HTML',async()=>{
 const malicious=normal('Tienda <img src=x onerror=alert(1)>',21500,'Usado');
 const {status,html}=await render([malicious]);
 assert.equal(status,200);
 assert.match(html,/Tienda &lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/Usado · según anuncio/);
});

test('conserva enlaces comerciales, botón real y distinción de publicidad',async()=>{
 const advertising=normal('Ads',16000,'Nuevo',{sponsored:true});
 const {status,html}=await render([advertising,...four]);
 assert.equal(status,200);
 assert.match(html,/Publicidad \(1\)/);
 assert.match(html,/Desde 180,00/);
 assert.match(html,/href="https:\/\/usados\.example\/iphone12"/);
 assert.match(html,/>Ver oferta en tienda<\/a>/);
 assert.match(html,/class="cmp-condition-chip cmp-condition-nuevo"/);
 assert.equal((html.match(/<li class="offer"/g)||[]).length,5);
});

test('etiquetas de estado legibles y responsivas, sin ocultar ofertas ni inventar stock',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const block=css.split('/* V3.4.4.12 — metadatos de oferta claros: vendedor y estado declarado.')[1]?.split('/* V3.4.4.2 — pulido mobile-first')[0];
 assert.ok(block);
 for(const rule of ['.cmp-offer-meta','.cmp-offer-shop','.cmp-condition-chip',
  '.cmp-condition-nuevo','.cmp-condition-usado','.cmp-condition-reacondicionado',
  '.cmp-condition-sin-confirmar','@media(max-width:620px)','overflow-wrap:anywhere']){
  assert.ok(block.includes(rule),rule);
 }
 assert.doesNotMatch(block,/display:\s*none|pointer-events:\s*none|visibility:\s*hidden/);
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(route,/Estado declarado por el vendedor; compruébalo antes de comprar/);
});
