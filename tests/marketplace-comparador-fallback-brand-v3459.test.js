'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {recentFallback,fallbackCategory,recentImage,CATEGORY_FALLBACKS}=require('../src/services/marketplace-comparador-recent-images-v3432');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const base=path.join(__dirname,'..');
test('ilustraciones locales en todos los productos de la captura y fallback general de marca',()=>{
 const cases={
  'portatil asus rog strix gaming':'portatil',
  'auriculares wireless apple airpods pro':'auriculares',
  'robot aspirador roborock s8':'aspirador',
  'cafetera delonghi magnifica s':'cafetera',
  'cecotec cecofry dual 9000':'freidora',
  'aire acondicionado portatil silencioso cecotec':'clima',
  'zapatillas skechers mujer':'zapatillas',
  'chaqueta north face hombre':'chaqueta',
  'smartwatch samsung galaxy watch 7':'reloj',
  'televisor smart tv oled':'television',
  'mesa de comedor':'muebles',
  'armario bajo':'armario',
  'iphone 12 128 GB':'movil',
  'producto sin categoría identificable':'general'
 };
 for(const [query,category] of Object.entries(cases)){
  assert.equal(fallbackCategory(query),category,query);
  const url=recentFallback(query);
  assert.equal(url,CATEGORY_FALLBACKS[category]);
  const local=path.join(base,'public',url);
  assert.equal(fs.existsSync(local),true,url);
  const xml=fs.readFileSync(local,'utf8');
  assert.match(xml,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(xml,/<\/svg>/);
  assert.ok(xml.length<5000);
  assert.match(xml,/Ilustración|ilustración|gráfica/i);
  assert.doesNotMatch(xml,/https?:\/\/|<script|<foreignObject/);
 }
});
test('la foto real fiable prevalece; una foto sin acreditar muestra ilustración y texto veraz',()=>{
 const query='auriculares wireless apple airpods pro';
 const photo={title:query,image:'https://images1.gstatic.com/products/auriculares-wireless-apple-airpods-pro.jpg',
  condition:'Nuevo',price_cents:12900,price_currency:'EUR',href:'https://tienda.es/airpods',shop:'Tienda A'};
 const noPhoto={...photo,image:'https://images1.gstatic.com/images?q=tbn:opaque'};
 assert.equal(recentImage(query,[noPhoto]),null);
 assert.equal(recentImage(query,[photo]),photo.image);
 const html=detail.heroMarkup(query,[noPhoto],null);
 assert.match(html,/comparador-ilustracion-auriculares-v3459\.svg/);
 assert.match(html,/class="cmp-illustration"/);
 assert.match(html,/Fotografía no verificada · Ilustración de la categoría/);
 const real=detail.heroMarkup(query,[photo],null);
 assert.match(real,/class="cmp-detail-photo"/);
 assert.match(real,/data-compare-fallback="\/assets\/comparador-ilustracion-auriculares-v3459\.svg"/);
 assert.match(real,/auriculares-wireless-apple-airpods-pro\.jpg/);
});
test('la portada mantiene imágenes de ofertas y usa ilustraciones diversas cuando faltan',async()=>{
 const old=db.query;
 db.query=async sql=>{
  if(sql.startsWith('SELECT slug,query_text,jsonb_array_length'))return {rowCount:3,rows:[
   {slug:'asus',query_text:'portatil asus rog strix gaming',offer_count:3,external_results:[]},
   {slug:'airpods',query_text:'auriculares wireless apple airpods pro',offer_count:5,external_results:[]},
   {slug:'freidora',query_text:'freidora de aire cosori 5.5l',offer_count:5,external_results:[]}
  ]};
  return {rows:[],rowCount:0};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const srv=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+srv.address().port+'/comparar');
  assert.equal(response.status,200);
  const html=await response.text();
  for(const k of ['portatil','auriculares','freidora'])
   assert.match(html,new RegExp('comparador-ilustracion-'+k+'-v3459\\.svg'));
  assert.equal((html.match(/class="cmp-illustration"/g)||[]).length,3);
  assert.doesNotMatch(html,/<img[^>]+src="https:\/\/.*?notavailable/);
 }finally{await new Promise(r=>srv.close(r));db.query=old;}
});
test('las fotos rotas solo cambian a archivos locales aprobados, sin solicitar proveedores',()=>{
 const js=fs.readFileSync(path.join(base,'public/comparador-v32135.js'),'utf8');
 assert.match(js,/document\.addEventListener\('error'/);
 assert.match(js,/data-compare-fallback/);
 assert.match(js,/img\.removeAttribute\('data-compare-fallback'\)/);
 assert.match(js,/\.svg\$\/\.test\(fallback/);
 assert.match(js,/Sin fotografía verificada/);
 assert.doesNotMatch(js,/fetch\(.*fallback/);
 const css=fs.readFileSync(path.join(base,'public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/V3\.4\.5\.9/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/cmp-detail-noimage img\.cmp-illustration/);
});
