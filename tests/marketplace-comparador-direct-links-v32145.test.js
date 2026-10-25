'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');

const token='eyJwcm9kdWN0IjoiSXBob25lMTIxMjhHQiIsIm9mZmVyIjoiMTIzIn0=';
const googleRedirect=(url)=>'https://www.google.com/url?sa=U&q='+encodeURIComponent(url)+'&ved=abc';

test('extrae un enlace HTTPS directo sin abrir redirecciones Google ni enlaces de tracking',()=>{
 const real='https://pixmania.com/es/iphone-12-128gb-morado?ref=google';
 assert.equal(provider.directMerchantUrl(googleRedirect(real)),real);
 assert.equal(provider.directMerchantUrl('https://www.google.com/aclk?adurl='+encodeURIComponent(real)),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/shopping/product/1234'),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent('https://www.google.com/search?q=iphone')),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent('javascript:alert(1)')),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent('http://pixmania.com/es/iphone')),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent('https://user:pass@pixmania.com/es/iphone')),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent('https://127.0.0.1/item')),null);
 assert.equal(provider.directMerchantUrl('https://www.google.com/url?q='+encodeURIComponent(real)),real);
 assert.equal(provider.directMerchantUrl('https://pixmania.com/es/iphone'), 'https://pixmania.com/es/iphone');
});

test('Google Shopping aprovecha enlaces directos auténticos de la respuesta inicial (sin otra consulta)',()=>{
 const url='https://pixmania.com/es/iphone-12-128gb';
 const rows=[
  {title:'Apple iPhone 12 128 GB morado',source:'Pixmania',price:'259,00 €',extracted_price:259,
   product_id:'123456789012345678',immersive_product_page_token:token,
   link:googleRedirect(url),product_link:'https://www.google.com/shopping/product/123456789012345678'},
  {title:'Apple iPhone 12 Pro 128GB oro',source:'Pixmania',price:'225 €',extracted_price:225,
   link:googleRedirect('https://pixmania.com/iphone-12-pro')}
 ];
 const result=provider.parseExternal(rows,'iphone 12 128 GB');
 assert.equal(result.length,1);
 assert.equal(result[0].href,url);
 assert.equal(result[0].destination,'store');
 assert.equal(result[0].product_id,'123456789012345678');
 assert.equal(result[0].page_token,token);
 assert.equal(provider.resolveOfferLink(result[0]).destination,'store');
 const other=provider.parseExternal([{...rows[0],link:undefined,product_link:'https://www.google.com/shopping/product/123456789012345678'}],'iphone 12 128 GB');
 assert.equal(other[0].destination,'shopping-search');
 assert.match(other[0].href,/google.com\/search/);
});

test('también aprovecha enlaces de anuncios, señalando la publicidad, sin seguir URLs de anuncios Google',()=>{
 const rows=[
  {title:'iPhone 12 128 GB',source:'Pixmania',price:'259 €',extracted_price:259,
   link:googleRedirect('https://pixmania.com/iphone-12-128'),tracking_link:'https://www.google.com/aclk?utm=xyz'},
  {title:'iPhone 12 128 GB',source:'Tienda Falsa',price:'200 €',extracted_price:200,
   link:'https://www.google.com/aclk?adurl=https%3A%2F%2Ffalsa.com%2Fproducto'}
 ];
 const got=provider.parseInlineStores(rows,'iphone 12 128 GB');
 assert.equal(got.length,1);
 assert.equal(got[0].href,'https://pixmania.com/iphone-12-128');
 assert.equal(got[0].sponsored,true);
});

test('el token exacto se usa en una sola consulta Google Product, con verificación de tienda y precio',async()=>{
 const offer={title:'iPhone 12 128 GB morado reacondicionado',shop:'Pixmania',price_cents:25900,
  product_id:'123456789012345678',page_token:token};
 let requests=0;
 const result=await provider.fetchDirectRetailer(offer,async(url)=>{
  requests++;
  const u=new URL(url);
  assert.equal(u.searchParams.get('engine'),'google_product');
  assert.equal(u.searchParams.get('gl'),'es');
  assert.equal(u.searchParams.get('hl'),'es');
  assert.equal(u.searchParams.get('page_token'),token);
  assert.equal(u.searchParams.get('product_id'),null);
  return {ok:true,json:async()=>({
   sellers_results:{online_sellers:[
    {name:'Otra tienda',base_price:'259,00 €',direct_link:'https://otra.example/p'},
    {name:'Pixmania',base_price:'299,00 €',direct_link:'https://pixmania.com/otro'},
    {name:'Pixmania',base_price:'259,00 €',direct_link:googleRedirect('https://pixmania.com/iphone-12-128')}
   ]}
  })};
 },{COMPARADOR_SERPAPI_KEY:'abcdefghijklmnopqrstuvwxyz'});
 assert.equal(requests,1);
 assert.equal(result.href,'https://pixmania.com/iphone-12-128');
 assert.equal(result.verified_price_cents,25900);
});

test('un token inválido no provoca búsquedas extra ni reemplaza el ID tradicional',async()=>{
 const offer={title:'iPhone 12 128GB',shop:'Pixmania',price_cents:25900,
  product_id:'123456789012345678',page_token:'?secret=oops&foo=bar'};
 assert.equal(provider.safePageToken(offer.page_token),null);
 assert.equal(provider.safePageToken(token),token);
 assert.equal(provider.safePageToken('x'.repeat(2500)),null);
 let calls=0;
 const result=await provider.fetchDirectRetailer(offer,async(url)=>{
  calls++;
  const params=new URL(url).searchParams;
  assert.equal(params.get('page_token'),null);
  assert.equal(params.get('product_id'),offer.product_id);
  return {ok:true,json:async()=>({sellers_results:{online_sellers:[{
   name:'Pixmania',base_price:'259,00 €',direct_link:'https://pixmania.com/iphone-12-128'
  }]}})};
 },{COMPARADOR_SERPAPI_KEY:'abcdefghijklmnopqrstuvwxyz'});
 assert.equal(calls,1);
 assert.equal(result.href,'https://pixmania.com/iphone-12-128');
});

test('un enlace directo conocido aparece primero; oferta antigua conserva búsqueda Google como alternativa',async()=>{
 const old=db.query,configured=provider.configured,now=new Date().toISOString();
 const slug=compare.slugFor('iphone 12 128 GB');
 const direct={title:'iPhone 12 128 GB morado',shop:'Pixmania',price_cents:25900,price_currency:'EUR',
  condition:'Reacondicionado',href:googleRedirect('https://pixmania.com/es/iphone-12-128'),internal:false};
 try{
  provider.configured=()=>false;
  let current=direct;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rows:[{
    id:51,slug,query_text:'iphone 12 128 GB',provider_status:'ok',
    created_at:now,last_checked_at:now,external_results:[current],index_approved:false,seo_blocked:false
   }],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const origin='http://127.0.0.1:'+server.address().port;
   const html=await (await fetch(origin+'/comparar/'+slug)).text();
   assert.match(html,/Ver oferta en tienda/);
   assert.match(html,/https:\/\/pixmania\.com\/es\/iphone-12-128/);
   assert.doesNotMatch(html,/Consultar enlace de la tienda|Buscar en Google/);
   current={...direct,href:'https://www.google.com/shopping/product/123'};
   const oldHtml=await (await fetch(origin+'/comparar/'+slug)).text();
   assert.match(oldHtml,/Buscar en Google/);
   assert.doesNotMatch(oldHtml,/Ver oferta en tienda/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;}
});
