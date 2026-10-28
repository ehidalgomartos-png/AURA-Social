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

const query='iphone 12 128 GB';
function offer(title,price,shop,href,extra={}){
 return {title,price_cents:price,price_currency:'EUR',condition:'Reacondicionado',
   image:'https://images1.gstatic.com/iphone-12.jpg',shop,href,...extra};
}
async function render(offers){
 const oldQuery=db.query,oldConfigured=provider.configured,slug=compare.slugFor(query);
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:33,slug,query_text:query,index_approved:false,seo_blocked:false,
      provider_status:'ok',created_at:new Date().toISOString(),
      last_checked_at:new Date().toISOString(),external_results:offers,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text()};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}
test('cada ficha de vendedor agrupa precio y botones en una columna, conservando enlaces',async()=>{
 const items=[
  offer('Apple iPhone 12 128 GB Negro',16799,'rebuy.es',
   'https://www.google.com/search?q=iphone+12+rebuy',{product_id:'1234567890123'}),
  offer('Apple iPhone 12 128 GB Reacondicionado',17799,'Tienda real',
   'https://tienda-real.es/productos/iphone-12')
 ];
 const {status,html}=await render(items);
 assert.equal(status,200);
 assert.equal((html.match(/class="offer-side"/g)||[]).length,2);
 assert.equal((html.match(/class="offer"/g)||[]).length,2);
 assert.match(html,/<div class="offer-side"><div class="price">167,99/);
 assert.match(html,/Consultar enlace de la tienda/);
 assert.match(html,/class="offer-link offer-search-backup" href="https:\/\/www\.google\.com\/search/);
 assert.match(html,/Buscar en Google/);
 assert.match(html,/href="https:\/\/tienda-real\.es\/productos\/iphone-12"/);
 assert.match(html,/Ver oferta en tienda/);
 assert.match(html,/href="#precios-y-tiendas">Ver las ofertas<\/a>/);
 assert.match(html,/167,99/);
 assert.match(html,/177,99/);
 assert.match(html,/rebuy.es/);
 assert.match(html,/rel="noopener noreferrer nofollow"/);
});
test('el filtro de productos averiados sigue siendo independiente y no cambia el mínimo',async()=>{
 const items=[
  offer('iPhone 12 128 GB No funciona',5500,'Tienda averías','https://averias.es/roto'),
  offer('Apple iPhone 12 128 GB',9000,'Tienda B','https://tienda-b.es/iphone')
 ];
 const {status,html}=await render(items);
 assert.equal(status,200);
 assert.match(html,/Precio desde<\/span><strong>90,00/);
 assert.match(html,/55,00/);
 assert.match(html,/Ver 1 anuncio averiado o para piezas/);
 assert.equal((html.match(/class="offer-side"/g)||[]).length,2);
});
test('estilos accesibles: botones blancos sobre azul y enlace Google secundario legible',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/body\.cmp-premium \.cmp-rich-comparison a\.cmp-detail-action:visited/);
 assert.match(css,/color:#fff;background:#125ba4/);
 assert.match(css,/\.offer-side>a\.offer-search-backup:visited/);
 assert.match(css,/background:#eff6ff;color:#164f84/);
 assert.match(css,/\.offer-side \.offer-lookup button\.offer-link/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/grid-template-columns:82px minmax\(0,1fr\)/);
 assert.match(css,/\.offer-side\{\s*grid-column:1\/-1/);
});
