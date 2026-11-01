'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const script=fs.readFileSync(path.join(__dirname,'../public/pulso-v3658.js'),'utf8');

function harness({count=180,saveData=false,pendingFirst=false}={}){
 const videos=[],cards=[],observers=[],feedListeners={},documentListeners={},windowListeners={};
 const resolutions=[];
 let videoScans=0,videoLookups=0;
 for(let i=0;i<count;i++){
  const video={paused:true,muted:true,playCount:0,pauseCount:0,
   matches:selector=>selector==='video.pulso-video',
   play(){
    this.playCount++;this.paused=false;
    if(i===0&&pendingFirst)return new Promise(resolve=>{resolutions.push(resolve)});
    return Promise.resolve();
   },
   pause(){this.pauseCount++;this.paused=true}
  };
  const card={isConnected:true,
   querySelector(selector){
    if(selector==='video.pulso-video'){videoLookups++;return video}
    return null;
   }
  };
  videos.push(video);cards.push(card);
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  querySelectorAll(selector){
   if(selector==='video.pulso-video'){videoScans++;return videos}
   if(selector==='[data-pulso-item]')return cards;
   return [];
  },
  addEventListener(name,fn,capture){feedListeners[name]={fn,capture}}
 };
 const elements={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={visibilityState:'visible',
  getElementById:key=>elements[key]||null,
  addEventListener(name,fn){documentListeners[name]=fn}
 };
 class Observer{
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(){}disconnect(){}
  emit(entries){this.fn(entries)}
 }
 const window={navigator:{connection:{saveData,effectiveType:'4g'}},
  matchMedia:()=>({matches:false}),IntersectionObserver:Observer,
  addEventListener(name,fn){windowListeners[name]=fn}
 };
 vm.runInNewContext(script,{
  document,window,navigator:window.navigator,IntersectionObserver:Observer,
  location:{origin:'https://redlibertad.com'}
 },{timeout:2500});
 function show(ratios){
  observers[0].emit(cards.map((card,index)=>({
   target:card,isIntersecting:(ratios[index]||0)>0,
   intersectionRatio:ratios[index]||0
  })));
 }
 function emitPlay(index){
  feedListeners.play.fn({target:videos[index]});
 }
 return {cards,videos,show,emitPlay,feedListeners,document,documentListeners,
  windowListeners,resolutions,scans:()=>videoScans,lookups:()=>videoLookups};
}
test('V3.6.80: 200 vídeos apenas visibles no originan consultas al reproductor',()=>{
 const h=harness({count:200});
 h.show(Array(200).fill(.12));
 assert.equal(h.lookups(),0);
 assert.equal(h.scans(),0);
 assert.equal(h.videos.filter(v=>v.playCount>0).length,0);
 const ratios=Array(200).fill(.08);ratios[134]=.92;
 h.show(ratios);
 assert.equal(h.lookups(),1,'solo consulta el vídeo que supera el umbral');
 assert.equal(h.scans(),1,'una sola pausa de seguridad al activar');
 assert.equal(h.videos[134].playCount,1);
});
test('V3.6.80: la confirmación de autoplay no vuelve a escanear todo el feed',()=>{
 const h=harness({count:220});
 const ratios=Array(220).fill(0);ratios[89]=.91;
 h.show(ratios);
 assert.equal(h.scans(),1);
 for(let i=0;i<30;i++)h.emitPlay(89);
 assert.equal(h.scans(),1,'ningún escaneo redundante por eventos play');
 assert.equal(h.videos[89].paused,false);
});
test('V3.6.80: iniciar manualmente un vídeo diferente pausa al anterior',()=>{
 const h=harness({count:160});
 h.show([.93,0,0]);
 assert.equal(h.scans(),1);
 h.emitPlay(0);
 assert.equal(h.scans(),1);
 h.videos[7].play();h.emitPlay(7);
 assert.equal(h.scans(),2);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[7].paused,false);
 h.emitPlay(7);
 assert.equal(h.scans(),2);
});
test('V3.6.80: los cambios de Reel siguen deteniendo el vídeo anterior',()=>{
 const h=harness();
 h.show([.94,.08,0]);
 h.emitPlay(0);
 h.show([.05,.94,0]);
 h.emitPlay(1);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
 assert.equal(h.scans(),2,'un escaneo por cambio, no dos');
});
test('V3.6.80: un play tardío tras deslizar no toma el control de otro Reel',()=>{
 const h=harness({pendingFirst:true});
 h.show([.94,0,0]);
 h.show([.04,.94,0]);
 h.videos[0].paused=false;
 const before=h.scans();
 h.emitPlay(0);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].paused,false);
 assert.equal(h.scans(),before);
});
test('V3.6.80: reproducción en segundo plano se cancela sin invadir controles',()=>{
 const h=harness();
 h.show([.94,0,0]);h.document.visibilityState='hidden';
 h.documentListeners.visibilitychange();
 h.videos[4].paused=false;
 h.emitPlay(4);
 assert.equal(h.videos[4].paused,true);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.feedListeners.play.capture,true);
});
test('V3.6.80: bajo ahorro de datos se conservan los controles manuales',()=>{
 const h=harness({saveData:true});
 h.show([.92,0,0]);
 assert.equal(h.videos[0].playCount,0);
 h.videos[0].play();h.emitPlay(0);
 assert.equal(h.videos[0].paused,false);
 h.videos[2].play();h.emitPlay(2);
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[2].paused,false);
});
test('V3.6.80: versión, acciones sociales, privacidad y lógica móvil intactas',()=>{
 const item={id:'25',username:'autor',displayName:'Autor',
  video:'/uploads/reels/25.mp4',likes:1,comments:2};
 const html=renderPage([item],true);
 assert.match(html,/page-lifecycle=3\.6\.79&amp;session=3\.6\.80/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon|setInterval/);
});
