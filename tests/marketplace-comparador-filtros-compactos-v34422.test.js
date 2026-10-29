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

const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const q='iphone 12 128 GB';
const offers=['Usado','Nuevo','Reacondicionado','Usado','Nuevo'].map((condition,i)=>({
 title:'Apple iPhone 12 128 GB Negro',shop:'Tienda '+(i+1),
 price_cents:17000+i*1200,price_currency:'EUR',condition,internal:false,
 href:'https://tienda-'+(i+1)+'.example/p/iphone-12-128'
}));
async function render(data){
 const old=db.query,configured=provider.configured,quota=worker.quotaStatus,sql=[];
 try{
  provider.configured=()=>false;worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  const slug=compare.slugFor(q);
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:881,slug,query_text:q,external_results:data,
     last_checked_at:new Date().toISOString(),provider_status:'ok',
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:res.status,html:await res.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=configured;worker.quotaStatus=quota;}
}
test('cinco ofertas tienen filtros avanzados nativos plegados sin ocultar acceso directo ni navegación',async()=>{
 const {status,html,sql}=await render(offers);
 assert.equal(status,200);
 assert.match(html,/<details class="cmp-advanced-filters" data-advanced-filters><summary>Más filtros <span data-advanced-summary>Estado y capacidad<\/span><\/summary>/);
 assert.match(html,/<div class="cmp-facet-group">/);
 assert.match(html,/data-condition-filter/);
 assert.match(html,/data-first-visible-link href="#oferta-[a-f0-9]{64}"/);
 assert.match(html,/href="#filtros-ofertas">Volver a filtros/);
 assert.ok(html.indexOf('data-access-choice="all"')<html.indexOf('data-advanced-filters'));
 assert.ok(html.indexOf('</details>')<html.indexOf('data-primary-offers'));
 assert.equal((html.match(/<li class="offer"/g)||[]).length,5);
 assert.equal(sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});
test('en listados cortos los selectores continúan visibles y no aparece un panel extra',async()=>{
 const {status,html}=await render(offers.slice(0,3));
 assert.equal(status,200);
 assert.doesNotMatch(html,/data-advanced-filters|data-advanced-summary/);
 assert.match(html,/class="cmp-facet-group"/);
 assert.match(html,/data-condition-filter/);
});
test('el estado del panel se conserva cuando se refrescan los resultados',()=>{
 const block=source.split('const previousToolbar=')[1]?.split('root.dataset.comparisonStatus=status.dataset.comparisonStatus')[0];
 assert.ok(block);
 assert.match(block,/advancedOpen:previousToolbar\.querySelector\?\.\('\[data-advanced-filters\]'\)\?\.open===true/);
 assert.match(block,/advancedPanel\.open=previousFilters\.advancedOpen/);
 assert.match(block,/applyComparisonFilters\(toolbar\)/);
 assert.match(block,/preventScroll:true/);
 assert.doesNotMatch(block,/\bfetch\(|serpapi|marketplace_compare_provider_usage|price_cents\s*=/i);
});
test('actualiza el contador de filtros avanzados sin modificar precios ni llamadas de red',()=>{
 const ctx={document:{querySelector:()=>null,addEventListener:()=>{}}};
 vm.runInNewContext(source,ctx,{filename:'comparador-v32135.js',timeout:1000});
 const items=[{id:'oferta-1',matches:s=>s==='li.offer',hidden:false,
  dataset:{offerAccess:'direct',offerCondition:'usado',offerCapacity:'128gb',offerPriceCents:'19900'}}];
 const condition={value:'all'},capacity={value:'all'},summary={textContent:''};
 const status={hidden:true,textContent:''},note={hidden:true},reset={hidden:true};
 const toolbar={dataset:{activeAccess:'all'},nextElementSibling:{matches:s=>s==='[data-primary-offers]',children:items},
  querySelector(s){return ({
   '[data-condition-filter]':condition,'[data-capacity-filter]':capacity,
   '[data-advanced-summary]':summary,'[data-filter-results]':status,
   '[data-access-note]':note,'[data-clear-comparison-filters]':reset
  })[s]||null;}
 };
 ctx.applyComparisonFilters(toolbar);
 assert.equal(summary.textContent,'Estado y capacidad');
 condition.value='usado';
 ctx.applyComparisonFilters(toolbar);
 assert.equal(summary.textContent,'1 filtro activo');
 capacity.value='128gb';
 ctx.applyComparisonFilters(toolbar);
 assert.equal(summary.textContent,'2 filtros activos');
 assert.equal(items[0].hidden,false);
 assert.match(status.textContent,/mínimo visible: 199,00/);
});
test('estilo táctil accesible y diseño responsive sin overlay de filtros',()=>{
 const section=css.split('/* V3.4.4.22 — filtros avanzados plegables')[1];
 assert.ok(section);
 assert.match(section,/>summary:focus-visible/);
 assert.match(section,/min-height:44px/);
 assert.match(section,/min-height:46px/);
 assert.match(section,/@media\(max-width:620px\)/);
 assert.match(section,/@media\(max-width:380px\)/);
 assert.doesNotMatch(section,/position:fixed|position:sticky|display:none|pointer-events:none/);
});
