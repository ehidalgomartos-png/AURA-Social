'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const HASH='#oferta-'+'a'.repeat(64);

function browser({hash=HASH,hasCard=true,status='ok',access='alternate',filtered=false}={}){
 const state={requests:0,scrolls:0,focused:0,notice:null};
 const listeners=new Map();
 const location={hash,pathname:'/comparar/ejemplo',href:'https://redlibertad.com/comparar/ejemplo'};
 const offerLink={focus(opts){state.focused++;assert.equal(opts.preventScroll,true);}};
 const item={
  id:HASH.slice(1),hidden:false,
  dataset:{offerAccess:access,offerCondition:'usado',offerCapacity:'128gb',offerPriceCents:'19000'},
  matches:s=>s==='li.offer',
  closest:s=>s==='[data-primary-offers]'?list:null,
  querySelector:s=>s==='a.offer-link'?offerLink:null,
  scrollIntoView(){state.scrolls++;}
 };
 const list={children:[item],matches:s=>s==='[data-primary-offers]'};
 const choices=['all','direct'].map(value=>({
  getAttribute:s=>s==='data-access-choice'?value:null,
  setAttribute(s,v){if(s==='aria-pressed')this.pressed=v;}
 }));
 const condition={value:'all'},capacity={value:'all'};
 const note={hidden:true},result={hidden:true,textContent:''};
 const reset={hidden:true},jump={hidden:false,setAttribute(){}};
 const toolbar={
  dataset:{activeAccess:'all'},nextElementSibling:list,
  querySelector(s){return ({
   '[data-condition-filter]':condition,'[data-capacity-filter]':capacity,
   '[data-access-note]':note,'[data-filter-results]':result,
   '[data-clear-comparison-filters]':reset,'[data-first-visible-link]':jump
  })[s]||null;},
  querySelectorAll(s){
   return ({'[data-access-choice]':choices,
    '[data-condition-filter],[data-capacity-filter]':[condition,capacity]})[s]||[];
  }
 };
 const results={
  firstChild:null,
  querySelector(s){if(s==='[data-shared-offer-notice]')return state.notice;
   if(s==='[data-direct-filter]')return toolbar;return null;},
  insertBefore(node){state.notice=node;}
 };
 const comparisonStatus={dataset:{comparisonStatus:status}};
 const document={
  hidden:false,
  querySelector(s){
   if(s==='[data-comparison-results]')return results;
   if(s==='[data-comparison-status]')return comparisonStatus;
   return null;
  },
  getElementById:id=>hasCard&&id===HASH.slice(1)?item:null,
  createElement:()=>({
   hidden:true,children:[],
   setAttribute(name,value){this[name]=value;},
   appendChild(el){this.children.push(el);}
  }),
  addEventListener(type,fn){
   listeners.set(type,[...(listeners.get(type)||[]),fn]);
  },
  dispatchEvent(event){
   for(const fn of listeners.get(event.type)||[])fn(event);
  }
 };
 const Event=class{constructor(type){this.type=type;}};
 vm.runInNewContext(source,{
  document,location,window:{addEventListener(type,fn){
   listeners.set(type,[...(listeners.get(type)||[]),fn]);
  }},
  navigator:{},URL,Event,setInterval:()=>1,clearInterval:()=>{},
  fetch:()=>{state.requests++;throw Error('No debe consultar la red');}
 },{filename:'comparador-v32135.js',timeout:1000});
 function emit(type){for(const handler of listeners.get(type)||[])handler({type});}
 function clickReveal(){
  const trigger=state.notice?.children?.find(c=>c['data-reveal-shared-offer']!==undefined);
  assert.ok(trigger,'debe existir el botón de mostrar oferta');
  for(const handler of listeners.get('click')||[])
   handler({type:'click',target:{closest:s=>s==='[data-reveal-shared-offer]'?trigger:null}});
 }
 if(filtered){toolbar.dataset.activeAccess='direct';}
 return {state,item,toolbar,choices,condition,capacity,reset,result,note,emit,clickReveal,
  apply(){
   // Mismo comportamiento que el botón real de filtro «Solo acceso directo».
   for(const handler of listeners.get('click')||[])
    handler({type:'click',target:{closest:s=>s==='[data-access-choice]'?{
     getAttribute:n=>n==='data-access-choice'?'direct':null,
     closest:n=>n==='[data-direct-filter]'?toolbar:null
    }:null}});
  },
  clear(){
   for(const handler of listeners.get('click')||[])
    handler({type:'click',target:{closest:s=>s==='[data-clear-comparison-filters]'?{
     closest:n=>n==='[data-direct-filter]'?toolbar:null
    }:null}});
  },
  setHash(v){location.hash=v;}
 };
}

