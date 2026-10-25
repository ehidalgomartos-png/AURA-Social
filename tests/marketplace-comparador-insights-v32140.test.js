'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const insights=require('../src/services/marketplace-comparador-insights-v32140');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

const offer=(title,price,shop,extra={})=>({
 title,shop,price_cents:price,price_currency:'EUR',
 condition:'Consultar estado',href:'https://tienda.example/'+encodeURIComponent(shop),internal:false,...extra
});

test('agrupa capacidad, gama y estado sin inventar nuevos ni combinar usados',()=>{
 const results=insights.buildInsights('iphone 12',[
  offer('Apple iPhone 12 64 GB Negro - Usado',7800,'Tienda Uno',{condition:'Usado'}),
  offer('Apple iPhone 12 64GB Azul Segunda mano',10000,'Tienda Dos',{condition:'Consultar estado'}),
  offer('Apple iPhone 12 128 GB Reacondicionado',18000,'Tienda Tres',{condition:'Reacondicionado'}),
  offer('Apple iPhone 12 64GB Azul Segunda mano',10000,'Tienda Dos',{condition:'Consultar estado'}),
  offer('Apple iPhone 12 256GB Nuevo',32000,'Tienda Cuatro',{condition:'Nuevo'}),
  offer('Apple iPhone 12 64GB desconocido',9900,'Tienda Cinco',{condition:'Consultar estado'})
 ]);
 assert.equal(results.total,5,'el duplicado no cuenta dos veces');
 assert.equal(results.variants.length,4);
 const used=results.variants.find(x=>x.capacity==='64 GB'&&x.condition==='Usado');
 assert.ok(used);
 assert.equal(used.count,2);
 assert.equal(used.minCents,7800);
 assert.equal(used.shopCount,2);
 assert.deepEqual(used.colors,['azul','negro']);
 assert.equal(used.suggestedQuery,'iphone 12 64 GB');
 const other=results.variants.find(x=>x.condition==='Estado sin confirmar');
 assert.equal(other.count,1,'no etiquetar como nuevo lo que no se ha verificado');
 assert.equal(results.hasMixedVariants,true);
 assert.equal(results.hasUsedOrRefurbished,true);
 assert.equal(insights.conditionOf({title:'Reconditioned iPhone',condition:'Consultar estado'}),'Estado sin confirmar');
 assert.equal(insights.conditionOf({title:'iPhone 12 - refurbished',condition:'Consultar estado'}),'Reacondicionado');
});
test('enlaces de búsqueda refinada no crean URLs permanentes por sí mismos',()=>{
 const group=insights.buildInsights('iphone 12',[offer('iPhone 12 128GB Azul',16000,'A')]).variants[0];
 assert.equal(group.suggestedQuery,'iphone 12 128 GB');
 assert.equal(insights.suggestedQuery('iphone 12 128 GB',{cap:'128gb',edition:'base'}),null);
 assert.equal(insights.suggestedQuery('iphone 12',{cap:'unknown',edition:'base'}),null);
 assert.equal(insights.suggestedQuery('iphone 12',{cap:'256gb',edition:'pro'}),null);
 assert.equal(insights.safeOffer(offer('Test',100,'A',{price_currency:'USD'})),false);
});
const exact=()=>['Tienda A','Tienda B','Tienda C'].map((shop,i)=>offer('Apple iPhone 17 Pro 256 GB Negro',90100+i*1400,shop,{href:'https://'+(i+1)+'.example/product'}));

test('el historial solo registra precios del mismo modelo con tres comercios directos',()=>{
 const page={id:123,query_text:'iphone 17 pro 256 GB'};
 const same=insights.verifiedSnapshot(page,exact(),new Date('2026-10-25T23:30:00Z'));
 assert.ok(same);
 assert.equal(same.day,'2026-10-26','la fecha diaria es Europe/Madrid');
 assert.equal(same.lowCents,90100);
 assert.equal(same.highCents,92900);
 assert.equal(same.shopCount,3);
 const mismatched=exact();
 mismatched[2]={...mismatched[2],title:'Apple iPhone 17 Pro Max 256 GB Negro'};
 assert.equal(insights.verifiedSnapshot(page,mismatched,new Date('2026-10-25T12:00:00Z')),null);
 assert.equal(insights.verifiedSnapshot({...page,query_text:'iphone 17'},exact(),new Date('2026-10-25T12:00:00Z')),null);
 assert.equal(insights.verifiedSnapshot(page,exact().slice(0,2),new Date('2026-10-25T12:00:00Z')),null);
});
test('worker actualiza un máximo de un snapshot por día, sin SerpApi extra',async()=>{
 const oldQuery=db.query;
 const writes=[];
 try{
  db.query=async(sql,args=[])=>{writes.push([sql,args]);return {rowCount:1,rows:[]};};
  assert.equal(await worker.recordVerifiedHistory({id:123,query_text:'iphone 17 pro 256 GB'},exact(),new Date('2026-10-25T23:30:00Z')),true);
  assert.equal(writes.length,1);
  assert.match(writes[0][0],/ON CONFLICT\(page_id,checked_day\)/);
  assert.deepEqual(writes[0][1],[123,'2026-10-26',90100,92900,3,3]);
  writes.length=0;
  assert.equal(await worker.recordVerifiedHistory({id:123,query_text:'iphone'},exact()),false);
  assert.equal(writes.length,0,'no guardar rangos de distintas variantes');
 }finally{db.query=oldQuery;}
});

test('HTML público ofrece versiones y precios verificados, pero no declara SEO apto de forma ficticia',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;
 const now=new Date().toISOString(),slug=compare.slugFor('iphone 12');
 const page={id:55,slug,query_text:'iphone 12',created_at:now,last_checked_at:now,updated_at:now,
  provider_status:'ok',index_approved:false,seo_blocked:false,editorial_summary:'',
  external_results:[
   offer('Apple iPhone 12 64GB Azul - Usado',7800,'Vendedor A',{condition:'Usado'}),
   offer('Apple iPhone 12 64GB Negro - Usado',10000,'Vendedor B',{condition:'Usado'}),
   offer('Apple iPhone 12 128GB Reacondicionado',18000,'Tienda C',{condition:'Reacondicionado'})
  ]
 };
 try{
  provider.configured=()=>false;
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[page]};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.match(html,/Versiones encontradas/);
   assert.match(html,/64 GB · Usado/);
   assert.match(html,/128 GB · Reacondicionado/);
   assert.match(html,/Desde 78,00/);
   assert.match(html,/Comparar esta capacidad/);
   assert.match(html,/href="\/comparar\?q=iphone%2012%2064%20GB"/);
   assert.doesNotMatch(html,/Una búsqueda crea una página permanente/);
   assert.doesNotMatch(html,/Evolución de precios verificados/,'no mostrar evolución sin al menos dos datos históricos');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});
test('los gráficos y fichas de historial solo aparecen con mediciones históricas suficientes',()=>{
 const styles=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(styles,/compare-variant-grid/);
 assert.match(styles,/compare-history/);
 assert.match(styles,/@media\(max-width:570px\)/);
 assert.match(source,/if\(rows.length<2\)return '';/);
 assert.match(source,/checked_day>=CURRENT_DATE-INTERVAL '180 days'/);
});
