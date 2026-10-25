'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const crypto=require('node:crypto');
const db=require('../src/db');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('cuota real compartida en PostgreSQL: diaria, mensual y sin proveedor',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldBudget=provider.budget;
 try{
  provider.configured=()=>true;
  provider.budget=()=>({daily:5,monthly:100});
  db.query=async()=>({rows:[{period_key:'d:2026-10-25',used:5},{period_key:'m:2026-10',used:6}]});
  const d=await worker.quotaStatus(new Date('2026-10-25T12:00:00Z'));
  assert.equal(d.available,false);assert.equal(d.reason,'daily');
  db.query=async()=>({rows:[{period_key:'d:2026-10-25',used:2},{period_key:'m:2026-10',used:100}]});
  const m=await worker.quotaStatus(new Date('2026-10-25T12:00:00Z'));
  assert.equal(m.available,false);assert.equal(m.reason,'monthly');
  db.query=async()=>({rows:[]});
  const ok=await worker.quotaStatus(new Date('2026-10-26T12:00:00Z'));
  assert.equal(ok.available,true);
  provider.budget=()=>({daily:0,monthly:100});
  assert.equal((await worker.quotaStatus()).reason,'disabled');
  provider.configured=()=>false;
  assert.equal((await worker.quotaStatus()).reason,'not_configured');
 }finally{db.query=oldQuery;provider.configured=oldConfigured;provider.budget=oldBudget;}
});

test('comparaciones guardadas aparecen en portada aunque no estén aprobadas para Google',async()=>{
 const oldQuery=db.query;
 try{
  db.query=async sql=>{
   if(sql.startsWith('SELECT slug,query_text,jsonb_array_length'))return {rows:[{slug:'iphone-12-abc',query_text:'iphone 12',offer_count:18}]};
   if(sql.startsWith('SELECT slug,query_text FROM marketplace_compare_pages WHERE'))return {rows:[]};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
  try{
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar');
   assert.equal(r.status,200);
   const html=await r.text();
   assert.match(html,/Comparaciones recientes/);
   assert.match(html,/\/comparar\/iphone-12-abc/);
   assert.match(html,/18 ofertas guardadas/);
   assert.doesNotMatch(html,/Todavía no hay comparaciones publicadas/);
   assert.doesNotMatch(html,/Páginas aprobadas para Google/,'sin ofertas elegibles no afirmar que están preparadas para indexación');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;}
});

test('cuota agotada: no ofrecer consultas directas y no cachear fracaso 24 horas',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus,oldReserve=worker.reserveQuota;
 const item={title:'iPhone 12 Azul',shop:'Wallapop',price_cents:10000,product_id:'12345678901234567',
  href:'https://www.google.com/search?udm=28&q=iPhone+12',condition:'Usado',internal:false};
 const slug=compare.slugFor('iphone 12');
 const hash=crypto.createHash('sha256').update([item.product_id,item.shop,item.title,String(item.price_cents)].join('|')).digest('hex');
 const now=new Date().toISOString();
 let deletions=0,credits=0;
 try{
  provider.configured=()=>false; // evita llamar al worker en GET de esta prueba
  worker.quotaStatus=async()=>({available:false,reason:'daily',daily:5,monthly:100,dailyUsed:5,monthlyUsed:5});
  worker.reserveQuota=async()=>{credits++;return false;};
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages'))return {rowCount:1,rows:[{
    id:6,slug,query_text:'iphone 12',provider_status:'ok',last_checked_at:now,created_at:now,
    external_results:[item],index_approved:false,editorial_summary:''
   }]};
   if(sql.startsWith('SELECT slug,external_results FROM marketplace_compare_pages'))return {rowCount:1,rows:[{slug,external_results:[item]}]};
   if(sql.startsWith('INSERT INTO marketplace_compare_merchant_links'))return {rowCount:1,rows:[{offer_key:hash}]};
   if(sql.startsWith('DELETE FROM marketplace_compare_merchant_links'))deletions++;
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const response=await fetch(base+'/comparar/'+slug),html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/Consultas externas agotadas por hoy/);
   assert.match(html,/Usado/);
   assert.match(html,/Buscar en Google/);
   assert.doesNotMatch(html,/Consultar enlace de la tienda/);
   const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
   const cookie=response.headers.get('set-cookie').split(';')[0];
   assert.ok(token&&cookie);
   provider.configured=()=>true; // prueba una pestaña antigua con POST válido
   const post=await fetch(base+'/comparar/tienda/'+slug+'/'+hash,{
    method:'POST',redirect:'manual',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:token}).toString()
   });
   assert.equal(post.status,200);
   assert.match(await post.text(),/límite compartido de consultas/);
   assert.equal(credits,1);
   assert.equal(deletions,1,'liberar el bloqueo de vendedor al renovarse la cuota');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;worker.reserveQuota=oldReserve;
 }
});
