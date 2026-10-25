'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('el modelo base no coincide con Pro ni Pro Max de la misma generación',()=>{
 assert.equal(provider.titleMatches('iphone 12 128 GB','iPhone 12 Pro 128 GB dorado'),false);
 assert.equal(provider.titleMatches('iphone 12 128GB','Apple iPhone 12 Pro Max 128GB dorado'),false);
 assert.equal(provider.titleMatches('iphone 12 128 GB','Apple iPhone 12 128 GB morado reacondicionado'),true);
 assert.equal(provider.titleMatches('iphone 12 128 GB','Apple iPhone 12 128GB morado reacondicionado'),true);
 assert.equal(provider.titleMatches('iphone 12 128GB','Apple iPhone 12 128 GB violeta'),true);
 assert.equal(provider.titleMatches('iphone 12 128 GB','Apple iPhone 12 256 GB'),false);
 assert.equal(provider.titleMatches('iphone 12 128 GB','Apple iPhone 12 64GB'),false);
 assert.equal(provider.titleMatches('iphone 12','iPhone 12 Pro 128 GB'),false);
 assert.equal(provider.titleMatches('iphone 12','iPhone 12 Pro Max 128 GB'),false);
 assert.equal(provider.titleMatches('iphone 12','iPhone 12 64GB'),true);
});
test('las búsquedas Pro y Pro Max tampoco mezclan precios con el modelo base',()=>{
 assert.equal(provider.titleMatches('iphone 12 Pro 128 GB','iPhone 12 128 GB'),false);
 assert.equal(provider.titleMatches('iphone 12 Pro 128 GB','iPhone 12 Pro Max 128 GB'),false);
 assert.equal(provider.titleMatches('iphone 12 Pro 128GB','iPhone 12 Pro 128 GB dorado'),true);
 assert.equal(provider.titleMatches('iphone 12 Pro Max 128GB','iPhone 12 Pro Max 128 GB dorado'),true);
 assert.equal(provider.titleMatches('samsung s26 Ultra 256 GB','Samsung S26 256GB'),false);
 assert.equal(provider.titleMatches('samsung s26 256 GB','Samsung S26 Ultra 256GB'),false);
 assert.equal(provider.titleMatches('iphone 12 mini 64 GB','iPhone 12 mini 64GB'),true);
 assert.equal(provider.titleMatches('iphone 12 mini 64 GB','iPhone 12 64GB'),false);
 // Para búsquedas completamente genéricas sigue permitiendo comparar gamas.
 assert.equal(provider.titleMatches('iphone','iPhone 12 Pro 128GB'),true);
});
test('resultados recibidos de SerpApi no incluyen otros modelos sin perder 128GB pegado',()=>{
 const results=[
  {title:'Apple iPhone 12 Pro 128 GB, dorado',source:'Pixmania',extracted_price:225,price:'225,00 €',link:'https://tienda.example/pro-128'},
  {title:'Apple iPhone 12 Pro 128GB dorado',source:'Pixmania',extracted_price:249,price:'249,00 €',link:'https://tienda.example/pro-128-b'},
  {title:'Apple iPhone 12 128GB morado',source:'Pixmania',extracted_price:259,price:'259,00 €',link:'https://tienda.example/base-128'}
 ];
 const filtered=provider.parseExternal(results,'iphone 12 128 GB');
 assert.equal(filtered.length,1);
 assert.equal(filtered[0].price_cents,25900);
 assert.equal(filtered[0].title,'Apple iPhone 12 128GB morado');
 const pro=provider.parseExternal(results,'iphone 12 pro 128 GB');
 assert.equal(pro.length,2);
 assert.deepEqual(pro.map(x=>x.price_cents),[22500,24900]);
 const inline=provider.parseInlineStores(results,'iphone 12 128 GB');
 assert.equal(inline.length,1);
});

test('la ficha permanente corrige precios antiguos guardados sin consumir SerpApi',async()=>{
 const original=db.query,configured=provider.configured;
 const now=new Date().toISOString(),slug=compare.slugFor('iphone 12 128 GB');
 const offers=[
  {title:'iPhone 12 Pro 128 GB, dorado, desbloqueado - Reacondicionado',shop:'Pixmania',condition:'Reacondicionado',price_cents:22500,price_currency:'EUR',href:'https://www.google.com/search?q=iphone12pro',internal:false},
  {title:'iPhone 12 Pro 128 GB, dorado, desbloqueado - Reacondicionado',shop:'Pixmania',condition:'Reacondicionado',price_cents:24900,price_currency:'EUR',href:'https://www.google.com/search?q=iphone12pro',internal:false},
  {title:'iPhone 12 128 GB, morado, desbloqueado - Reacondicionado',shop:'Pixmania',condition:'Reacondicionado',price_cents:25900,price_currency:'EUR',href:'https://www.google.com/search?q=iphone12',internal:false}
 ];
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))
    return {rowCount:1,rows:[{id:88,slug,query_text:'iphone 12 128 GB',provider_status:'ok',external_results:offers,
      created_at:now,last_checked_at:now,index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await res.text();
   assert.equal(res.status,200);
   assert.match(html,/259,00/);
   assert.match(html,/class="compare-single-product"/);
   assert.match(html,/1 oferta/);
   assert.match(html,/iPhone 12 128 GB, morado/);
   assert.doesNotMatch(html,/225,00|249,00|iPhone 12 Pro/);
   assert.match(html,/name="robots" content="noindex,follow"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=configured;}
});

test('la portada, el sitemap y la URL pública aplican el mismo filtro de modelos',()=>{
 const page={
  query_text:'iphone 12 128 GB',slug:compare.slugFor('iphone 12 128 GB'),
  index_approved:true,seo_blocked:false,provider_status:'ok',
  last_checked_at:new Date().toISOString(),
  editorial_summary:'Comparación editorial original y verificada de teléfonos de una misma capacidad, realizada para ayudar a los visitantes a identificar los modelos y comprobar sus vendedores antes de comprar.'
 };
 const offers=[
  {title:'iPhone 12 Pro 128 GB dorado',shop:'Tienda 1',price_cents:22500,price_currency:'EUR',href:'https://tienda1.example/p',condition:'Consultar estado'},
  {title:'iPhone 12 Pro 128 GB dorado',shop:'Tienda 2',price_cents:24900,price_currency:'EUR',href:'https://tienda2.example/p',condition:'Consultar estado'},
  {title:'iPhone 12 128 GB violeta',shop:'Tienda 3',price_cents:25900,price_currency:'EUR',href:'https://tienda3.example/p',condition:'Consultar estado'}
 ];
 assert.equal(seo.indexEligible(page,offers),false,'no indexar como si hubiera 3 tiendas del mismo modelo');
 const graph=seo.structuredData(page,offers,true,'/comparar/'+page.slug);
 assert.equal(graph['@graph'].some(x=>x['@type']==='Product'),false);
});
