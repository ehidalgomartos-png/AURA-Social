'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const {validOfferPhoto}=require('../src/services/marketplace-comparador-image-confidence-v3433');
const {recentImage}=require('../src/services/marketplace-comparador-recent-images-v3432');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const photo='https://images1.gstatic.com/products/samsung-s26-front.jpg';
const samsung={title:'Samsung Galaxy S26 256 GB Smartphone',condition:'Nuevo',
 shop:'Tienda A',image:photo,price_cents:79900,href:'https://tienda.es/s26'};
test('Samsung sin información suficiente, fundas, cajas y fotografías de embalajes usan fallback',()=>{
 const q='samsung s26 256 GB';
 assert.equal(validOfferPhoto(q,{...samsung,title:'Samsung S26 256GB'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,title:'Funda Samsung Galaxy S26 256 GB'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,title:'Samsung Galaxy S26 256 GB Smartphone con funda'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,image:'https://images1.gstatic.com/products/samsung-s26-box.jpg'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,image:'https://images1.gstatic.com/products/samsung-s26-case.png'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,image:'https://images1.gstatic.com/products/packaging-s26.png'}),null);
 assert.equal(recentImage(q,[{...samsung,title:'Samsung S26 256GB'}]),null);
 assert.equal(recentImage('samsung s26',[{...samsung,title:'Samsung S26 Smartphone'}]),photo);
});
test('sólo se aceptan fotografías seguras del modelo y capacidad buscados',()=>{
 const q='samsung s26 256 GB';
 assert.equal(validOfferPhoto(q,samsung),photo);
 assert.equal(validOfferPhoto(q,{...samsung,title:'Samsung Galaxy S26 Ultra 256 GB'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,title:'Samsung Galaxy S26 128 GB'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,image:'http://example.org/s26.jpg'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,image:'https://example.org/s26.jpg'}),null);
 assert.equal(validOfferPhoto(q,{...samsung,title:'Samsung Galaxy S26 256 GB No funciona'}),null);
 assert.equal(validOfferPhoto('armario',[samsung]),null);
 assert.equal(validOfferPhoto('iphone 12 128 GB',{...samsung,title:'iPhone 12 128 GB',image:'https://images1.gstatic.com/product/iphone.jpg'}),
  'https://images1.gstatic.com/product/iphone.jpg');
});
test('el hero conserva precio y ofertas cuando una imagen es ambigua',()=>{
 const ambiguous={...samsung,title:'Samsung S26 256 GB',image:'https://images1.gstatic.com/box.png',price_cents:29900};
 const hero=detail.heroMarkup('samsung s26 256 GB',[ambiguous,samsung],null,false,0);
 assert.match(hero,/299,00/);
 assert.match(hero,/2 ofertas/);
 assert.match(hero,/cmp-detail-photo/);
 assert.match(hero,/samsung-s26-front\.jpg/);
 assert.doesNotMatch(hero,/box\.png/);
 const fallback=detail.heroMarkup('samsung s26 256 GB',[ambiguous],null,false,0);
 assert.match(fallback,/299,00/);
 assert.match(fallback,/Fotografía no verificada/);
 assert.match(fallback,/comparador-producto-v3432\.svg/);
 assert.doesNotMatch(fallback,/box\.png/);
});
test('portada reutiliza sólo miniaturas fiables sin consultar SerpApi ni alterar ofertas',async()=>{
 const original=db.query,queries=[];
 try{
  db.query=async(sql,args=[])=>{
   queries.push(sql);
   if(sql.startsWith('SELECT slug,query_text,jsonb_array_length(external_results)'))return {rows:[
    {slug:'samsung-s26',query_text:'samsung s26',offer_count:4,external_results:[
     {...samsung,title:'Samsung S26',image:'https://images1.gstatic.com/case.jpg'}
    ]},
    {slug:'samsung-s26-256-gb',query_text:'samsung s26 256 GB',offer_count:5,external_results:[
     samsung
    ]}
   ],rowCount:2};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar');
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/comparador-movil-generico-v3435\.svg/);
   assert.match(html,/samsung-s26-front\.jpg/);
   assert.doesNotMatch(html,/src="https:\/\/images1\.gstatic\.com\/case\.jpg"/);
   assert.match(html,/4 ofertas guardadas/);
   assert.match(html,/5 ofertas guardadas/);
   assert.equal(queries.filter(q=>q.startsWith('SELECT ')).length,2);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;}
});
test('el filtro no cambia clasificación de averías ni precios mínimos',()=>{
 const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
 const broken={...samsung,title:'Samsung Galaxy S26 256 GB No funciona',price_cents:5000};
 const normal={...samsung,price_cents:79900};
 const grouped=quality.groupOffers('samsung s26 256 GB',[broken,normal]);
 assert.equal(grouped.main.length,1);
 assert.equal(grouped.repair.length,1);
 assert.equal(grouped.main[0].price_cents,79900);
});
