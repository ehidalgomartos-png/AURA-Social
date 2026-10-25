'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const crypto=require('node:crypto');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

const item=(shop='Wallapop')=>({
 title:'iPhone 12 64GB Morado',shop,condition:'Usado',
 price_cents:7800,price_currency:'EUR',product_id:'123456789012345678',
 href:'https://www.google.com/search?q=iphone+12+64GB&udm=28',internal:false
});
const hashOf=o=>crypto.createHash('sha256').update([o.product_id,o.shop,o.title,String(o.price_cents)].join('|')).digest('hex');
test('Wallapop y particulares no ofrecen una consulta adicional sin URL verificada',()=>{
 assert.equal(provider.canLookupSeller(item('Wallapop')),false);
 assert.equal(provider.canLookupSeller(item('Vinted')),false);
 assert.equal(provider.canLookupSeller(item('Milanuncios')),false);
 assert.equal(provider.canLookupSeller(item('Facebook Marketplace')),false);
 assert.equal(provider.canLookupSeller(item('Certideal.es')),true);
 const url=provider.resolveOfferLink(item());
 assert.equal(url.destination,'shopping-search');
 assert.match(url.href,/google.com\/search/);
});

test('ofertas Wallapop no muestran botones de consulta pagada ni salen de la comparación al pulsar un formulario antiguo',async()=>{
 const originalQuery=db.query,originalConfigured=provider.configured,originalQuota=worker.reserveQuota;
 let quotaCalls=0;
 const offer=item(),slug=compare.slugFor('iphone 12'),hash=hashOf(offer),now=new Date().toISOString();
 try{
  provider.configured=()=>false;
  worker.reserveQuota=async()=>{quotaCalls++;return true;};
  db.query=async(sql,args=[])=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
    id:5,slug,query_text:'iphone 12',external_results:[offer],created_at:now,
    last_checked_at:now,provider_status:'ok',index_approved:false,seo_blocked:false
   }]};
   if(sql.startsWith('SELECT slug,external_results FROM marketplace_compare_pages'))return {rowCount:1,rows:[{slug,external_results:[offer]}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const first=await fetch(base+'/comparar/'+slug);
   const html=await first.text();
   assert.equal(first.status,200);
   assert.match(html,/Buscar en Google/);
   assert.doesNotMatch(html,/Consultar enlace de la tienda/);
   const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1],cookie=first.headers.get('set-cookie').split(';')[0];
   provider.configured=()=>true;
   const post=await fetch(base+'/comparar/tienda/'+slug+'/'+hash,{
    method:'POST',redirect:'manual',
    headers:{'content-type':'application/x-www-form-urlencoded',cookie},
    body:new URLSearchParams({_csrf:token}).toString()
   });
   assert.equal(post.status,303);
   assert.equal(post.headers.get('location'),'/comparar/'+slug+'?enlace=sin-verificar#precios-y-tiendas');
   assert.equal(quotaCalls,0);
   provider.configured=()=>false;
   const redirectPage=await fetch(base+'/comparar/'+slug+'?enlace=sin-verificar');
   const notice=await redirectPage.text();
   assert.match(notice,/No se ha podido confirmar un enlace directo/);
   assert.match(notice,/role="status"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=originalQuery;provider.configured=originalConfigured;worker.reserveQuota=originalQuota;}
});

test('los enlaces no verificables se cachean y el botón desaparece durante su periodo',async()=>{
 const old=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const offer=item('Certideal.es'),slug=compare.slugFor('iphone 12'),now=new Date().toISOString(),hash=hashOf(offer);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:true,daily:12,monthly:220,dailyUsed:1,monthlyUsed:4});
  let unavailable=false;
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
    id:1,slug,query_text:'iphone 12',created_at:now,last_checked_at:now,provider_status:'ok',
    external_results:[offer],seo_blocked:false,index_approved:false
   }]};
   if(sql.startsWith('SELECT offer_key,href,status FROM marketplace_compare_merchant_links'))
    return {rowCount:Number(unavailable),rows:unavailable?[{offer_key:hash,status:'unavailable',href:null}]:[]};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   assert.match(await (await fetch(base+'/comparar/'+slug)).text(),/Consultar enlace de la tienda/);
   unavailable=true;
   const html=await (await fetch(base+'/comparar/'+slug)).text();
   assert.doesNotMatch(html,/Consultar enlace de la tienda/);
   assert.match(html,/Buscar en Google/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
});

