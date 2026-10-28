'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');
const {safeHost,describeDestination}=require('../src/services/marketplace-comparador-destinations-v3449');

const q='iphone 12 128 GB',slug=compare.slugFor(q);
const direct={title:'Apple iPhone 12 128 GB negro',shop:'Tienda <X> "Demo"',
 price_cents:18000,price_currency:'EUR',condition:'Reacondicionado',internal:false,
 href:'https://compras.example/p/iphone12?producto=128'};
const search={...direct,shop:'Wallapop',price_cents:19000,
 href:'https://www.google.com/search?q=iphone+12+128gb'};
const advertised={...direct,shop:'Comercio Promo',sponsored:true,price_cents:17000,
 href:'https://anuncios.example/es/iphone'};
const listing={id:91,title:'iPhone 12 128 GB Negro',price_cents:15900,image_urls:[],
 details:{condition:'used'},display_name:'Carmen',username:'carmen'};
const partner={listing_id:91,store_id:12,store_name:'MundoTaza',store_url:'https://mundotaza.com/',
 store_status:'approved',purchase_enabled:true,stock_status:'in_stock',
 source:'manual',product_url:'https://mundotaza.com/producto/iphone-12',last_checked_at:null};

test('identifica dominio HTTPS de destino sin mostrar cadenas inseguras',()=>{
 assert.equal(safeHost('https://COMPRAS.example/p?a=1'),'compras.example');
 for(const x of ['/comprar','http://compras.example/x','javascript:alert(1)',
  'https://usuario:clave@compras.example/p','not a url']){
  assert.equal(safeHost(x),null,x);
 }
 assert.deepEqual(describeDestination({title:'iPhone 12'},{
  destination:'shopping-search',href:'https://www.google.com/search?q=iphone'
 },false),{
  note:'Búsqueda en Google: puede mostrar ofertas diferentes',
  ariaLabel:'Buscar en Google otras ofertas para iPhone 12'
 });
 const manual=describeDestination({...direct,manual_link:true},{destination:'store',href:direct.href},true);
 assert.match(manual.note,/Enlace revisado por administración · compras.example/);
 assert.doesNotMatch(manual.note,/producto=128/);
 const internal=describeDestination({title:'Taza'}, {destination:'internal',href:'/marketplace/p/99'},false);
 assert.equal(internal.note,'Anuncio de RedLibertad');
});

async function render({external=[direct,search,advertised],withPartner=false}={}){
 const oldQuery=db.query,oldConfigured=provider.configured,sql=[];
 try{
  provider.configured=()=>false;
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:70,slug,query_text:q,external_results:external,
      provider_status:'ok',last_checked_at:new Date().toISOString(),
      index_approved:false,seo_blocked:false,editorial_summary:''}]};
   if(withPartner && statement.startsWith('SELECT l.id,l.title,l.price_cents,l.image_urls,l.details'))
    return {rowCount:1,rows:[listing]};
   if(withPartner && statement.startsWith('SELECT x.listing_id,x.store_id,x.product_url'))
    return {rowCount:1,rows:[partner]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:res.status,html:await res.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}

test('tarjetas muestran la tienda real y advierten que Google no garantiza el mismo anuncio',async()=>{
 const {status,html,sql}=await render();
 assert.equal(status,200);
 assert.match(html,/Enlace directo del vendedor · compras.example/);
 assert.match(html,/Búsqueda en Google: puede mostrar ofertas diferentes/);
 assert.match(html,/aria-label="Ver oferta de Tienda &lt;X&gt; &quot;Demo&quot; en compras.example"/);
 assert.match(html,/aria-label="Buscar en Google otras ofertas para Apple iPhone 12 128 GB negro"/);
 assert.match(html,/Publicidad de Google · anuncios.example/);
 assert.match(html,/href="https:\/\/compras.example\/p\/iphone12\?producto=128"/);
 assert.match(html,/>Ver oferta en tienda<\/a>/);
 assert.match(html,/>Buscar en Google<\/a>/);
 assert.match(html,/Desde 180,00/);
 assert.match(html,/Publicidad \(1\)/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.equal(sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});

test('comercios vinculados conservan enlace de compra, dominio y seguimiento de clics',async()=>{
 const oldSecret=process.env.JWT_SECRET;
 try{
  process.env.JWT_SECRET='test-comparison-store-links-v3449';
  const {status,html}=await render({external:[],withPartner:true});
  assert.equal(status,200);
  assert.match(html,/Compra en la web del comercio · mundotaza.com/);
  assert.match(html,/aria-label="Ver oferta de MundoTaza en mundotaza.com"/);
  assert.match(html,/href="https:\/\/mundotaza.com\/producto\/iphone-12"/);
  assert.match(html,/data-comparison-merchant-click="1"/);
  assert.match(html,/>Ver oferta en tienda<\/a>/);
  assert.match(html,/name="robots" content="noindex,follow"/);
 }finally{if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});

test('los textos de dominio no desbordan las tarjetas en pantallas pequeñas',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/V3\.4\.4\.9: dominios reales/);
 assert.match(css,/\.offer \.offer-destination\{display:block;max-width:100%;overflow-wrap:anywhere/);
 assert.match(css,/@media\(max-width:540px\)/);
});
