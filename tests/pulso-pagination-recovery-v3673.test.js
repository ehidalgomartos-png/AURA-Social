'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/pulso-v3658.js');
const nav=read('public/pulso-navigation-v3664.js');
const begin=source.indexOf(' // V3.6.73: los errores se recuperan manualmente');
const end=source.indexOf(' // Una reproducción iniciada por la persona',begin);
assert.ok(begin>0&&end>begin,'pagination block available');
const pagination=source.slice(begin,end);
const item=id=>({id:String(id),username:'autor_real',displayName:'Autor real',
 caption:'Vídeo verdadero',video:'/uploads/reels/'+id+'.mp4',likes:0,comments:0});
const response=(page,items,hasMore=true)=>({
 status:200,ok:true,json:async()=>({page,items,hasMore})
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function harness({following=false,initialIds=['25'],firstPage=1}={}){
 const cards=initialIds.map(id=>({dataset:{reelId:id}}));
 const footer={};
 const status={textContent:''};
 const handlers={};
 const more={hidden:false,disabled:false,addEventListener(type,fn){handlers[type]=fn}};
 const events=[],requests=[],queued=[],observers=[];
 let observed=0;
 class CustomEventFake{constructor(type,params){this.type=type;this.detail=params.detail}}
 const feed={
  querySelectorAll(type){assert.equal(type,'[data-pulso-item]');return cards},
  insertBefore(fragment,target){
   assert.equal(target,footer);
   cards.push(...fragment.children);
  },
  dispatchEvent(event){events.push(event);return true}
 };
 const doc={visibilityState:'visible',
  createDocumentFragment(){return {children:[],append(node){this.children.push(node)}}}
 };
 class Observer{
  constructor(callback,opts){this.callback=callback;this.opts=opts;observers.push(this)}
  observe(target){this.target=target}
  emit(inside){
   this.callback([{target:footer,isIntersecting:inside,intersectionRatio:inside?1:0}]);
  }
 }
 const context={
  page:firstPage,loading:false,hasMore:true,mode:following?'siguiendo':'para-ti',
  more,status,feed,footer,document:doc,window:{IntersectionObserver:Observer},
  IntersectionObserver:Observer,CustomEvent:CustomEventFake,
  cardFor(entry){
   if(!/^[1-9]\d{0,15}$/.test(String(entry?.id||'')))return null;
   if(!String(entry?.video||'').startsWith('/uploads/'))return null;
   return {dataset:{reelId:String(entry.id)}};
  },
  observeNew(){observed++},
  fetch:async(url,options)=>{
   requests.push({url,options});
   if(!queued.length)throw Error('Unplanned request '+url);
   const value=queued.shift();
   return typeof value==='function'?await value():value;
  }
 };
 vm.runInNewContext(pagination+'\nthis.loadMore=loadMore;this.state=()=>({page,loading,hasMore,autoBlockedV3673,footerInsideV3673})',
  context,{timeout:2500});
 return {...context,cards,requests,queued,events,handlers,status,more,doc,observers,
  observed:()=>observed,enter:()=>observers[0].emit(true),leave:()=>observers[0].emit(false),
  manual:()=>handlers.click()};
}

test('V3.6.73: el footer dispara una sola petición mientras permanece visible',async()=>{
 const h=harness();
 h.queued.push(response(2,[item(26)]),response(3,[item(27)]));
 h.enter();await tick();
 for(let i=0;i<10;i++)h.enter();
 await tick();
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].url,'/api/pulso/public?page=2');
 assert.equal(h.requests[0].options.credentials,'omit');
 assert.equal(h.requests[0].options.cache,'no-store');
 assert.equal(h.state().page,2);
 assert.deepEqual(h.cards.map(x=>x.dataset.reelId),['25','26']);
 h.leave();h.enter();await tick();
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].url,'/api/pulso/public?page=3');
 assert.deepEqual(h.cards.map(x=>x.dataset.reelId),['25','26','27']);
});
test('V3.6.73: dos avisos de visibilidad concurrentes nunca duplican el POST ni GET',async()=>{
 const h=harness();
 let release;
 h.queued.push(()=>new Promise(resolve=>{release=resolve}));
 h.enter();
 h.leave();h.enter();
 await tick();
 assert.equal(h.requests.length,1);
 assert.equal(h.more.disabled,true);
 release(response(2,[item(26)]));
 await tick();
 assert.equal(h.state().page,2);
 assert.equal(h.more.disabled,false);
 assert.equal(h.requests.length,1);
});
test('V3.6.73: error de red suspende carga automática y permite reintento manual',async()=>{
 const h=harness();
 h.queued.push(()=>{throw Error('network')},response(2,[item(26)]));
 h.enter();await tick();
 assert.equal(h.state().page,1);
 assert.equal(h.state().autoBlockedV3673,true);
 assert.equal(h.more.hidden,false);
 assert.match(h.status.textContent,/Pulsa «Ver más vídeos» para reintentar/);
 for(let i=0;i<8;i++){h.leave();h.enter();}
 await tick();
 assert.equal(h.requests.length,1,'no bucle al permanecer visible el footer');
 h.manual();await tick();
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].url,'/api/pulso/public?page=2');
 assert.equal(h.state().page,2);
 assert.equal(h.state().autoBlockedV3673,false);
 assert.equal(h.events.at(-1).detail.result,'added');
});
test('V3.6.73: respuesta inválida no modifica página, vídeos ni estado de sesión',async()=>{
 const h=harness();
 h.queued.push({status:200,ok:true,json:async()=>({page:99,items:[item(9)],hasMore:true})});
 h.enter();await tick();
 assert.equal(h.state().page,1);
 assert.deepEqual(h.cards.map(x=>x.dataset.reelId),['25']);
 assert.equal(h.events.at(-1).detail.result,'error');
 assert.equal(h.state().autoBlockedV3673,true);
});
test('V3.6.73: no repite Reels existentes ni repetidos dentro de una misma página',async()=>{
 const h=harness();
 h.queued.push(response(2,[item(25),item(26),item(26),item(27),{id:'-2'}]));
 h.manual();await tick();
 assert.deepEqual(h.cards.map(x=>x.dataset.reelId),['25','26','27']);
 assert.equal(h.events.at(-1).detail.added,2);
 assert.equal(h.observed(),1);
});
test('V3.6.73: páginas sin novedades no provocan cascadas de consultas',async()=>{
 const h=harness();
 h.queued.push(response(2,[item(25),item(25)]),response(3,[item(26)]));
 h.enter();await tick();
 assert.equal(h.state().page,2);
 assert.equal(h.state().autoBlockedV3673,true);
 assert.equal(h.events.at(-1).detail.result,'empty');
 assert.match(h.status.textContent,/No hay vídeos nuevos en este bloque/);
 h.leave();h.enter();await tick();
 assert.equal(h.requests.length,1);
 h.manual();await tick();
 assert.equal(h.requests.length,2);
 assert.equal(h.state().page,3);
 assert.deepEqual(h.cards.map(x=>x.dataset.reelId),['25','26']);
});
test('V3.6.73: el último bloque deja de solicitar páginas',async()=>{
 const h=harness();
 h.queued.push(response(2,[item(26)],false));
 h.enter();await tick();
 assert.equal(h.more.hidden,true);
 assert.equal(h.state().hasMore,false);
 assert.match(h.status.textContent,/final de los vídeos/);
 h.leave();h.enter();h.manual();await tick();await tick();
 assert.equal(h.requests.length,1);
});
test('V3.6.73: al llegar a la página 20 no consulta una página 21',async()=>{
 const h=harness({firstPage:19});
 h.queued.push(response(20,[item(26)],true));
 h.manual();await tick();
 assert.equal(h.requests[0].url,'/api/pulso/public?page=20');
 assert.equal(h.state().hasMore,false);
 h.manual();await tick();
 assert.equal(h.requests.length,1);
});
test('V3.6.73: la pestaña Siguiendo respeta sesión y se detiene en 401',async()=>{
 const h=harness({following:true});
 h.queued.push({status:401,ok:false,json:async()=>({error:'unauthorized'})});
 h.enter();await tick();
 assert.equal(h.requests[0].url,'/api/pulso/following?page=2');
 assert.equal(h.requests[0].options.credentials,'same-origin');
 assert.equal(h.state().page,1);
 assert.equal(h.state().hasMore,false);
 assert.equal(h.more.hidden,true);
 assert.match(h.status.textContent,/sesión ha caducado/);
 assert.equal(h.events.at(-1).detail.result,'unauthorized');
});
test('V3.6.73: no se hacen precargas automáticas con la pestaña oculta',async()=>{
 const h=harness();
 h.doc.visibilityState='hidden';
 h.enter();await tick();
 assert.equal(h.requests.length,0);
 h.doc.visibilityState='visible';
 h.leave();h.queued.push(response(2,[item(26)]));
 h.enter();await tick();
 assert.equal(h.requests.length,1);
});
test('V3.6.73: navegación recibe el fin, éxito o fallo de paginación y conserva botones',()=>{
 const html=renderPage([item(25)],true);
 assert.match(html,/pulso-v3658\.js\?v=3\.6\.58&amp;playback=3\.6\.70&amp;share=3\.6\.71&amp;perf=3\.6\.72&amp;pagination=3\.6\.73/);
 assert.match(html,/pulso-navigation-v3664\.js\?v=3\.6\.64&amp;recovery=3\.6\.71&amp;perf=3\.6\.72&amp;pagination=3\.6\.73/);
 assert.match(nav,/feed\.addEventListener\('pulso:page-result'/);
 assert.match(nav,/pendingAdvance=null/);
 assert.match(nav,/if\(added>0\)goTo\(at\)/);
 assert.match(source,/new CustomEvent\('pulso:page-result'/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|sendBeacon/);
});