test('la caché conserva enlaces ya verificados de Wallapop sin otra consulta pagada',async()=>{
 const originalQuery=db.query,originalConfigured=provider.configured;
 const offer=item('Wallapop'),slug=compare.slugFor('iphone 12'),now=new Date().toISOString(),hash=hashOf(offer);
 try{
  provider.configured=()=>false;
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
    id:4,slug,query_text:'iphone 12',created_at:now,last_checked_at:now,
    external_results:[offer],index_approved:false,seo_blocked:false,provider_status:'ok'
   }]};
   if(sql.startsWith('SELECT offer_key,href,status FROM marketplace_compare_merchant_links'))
    return {rows:[{offer_key:hash,href:'https://wallapop.com/item/iphone-12-verified',status:'ok'}],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const html=await (await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug)).text();
   assert.match(html,/Ver oferta en tienda/);
   assert.match(html,/https:\/\/wallapop.com\/item\/iphone-12-verified/);
   assert.doesNotMatch(html,/Consultar enlace de la tienda/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=originalQuery;provider.configured=originalConfigured;}
});

test('el worker no descarta una búsqueda recuperada porque una fecha anterior sigue reciente',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldFetch=provider.fetchOffers,oldConnect=db.pool.connect;
 let requests=0;const now=new Date().toISOString(),writes=[];
 try{
  provider.configured=()=>true;
  provider.fetchOffers=async()=>{requests++;return [{title:'iPhone 12 128GB',shop:'Tienda',price_cents:23000,price_currency:'EUR',href:'https://tienda.example/iphone'}];};
  db.pool.connect=async()=>({query:async()=>({rowCount:1}),release(){}});
  db.query=async(sql,args=[])=>{
   writes.push([sql,args]);
   if(sql.startsWith("UPDATE marketplace_compare_jobs SET status='running'"))return {rowCount:1,rows:[{page_id:7,attempts:1}]};
   if(sql.startsWith('SELECT id,query_text,last_checked_at,provider_status,external_results'))
    return {rowCount:1,rows:[{id:7,query_text:'iphone 12 128 GB',last_checked_at:now,provider_status:'queued',external_results:[]}]};
   return {rowCount:1,rows:[]};
  };
  assert.equal(await worker.processOne(),true);
  assert.equal(requests,1,'el trabajo pendiente ejecuta realmente la búsqueda externa');
  assert.ok(writes.some(([sql])=>sql.includes('SET external_results=')));
 }finally{db.query=oldQuery;provider.configured=oldConfigured;provider.fetchOffers=oldFetch;db.pool.connect=oldConnect;}
});

test('se pueden recuperar trabajos antiguos terminados dejando una ficha queued',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;let sql='';
 try{
  provider.configured=()=>true;
  db.query=async(q)=>{if(q.startsWith('INSERT INTO marketplace_compare_jobs')){sql=q;return {rowCount:1,rows:[{page_id:9}]};}return {rows:[],rowCount:0};};
  assert.equal(await worker.enqueue({id:9,provider_status:'queued',external_results:[],last_checked_at:new Date().toISOString()},async()=>{}),true);
  assert.match(sql,/provider_status IN \('queued','checking'\)/);
  assert.match(sql,/finished_at<now\(\)-interval '2 minutes'/);
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});

test('el navegador no mantiene Buscando ofertas indefinidamente al agotarse el sondeo',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(script,/La búsqueda está tardando más de lo habitual|Esta comparación está tardando más de lo habitual/);
 assert.match(script,/root\.dataset\.comparisonStatus='waiting'/);
 assert.match(script,/maxAttempts=18/);
});
