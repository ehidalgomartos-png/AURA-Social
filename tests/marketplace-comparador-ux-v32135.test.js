'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const db=require('../src/db');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('Google product_link inválido se sustituye por búsqueda web sin forzar Shopping',()=>{
 const broken='https://www.google.com/search?ibp=oshop&q=samsung%20s26&prds=catalogid:15494712961249802758,headlineOfferDocid:15494712961249802758';
 const offer=provider.resolveOfferLink({title:'Samsung Galaxy S26 256 GB',shop:'Tienda A',href:broken});
 assert.ok(offer);
 assert.equal(offer.destination,'shopping-search');
 const url=new URL(offer.href);
 assert.equal(url.hostname,'www.google.com');
 assert.equal(url.pathname,'/search');
 assert.equal(url.searchParams.get('udm'),null);
 assert.equal(url.searchParams.get('gl'),'es');
 assert.equal(url.searchParams.get('hl'),'es');
 assert.match(url.searchParams.get('q'),/Galaxy S26 256 GB Tienda A/);
 assert.ok(!url.searchParams.has('prds'),'la URL de producto fallida no se reutiliza');
});

test('Un enlace directo de vendedor se conserva; Google tracking no se anuncia como tienda',()=>{
 assert.deepEqual(provider.resolveOfferLink({title:'iPhone 17 Pro',shop:'Tienda',href:'https://tienda.example/producto?ref=foo'}),
  {href:'https://tienda.example/producto?ref=foo',destination:'store'});
 assert.equal(provider.resolveOfferLink({title:'iPhone 17 Pro',shop:'Tienda',href:'https://www.google.com/aclk?sa=L'}).destination,'shopping-search');
 const results=provider.parseExternal([
  {title:'Samsung Galaxy S26 256 GB',source:'Tienda A',price:'799 €',extracted_price:799,product_link:'https://www.google.com/search?ibp=oshop&prds=foo'},
  {title:'Samsung Galaxy S26 256GB',source:'Tienda B',price:'€810',extracted_price:810,link:'https://vendedor.example/s26'},
  {title:'Samsung Galaxy S26 256 GB',source:'Tienda C',price:'€811',extracted_price:811,link:'https://www.google.com/aclk?foo'},
 ],'samsung s26');
 assert.equal(results.length,3);
 assert.equal(results[0].destination,'shopping-search');
 assert.equal(results[1].destination,'store');
 assert.equal(results[2].destination,'shopping-search');
 assert.ok(results.every(x=>!x.href.includes('prds=')));
});

test('La página muestra tarjetas y destino seguro también para resultados antiguos de PostgreSQL',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;
 const slug=compare.slugFor('samsung s26');
 const now=new Date().toISOString();
 const offers=[{
   title:'Samsung Galaxy S26 256 GB',shop:'Tienda A',price_cents:79900,
   href:'https://www.google.com/search?ibp=oshop&q=samsung%20s26&prds=catalogid:123',
   condition:'Consultar estado',internal:false
 },{
   title:'Samsung Galaxy S26 256 GB',shop:'Tienda B',price_cents:81900,
   href:'https://vendedor.example/s26',condition:'Consultar estado',internal:false
 }];
 provider.configured=()=>false;
 db.query=async(sql,args=[])=>{
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages'))return {rowCount:1,rows:[{
   id:8,slug,query_text:'samsung s26',provider_status:'ok',last_checked_at:now,
   index_approved:false,editorial_summary:'',created_at:now,external_results:offers
  }]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 try{
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
  const html=await res.text();
  assert.equal(res.status,200);
  assert.match(html,/comparador-v32135\.css/);
  assert.match(html,/comparador-v32135\.js/);
  assert.match(html,/Buscar en Google/);
  assert.match(html,/Ver oferta en tienda/);
  assert.match(html,/Precio más bajo mostrado/);
  assert.match(html,/data-comparison-results/);
  assert.match(html,/data-comparison-status="ok"/);
  assert.doesNotMatch(html,/prds=catalogid/i);
  assert.doesNotMatch(html,/udm=28/);
  assert.match(html,/gl=es/);
  assert.match(html,/noindex,follow/);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=oldQuery;provider.configured=oldConfigured;
 }
});

test('Autoactualización es propia y se desactiva al acabar',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 const styles=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(script,/fetch\(location\.pathname/);
 assert.match(script,/clearInterval\(interval\)/);
 assert.match(script,/maxAttempts=18/);
 assert.match(script,/root\.dataset\.comparisonStatus/);
 assert.match(styles,/@media\(max-width:700px\)/);
 assert.match(styles,/comparison-list/);
});
