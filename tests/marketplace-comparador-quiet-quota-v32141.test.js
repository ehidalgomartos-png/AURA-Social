'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('presupuesto gratuito por defecto de 12/día, 220/mes, reserva de 30',()=>{
 assert.deepEqual(provider.budget({}),{daily:12,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'8',COMPARADOR_MONTHLY_LIMIT:'180'}),{daily:8,monthly:180});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'90',COMPARADOR_MONTHLY_LIMIT:'250'}),{daily:50,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'0',COMPARADOR_MONTHLY_LIMIT:'0'}),{daily:0,monthly:0});
});

test('administración muestra presupuesto interno, no se muestra en público',()=>{
 const html=compare.seoAdminView([], 'c'.repeat(48), 'todas',{
  daily:12,monthly:220,dailyUsed:6,monthlyUsed:7,available:true
 });
 assert.match(html,/Consultas del comparador/);
 assert.match(html,/6 \/ 12/);
 assert.match(html,/7 \/ 220/);
 assert.match(html,/Presupuesto interno de RedLibertad/);
 assert.match(html,/SerpApi/);
});

test('comparación sin ofertas presenta un único estado amistoso, sin detalles de cuota ni falsos precios',async()=>{
 const old=db.query,configured=provider.configured;
 const slug=compare.slugFor('iphone 12 128 GB');
 const now=new Date().toISOString();
 try{
  provider.configured=()=>false; // no encola ni consume proveedor en este test
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
    id:32,slug,query_text:'iphone 12 128 GB',provider_status:'limit_reached',
    last_checked_at:now,created_at:now,editorial_summary:'',external_results:[],
    index_approved:false,seo_blocked:false
   }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await r.text();
   assert.equal(r.status,200);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.match(html,/Las búsquedas externas están temporalmente en pausa/);
   assert.match(html,/no tenemos ofertas verificadas que mostrar/);
   assert.match(html,/Ver otras comparaciones/);
   assert.equal((html.match(/class="compare-awaiting"/g)||[]).length,1);
   assert.match(html,/data-comparison-results/,'el sondeo del navegador conserva el destino');
   assert.doesNotMatch(html,/<h2>Estamos preparando esta comparación<\/h2>|compare-awaiting-spinner/);
   assert.doesNotMatch(html,/Límite de consultas|consultas externas|cuota|SerpApi|Actualizado:/i);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;}
});

test('cuando hay precios guardados no se informa del límite privado',async()=>{
 const old=db.query,configured=provider.configured,status=worker.quotaStatus;
 const slug=compare.slugFor('iphone 12');
 const now=new Date().toISOString();
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'daily',daily:12,monthly:220,dailyUsed:12,monthlyUsed:12});
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
    id:52,slug,query_text:'iphone 12',provider_status:'limit_reached',
    last_checked_at:now,created_at:now,editorial_summary:'',index_approved:false,seo_blocked:false,
    external_results:[{title:'iPhone 12 64GB Azul',shop:'Wallapop',price_cents:7900,price_currency:'EUR',
      href:'https://www.google.com/search?q=iphone12&udm=28',condition:'Usado',product_id:'1234567890123'}]
   }]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await r.text();
   assert.equal(r.status,200);
   assert.match(html,/79,00/);
   assert.match(html,/Buscar en Google/);
   assert.doesNotMatch(html,/cuota|agotad|límite|SerpApi/i);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;worker.quotaStatus=status;}
});

test('comparación vacía bloqueada por cuota reintenta al renovarse aunque el estado anterior sea reciente',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldBudget=provider.budget;
 try{
  provider.configured=()=>true;provider.budget=()=>({daily:12,monthly:220});
  const calls=[];
  db.query=async(sql,args=[])=>{
   calls.push([sql,args]);
   if(sql.startsWith('SELECT period_key,used'))return {rows:[]};
   if(sql.includes('RETURNING page_id'))return {rowCount:1,rows:[{page_id:51}]};
   return {rowCount:0,rows:[]};
  };
  const empty={id:51,provider_status:'limit_reached',external_results:[],last_checked_at:new Date().toISOString()};
  assert.equal(await worker.enqueue(empty,async()=>{}),true);
  assert.ok(calls.some(x=>x[0].includes("provider_status='limit_reached' AND jsonb_array_length(external_results)=0")));
  calls.length=0;
  db.query=async(sql,args=[])=>{
   calls.push([sql,args]);
   if(sql.startsWith('SELECT period_key,used')){
    const now=worker.periodKeys(new Date());
    return {rows:[{period_key:now.day,used:12},{period_key:now.month,used:12}]};
   }
   return {rowCount:0,rows:[]};
  };
  assert.equal(await worker.enqueue(empty,async()=>{}),false);
  assert.ok(!calls.some(x=>x[0].includes('INSERT INTO marketplace_compare_jobs')));
 }finally{db.query=oldQuery;provider.configured=oldConfigured;provider.budget=oldBudget;}
});
