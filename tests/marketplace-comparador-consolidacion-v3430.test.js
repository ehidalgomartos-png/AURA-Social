'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
test('directorio permite SEO solo con tiendas reales distintas y catálogo suficiente',async()=>{
 const original=db.query,seen=[];
 let rows=[
  {name:'Tienda Uno',store_url:'https://uno.es/',products:5},
  {name:'Tienda Dos',store_url:'https://dos.es/',products:4},
  {name:'Tienda Tres',store_url:'https://tres.es/',products:3},
  {name:'Tienda Duplicada',store_url:'https://www.uno.es/',products:8},
  {name:'Tienda insegura',store_url:'http://tienda.es/',products:10}
 ];
 try{
  db.query=async(sql,args=[])=>{
   seen.push(sql);
   if(sql.startsWith('SELECT s.name,s.store_url,COUNT(DISTINCT x.listing_id)'))return {rowCount:rows.length,rows};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const rsp=await fetch(base+'/comparar/comercios/tiendas');
   assert.equal(rsp.status,200);
   const html=await rsp.text();
   assert.match(html,/Tienda Uno/);
   assert.match(html,/Tienda Dos/);
   assert.match(html,/Tienda Tres/);
   assert.doesNotMatch(html,/Tienda Duplicada/);
   assert.doesNotMatch(html,/Tienda insegura/);
   assert.doesNotMatch(html,/name="robots" content="noindex,follow"/);
   assert.match(html,/Buscar y comparar precios/);
   assert.ok(seen.some(s=>s.includes("s.status='approved'")));
   rows=rows.slice(0,2);
   const tiny=await fetch(base+'/comparar/comercios/tiendas');
   assert.equal(tiny.status,200);
   assert.match(await tiny.text(),/name="robots" content="noindex,follow"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;}
});
test('solicitud gratuita tiene pasos visibles y ninguna llamada a cobros o SerpApi',async()=>{
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const rsp=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/comercios');
  const html=await rsp.text();
  assert.match(html,/cmp-commerce-steps/);
  assert.match(html,/Solicita el alta/);
  assert.match(html,/Verifica tu dominio/);
  assert.match(html,/Comparte tus productos/);
  assert.match(html,/sin cuota, sin comisiones/);
  assert.doesNotMatch(html,/checkout\/session|create-subscription/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
