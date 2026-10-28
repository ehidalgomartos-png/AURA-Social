'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const {validOfferPhoto}=require('../src/services/marketplace-comparador-image-confidence-v3433');
const {recentImage,recentFallback}=require('../src/services/marketplace-comparador-recent-images-v3432');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');
const {router,slugFor}=require('../src/routes/marketplace-comparador-v32132');
const phone={title:'Samsung Galaxy S26 256 GB Smartphone',price_cents:77900,
 price_currency:'EUR',condition:'Nuevo',shop:'Tienda real',href:'https://tienda.es/galaxy-s26',
 image:'https://images1.gstatic.com/products/samsung-s26-front.jpg'};
test('Samsung: una URL de imagen opaca no acredita un móvil aunque el título coincida',()=>{
 const query='samsung s26 256 GB';
 for(const image of [
  'https://images1.gstatic.com/images?q=tbn:ABCD1234',
  'https://serpapi.com/searches/ABCD/image',
  'https://images1.gstatic.com/galaxy-s26.jpg',
  'https://images1.gstatic.com/products/galaxy-s26-case.jpg',
  'https://images1.gstatic.com/products/galaxy-s26-box.jpg'
 ]){
  assert.equal(validOfferPhoto(query,{...phone,image}),null,image);
 }
 assert.equal(validOfferPhoto(query,phone),phone.image);
 assert.equal(recentImage('samsung s26',[{...phone,image:'https://images1.gstatic.com/images?q=tbn:123'}]),null);
 assert.equal(recentFallback('samsung s26'),'/assets/comparador-movil-generico-v3435.svg');
 assert.equal(recentFallback('samsung s26 256 GB'),'/assets/comparador-movil-generico-v3435.svg');
 assert.equal(recentFallback('armario'),'/assets/comparador-armarios-generico-v3435.svg');
 assert.equal(recentFallback('mesa'),'/assets/comparador-producto-v3432.svg');
});
test('la búsqueda genérica de armarios no tiene foto de modelo ni características generales inventadas',()=>{
 const offers=[
  {title:'Armario ropero blanco 3 puertas',price_cents:6499,condition:'Consultar estado',shop:'Tienda A'},
  {title:'Armario bajo auxiliar 2 puertas',price_cents:9999,condition:'Nuevo',shop:'Tienda B'}
 ];
 const markup=detail.broadResultsMarkup('armario',offers,false);
 assert.match(markup,/Búsqueda general/);
 assert.match(markup,/Resultados para «armario»/);
 assert.match(markup,/64,99/);
 assert.match(markup,/2 ofertas · 2 vendedores/);
 assert.match(markup,/productos, medidas y modelos diferentes/);
 assert.match(markup,/no representa a toda la categoría/);
 assert.doesNotMatch(markup,/cmp-detail-photo|Fotografía no verificada|Capacidad sin identificar|Oferta más económica: consultar estado/);
 assert.equal(detail.broadResultsMarkup('armario',[]), '');
});
test('armario en ficha pública: no muestra versiones por capacidad ni SEO de un producto concreto',async()=>{
 const original=db.query,configured=provider.configured,query='armario',queries=[];
 try{
  provider.configured=()=>false;
  db.query=async(sql,args=[])=>{
   queries.push(sql);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:52,slug:slugFor(query),query_text:query,index_approved:false,
     seo_blocked:false,provider_status:'ok',editorial_summary:'',last_checked_at:new Date().toISOString(),
     external_results:[
      {title:'Armario ropero blanco 3 puertas',price_cents:6499,price_currency:'EUR',
       shop:'Tienda A',condition:'Consultar estado',image:'https://images1.gstatic.com/products/ropero.jpg',href:'https://tienda-a.es/armario'},
      {title:'Armario bajo auxiliar 2 puertas',price_cents:9999,price_currency:'EUR',
       shop:'Tienda B',condition:'Nuevo',image:'https://images1.gstatic.com/products/auxiliar.jpg',href:'https://tienda-b.es/armario'}
     ]}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const result=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slugFor(query));
   const html=await result.text();
   assert.equal(result.status,200);
   assert.match(html,/class="cmp-broad-results"/);
   assert.match(html,/Resultados para «armario»/);
   assert.match(html,/Mínimo de una oferta/);
   assert.match(html,/de productos potencialmente diferentes/);
   assert.match(html,/Precios y tiendas|Productos y modelos relacionados/);
   assert.match(html,/href="https:\/\/tienda-a.es\/armario"/);
   assert.match(html,/href="https:\/\/tienda-b.es\/armario"/);
   assert.doesNotMatch(html,/Versiones encontradas|Capacidad sin identificar|agrupadas por capacidad|Ficha del producto · RedLibertad/);
   assert.doesNotMatch(html,/class="cmp-detail-image"|class="cmp-detail-specifications"/);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.equal(queries.some(q=>/UPDATE marketplace_compare_pages|INSERT INTO marketplace_compare/.test(q)),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=configured;}
});
test('la búsqueda exacta mantiene ficha de producto, precios y fotografía si hay origen identificable',()=>{
 const markup=detail.heroMarkup('samsung s26 256 GB',[phone],null,false,0);
 assert.match(markup,/class="cmp-detail-hero"/);
 assert.match(markup,/779,00/);
 assert.match(markup,/samsung-s26-front\.jpg/);
 assert.match(markup,/href="#precios-y-tiendas"/);
});
test('los iconos son ilustraciones locales y el resumen se adapta a móvil',()=>{
 for(const p of ['comparador-movil-generico-v3435.svg','comparador-armarios-generico-v3435.svg']){
  const svg=fs.readFileSync(path.join(__dirname,'../public/assets',p),'utf8');
  assert.match(svg,/<svg /);assert.match(svg,/<\/svg>/);assert.ok(svg.length<4000);
 }
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/\.cmp-broad-results/);
 assert.match(css,/@media\(max-width:690px\)/);
});
