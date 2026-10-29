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

const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const query='iphone 12 128 GB';
const offers=['Tienda Uno','Tienda Dos'].map((shop,i)=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents:18500+i*2000,
 price_currency:'EUR',condition:'Usado',internal:false,
 href:'https://tienda'+(i+1)+'.example/iphone-12'
}));
async function render({checked=new Date().toISOString(),status='ok',rows=offers}={}){
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const queries=[],slug=compare.slugFor(query);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async(sql)=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{
     id:1042,slug,query_text:query,external_results:rows,
     last_checked_at:checked,provider_status:status,
     index_approved:false,seo_blocked:false,editorial_summary:''
    }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;
 }
}
test('precios externos antiguos avisan en cada tarjeta sin ocultar la oferta ni el precio',async()=>{
 const r=await render({checked:new Date(Date.now()-9*24*60*60*1000).toISOString()});
 assert.equal(r.status,200);
 assert.equal((r.html.match(/class="cmp-offer-price-advice"/g)||[]).length,2);
 assert.match(r.html,/Precio guardado de una consulta anterior/);
 assert.match(r.html,/Comprueba el importe y la disponibilidad en la tienda/);
 assert.match(r.html,/Último precio guardado:/);
 assert.match(r.html,/data-offer-price-cents="18500"/);
 assert.equal((r.html.match(/<li class="offer"/g)||[]).length,2);
});
test('precios recientes no generan alertas de antigüedad en tarjetas',async()=>{
 const r=await render();
 assert.equal(r.status,200);
 assert.doesNotMatch(r.html,/class="cmp-offer-price-advice"/);
 assert.match(r.html,/Precio consultado:/);
 assert.equal((r.html.match(/class="offer-link/g)||[]).length,2);
});
test('si falta fecha de consulta no se presenta como precio confirmado',async()=>{
 const r=await render({checked:null});
 assert.equal(r.status,200);
 assert.match(r.html,/Sin fecha de precio externo/);
 assert.equal((r.html.match(/class="cmp-offer-price-advice"/g)||[]).length,2);
});
test('el fallo de actualización no se confunde con falta de stock',async()=>{
 const r=await render({
  checked:new Date(Date.now()-9*24*60*60*1000).toISOString(),status:'unavailable'
 });
 assert.equal(r.status,200);
 assert.match(r.html,/La actualización no se ha completado/);
 assert.match(r.html,/class="cmp-offer-price-advice"/);
 assert.doesNotMatch(r.html,/Producto agotado|Sin stock|No disponible en tienda/);
});
test('un enlace directo no confirmado no declara agotado un producto',()=>{
 assert.match(route,/No se ha confirmado un enlace directo de esta oferta\. Esto no significa que el producto esté agotado\./);
 assert.match(route,/link\.destination==='shopping-search'/);
 assert.match(route,/lookup_status==='unavailable'/);
 assert.match(route,/esc\(href\)/);
});
test('no se añaden llamadas al proveedor, cambios de precio ni escrituras de cuotas',async()=>{
 const r=await render({checked:new Date(Date.now()-9*24*60*60*1000).toISOString()});
 assert.equal(r.queries.some(q=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(q)),false);
 assert.match(route,/money\(o\.price_cents\)/);
 assert.match(route,/data-comparison-merchant-click/);
 assert.match(route,/savedPriceAdvice/);
 assert.match(route,/!o\.internal&&priceInfo\?\.isStale/);
});
test('aviso legible y compacto en móvil, sin tapar botones',()=>{
 const section=css.split('/* V3.4.4.25 — precio externo histórico')[1];
 assert.ok(section);
 assert.match(section,/\.cmp-offer-price-advice/);
 assert.match(section,/overflow-wrap:anywhere/);
 assert.match(section,/@media\(max-width:760px\)/);
 assert.doesNotMatch(section,/display:none|position:fixed|pointer-events:none/);
});
