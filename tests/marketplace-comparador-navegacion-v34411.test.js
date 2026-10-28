'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

const q='iphone 12 128 GB';
const offers=['Tienda A','Tienda B','Tienda C','Tienda D','Tienda E'].map((shop,i)=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents:17500+i*1000,
 price_currency:'EUR',condition:'Reacondicionado',internal:false,
 href:'https://tienda-'+String(i+1)+'.example/producto/iphone-12'
}));
function offerKey(o){
 return crypto.createHash('sha256').update([
  String(o.product_id||''),String(o.shop||''),String(o.title||''),String(o.price_cents||'')
 ].join('|')).digest('hex');
}
async function render(data){
 const old=db.query,configured=provider.configured,quota=worker.quotaStatus;
 const sql=[],slug=compare.slugFor(q);
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async stmt=>{
   sql.push(stmt);
   if(stmt.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:880,slug,query_text:q,external_results:data,
     last_checked_at:new Date().toISOString(),provider_status:'ok',
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:r.status,html:await r.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;worker.quotaStatus=quota;}
}

test('cinco ofertas crean accesos internos en ambas direcciones sin alterar precios ni tarjetas',async()=>{
 const {status,html,sql}=await render(offers);
 assert.equal(status,200);
 const expected='#oferta-'+offerKey(offers[0]);
 assert.match(html,/data-direct-filter id="filtros-ofertas"/);
 assert.match(html,new RegExp('data-first-visible-link href="'+expected+'"'));
 assert.match(html,/Ir a la primera oferta visible/);
 assert.match(html,/class="cmp-offer-return-nav" aria-label="Moverse por las ofertas"/);
 assert.match(html,/href="#filtros-ofertas">Volver a filtros/);
 assert.match(html,/href="#precios-y-tiendas">Inicio de las ofertas/);
 assert.equal((html.match(/<li class="offer"/g)||[]).length,5);
 assert.match(html,/Desde 175,00/);
 assert.ok(html.indexOf('data-primary-offers')<html.indexOf('cmp-offer-return-nav'));
 assert.equal(sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});
test('una lista corta no añade navegación ni ocupa espacio en móvil',async()=>{
 const {status,html}=await render(offers.slice(0,3));
 assert.equal(status,200);
 assert.doesNotMatch(html,/data-first-visible-link|cmp-offer-return-nav|id="filtros-ofertas"/);
 assert.equal((html.match(/<li class="offer"/g)||[]).length,3);
});

function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 const handlers={click:[],change:[]};
 const document={querySelector:()=>null,addEventListener:(name,cb)=>handlers[name]?.push(cb)};
 const ctx={document};
 vm.runInNewContext(source,ctx,{filename:'comparador-v32135.js',timeout:1000});
 const prices=[17500,18500,19500,20500,21500];
 const items=prices.map((price,i)=>({
  id:'oferta-'+i,hidden:false,matches:x=>x==='li.offer',
  dataset:{offerAccess:i%2?'direct':'alternate',offerCondition:i<2?'usado':'reacondicionado',
   offerCapacity:'128gb',offerPriceCents:String(price)}
 }));
 const jump={hidden:false,href:'#oferta-0',setAttribute(k,v){if(k==='href')this.href=v}};
 const status={hidden:true,textContent:''},note={hidden:true},reset={hidden:true};
 const condition={value:'all'},capacity={value:'all'};
 const options=['all','direct'].map(choice=>({
  choice,pressed:choice==='all',
  setAttribute(name,value){if(name==='aria-pressed')this.pressed=value==='true';},
  getAttribute(name){return name==='data-access-choice'?this.choice:null;}
 }));
 const toolbar={dataset:{},nextElementSibling:{matches:x=>x==='[data-primary-offers]',children:items},
  querySelector(selector){return {
   '[data-condition-filter]':condition,'[data-capacity-filter]':capacity,
   '[data-filter-results]':status,'[data-access-note]':note,
   '[data-clear-comparison-filters]':reset,'[data-first-visible-link]':jump
  }[selector]||null;},
  querySelectorAll(selector){return {
   '[data-access-choice]':options,'[data-condition-filter],[data-capacity-filter]':[condition,capacity]
  }[selector]||[];}
 };
 reset.closest=x=>x==='[data-direct-filter]'?toolbar:null;
 return {ctx,handlers,items,jump,toolbar,status,note,reset,condition,capacity,options};
}

test('el salto se actualiza a la primera oferta VISIBLE al cambiar y combinar filtros',()=>{
 const f=fixture();
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.jump.href,'#oferta-0');
 assert.equal(f.jump.hidden,false);
 f.toolbar.dataset.activeAccess='direct';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.jump.href,'#oferta-1');
 assert.equal(f.items.filter(x=>!x.hidden).length,2);
 f.condition.value='reacondicionado';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.jump.href,'#oferta-3');
 assert.match(f.status.textContent,/mínimo visible: 205,00/);
 f.capacity.value='256gb';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.items.filter(x=>!x.hidden).length,0);
 assert.equal(f.jump.hidden,true,'no navegar a una oferta filtrada y oculta');
 assert.doesNotMatch(f.status.textContent,/mínimo visible/);
});

test('al quitar filtros vuelve el enlace al primer anuncio, sin llamadas de red ni recargas',()=>{
 const f=fixture();
 f.toolbar.dataset.activeAccess='direct';
 f.capacity.value='256gb';
 f.ctx.applyComparisonFilters(f.toolbar);
 assert.equal(f.jump.hidden,true);
 const handler=f.handlers.click.find(cb=>cb.toString().includes('data-clear-comparison-filters'));
 assert.ok(handler);
 handler({target:{closest:()=>f.reset}});
 assert.equal(f.jump.href,'#oferta-0');
 assert.equal(f.jump.hidden,false);
 assert.equal(f.reset.hidden,true);
 assert.equal(f.toolbar.dataset.activeAccess,'all');
 assert.equal(f.items.filter(x=>!x.hidden).length,5);
 assert.deepEqual(f.options.map(x=>x.pressed),[true,false]);
});

test('enlaces accesibles, CSS táctil y sin ocultación de tarjetas por la navegación',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/V3\.4\.4\.11/);
 assert.match(css,/\.cmp-first-visible-link:focus-visible/);
 assert.match(css,/\.cmp-offer-return-nav a:focus-visible/);
 assert.match(css,/\.cmp-first-visible-link\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 const section=css.split('/* V3.4.4.2 — pulido mobile-first')[1];
 assert.doesNotMatch(section,/display:\s*none|pointer-events:\s*none|visibility:\s*hidden/);
});
