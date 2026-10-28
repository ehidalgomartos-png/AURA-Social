'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

const q='iphone 12';
const offers=[
 {title:'Apple iPhone 12 128 GB',shop:'Vendedor Usado',price_cents:15000,
  price_currency:'EUR',condition:'Usado',href:'https://www.google.com/search?q=iphone+12',internal:false},
 {title:'Apple iPhone 12 256 GB',shop:'Tienda Reacondicionados',price_cents:21000,
  price_currency:'EUR',condition:'Reacondicionado',href:'https://tienda-a.example/p/iphone',internal:false},
 {title:'Apple iPhone 12 256 GB',shop:'Tienda Nuevos',price_cents:23000,
  price_currency:'EUR',condition:'Nuevo',href:'https://tienda-b.example/p/iphone',internal:false}
];

test('la ficha conserva el mínimo general y expone los precios de tarjetas en céntimos, sin llamadas de pago',async()=>{
 const old=db.query,configured=provider.configured,quota=worker.quotaStatus;
 const sql=[],slug=compare.slugFor(q);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:701,slug,query_text:q,external_results:offers,
     last_checked_at:new Date().toISOString(),provider_status:'ok',index_approved:false,
     seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/Desde 150,00/);
   assert.match(html,/data-filter-results hidden/);
   assert.match(html,/data-clear-comparison-filters hidden>Quitar filtros/);
   assert.match(html,/data-offer-access="alternate" data-offer-condition="usado" data-offer-capacity="128gb" data-offer-price-cents="15000"/);
   assert.match(html,/data-offer-access="direct" data-offer-condition="reacondicionado" data-offer-capacity="256gb" data-offer-price-cents="21000"/);
   assert.match(html,/data-offer-access="direct" data-offer-condition="nuevo" data-offer-capacity="256gb" data-offer-price-cents="23000"/);
   assert.equal((html.match(/data-offer-price-cents=/g)||[]).length,3);
   assert.equal(sql.some(x=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(x)),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;worker.quotaStatus=quota;}
});

function fixture(){
 const handlers={click:[],change:[]};
 const doc={querySelector:()=>null,addEventListener:(name,fn)=>handlers[name]?.push(fn)};
 const ctx={document:doc};
 const src=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 vm.runInNewContext(src,ctx,{filename:'comparador-v32135.js',timeout:1000});
 const items=[
  ['alternate','usado','128gb','15000'],['direct','reacondicionado','256gb','21000'],
  ['direct','nuevo','256gb','23000']
 ].map(values=>({dataset:Object.fromEntries(['offerAccess','offerCondition','offerCapacity','offerPriceCents']
  .map((key,i)=>[key,values[i]])),hidden:false,matches:q=>q==='li.offer'}));
 const status={hidden:true,textContent:''},note={hidden:true},reset={hidden:true};
 const condition={value:'all'},capacity={value:'all'};
 const options=['all','direct'].map(choice=>({
  choice,pressed:choice==='all',
  setAttribute(name,val){if(name==='aria-pressed')this.pressed=val==='true';},
  getAttribute(name){return name==='data-access-choice'?this.choice:null;}
 }));
 const toolbar={dataset:{},nextElementSibling:{matches:q=>q==='[data-primary-offers]',children:items},
  querySelector(q){
   return {'[data-condition-filter]':condition,'[data-capacity-filter]':capacity,
    '[data-access-note]':note,'[data-filter-results]':status,
    '[data-clear-comparison-filters]':reset}[q]||null;
  },
  querySelectorAll(q){
   return {'[data-access-choice]':options,
    '[data-condition-filter],[data-capacity-filter]':[condition,capacity]}[q]||[];
  }
 };
 reset.closest=q=>q==='[data-direct-filter]'?toolbar:null;
 return {ctx,handlers,items,toolbar,status,note,reset,condition,capacity,options};
}

test('el mínimo visible cambia con filtros de acceso, capacidad y condición; el precio original no cambia',()=>{
 const f=fixture();
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.status.hidden,true);
 assert.equal(f.reset.hidden,true);
 f.toolbar.dataset.activeAccess='direct';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.items.filter(x=>!x.hidden).length,2);
 assert.match(f.status.textContent,/2 de 3 ofertas visibles/);
 assert.match(f.status.textContent,/mínimo visible: 210,00/);
 assert.equal(f.note.hidden,false);
 assert.equal(f.reset.hidden,false);
 f.condition.value='nuevo';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.items.filter(x=>!x.hidden).length,1);
 assert.match(f.status.textContent,/mínimo visible: 230,00/);
 f.capacity.value='128gb';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.items.filter(x=>!x.hidden).length,0);
 assert.match(f.status.textContent,/0 de 3 ofertas visibles/);
 assert.match(f.status.textContent,/Ninguna coincide/);
 assert.doesNotMatch(f.status.textContent,/mínimo visible/);
 assert.deepEqual(f.items.map(i=>i.dataset.offerPriceCents),['15000','21000','23000']);
});

test('Quitar filtros restablece selecciones, tarjetas y botones sin recargar ni consultar APIs',()=>{
 const f=fixture();
 f.toolbar.dataset.activeAccess='direct';f.condition.value='nuevo';f.capacity.value='128gb';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.items.filter(x=>!x.hidden).length,0);
 const resetHandler=f.handlers.click.find(fn=>fn.toString().includes('data-clear-comparison-filters'));
 assert.ok(resetHandler);
 resetHandler({target:{closest:()=>f.reset}});
 assert.equal(f.toolbar.dataset.activeAccess,'all');
 assert.equal(f.condition.value,'all');
 assert.equal(f.capacity.value,'all');
 assert.equal(f.items.filter(i=>!i.hidden).length,3);
 assert.equal(f.reset.hidden,true);
 assert.equal(f.status.hidden,true);
 assert.equal(f.note.hidden,true);
 assert.deepEqual(f.options.map(o=>o.pressed),[true,false]);
});

test('no calcular mínimo falso cuando falta el dato y estilos de reset adaptados a móvil',()=>{
 const f=fixture();f.items[0].dataset.offerPriceCents='';f.items[1].dataset.offerPriceCents='NaN';
 f.toolbar.dataset.activeAccess='all';f.condition.value='usado';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.match(f.status.textContent,/1 de 3 ofertas visibles/);
 assert.doesNotMatch(f.status.textContent,/mínimo visible|0,00/);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/\.cmp-filter-reset\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.cmp-filter-reset\{width:100%;min-height:46px\}/);
});
