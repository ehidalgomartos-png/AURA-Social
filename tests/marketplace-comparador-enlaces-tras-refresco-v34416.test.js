'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const VALID_HASH='#oferta-'+'a'.repeat(64);
function browser({hash=VALID_HASH,initial='checking',next='ok',offerAppears=false}={}){
 const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 const listeners=new Map(),state={fetches:0,scrolls:0,polls:0,notice:null};
 let poll,clearCount=0,visible=false;
 const status={dataset:{comparisonStatus:initial},innerHTML:'Buscando ofertas'};
 const results={
  firstChild:null,_innerHTML:'',
  get innerHTML(){return this._innerHTML;},
  set innerHTML(value){this._innerHTML=value;visible=offerAppears;},
  querySelector(selector){return selector==='[data-shared-offer-notice]'?state.notice:null;},
  insertBefore(node){state.notice=node;}
 };
 const card={
  matches:selector=>selector==='li.offer',
  closest:selector=>selector==='[data-primary-offers]'?{}:null,
  scrollIntoView(){state.scrolls++;}
 };
 const document={
  hidden:false,
  querySelector(selector){
   if(selector==='[data-comparison-status]')return status;
   if(selector==='[data-comparison-results]')return results;
   return null;
  },
  getElementById(id){return visible&&id===VALID_HASH.slice(1)?card:null;},
  createElement(){
   return {hidden:true,textContent:'',className:'',setAttribute(key,value){this[key]=value;}};
  },
  addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);},
  dispatchEvent(event){for(const handler of listeners.get(event.type)||[])handler(event);}
 };
 const window={
  addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);}
 };
 const location={hash,pathname:'/comparar/iphone-12-128',href:'https://redlibertad.com/comparar/iphone-12-128'};
 const docForFetch={
  querySelector(selector){
   if(selector==='[data-comparison-results]')return {innerHTML:'<ol>Ofertas actualizadas</ol>'};
   if(selector==='[data-comparison-status]')return {dataset:{comparisonStatus:next},innerHTML:'Lista actualizada'};
   return null;
  }
 };
 const DOMParser=class{parseFromString(){return docForFetch;}};
 const Event=class{constructor(type){this.type=type;}};
 const fetch=async()=>{
  state.fetches++;
  return {ok:true,text:async()=>'<html>Test</html>'};
 };
 vm.runInNewContext(source,{document,window,location,navigator:{},URL,fetch,Event,DOMParser,
  setInterval(fn){poll=fn;return 19;},
  clearInterval(){clearCount++;}},
 {filename:'comparador-v32135.js',timeout:1000});
 function emit(type){document.dispatchEvent(new Event(type));}
 return {state,results,status,emit,refresh:async()=>{assert.ok(poll,'debe registrar polling');state.polls++;await poll();},
  clearCount:()=>clearCount,location};
}

test('en una comparación todavía buscando, no declara desaparecida la oferta compartida',()=>{
 const b=browser();
 b.emit('DOMContentLoaded');
 assert.equal(b.state.notice,null);
 assert.equal(b.state.scrolls,0);
 assert.equal(b.state.fetches,0);
});

test('al llegar ofertas, el enlace profundo recupera su tarjeta sin nueva búsqueda',async()=>{
 const b=browser({offerAppears:true,next:'ok'});
 b.emit('DOMContentLoaded');
 await b.refresh();
 assert.equal(b.results.innerHTML,'<ol>Ofertas actualizadas</ol>');
 assert.equal(b.status.dataset.comparisonStatus,'ok');
 assert.equal(b.state.notice,null,'no debe afirmar desaparición cuando la oferta ha aparecido');
 assert.equal(b.state.scrolls,1,'volver a situar la tarjeta recién renderizada en pantalla');
 assert.equal(b.state.fetches,1,'una lectura de refresco ya existente, sin peticiones añadidas');
 assert.ok(b.clearCount()>=1);
});

test('si finaliza la búsqueda y la oferta no reaparece, avisa una sola vez',async()=>{
 const b=browser({offerAppears:false,next:'ok'});
 b.emit('DOMContentLoaded');
 assert.equal(b.state.notice,null);
 await b.refresh();
 assert.ok(b.state.notice);
 assert.equal(b.state.notice.role,'status');
 assert.equal(b.state.notice.hidden,false);
 assert.match(b.state.notice.textContent,/ya no aparece en la comparación actual/);
 assert.equal(b.state.scrolls,0);
 b.emit('comparison:results-updated');
 assert.equal(b.state.fetches,1);
 assert.equal(b.state.scrolls,0);
});

test('si el refresco sigue en checking no hay falsas alarmas de oferta eliminada',async()=>{
 const b=browser({offerAppears:false,next:'checking'});
 b.emit('DOMContentLoaded');
 await b.refresh();
 assert.equal(b.status.dataset.comparisonStatus,'checking');
 assert.equal(b.state.notice,null);
 assert.equal(b.state.fetches,1);
});

test('un enlace retirado no produce avisos al llegar datos asíncronos',async()=>{
 const b=browser({hash:'',offerAppears:false,next:'ok'});
 b.emit('DOMContentLoaded');
 await b.refresh();
 assert.equal(b.state.notice,null);
 assert.equal(b.state.scrolls,0);
});

test('un hash malformado se ignora aunque haya resultados nuevos',async()=>{
 const b=browser({hash:'#oferta-'+ 'X'.repeat(64),offerAppears:false,next:'ok'});
 b.emit('DOMContentLoaded');
 await b.refresh();
 assert.equal(b.state.notice,null);
 assert.equal(b.state.fetches,1);
});

test('solo reubica al usuario al refrescar, no al abrir o cambiar el hash',()=>{
 const b=browser({initial:'ok'});
 b.emit('DOMContentLoaded');
 b.emit('hashchange');
 assert.equal(b.state.scrolls,0);
 assert.equal(b.state.fetches,0);
});

test('contrato sin llamadas nuevas de SerpApi ni alteraciones de precios o filtros',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 const block=source.split('/* V3.4.4.15 — Enlaces compartidos: avisar si una oferta ya no está disponible.')[1];
 assert.ok(block);
 assert.match(block,/comparison:results-updated/);
 assert.match(block,/status==='queued'\|\|status==='checking'/);
 assert.doesNotMatch(block,/\bfetch\(|serpapi|marketplace_compare_provider_usage|item\.hidden=/);
 assert.match(source,/document\.dispatchEvent\(new Event\('comparison:results-updated'\)\)/);
});
