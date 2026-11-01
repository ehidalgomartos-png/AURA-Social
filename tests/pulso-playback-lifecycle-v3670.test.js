'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const script=read('public/pulso-v3658.js');

function harness({count=3,saveData=false,reducedMotion=false}={}){
 const videos=[],cards=[],observers=[],windowListeners={},documentListeners={},feedListeners={};
 for(let i=0;i<count;i++){
  const video={
   paused:true,muted:true,playCalls:0,pauseCalls:0,
   matches:selector=>selector==='video.pulso-video',
   play(){this.playCalls++;this.paused=false;return Promise.resolve();},
   pause(){this.pauseCalls++;this.paused=true;}
  };
  const card={
   isConnected:true,video,
   querySelector:selector=>selector==='video.pulso-video'?video:null
  };
  videos.push(video);cards.push(card);
 }
 const feed={
  dataset:{pulsoMode:'para-ti'},
  querySelectorAll:selector=>{
   if(selector==='video.pulso-video')return videos;
   if(selector==='[data-pulso-item]')return cards;
   throw Error('Unexpected feed selector '+selector);
  },
  addEventListener:(name,fn,capture)=>{feedListeners[name]={fn,capture};}
 };
 const more={hidden:true,disabled:false,addEventListener(){}};
 const footer={};
 const status={textContent:''};
 const byId={pulsoFeed:feed,pulsoMore:more,pulsoStatus:status,pulsoFooter:footer};
 const document={visibilityState:'visible',
  getElementById:id=>byId[id]||null,
  addEventListener:(name,fn)=>{documentListeners[name]=fn;}
 };
 class Observer{
  constructor(fn,options){this.fn=fn;this.options=options;this.targets=[];observers.push(this);}
  observe(value){this.targets.push(value);}
  disconnect(){this.disconnected=true;}
  emit(entries){this.fn(entries);}
 }
 const window={
  IntersectionObserver:Observer,
  navigator:{connection:{saveData}},
  matchMedia:()=>({matches:reducedMotion}),
  addEventListener:(name,fn)=>{windowListeners[name]=fn;}
 };
 vm.runInNewContext(script,{
  window,document,IntersectionObserver:Observer,MutationObserver:undefined,
  navigator:window.navigator,location:{origin:'https://redlibertad.com'}
 },{timeout:2500});
 assert.equal(observers.length,2,'visor y paginador usan observadores separados');
 return {videos,cards,feed,observers,document,windowListeners,documentListeners,feedListeners};
}
const show=(h,ratios)=>h.observers[0].emit(h.cards.map((card,i)=>({
 target:card,isIntersecting:ratios[i]>0,intersectionRatio:ratios[i]||0
})));
const item=id=>({
 id:String(id),caption:'Vídeo real de la comunidad',username:'autor_real',
 displayName:'Autor real',video:'/uploads/reels/'+id+'.mp4',avatar:null,
 likes:1,comments:2
});

test('V3.6.70: deslizar entre Reels selecciona uno solo y no depende del orden de eventos',()=>{
 const h=harness();
 show(h,[.89,.20,0]);
 assert.deepEqual(h.videos.map(v=>v.playCalls),[1,0,0]);
 show(h,[.7,.88,.02]);
 assert.equal(h.videos[0].paused,true);
 assert.deepEqual(h.videos.map(v=>v.playCalls),[1,1,0]);
 assert.deepEqual(h.videos.map(v=>v.paused),[true,false,true]);
 // Llegan eventos de intersección atrasados: el segundo sigue siendo ganador.
 h.observers[0].emit([
  {target:h.cards[1],isIntersecting:true,intersectionRatio:.88},
  {target:h.cards[0],isIntersecting:true,intersectionRatio:.7}
 ]);
 assert.deepEqual(h.videos.map(v=>v.playCalls),[1,1,0]);
});
test('V3.6.70: la pausa manual no se revierte mientras sigue visible el mismo vídeo',()=>{
 const h=harness();
 show(h,[.92,0,0]);
 h.videos[0].pause();
 show(h,[.91,.04,0]);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[0].playCalls,1);
 h.document.visibilityState='hidden';h.documentListeners.visibilitychange();
 h.document.visibilityState='visible';h.documentListeners.visibilitychange();
 assert.equal(h.videos[0].playCalls,1);
});
test('V3.6.70: salir de pestaña pausa el vídeo y al volver reanuda solo si estaba reproduciendo',()=>{
 const h=harness();
 show(h,[.05,.9,.05]);
 assert.equal(h.videos[1].paused,false);
 h.document.visibilityState='hidden';h.documentListeners.visibilitychange();
 assert.equal(h.videos[1].paused,true);
 h.document.visibilityState='visible';h.documentListeners.visibilitychange();
 assert.equal(h.videos[1].playCalls,2);
 assert.equal(h.videos[1].paused,false);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.70: restaurar desde historial BFCache vuelve a observar y recupera el Reel',()=>{
 const h=harness();
 show(h,[.95,.03,0]);
 const before=h.observers[0].targets.length;
 h.windowListeners.pagehide();
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.observers[0].disconnected,true);
 h.windowListeners.pageshow({persisted:false});
 assert.equal(h.observers[0].targets.length,before);
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.observers[0].targets.length,before+3);
 assert.equal(h.videos[0].playCalls,2);
});
test('V3.6.70: reproducir manualmente otro vídeo siempre pausa el anterior',()=>{
 const h=harness();
 show(h,[.95,.01,.01]);
 assert.equal(h.feedListeners.play.capture,true);
 h.videos[1].play();
 h.feedListeners.play.fn({target:h.videos[1]});
 assert.deepEqual(h.videos.map(v=>v.paused),[true,false,true]);
});
test('V3.6.70: ahorro de datos y movimiento reducido impiden autoplay, no reproducción manual',()=>{
 for(const options of [{saveData:true},{reducedMotion:true}]){
  const h=harness(options);
  show(h,[.91,0,0]);
  assert.equal(h.videos[0].playCalls,0);
  h.videos[0].play();h.feedListeners.play.fn({target:h.videos[0]});
  assert.equal(h.videos[0].paused,false);
  h.document.visibilityState='hidden';h.documentListeners.visibilitychange();
  h.document.visibilityState='visible';h.documentListeners.visibilitychange();
  assert.equal(h.videos[0].playCalls,1,'no autoplay después de volver');
 }
});
test('V3.6.70: la página conserva compartir, controles accesibles y solo cambia el recurso cacheado',()=>{
 const html=renderPage([item(25)],false);
 assert.match(html,/pulso-v3658\.js\?v=3\.6\.58&amp;playback=3\.6\.70/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/pulso-navigation-v3664\.js\?v=3\.6\.64/);
 assert.match(html,/pulso-compact-mobile-v3666\.css\?v=3\.6\.66/);
 assert.doesNotMatch(html,/data-pulso-follow|Ver vídeo y participar/);
 assert.match(script,/syncPlayback\(resume\)/);
 assert.match(script,/visibleRatios/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon|fetch\('https/);
});