test('si la oferta enlazada está oculta, explica el filtro y muestra acción accesible',()=>{
 const b=browser();
 b.emit('DOMContentLoaded');
 b.apply();
 assert.equal(b.item.hidden,true);
 assert.ok(b.state.notice);
 assert.equal(b.state.notice.role,'status');
 assert.equal(b.state.notice.hidden,false);
 assert.match(b.state.notice.textContent,/oculta por los filtros actuales/);
 assert.equal(b.state.notice.children.length,1);
 assert.equal(b.state.notice.children[0].textContent,'Mostrar esta oferta');
 assert.equal(b.state.notice.children[0].type,'button');
 assert.equal(b.state.scrolls,0);
 assert.equal(b.state.requests,0);
});

test('mostrar oferta restablece filtros locales, navega y recupera foco sin otra búsqueda',()=>{
 const b=browser();
 b.apply();
 b.condition.value='usado';
 b.capacity.value='128gb';
 b.clickReveal();
 assert.equal(b.toolbar.dataset.activeAccess,'all');
 assert.equal(b.condition.value,'all');
 assert.equal(b.capacity.value,'all');
 assert.equal(b.item.hidden,false);
 assert.equal(b.state.notice.hidden,true);
 assert.equal(b.state.scrolls,1);
 assert.equal(b.state.focused,1);
 assert.equal(b.state.requests,0);
 assert.deepEqual(b.choices.map(c=>c.pressed),['true','false']);
});

test('al quitar filtros manualmente, el aviso se oculta sin desplazar al comprador',()=>{
 const b=browser();
 b.apply();
 assert.equal(b.state.notice.hidden,false);
 b.clear();
 assert.equal(b.state.notice.hidden,true);
 assert.equal(b.state.scrolls,0);
});

test('un enlace compartido visible no añade aviso ni botones innecesarios',()=>{
 const b=browser({access:'direct'});
 b.emit('DOMContentLoaded');
 b.apply();
 assert.equal(b.item.hidden,false);
 assert.equal(b.state.notice,null);
 assert.equal(b.state.requests,0);
});

test('los hashes no válidos no muestran controles ni eliminan filtros',()=>{
 const b=browser({hash:'#otra-seccion'});
 b.apply();
 assert.equal(b.item.hidden,true);
 assert.equal(b.state.notice,null);
 assert.equal(b.toolbar.dataset.activeAccess,'direct');
 assert.equal(b.state.requests,0);
});

test('una oferta realmente ausente mantiene el aviso existente sin crear un botón falso',()=>{
 const b=browser({hasCard:false,status:'ok'});
 b.emit('DOMContentLoaded');
 assert.ok(b.state.notice);
 assert.match(b.state.notice.textContent,/ya no aparece en la comparación actual/);
 assert.equal(b.state.notice.children.length,0);
});

test('durante una consulta en curso no se comunica una desaparición',()=>{
 const b=browser({hasCard:false,status:'checking'});
 b.emit('DOMContentLoaded');
 assert.equal(b.state.notice,null);
});

test('CSS móvil y contrato comercial: botones táctiles y cero consultas adicionales',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const section=css.split('/* V3.4.4.18 — enlace compartido oculto')[1];
 assert.ok(section);
 assert.match(section,/min-height:44px/);
 assert.match(section,/min-height:46px/);
 assert.match(section,/:focus-visible/);
 const code=source.split('/* V3.4.4.15 — Enlaces compartidos: avisar si una oferta ya no está disponible.')[1];
 assert.ok(code);
 assert.match(code,/data-reveal-shared-offer/);
 assert.match(code,/resetComparisonFilters\(toolbar\)/);
 assert.doesNotMatch(code,/\bfetch\(|serpapi|marketplace_compare_provider_usage|\.price_cents\s*=/i);
});
