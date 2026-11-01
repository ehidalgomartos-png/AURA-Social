'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const script=fs.readFileSync(path.join(__dirname,'../public/pulso-v3658.js'),'utf8');
function harness({saveData=false,reducedMotion=false}={}){
 const videos=[],cards=[],observers=[],documentListeners={},windowListeners={},feedListeners={};
 for(let i=0;i<3;i++){
  const v={paused:true,plays:0,pauses:0,muted:true,
   matches:selector=>selector==='video.pulso-video',
   play(){this.plays++;this.paused=false;return Promise.resolve()},
   pause(){this.pauses++;this.paused=true}
  };
  videos.push(v);
  cards.push({isConnected:true,querySelector:selector=>selector==='video.pulso-video'?v:null});
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  querySelectorAll(selector){
   if(selector==='video.pulso-video')return videos;
   if(selector==='[data-pulso-item]')return cards;
   return [];
  },
  addEventListener(name,fn){feedListeners[name]=fn}
 };
 const nodes={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={
  visibilityState:'visible',
  getElementById:id=>nodes[id]||null,
  addEventListener(name,fn){documentListeners[name]=fn}
 };
 class Observer{
  constructor(fn){this.fn=fn;this.targets=[];observers.push(this)}
  observe(card){this.targets.push(card)}
  disconnect(){this.disconnected=true}
  emit(entries){this.fn(entries)}
 }
 const window={
  navigator:{connection:{saveData,effectiveType:'4g'}},
  matchMedia:()=>({matches:reducedMotion}),
  IntersectionObserver:Observer,
  addEventListener(name,fn){windowListeners[name]=fn}
 };
 vm.runInNewContext(script,{
  document,window,IntersectionObserver:Observer,navigator:window.navigator,
  location:{origin:'https://redlibertad.com'}
 },{timeout:2500});
 const show=ratios=>observers[0].emit(cards.map((card,i)=>({
  target:card,isIntersecting:(ratios[i]||0)>0,intersectionRatio:ratios[i]||0
 })));
 const hide=()=>{document.visibilityState='hidden';documentListeners.visibilitychange()};
 const appear=()=>{document.visibilityState='visible';documentListeners.visibilitychange()};
 return {videos,cards,observers,document,show,hide,appear,
  documentListeners,windowListeners,feedListeners};
}
test('V3.6.79: pageshow oculto no pierde la intención de reproducir al volver a visible',()=>{
 const h=harness();h.show([.94,.03,0]);
 assert.equal(h.videos[0].plays,1);
 h.windowListeners.pagehide();
 h.document.visibilityState='hidden';
 const before=h.observers[0].targets.length;
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.videos[0].plays,1,'no arranca en segundo plano');
 assert.equal(h.observers[0].targets.length,before+3,'se reobservan Reels');
 h.appear();
 assert.equal(h.videos[0].plays,2);
 assert.equal(h.videos[1].plays,0);
});
test('V3.6.79: visibilitychange y luego BFCache oculto restauran una sola vez',()=>{
 const h=harness();h.show([.91,.04,0]);
 h.hide();
 h.windowListeners.pagehide();
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.videos[0].plays,1);
 h.appear();
 assert.equal(h.videos[0].plays,2);
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.videos[0].plays,2,'sin duplicar el play tras páginas visibles');
});
test('V3.6.79: tras pausa manual no se autoinicia ni con BFCache retrasado',()=>{
 const h=harness();h.show([.91,0,0]);
 h.videos[0].pause();
 h.windowListeners.pagehide();
 h.document.visibilityState='hidden';
 h.windowListeners.pageshow({persisted:true});
 h.appear();
 assert.equal(h.videos[0].plays,1);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.79: no activa otro Reel cuya visibilidad cambió mientras estaba oculto',()=>{
 const h=harness();h.show([.93,.04,0]);
 h.windowListeners.pagehide();
 h.document.visibilityState='hidden';
 h.show([0,.92,.02]);
 h.windowListeners.pageshow({persisted:true});
 h.appear();
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].plays,0,'no se reproduce un Reel no solicitado');
 h.show([0,.08,.96]);
 assert.equal(h.videos[2].plays,1,'navegar voluntariamente mantiene autoplay');
});
test('V3.6.79: evento freeze conserva y resume la reproducción previa',()=>{
 const h=harness();h.show([.93,0,0]);
 h.documentListeners.freeze();
 assert.equal(h.videos[0].paused,true);
 h.documentListeners.resume();
 assert.equal(h.videos[0].plays,2);
 assert.equal(h.videos[0].paused,false);
});
test('V3.6.79: evento resume en pestaña aún oculta difiere la reproducción',()=>{
 const h=harness();h.show([.93,0,0]);
 h.hide();
 h.documentListeners.freeze();
 h.documentListeners.resume();
 assert.equal(h.videos[0].plays,1);
 h.appear();
 assert.equal(h.videos[0].plays,2);
});
test('V3.6.79: freeze/resume no revierte la pausa del usuario',()=>{
 const h=harness();h.show([.94,0,0]);
 h.videos[0].pause();
 h.documentListeners.freeze();
 h.documentListeners.resume();
 assert.equal(h.videos[0].plays,1);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.79: los ajustes de datos y movimiento se respetan en resume',()=>{
 for(const config of [{saveData:true},{reducedMotion:true}]){
  const h=harness(config);h.show([.94,0,0]);
  h.videos[0].play();h.feedListeners.play({target:h.videos[0]});
  h.documentListeners.freeze();
  h.documentListeners.resume();
  assert.equal(h.videos[0].plays,1);
  assert.equal(h.videos[0].paused,true);
 }
});
test('V3.6.79: conserva versión, privacidad, controles y no consulta nueva API',()=>{
 const item={id:'25',username:'autor',displayName:'Autor real',
  video:'/uploads/reels/25.mp4',likes:1,comments:2};
 const html=renderPage([item],true);
 assert.match(html,/resume=3\.6\.78&amp;page-lifecycle=3\.6\.79/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon|setInterval/);
 assert.match(script,/if\(document\.visibilityState!=='visible'\)return;/);
});
