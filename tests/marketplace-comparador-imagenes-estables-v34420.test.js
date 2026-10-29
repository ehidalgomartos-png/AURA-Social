'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
function setup({early=[]}={}){
 const listeners=new Map(),state={replaced:[],fetches:0};
 const document={
  querySelector:()=>null,
  querySelectorAll:()=>early,
  createElement(tag){
   return {tag,className:'',textContent:'',attributes:{},
    setAttribute(key,val){this.attributes[key]=val;}};
  },
  addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);}
 };
 vm.runInNewContext(source,{
  document,window:{addEventListener(){}},location:{hash:'',pathname:'/comparar/ejemplo',href:'https://redlibertad.com/comparar/ejemplo'},
  navigator:{},URL,
  fetch(){state.fetches++;throw Error('No extra fetch allowed');}
 },{filename:'comparador-v32135.js',timeout:1000});
 const photo=({valid=true,inList=true,complete=false,naturalWidth=1}={})=>({
  complete,naturalWidth,
  matches:s=>valid&&s==='img.offer-photo',
  closest:s=>inList&&s==='.comparison-list'?{}:null,
  replaceWith(element){state.replaced.push(element);}
 });
 return {listeners,state,photo,fire(type,target){
  for(const listener of listeners.get(type)||[])listener({type,target});
 }};
}
test('las imágenes mantienen un tamaño reservado y carga no bloqueante',()=>{
 const markup=html.slice(html.indexOf('function offerMarkup('),html.indexOf('function nonComparableMarkup('));
 assert.match(markup,/width="110" height="108" loading="lazy" decoding="async"/);
 assert.match(markup,/referrerpolicy="no-referrer"/);
 assert.match(markup,/provider\.safeImage\(o\.image\)/);
});
test('si no existe fotografía el servidor muestra un marcador neutral',()=>{
 const markup=html.slice(html.indexOf('function offerMarkup('),html.indexOf('function nonComparableMarkup('));
 assert.match(markup,/offer-noimage" aria-hidden="true">Sin fotografía/);
 assert.doesNotMatch(markup,/offer-noimage" aria-hidden="true">🛍️/);
});
test('un error de imagen reemplaza exclusivamente la imagen de una oferta',()=>{
 const b=setup(),p=b.photo();
 b.fire('error',p);
 assert.equal(b.state.replaced.length,1);
 assert.equal(b.state.replaced[0].className,'offer-noimage');
 assert.equal(b.state.replaced[0].textContent,'Sin fotografía');
 assert.equal(b.state.replaced[0].attributes['aria-hidden'],'true');
 assert.equal(b.state.fetches,0);
});
test('nunca modifica fotos externas a las tarjetas del comparador',()=>{
 const b=setup();
 b.fire('error',b.photo({valid:false}));
 b.fire('error',b.photo({inList:false}));
 assert.equal(b.state.replaced.length,0);
});
test('una foto que falló antes de cargar el script también tiene fallback',()=>{
 const earlyPhotos=[];
 const b=setup({early:earlyPhotos});
 const earlier=b.photo({complete:true,naturalWidth:0});
 // Simular imagen que ya falló cuando se analiza el DOM en esta misma instancia.
 earlyPhotos.push(earlier);
 b.fire('DOMContentLoaded');
 assert.equal(b.state.replaced.length,1);
 assert.equal(b.state.fetches,0);
});
test('las fotografías válidas ya cargadas quedan intactas',()=>{
 const p={complete:true,naturalWidth:100,matches:()=>true,closest:()=>({}),replaceWith(){throw Error('Do not replace');}};
 const b=setup({early:[p]});
 b.fire('DOMContentLoaded');
 assert.equal(b.state.replaced.length,0);
});
test('estilos de imagen proporcionada y marcador compatible con móvil',()=>{
 const section=css.split('/* V3.4.4.20 — fotografías proporcionadas')[1];
 assert.ok(section);
 assert.match(section,/object-fit:contain/);
 assert.match(section,/aspect-ratio:110 \/ 108/);
 assert.match(section,/\.offer-noimage/);
 assert.match(section,/font-size:.7rem/);
 assert.match(section,/@media\(max-width:760px\)/);
});
test('sin nuevas llamadas comerciales ni modificaciones de enlaces, precios o SEO',()=>{
 const block=source.split('/* V3.4.4.20 — si la foto remota falla')[1];
 assert.ok(block);
 assert.doesNotMatch(block,/\bfetch\(|serpapi|marketplace_compare_provider_usage|\.price_cents\s*=|\.href\s*=/i);
 assert.match(html,/data-comparison-merchant-click/);
 assert.match(html,/money\(o\.price_cents\)/);
});
