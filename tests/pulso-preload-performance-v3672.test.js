'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function navHarness({count=80,saveData=false}={}){
 const cards=[],videos=[],observers=[],mutations=[],listeners={},windowListeners={},documentListeners={};
 let mediaLookups=0;
 function makeCard(id){
  const video={preload:'none',paused:true};
  const card={id,isConnected:true,attrs:{},video,
   querySelector(selector){
    if(selector==='video.pulso-video'){mediaLookups++;return video;}
    if(selector==='.pulso-error-v3664')return null;
    return null;
   },
   setAttribute(key,value){this.attrs[key]=String(value)},
   removeAttribute(key){delete this.attrs[key]},
   scrollIntoView(){}
  };
  videos.push(video);return card;
 }
 for(let id=1;id<=count;id++)cards.push(makeCard(id));
 const feed={
  addEventListener:(event,fn)=>{listeners[event]=fn},
  querySelectorAll:selector=>{
   assert.equal(selector,'[data-pulso-item]');
   return cards;
  }
 };
 const button=()=>({disabled:false,
  addEventListener(event,fn){this[event]=fn},
  setAttribute(){}});
 const previous=button(),next=button(),counter={textContent:''};
 const more={hidden:false,disabled:false,click(){}};
 const document={
  visibilityState:'visible',
  getElementById:id=>({
   pulsoFeed:feed,pulsoPreviousV3664:previous,pulsoNextV3664:next,
   pulsoNavStatusV3664:counter,pulsoMore:more
  })[id]||null,
  addEventListener:(event,fn)=>{documentListeners[event]=fn},
  createElement:tag=>({tagName:tag.toUpperCase()})
 };
 class Observer{
  constructor(fn,opts){this.fn=fn;this.opts=opts;this.targets=[];observers.push(this);}
  observe(target){this.targets.push(target)}
  disconnect(){this.disconnected=true}
  emit(entries){this.fn(entries)}
 }
 class Mutation{
  constructor(fn){this.fn=fn;mutations.push(this)}
  observe(){}
  emit(records){this.fn(records)}
 }
 const window={navigator:{connection:{saveData}},
  matchMedia:()=>({matches:false}),IntersectionObserver:Observer,
  addEventListener:(event,fn)=>{windowListeners[event]=fn}};
 vm.runInNewContext(read('public/pulso-navigation-v3664.js'),{
  document,window,IntersectionObserver:Observer,MutationObserver:Mutation,
  requestAnimationFrame:fn=>fn()
 },{timeout:2500});
 return {cards,videos,previous,next,counter,more,document,documentListeners,
  windowListeners,observers,mutations,makeCard,
  lookups:()=>mediaLookups};
}
function playbackHarness(){
 const videos=[],cards=[],observers=[],feedListeners={};
 let scans=0;
 for(let i=0;i<30;i++){
  const video={paused:true,muted:true,plays:0,
   play(){this.paused=false;this.plays++;return Promise.resolve()},
   pause(){this.paused=true}
  };
  const card={isConnected:true,querySelector:()=>video};
  videos.push(video);cards.push(card);
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  addEventListener(name,fn){feedListeners[name]=fn},
  querySelectorAll(selector){
   if(selector==='video.pulso-video'){scans++;return videos;}
   if(selector==='[data-pulso-item]')return cards;
   return [];
  }
 };
 const nodes={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={visibilityState:'visible',
  getElementById:id=>nodes[id]||null,
  addEventListener(){}};
 class Observer{constructor(fn){this.fn=fn;observers.push(this)}observe(){} disconnect(){} emit(entries){this.fn(entries)}}
 const window={navigator:{connection:{saveData:false}},
  matchMedia:()=>({matches:false}),IntersectionObserver:Observer,
  addEventListener(){}};
 vm.runInNewContext(read('public/pulso-v3658.js'),{
  document,window,IntersectionObserver:Observer
 },{timeout:2500});
 return {videos,cards,observer:observers[0],scans:()=>scans};
}
const item=id=>({id:String(id),username:'autor_real',displayName:'Autor real',
 caption:'Vídeo auténtico',video:'/uploads/reels/'+id+'.mp4',
 avatar:null,likes:1,comments:1});

test('V3.6.72: el primer Reel prepara solo sus propios metadatos y los del siguiente',()=>{
 const h=navHarness({count:120});
 assert.deepEqual(h.videos.slice(0,4).map(v=>v.preload),['metadata','metadata','none','none']);
 assert.ok(h.videos.slice(4).every(v=>v.preload==='none'));
 assert.ok(h.lookups()<=2,'no consultar los 120 vídeos para iniciar');
 assert.equal(h.counter.textContent,'Vídeo 1 de 120 cargados');
});
test('V3.6.72: avanzar limita búsquedas de vídeo a tres vecinos, incluso con muchos Reels',()=>{
 const h=navHarness({count:160});
 const before=h.lookups();
 h.next.click();
 assert.equal(h.counter.textContent,'Vídeo 2 de 160 cargados');
 assert.ok(h.lookups()-before<=3,'solo consulta tres vecinos al avanzar');
 assert.deepEqual(h.videos.slice(0,5).map(v=>v.preload),['metadata','metadata','metadata','none','none']);
 const second=h.lookups();
 h.next.click();
 assert.ok(h.lookups()-second<=3);
 assert.deepEqual(h.videos.slice(0,6).map(v=>v.preload),['none','metadata','metadata','metadata','none','none']);
 assert.ok(h.videos.filter(v=>v.preload==='metadata').length<=3);
});
test('V3.6.72: avisos repetidos del observador no vuelven a actualizar el mismo vídeo',()=>{
 const h=navHarness({count:100});
 const before=h.lookups();
 for(let i=0;i<15;i++)h.observers[0].emit([
  {target:h.cards[0],isIntersecting:true,intersectionRatio:.89}
 ]);
 assert.equal(h.lookups(),before);
 assert.equal(h.counter.textContent,'Vídeo 1 de 100 cargados');
});
test('V3.6.72: al ocultar la pestaña libera la precarga y al volver la restaura',()=>{
 const h=navHarness({count:80});
 h.next.click();
 h.document.visibilityState='hidden';
 h.documentListeners.visibilitychange();
 assert.ok(h.videos.every(v=>v.preload==='none'));
 h.document.visibilityState='visible';
 h.documentListeners.visibilitychange();
 assert.deepEqual(h.videos.slice(0,4).map(v=>v.preload),
  ['metadata','metadata','metadata','none']);
});
test('V3.6.72: con ahorro de datos no precarga vecinos ni siquiera al navegar',()=>{
 const h=navHarness({count:80,saveData:true});
 for(let i=0;i<5;i++)h.next.click();
 assert.ok(h.videos.every(v=>v.preload==='none'));
 assert.equal(h.lookups(),0);
});
test('V3.6.72: nuevos Reels y recuperación BFCache actualizan la ventana pequeña',()=>{
 const h=navHarness({count:2});
 h.next.click();
 const added=h.makeCard(3);
 h.cards.push(added);
 h.mutations[0].emit([{addedNodes:[added]}]);
 assert.deepEqual(h.videos.map(v=>v.preload),['metadata','metadata','metadata']);
 h.windowListeners.pagehide();
 assert.equal(h.observers[0].disconnected,true);
 h.windowListeners.pageshow({persisted:true});
 assert.ok(h.observers[0].targets.length>=6);
 assert.ok(h.videos.filter(v=>v.preload==='metadata').length<=3);
});
test('V3.6.72: no escanea los 30 reproductores de nuevo cuando el mismo Reel permanece visible',()=>{
 const h=playbackHarness();
 const first={target:h.cards[0],isIntersecting:true,intersectionRatio:.9};
 h.observer.emit([first]);
 const before=h.scans();
 assert.equal(before,1);
 for(let i=0;i<12;i++)h.observer.emit([first]);
 assert.equal(h.scans(),before);
 assert.equal(h.videos[0].plays,1);
 h.observer.emit([
  {target:h.cards[0],isIntersecting:true,intersectionRatio:.15},
  {target:h.cards[1],isIntersecting:true,intersectionRatio:.88}
 ]);
 assert.equal(h.scans(),before+1);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
});
test('V3.6.72: conserva acciones, privacidad y cache-bust real',()=>{
 const html=renderPage([item(25),item(26)],true);
 const nav=read('public/pulso-navigation-v3664.js');
 const player=read('public/pulso-v3658.js');
 assert.match(html,/pulso-navigation-v3664\.js\?v=3\.6\.64&amp;recovery=3\.6\.71&amp;perf=3\.6\.72/);
 assert.match(html,/pulso-v3658\.js\?v=3\.6\.58&amp;playback=3\.6\.70&amp;share=3\.6\.71&amp;perf=3\.6\.72/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/href="\/app\?view=reels&crear=reel"/);
 assert.match(html,/preload="none" controls muted playsinline loop/);
 assert.match(nav,/function preloadNear\(index,items\)/);
 assert.match(nav,/const warmedV3672=new Set\(\)/);
 assert.match(player,/if\(changed\)pauseAll\(winner\)/);
 assert.doesNotMatch(nav,/Math\.random|sendBeacon|localStorage|sessionStorage/);
});
