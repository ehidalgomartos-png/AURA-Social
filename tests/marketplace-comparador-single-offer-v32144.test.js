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

const now=new Date().toISOString();
const offer=(title,price,shop,extra={})=>({
 title,shop,price_cents:price,price_currency:'EUR',
 condition:'Reacondicionado',href:'https://www.google.com/search?q=iphone+12',
 image:'https://images1.gstatic.com/iphone-12.png',internal:false,...extra
});
async function publicPage(query,offers,status='ok',suffix=''){
 const oldQuery=db.query,oldConfigured=provider.configured,slug=compare.slugFor(query);
 provider.configured=()=>false;
 db.query=async(sql)=>{
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rows:[{
   id:51,slug,query_text:query,provider_status:status,external_results:offers,
   created_at:now,last_checked_at:now,index_approved:false,seo_blocked:false,editorial_summary:''
  }],rowCount:1};
  return {rows:[],rowCount:0};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
 let server;
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug+suffix);
  return {status:response.status,html:await response.text()};
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;provider.configured=oldConfigured;
 }
}

test('una única oferta usa ficha principal y no repite el producto tres veces',async()=>{
 const {html,status}=await publicPage('iphone 12 128 GB',[
  offer('iPhone 12 128 GB, morado, desbloqueado - Reacondicionado',25900,'Pixmania')
 ]);
 assert.equal(status,200);
 assert.match(html,/class="compare-single-product"/);
 assert.match(html,/class="compare-single-status"/);
 assert.match(html,/1 oferta coincidente/);
 assert.match(html,/Oferta encontrada/);
 assert.match(html,/iPhone 12 128 GB, morado, desbloqueado/);
 assert.match(html,/class="cmp-offer-shop">Pixmania<\/small>/);
 assert.match(html,/class="cmp-condition-chip cmp-condition-reacondicionado"[^>]*>Reacondicionado · según anuncio<\/span>/);
 assert.match(html,/259,00/);
 assert.match(html,/images1\.gstatic\.com\/iphone-12\.png/);
 assert.match(html,/Buscar en Google/);
 assert.doesNotMatch(html,/Precios encontrados|Versiones encontradas|<h2 id="precios-y-tiendas">Precios y tiendas/);
 assert.doesNotMatch(html,/1 ofertas|Precio más bajo mostrado/);
 assert.match(html,/Precios consultados:/);
 assert.match(html,/precio, la disponibilidad y el envío se confirman/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/"@type":"Product"/);
 assert.equal((html.match(/class="offer"/g)||[]).length,1);
});

test('una única oferta mantiene enlace directo comprobado y mensaje útil de retorno',async()=>{
 const direct=offer('iPhone 12 128 GB morado',25900,'Tienda Ejemplo',{href:'https://tienda.example/producto/iphone-12-128'});
 const {html}=await publicPage('iphone 12 128 GB',[direct],'ok','?enlace=sin-verificar');
 assert.match(html,/Ver oferta en tienda/);
 assert.match(html,/https:\/\/tienda\.example\/producto\/iphone-12-128/);
 assert.match(html,/No se ha podido confirmar un enlace directo/);
 assert.match(html,/id="precios-y-tiendas"/);
 assert.match(html,/name="_csrf"/);
});

test('dos ofertas de la misma variante no muestran sección de versiones redundante',async()=>{
 const data=[
  offer('iPhone 12 128 GB violeta reacondicionado',25900,'Pixmania'),
  offer('iPhone 12 128GB negro reacondicionado',26500,'Otra tienda')
 ];
 const {html,status}=await publicPage('iphone 12 128 GB',data);
 assert.equal(status,200);
 assert.match(html,/Precios encontrados/);
 assert.match(html,/2 ofertas/);
 assert.match(html,/Precios y tiendas/);
 assert.doesNotMatch(html,/Versiones encontradas|compare-single-product/);
 assert.equal((html.match(/class="offer"/g)||[]).length,2);
});

test('dos variantes diferentes conservan agrupación para evitar comparaciones engañosas',async()=>{
 const data=[
  offer('iPhone 12 64 GB azul usado',7800,'Tienda A',{condition:'Usado'}),
  offer('iPhone 12 128 GB violeta reacondicionado',25900,'Tienda B')
 ];
 const {html}=await publicPage('iphone 12',data);
 assert.match(html,/Versiones encontradas/);
 assert.match(html,/2 ofertas agrupadas/);
 assert.match(html,/64 GB · Usado/);
 assert.match(html,/128 GB · Reacondicionado/);
 assert.match(html,/Precios y tiendas/);
});

test('búsqueda sin resultados conserva el estado de espera y no genera fichas vacías',async()=>{
 const {html}=await publicPage('iphone 12 128 GB',[],'limit_reached');
 assert.match(html,/Estamos preparando esta comparación/);
 assert.doesNotMatch(html,/compare-single-product|Versiones encontradas/);
 assert.match(html,/data-comparison-results/);
});

test('nuevos estilos de oferta principal se adaptan a móvil sin ocultar botones',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/\.compare-single-product/);
 assert.match(css,/\.compare-single-product \.offer \.offer-photo/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/grid-column:1 \/ -1/);
 assert.match(css,/min-height:46px/);
});
