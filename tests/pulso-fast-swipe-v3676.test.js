'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const script=fs.readFileSync(path.join(__dirname,'../public/pulso-v3658.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function harness({count=4,pendingFirst=false,saveData=false}={}){
 const videos=[],cards=[],resolvers=[],observers=[],listeners={},docListeners={},windowListeners={};
 let scans=0;
 for(let i=0;i<count;i++){
  const video={paused:true,muted:true,playCalls:0,pauseCalls:0,
   matches:selector=>selector==='video.pulso-video',
   play(){
    this.playCalls++;this.paused=false;
    if(pendingFirst&&i===0)return new Promise(resolve=>{resolvers[i]=resolve});
    return Promise.resolve();
   },
   pause(){this.pauseCalls++;this.paused=true}
  };
  videos.push(video);
  cards.push({isConnected:true,querySelector:selector=>selector==='video.pulso-video'?video:null});
 }
 const feed={
  dataset:{pulsoMode:'para-ti'},
  addEventListener(name,fn,capture){listeners[name]={fn,capture}},
  querySelectorAll(selector){
   if(selector==='video.pulso-video'){scans++;return videos;}
   if(selector==='[data-pulso-item]')return cards;
   return [];
  }
 };
 const more={hidden:true,addEventListener(){}};
 const elements={pulsoFeed:feed,pulsoMore:more,pulsoFooter:{},pulsoStatus:{textContent:''}};
 const document={visibilityState:'visible',
  getElementById:id=>elements[id]||null,
  addEventListener(name,fn){docListeners[name]=fn}
 };
 class Observer{
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(){}disconnect(){}
  emit(entries){this.fn(entries)}
 }
 const window={
  navigator:{connection:{saveData,effectiveType:'4g'}},
  matchMedia:()=>({matches:false}),
  IntersectionObserver:Observer,
  addEventListener(name,fn){windowListeners[name]=fn}
 };
 vm.runInNewContext(script,{document,window,IntersectionObserver:Observer,
  navigator:window.navigator,location:{origin:'https://redlibertad.com'}},{timeout:2500});
 const show=ratios=>observers[0].emit(cards.map((card,i)=>({
  target:card,isIntersecting:(ratios[i]||0)>0,intersectionRatio:ratios[i]||0
 })));
 return {videos,cards,observers,listeners,show,document,docListeners,
  windowListeners,resolvers,scans:()=>scans};
}

test('V3.6.76: cambios rápidos no permiten que un play tardío recupere el vídeo anterior',()=>{
 const h=harness({pendingFirst:true});
 h.show([.91,.04,0,0]);
 h.show([.02,.92,.04,0]);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
 // El navegador notifica con retraso la reproducción del primer Reel.
 h.videos[0].paused=false;
 h.listeners.play.fn({target:h.videos[0]});
 assert.equal(h.videos[0].paused,true,'se detiene un play obsoleto');
 assert.equal(h.videos[1].paused,false,'no se interrumpe el Reel visible');
});
test('V3.6.76: la promesa de autoplay tardía no activa un Reel fuera de pantalla',async()=>{
 const h=harness({pendingFirst:true});
 h.show([.92,0,0,0]);
 h.show([0,.91,0,0]);
 assert.equal(typeof h.resolvers[0],'function');
 h.videos[0].paused=false;
 h.resolvers[0]();
 await tick();
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
});
test('V3.6.76: sin vídeo claramente visible deja de escanear todos los reproductores',()=>{
 const h=harness({count:150});
 h.show([.92]);
 const before=h.scans();
 h.show([.35,.24]);
 const once=h.scans();
 assert.equal(once,before+1,'pausa al abandonar el vídeo');
 for(let i=0;i<40;i++)h.show([.33,.31]);
 assert.equal(h.scans(),once,'no recorre 150 vídeos por cada frame');
});
test('V3.6.76: conserva la reproducción manual de otros Reels',()=>{
 const h=harness();
 h.show([.91,.02,0,0]);
 h.videos[1].play();
 h.listeners.play.fn({target:h.videos[1]});
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
 assert.equal(h.listeners.play.capture,true);
});
test('V3.6.76: reproducción tardía en pestaña oculta se detiene',()=>{
 const h=harness({pendingFirst:true});
 h.show([.92,0,0,0]);
 h.document.visibilityState='hidden';
 h.docListeners.visibilitychange();
 h.videos[0].paused=false;
 h.listeners.play.fn({target:h.videos[0]});
 assert.equal(h.videos[0].paused,true);
 h.videos[1].paused=false;
 h.listeners.play.fn({target:h.videos[1]});
 assert.equal(h.videos[1].paused,true,'manual tampoco reproduce en segundo plano');
});
test('V3.6.76: ahorro de datos y reproducción sin solapamientos',()=>{
 const h=harness({saveData:true});
 h.show([.91,0,0,0]);
 assert.equal(h.videos[0].playCalls,0);
 h.videos[0].play();
 h.listeners.play.fn({target:h.videos[0]});
 assert.equal(h.videos[0].paused,false);
 h.show([.1,.92,0,0]);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].playCalls,0);
});
test('V3.6.76: cambia únicamente el cliente, sin tocar privacidad ni acciones',()=>{
 const item={id:'25',username:'autor',displayName:'Autor real',video:'/uploads/reels/25.mp4',likes:0,comments:1};
 const html=renderPage([item],true);
 assert.match(html,/network=3\.6\.75&amp;swipe=3\.6\.76/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon/);
});
