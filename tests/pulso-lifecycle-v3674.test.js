'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/pulso-v3658.js'),'utf8');
const start=source.indexOf(' // V3.6.73: los errores se recuperan manualmente');
const end=source.indexOf(' // Una reproducción iniciada por la persona',start);
assert.ok(start>=0&&end>start);
const code=source.slice(start,end);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const events={document:{},window:{}},timers=new Map(), requests=[],queued=[],dispatch=[];
 const cards=[{dataset:{reelId:'25'}}],footer={};
 const handlers={},status={textContent:''},more={hidden:false,disabled:false,addEventListener(n,fn){handlers[n]=fn}};
 class AbortControllerFake{
  constructor(){this.signal={aborted:false};}
  abort(){this.signal.aborted=true;}
 }
 class Observer{
  constructor(fn){this.fn=fn;this.disconnectCalls=0;this.observeCalls=0;}
  observe(){this.observeCalls++;}
  unobserve(){}
  disconnect(){this.disconnectCalls++;}
  emit(visible){this.fn([{target:footer,isIntersecting:visible,intersectionRatio:visible?1:0}]);}
 }
 class CustomEventFake{constructor(type,o){this.type=type;this.detail=o.detail;}}
 let observer;
 const feed={
  querySelectorAll(){return cards},
  insertBefore(fragment){cards.push(...fragment.children)},
  dispatchEvent(event){dispatch.push(event)}
 };
 const document={visibilityState:'visible',
  createDocumentFragment(){return {children:[],append(c){this.children.push(c)}}},
  addEventListener(name,fn){events.document[name]=fn}
 };
 const window={
  IntersectionObserver:class extends Observer{constructor(fn){super(fn);observer=this}},
  addEventListener(name,fn){events.window[name]=fn}
 };
 const c={page:1,loading:false,hasMore:true,mode:'para-ti',more,status,feed,footer,window,document,
  AbortController:AbortControllerFake,CustomEvent:CustomEventFake,
  IntersectionObserver:window.IntersectionObserver,
  setTimeout(fn,ms){assert.equal(ms,15000);const id=timers.size+1;timers.set(id,fn);return id;},
  clearTimeout(id){timers.delete(id)},
  fetch(url,options){
   requests.push({url,options});
   if(!queued.length)throw Error('unexpected fetch');
   return queued.shift()(options);
  },
  cardFor(item){return {dataset:{reelId:String(item.id)}}},
  observeNew(){}};
 vm.runInNewContext(code+'\nthis.state=()=>({loading,hasMore,page,blocked:autoBlockedV3673})',c);
 const response=(ids)=>({status:200,ok:true,json:async()=>({page:2,hasMore:true,items:ids.map(id=>({id}))})});
 return {c,events,requests,queued,dispatch,status,more,timers,cards,response,state:c.state,
  enter(){observer.emit(true)},leave(){observer.emit(false)},
  manual(){handlers.click()},
  hide(){document.visibilityState='hidden';events.document.visibilitychange()},
  show(){document.visibilityState='visible';events.document.visibilitychange()},
  observer:()=>observer};
}
test('V3.6.74: al ocultar la pestaña cancela solicitud y desbloquea controles',async()=>{
 const h=harness();
 let release;
 h.queued.push(()=>new Promise(resolve=>{release=resolve}));
 h.enter();await tick();
 assert.equal(h.state().loading,true);
 const signal=h.requests[0].options.signal;
 h.hide();
 assert.equal(signal.aborted,true);
 assert.equal(h.state().loading,false);
 assert.equal(h.more.disabled,false);
 release(h.response(['26']));await tick();
 assert.equal(h.cards.length,1,'una respuesta obsoleta no se inserta');
 assert.equal(h.state().page,1);
 assert.equal(h.dispatch.at(-1).detail.result,'paused');
});
test('V3.6.74: recupera la paginación tras volver a la pestaña',async()=>{
 const h=harness();
 h.queued.push(async()=>h.response(['26']));
 h.hide();h.enter();await tick();
 assert.equal(h.requests.length,0);
 h.show();h.enter();await tick();
 assert.equal(h.requests.length,1);
 assert.equal(h.cards.length,2);
});
test('V3.6.74: al volver desde BFCache reobserva el pie sin duplicar consultas',async()=>{
 const h=harness();
 h.events.window.pagehide();
 assert.equal(h.observer().disconnectCalls,1);
 h.events.window.pageshow({persisted:true});
 assert.ok(h.observer().observeCalls>=2);
 h.queued.push(async()=>h.response(['26']));
 h.enter();await tick();
 assert.equal(h.requests.length,1);
});
test('V3.6.74: timeout cancela fetch lento y permite reintento manual',async()=>{
 const h=harness();
 h.queued.push(()=>new Promise(()=>{}));
 h.enter();await tick();
 const timer=[...h.timers.values()][0];
 assert.equal(typeof timer,'function');
 timer();await tick();
 assert.equal(h.requests[0].options.signal.aborted,true);
 assert.equal(h.state().loading,false);
 assert.equal(h.state().blocked,true);
 assert.match(h.status.textContent,/reintentar/);
 h.queued.push(async()=>h.response(['26']));
 h.manual();await tick();
 assert.equal(h.cards.length,2);
 assert.equal(h.requests.length,2);
});
test('V3.6.74: respeta privacidad y versionado del cliente',()=>{
 const html=renderPage([{id:'25',username:'real',displayName:'Real',caption:'Vídeo',video:'/uploads/reels/25.mp4',likes:0,comments:0}],true);
 assert.match(html,/pagination=3\.6\.73&amp;lifecycle=3\.6\.74/);
 assert.match(source,/credentials:'same-origin'/);
 assert.match(source,/credentials:'omit'/);
 assert.doesNotMatch(code,/localStorage|sessionStorage|sendBeacon|innerHTML/);
});
