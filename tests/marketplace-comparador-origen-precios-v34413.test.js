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
const comparison=require('../src/routes/marketplace-comparador-v32132');
const {sourceLabel}=require('../src/services/marketplace-comparador-price-source-v34413');

const q='iphone 12 128 GB';
const offer=(shop,price_cents,extra={})=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents,
 price_currency:'EUR',condition:'Usado',image:null,internal:false,
 href:'https://'+shop.toLowerCase().replace(/\W+/g,'')+'.example/producto/iphone',
 ...extra
});

test('fuente de precio: diferenciar RedLibertad, tienda vinculada, publicidad y fuentes externas',()=>{
 assert.equal(sourceLabel({internal:true},null),'Precio publicado en RedLibertad');
 assert.equal(sourceLabel({internal:true,partner_store:true},null),
  'Precio publicado en RedLibertad · tienda vinculada');
 assert.equal(sourceLabel({internal:true,sponsored:true},{isStale:true}),
  'Precio publicado en RedLibertad');
 assert.equal(sourceLabel({sponsored:true},{isStale:true}),
  'Publicidad · precio orientativo');
 assert.equal(sourceLabel(offer('Tienda',18000),{date:'28/10/26 18:00',isStale:false}),
  'Oferta externa · precio orientativo');
 assert.equal(sourceLabel(offer('Tienda',18000),{date:'27/10/26 18:00',isStale:true}),
  'Oferta externa · precio anterior');
 assert.equal(sourceLabel(offer('Tienda',18000),{date:null}),
  'Oferta externa · fecha sin confirmar');
 assert.equal(sourceLabel(offer('Tienda',18000),{date:null,isStale:true}),
  'Oferta externa · fecha sin confirmar');
 assert.equal(sourceLabel(null,null),'Oferta externa · fecha sin confirmar');
});

async function render({offers,checkedAt=new Date().toISOString(),listingRows=[],linkedRows=[]}){
 const query=compareSlug();
 const prior=db.query,configured=provider.configured,quota=worker.quotaStatus;
 const sql=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async stmt=>{
   sql.push(stmt);
   if(stmt.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:413,slug:query,query_text:q,
     external_results:offers,last_checked_at:checkedAt,provider_status:'ok',
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   if(stmt.startsWith('SELECT l.id,l.title,l.price_cents,l.image_urls,l.details'))
    return {rowCount:listingRows.length,rows:listingRows};
   if(stmt.startsWith('SELECT x.listing_id,x.store_id,x.product_url'))
    return {rowCount:linkedRows.length,rows:linkedRows};
   return {rowCount:0,rows:[]};
  };
  const app=express();
  app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(comparison.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+query);
   return {status:res.status,html:await res.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=prior;provider.configured=configured;worker.quotaStatus=quota;}
}
function compareSlug(){return comparison.slugFor(q);}

test('precios de ofertas externas recientes conservan fecha, vendedor, importe y enlaces',async()=>{
 const rows=[offer('Tienda Uno',18000),offer('Tienda Dos',19500)];
 const {status,html,sql}=await render({offers:rows});
 assert.equal(status,200);
 assert.match(html,/Desde 180,00/);
 assert.equal((html.match(/class="cmp-price-source"/g)||[]).length,2);
 assert.equal((html.match(/Oferta externa · precio orientativo/g)||[]).length,2);
 assert.match(html,/Precio consultado:/);
 assert.match(html,/href="https:\/\/tiendauno\.example\/producto\/iphone"/);
 assert.match(html,/data-offer-price-cents="18000"/);
 assert.equal(sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});

test('ofertas externas antiguas no aparentan un precio comprobado ahora',async()=>{
 const oldDate=new Date(Date.now()-4*24*60*60*1000).toISOString();
 const {status,html}=await render({offers:[offer('Tienda',18000)],checkedAt:oldDate});
 assert.equal(status,200);
 assert.match(html,/Oferta externa · precio anterior/);
 assert.match(html,/Último precio guardado:/);
 assert.doesNotMatch(html,/Oferta externa · precio orientativo/);
 assert.match(html,/name="robots" content="noindex,follow"/);
});

test('si la fecha es desconocida, no se inventa una fecha de consulta',async()=>{
 const {status,html}=await render({offers:[offer('Tienda',18000)],checkedAt:null});
 assert.equal(status,200);
 assert.match(html,/Oferta externa · fecha sin confirmar/);
 assert.match(html,/Sin fecha de precio externo/);
 assert.doesNotMatch(html,/Precio consultado:/);
});

test('publicidad separada muestra origen correcto sin influir en el precio mínimo',async()=>{
 const advertising=offer('Promo',5500,{sponsored:true});
 const ordinary=offer('Comercio',19000);
 const other=offer('Otra Tienda',21000);
 const {status,html}=await render({offers:[advertising,ordinary,other]});
 assert.equal(status,200);
 assert.match(html,/Desde 190,00/);
 assert.match(html,/Publicidad \(1\)/);
 assert.match(html,/Publicidad · precio orientativo/);
 assert.match(html,/Oferta externa · precio orientativo/);
 assert.equal((html.match(/class="cmp-price-source"/g)||[]).length,3);
});

test('tarjetas locales de RedLibertad identifican su precio publicado sin fingir consulta externa',async()=>{
 const listing={id:913,title:'iPhone 12 128 GB Negro',price_cents:16900,
  image_urls:[],details:{condition:'used'},display_name:'Ana',username:'ana'};
 const {status,html}=await render({offers:[],listingRows:[listing]});
 assert.equal(status,200);
 assert.match(html,/Precio publicado en RedLibertad/);
 assert.match(html,/Desde 169,00|169,00/);
 assert.doesNotMatch(html,/Oferta externa · precio orientativo/);
 assert.match(html,/>Ver anuncio<\/a>/);
});

test('la información del origen se adapta a móvil sin ocultar ofertas',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const block=css.split('/* V3.4.4.13 — origen verificable del precio')[1]?.split('/* V3.4.4.2 — pulido mobile-first')[0];
 assert.ok(block);
 assert.match(block,/cmp-price-source/);
 assert.match(block,/overflow-wrap:anywhere/);
 assert.match(block,/@media\(max-width:760px\)/);
 assert.doesNotMatch(block,/display:\s*none|pointer-events:\s*none|visibility:\s*hidden/);
});
