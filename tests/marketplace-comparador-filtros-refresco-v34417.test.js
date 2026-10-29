'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const offer=(price,access,condition,capacity)=>({
 id:'oferta-'+price,hidden:false,matches:s=>s==='li.offer',
 dataset:{offerPriceCents:String(price),offerAccess:access,offerCondition:condition,offerCapacity:capacity}
});
const initialOffers=[
 offer(12000,'direct','usado','128gb'),
 offer(14000,'alternate','usado','256gb'),
 offer(18000,'direct','nuevo','128gb')
];
const changedOffers=[
 offer(11500,'direct','usado','128gb'),
 offer(13000,'alternate','usado','128gb'),
 offer(17000,'direct','nuevo','256gb')
];

function browser({initial=initialOffers,next=changedOffers,initialOptions={},nextOptions={},focused=null}={}){
 const state={requests:0,scrolls:0,focusCalls:[],events:[]};
 const listeners=new Map();
 const document={
  hidden:false,activeElement:null,
  querySelector(selector){
   if(selector==='[data-comparison-status]')return status;
   if(selector==='[data-comparison-results]')return results;
   return null;
  },
  getElementById:()=>null,
  addEventListener(type,handler){
   listeners.set(type,[...(listeners.get(type)||[]),handler]);
  },
  dispatchEvent(event){
   state.events.push(event.type);
   for(const handler of listeners.get(event.type)||[])handler(event);
  }
 };
 const control=(type,selector,value,options,toolbar)=>({
  _toolbar:toolbar,kind:type,selector,value,options:(options||[]).map(v=>({value:v})),
  hidden:false,disabled:false,
  matches(s){return s===selector;},
  focus(opts){state.focusCalls.push({selector,opts});document.activeElement=this;}
 });
 function makeToolbar(items,opts){
  if(items.length<2)return null;
  const options={conditions:['all','usado','nuevo'],capacities:['all','128gb','256gb'],direct:true,...opts};
  const t={dataset:{activeAccess:'all'},nextElementSibling:{
    matches:s=>s==='[data-primary-offers]',children:items
  },
   contains(el){return Boolean(el&&el._toolbar===this);},
   querySelector(selector){
    if(selector==='[data-condition-filter]')return this.condition;
    if(selector==='[data-capacity-filter]')return this.capacity;
    if(selector==='[data-filter-results]')return this.filterStatus;
    if(selector==='[data-access-note]')return this.accessNote;
    if(selector==='[data-clear-comparison-filters]')return this.reset;
    if(selector==='[data-first-visible-link]')return this.jump;
    if(selector==='[data-access-choice="direct"]')return this.buttons.find(b=>b.kind==='direct')||null;
    if(selector==='[data-access-choice="all"]')return this.buttons.find(b=>b.kind==='all')||null;
    return null;
   },
   querySelectorAll(selector){
    if(selector==='[data-access-choice]')return this.buttons;
    if(selector==='[data-condition-filter],[data-capacity-filter]')return [this.condition,this.capacity];
    return [];
   }
  };
  t.condition=control('condition','[data-condition-filter]','all',options.conditions,t);
  t.capacity=control('capacity','[data-capacity-filter]','all',options.capacities,t);
  t.buttons=['all',...(options.direct?['direct']:[])].map(kind=>({
    _toolbar:t,kind,hidden:false,disabled:false,
    matches:s=>s==='[data-access-choice]',
    getAttribute:name=>name==='data-access-choice'?kind:null,
    setAttribute(name,value){if(name==='aria-pressed')this.pressed=value;},
    focus(opts){state.focusCalls.push({selector:'[data-access-choice="'+kind+'"]',opts});document.activeElement=this;}
  }));
  t.buttons[0].pressed='true';
  t.filterStatus={hidden:true,textContent:''};
  t.accessNote={hidden:true};
  t.reset=control('reset','[data-clear-comparison-filters]','',[],t);t.reset.hidden=true;
  t.jump={hidden:false,setAttribute(name,value){if(name==='href')this.href=value;}};
  return t;
 }
 const status={dataset:{comparisonStatus:'checking'},innerHTML:'Cargando'};
 const results={
  _innerHTML:'Inicial',toolbar:makeToolbar(initial,initialOptions),
  get innerHTML(){return this._innerHTML;},
  set innerHTML(html){
   this._innerHTML=html;this.toolbar=makeToolbar(next.map(o=>({...o,hidden:false})),nextOptions);
  },
  querySelector(selector){return selector==='[data-direct-filter]'?this.toolbar:null;}
 };
 const page={
  querySelector(selector){
   if(selector==='[data-comparison-results]')return {innerHTML:'Ofertas nuevas'};
   if(selector==='[data-comparison-status]')return {dataset:{comparisonStatus:'ok'},innerHTML:'Completado'};
   return null;
  }
 };
 let refresh;
 const ctx={
  document,window:{addEventListener:()=>{}},
  location:{hash:'',href:'https://redlibertad.com/comparar/ejemplo',pathname:'/comparar/ejemplo'},
  navigator:{},URL,
  Event:class{constructor(type){this.type=type;}},
  DOMParser:class{parseFromString(){return page;}},
  fetch:async()=>{state.requests++;return {ok:true,text:async()=>'<html></html>'};},
  setInterval(fn){refresh=fn;return 101;},clearInterval:()=>{}
 };
 vm.runInNewContext(source,ctx,{filename:'comparador-v32135.js',timeout:1000});
 const old=results.toolbar;
 if(old&&focused)document.activeElement=old[focused]||old.buttons.find(b=>b.kind===focused)||null;
 return {state,document,results,old,refresh:async()=>{
  assert.equal(typeof refresh,'function');
  await refresh();
 }};
}
test('conserva la combinación de acceso, estado y capacidad al llegar precios nuevos',async()=>{
 const b=browser();
 b.old.dataset.activeAccess='direct';
 b.old.condition.value='usado';
 b.old.capacity.value='128gb';
 await b.refresh();
 const t=b.results.toolbar;
 assert.equal(t.dataset.activeAccess,'direct');
 assert.equal(t.condition.value,'usado');
 assert.equal(t.capacity.value,'128gb');
 assert.deepEqual(t.buttons.map(x=>x.pressed),['false','true']);
 assert.equal(t.nextElementSibling.children.filter(o=>!o.hidden).length,1);
 assert.match(t.filterStatus.textContent,/1 de 3 ofertas visibles/);
 assert.match(t.filterStatus.textContent,/mínimo visible: 115,00/);
 assert.equal(b.state.requests,1,'solo la solicitud de refresco ya existente');
});
test('deja el mínimo general intacto en el servidor y recalcula solo el mínimo visible local',async()=>{
 const b=browser();
 b.old.capacity.value='256gb';
 await b.refresh();
 assert.equal(b.results.toolbar.nextElementSibling.children.filter(o=>!o.hidden).length,1);
 assert.match(b.results.toolbar.filterStatus.textContent,/mínimo visible: 170,00/);
 assert.equal(b.state.requests,1);
});
test('retira selecciones obsoletas cuando desaparecen las opciones disponibles',async()=>{
 const b=browser({nextOptions:{direct:false,conditions:['all','nuevo'],capacities:['all','256gb']}});
 b.old.dataset.activeAccess='direct';
 b.old.condition.value='usado';
 b.old.capacity.value='128gb';
 await b.refresh();
 const t=b.results.toolbar;
 assert.equal(t.dataset.activeAccess,'all');
 assert.equal(t.condition.value,'all');
 assert.equal(t.capacity.value,'all');
 assert.equal(t.filterStatus.hidden,true);
 assert.equal(t.nextElementSibling.children.filter(o=>!o.hidden).length,3);
});
test('conserva el foco del selector en móvil sin desplazar la pantalla',async()=>{
 const b=browser({focused:'condition'});
 b.old.condition.value='usado';
 await b.refresh();
 const t=b.results.toolbar;
 assert.equal(b.document.activeElement,t.condition);
 assert.equal(b.state.focusCalls.length,1);
 assert.equal(b.state.focusCalls[0].opts.preventScroll,true);
});
test('no busca dónde enfocar si el usuario estaba fuera de los resultados',async()=>{
 const b=browser();
 b.document.activeElement={};
 await b.refresh();
 assert.equal(b.state.focusCalls.length,0);
});
test('el refresco admite una lista que pasa de una oferta a varias sin filtros previos',async()=>{
 const b=browser({initial:[initialOffers[0]],next:changedOffers});
 assert.equal(b.old,null);
 await b.refresh();
 assert.ok(b.results.toolbar);
 assert.equal(b.results.toolbar.dataset.activeAccess,'all');
 assert.equal(b.results.toolbar.filterStatus.hidden,true);
});
test('si la nueva lista ya no permite filtrar, no deja selecciones antiguas ni rompe el refresco',async()=>{
 const b=browser({next:[changedOffers[0]]});
 b.old.condition.value='usado';
 await b.refresh();
 assert.equal(b.results.toolbar,null);
 assert.equal(b.state.requests,1);
 assert.ok(b.state.events.includes('comparison:results-updated'));
});
test('contrato de filtrado solo local: sin nuevas consultas ni modificación de precios comerciales',()=>{
 const block=source.split('// V3.4.4.17: conservar la selección local')[1]
  ?.split('root.dataset.comparisonStatus=status.dataset.comparisonStatus')[0];
 assert.ok(block,'el bloque del refresco debe restaurar filtros después de sustituir el HTML');
 assert.match(block,/applyComparisonFilters\(toolbar\)/);
 assert.match(block,/preventScroll:true/);
 assert.doesNotMatch(block,/\bfetch\(|serpapi|marketplace_compare_provider_usage|\.price_cents\s*=/i);
});
