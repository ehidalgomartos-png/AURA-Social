'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const query='iphone 12';
const offer=(title,shop,price,condition,extra={})=>({
 title,shop,price_cents:price,price_currency:'EUR',condition,internal:false,
 href:'https://'+shop.toLowerCase().replace(/[^a-z]/g,'')+'.example/iphone',...extra
});
const offers=[
 offer('Apple iPhone 12 64GB Azul - Usado','Tienda A',7800,'Usado'),
 offer('Apple iPhone 12 64GB Negro - Usado','Tienda B',10000,'Usado'),
 offer('Apple iPhone 12 128GB Reacondicionado','Tienda C',18000,'Reacondicionado')
];
function key(o){
 return crypto.createHash('sha256').update([
  String(o.product_id||''),String(o.shop||''),String(o.title||''),String(o.price_cents||'')
 ].join('|')).digest('hex');
}
async function render(offersToRender){
 const old=db.query,configured=provider.configured,quota=worker.quotaStatus,sql=[];
 try{
  provider.configured=()=>false;worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  const slug=compare.slugFor(query);
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:924,slug,query_text:query,external_results:offersToRender,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      last_checked_at:new Date().toISOString(),provider_status:'ok',
      index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;worker.quotaStatus=quota;}
}
test('cada variante del resumen enlaza a una oferta existente de su grupo',async()=>{
 const r=await render(offers);
 assert.equal(r.status,200);
 assert.match(r.html,/Versiones encontradas/);
 const first=key(offers[0]),third=key(offers[2]);
 assert.match(r.html,new RegExp('class="compare-variant-jump" href="#oferta-'+first+'"'));
 assert.match(r.html,new RegExp('class="compare-variant-jump" href="#oferta-'+third+'"'));
 assert.match(r.html,new RegExp('id="oferta-'+first+'"'));
 assert.match(r.html,new RegExp('id="oferta-'+third+'"'));
 assert.equal((r.html.match(/class="compare-variant-jump"/g)||[]).length,2);
});
test('enlaces son locales y no confunden búsqueda de capacidad con compra externa',async()=>{
 const r=await render(offers);
 const jumps=[...r.html.matchAll(/class="compare-variant-jump" href="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(jumps.length,2);
 assert.ok(jumps.every(x=>/^#oferta-[a-f0-9]{64}$/.test(x)));
 assert.match(r.html,/Comparar esta capacidad/);
 assert.match(r.html,/Ver una oferta de este grupo/);
 assert.doesNotMatch(jumps.join(' '),/google|http|\/comparar\?q=/i);
});
test('el precio y el estado del grupo siguen basados en ofertas existentes',async()=>{
 const r=await render(offers);
 assert.match(r.html,/Desde 78,00/);
 assert.match(r.html,/128 GB · Reacondicionado/);
 assert.match(r.html,/64 GB · Usado/);
 assert.equal((r.html.match(/<li class="offer"/g)||[]).length,3);
});
test('una única variante no crea navegación adicional ni grupo ficticio',async()=>{
 const r=await render(offers.slice(0,2));
 assert.equal(r.status,200);
 assert.doesNotMatch(r.html,/compare-variant-jump/);
 assert.doesNotMatch(r.html,/Versiones encontradas/);
});
test('navegación sin llamadas nuevas de proveedor ni escrituras de cuotas',async()=>{
 const r=await render(offers);
 assert.equal(r.sql.some(x=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(x)),false);
 assert.match(source,/firstOfferByVariant\.set\(key,offerKey\(offer\)\)/);
 assert.match(source,/insightsMarkup\(page\.query_text,insight,ordinary\)/);
 assert.match(source,/const key=insights\.variantKey\(offer\)\.key/);
});
test('accesos de variantes adaptados a móvil y teclado',()=>{
 const part=css.split('/* V3.4.4.24 — acceso a una oferta real')[1];
 assert.ok(part);
 assert.match(part,/min-height:44px/);
 assert.match(part,/min-height:46px/);
 assert.match(part,/:focus-visible/);
 assert.match(part,/@media\(max-width:620px\)/);
 assert.doesNotMatch(part,/display:\s*none|position:\s*fixed|pointer-events:\s*none/);
});
