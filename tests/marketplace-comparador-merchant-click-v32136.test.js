'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const crypto=require('node:crypto');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('la búsqueda principal conserva product_id sin alterar enlaces externos',()=>{
 const result=provider.parseExternal([{title:'iPhone 13 128 GB',source:'Certideal.es',extracted_price:220.99,
  price:'220,99 €',product_id:'1234567890123456789',product_link:'https://www.google.com/shopping/product/1234567890123456789'}],'iphone 13');
 assert.equal(result.length,1);
 assert.equal(result[0].product_id,'1234567890123456789');
 assert.equal(result[0].destination,'shopping-search');
});

test('Google Product API solo devuelve enlace directo al mismo vendedor con precio comparable',async()=>{
 const offer={title:'iPhone 13 128GB',shop:'Certideal.es',price_cents:22099,product_id:'1234567890123456789'};
 const sellers=[
  {name:'Otro Comercio',direct_link:'https://otro.example/item',base_price:'210,99 €'},
  {name:'Certideal',direct_link:'https://certideal.example/iphone-13',base_price:'220,99 €'},
  {name:'Certideal',direct_link:'https://certideal.example/different',base_price:'350,99 €'}
 ];
 assert.equal(provider.sameRetailer('Certideal.es','Certideal'),true);
 assert.equal(provider.readEuroAmount('220,99 €'),22099);
 assert.equal(provider.readEuroAmount('1.220,99 €'),122099);
 assert.equal(provider.readEuroAmount('$220.99'),null);
 assert.equal(provider.selectRetailer(offer,sellers).href,'https://certideal.example/iphone-13');
 assert.equal(provider.selectRetailer(offer,[sellers[0],sellers[2]]),null);
 let requests=0;
 const data=await provider.fetchDirectRetailer(offer,async(url)=>{
  requests++;
  const u=new URL(url);
  assert.equal(u.searchParams.get('engine'),'google_product');
  assert.equal(u.searchParams.get('product_id'),offer.product_id);
  assert.equal(u.searchParams.get('gl'),'es');
  assert.equal(u.searchParams.get('hl'),'es');
  return {ok:true,json:async()=>({sellers_results:{online_sellers:sellers}})};
 },{COMPARADOR_SERPAPI_KEY:'abcdefghijklmnopqrstuvwxyz'});
 assert.equal(requests,1);
 assert.equal(data.href,'https://certideal.example/iphone-13');
});

test('el acceso al vendedor exige POST protegido con CSRF y conserva cuota',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldDirect=provider.fetchDirectRetailer,oldReserve=worker.reserveQuota,oldStatus=worker.quotaStatus;
 const offer={title:'iPhone 13 128GB',shop:'Certideal.es',price_cents:22099,product_id:'1234567890123456789',
  href:'https://www.google.com/search?q=iPhone+13+Certideal&udm=28',condition:'Reacondicionado',internal:false};
 const hash=crypto.createHash('sha256').update([offer.product_id,offer.shop,offer.title,String(offer.price_cents)].join('|')).digest('hex');
 const slug=compare.slugFor('iphone 13'),now=new Date().toISOString();
 let lookupCalls=0,quotaCalls=0;
 const records=[];
 try{
  provider.configured=()=>false;
  provider.fetchDirectRetailer=async()=>{lookupCalls++;return {href:'https://certideal.example/iphone13',verified_price_cents:22099}};
  worker.reserveQuota=async()=>{quotaCalls++;return true};
  worker.quotaStatus=async()=>({available:true,reason:null,daily:5,monthly:100,dailyUsed:0,monthlyUsed:0});
  db.query=async(sql,args=[])=>{
   records.push([sql,args]);
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages'))return {rowCount:1,rows:[{id:1,slug,query_text:'iphone 13',created_at:now,
    last_checked_at:now,index_approved:false,provider_status:'ok',external_results:[offer]}]};
   if(sql.startsWith('SELECT slug,external_results FROM marketplace_compare_pages'))return {rowCount:1,rows:[{slug,external_results:[offer]}]};
   if(sql.includes('INSERT INTO marketplace_compare_merchant_links'))return {rowCount:1,rows:[{offer_key:hash}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const response=await fetch(base+'/comparar/'+slug);
   assert.equal(response.status,200);
   const html=await response.text();
   assert.match(html,/Consultar enlace de la tienda/);
   const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
   const cookie=response.headers.get('set-cookie')?.split(';')[0];
   assert.ok(token&&cookie);
   const noToken=await fetch(base+'/comparar/tienda/'+slug+'/'+hash,{method:'POST',redirect:'manual',
    headers:{'content-type':'application/x-www-form-urlencoded',cookie},body:'x=1'});
   assert.equal(noToken.status,403);
   assert.equal(quotaCalls,0);
   provider.configured=()=>true;
   const yes=await fetch(base+'/comparar/tienda/'+slug+'/'+hash,{method:'POST',redirect:'manual',
    headers:{'content-type':'application/x-www-form-urlencoded',cookie},
    body:new URLSearchParams({_csrf:token}).toString()});
   assert.equal(yes.status,303);
   assert.equal(yes.headers.get('location'),'https://certideal.example/iphone13');
   assert.equal(lookupCalls,1);
   assert.equal(quotaCalls,1);
   assert.ok(records.some(x=>x[0].includes('marketplace_compare_merchant_links SET status')));
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;provider.fetchDirectRetailer=oldDirect;worker.reserveQuota=oldReserve;worker.quotaStatus=oldStatus;}
});
