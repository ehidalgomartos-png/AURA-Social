'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const script=fs.readFileSync(path.join(__dirname,'../public/pulso-v3658.js'),'utf8');
function harness({saveData=false,reducedMotion=false,onLine=true}={}){
 const videos=[],cards=[],observers=[],feedListeners={},documentListeners={},windowListeners={};
 const timers=new Map();let id=1,scans=0;
 for(let i=0;i<3;i++){
  const card={isConnected:true,children:[],
   querySelector(selector){
    if(selector==='video.pulso-video')return videos[i];
    if(selector==='.pulso-error-v3664')return null;
    return null;
   },
   append(child){this.children.push(child)}
  };
  const video={paused:true,plays:0,pauses:0,muted:true,
   matches:s=>s==='video.pulso-video',
   closest:s=>s==='[data-pulso-item]'?card:null,
   play(){this.plays++;this.paused=false;return Promise.resolve()},
   pause(){this.pauses++;this.paused=true}
  };
  cards.push(card);videos.push(video);
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  addEventListener(name,fn){feedListeners[name]=fn},
  querySelectorAll(s){
   if(s==='video.pulso-video'){scans++;return videos}
   if(s==='[data-pulso-item]')return cards;
   return [];
  }};
 const nodes={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={visibilityState:'visible',
  getElementById:key=>nodes[key]||null,
  addEventListener(name,fn){documentListeners[name]=fn},
  createElement(tag){
   return {tag,className:'',textContent:'',removed:false,attrs:{},
    setAttribute(k,v){this.attrs[k]=v},
    remove(){this.removed=true}
   }
  }
 };
 class Observer{
  constructor(fn){this.fn=fn;this.targets=[];observers.push(this)}
  observe(v){this.targets.push(v)}
  disconnect(){this.disconnected=true}
  emit(entries){this.fn(entries)}
 }
 const window={navigator:{onLine,connection:{saveData,effectiveType:'4g'}},
  matchMedia:()=>({matches:reducedMotion}),IntersectionObserver:Observer,
  addEventListener(name,fn){windowListeners[name]=fn}
 };
 vm.runInNewContext(script,{document,window,IntersectionObserver:Observer,
  navigator:window.navigator,location:{origin:'https://redlibertad.com'},
  setTimeout(fn,ms){const index=id++;timers.set(index,{fn,ms});return index},
  clearTimeout(index){timers.delete(index)}
 },{timeout:2500});
 const show=ratios=>observers[0].emit(cards.map((card,i)=>({
  target:card,isIntersecting:(ratios[i]||0)>0,intersectionRatio:ratios[i]||0
 })));
 function flush(){for(const [id,t] of [...timers]){timers.delete(id);t.fn()}}
 const emit=(name,i=0)=>feedListeners[name]({target:videos[i]});
 function notices(i=0){return cards[i].children.filter(x=>x.className==='pulso-buffering-v3677')}
 const hide=()=>{document.visibilityState='hidden';documentListeners.visibilitychange()};
 const returnToApp=()=>{document.visibilityState='visible';documentListeners.visibilitychange()};
 return {videos,cards,observers,feedListeners,documentListeners,windowListeners,window,
  document,show,emit,flush,timers,notices,hide,returnToApp,scans:()=>scans};
}
test('V3.6.78: al volver de otra aplicación solo reanuda el vídeo previamente activo',()=>{
 const h=harness();h.show([.95,.02,0]);
 assert.equal(h.videos[0].plays,1);
 h.hide();
 assert.equal(h.videos[0].paused,true);
 h.returnToApp();
 assert.equal(h.videos[0].plays,2);
 assert.equal(h.videos[0].paused,false);
 assert.equal(h.videos[1].plays,0);
});
test('V3.6.78: no reproduce un vídeo que se pausó manualmente antes de salir',()=>{
 const h=harness();h.show([.92,.02,0]);h.videos[0].pause();
 h.hide();h.returnToApp();
 assert.equal(h.videos[0].plays,1);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.78: si cambia el elemento visible en segundo plano no inicia ese otro Reel',()=>{
 const h=harness();h.show([.94,0,0]);h.hide();
 // El navegador puede entregar observaciones nuevas antes del visibilitychange.
 h.show([0,.93,0]);
 h.returnToApp();
 assert.equal(h.videos[0].paused,true);
 assert.equal(h.videos[1].plays,0,'no inicia un vídeo distinto al guardado');
 h.show([0,.1,.94]);
 assert.equal(h.videos[2].plays,1,'al deslizar voluntariamente vuelve a funcionar autoplay');
});
test('V3.6.78: BFCache recupera una reproducción anterior, no otra',()=>{
 const h=harness();h.show([.93,.02,0]);
 const before=h.observers[0].targets.length;
 h.windowListeners.pagehide();
 assert.equal(h.videos[0].paused,true);
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.videos[0].plays,2);
 assert.equal(h.videos[1].plays,0);
 assert.equal(h.observers[0].targets.length,before+3);
});
test('V3.6.78: BFCache nunca autoarranca un Reel pausado manualmente',()=>{
 const h=harness();h.show([.93,0,0]);h.videos[0].pause();
 h.windowListeners.pagehide();h.windowListeners.pageshow({persisted:true});
 assert.equal(h.videos[0].plays,1);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.78: offline se muestra solo tras una espera real del vídeo activo',()=>{
 const h=harness({onLine:false});h.show([.92,0,0]);
 h.emit('waiting');
 assert.equal(h.notices().length,0);
 h.flush();
 assert.equal(h.notices().length,1);
 assert.match(h.notices()[0].textContent,/Sin conexión/);
 assert.equal(h.videos[0].plays,1);
});
test('V3.6.78: online actualiza el aviso sin recargar ni hacer play adicional',()=>{
 const h=harness({onLine:false});h.show([.93,0,0]);
 h.emit('stalled');h.flush();
 const notice=h.notices()[0];const before=h.scans();
 h.window.navigator.onLine=true;h.windowListeners.online();
 assert.equal(notice.textContent,'Cargando vídeo…');
 assert.equal(h.videos[0].plays,1);
 assert.equal(h.scans(),before);
 h.emit('playing');
 assert.equal(notice.removed,true);
});
test('V3.6.78: si se pierde conexión durante la espera adapta el mismo aviso',()=>{
 const h=harness({onLine:true});h.show([.93,0,0]);
 h.emit('waiting');h.flush();
 const notice=h.notices()[0];
 h.window.navigator.onLine=false;h.windowListeners.offline();
 assert.match(notice.textContent,/Sin conexión/);
 assert.equal(h.notices().length,1,'no duplica avisos');
 assert.equal(h.timers.size,0,'sin reintento automático');
});
test('V3.6.78: el regreso no invalida ahorro de datos ni movimiento reducido',()=>{
 for(const options of [{saveData:true},{reducedMotion:true}]){
  const h=harness(options);h.show([.92,0,0]);
  h.videos[0].play();h.feedListeners.play({target:h.videos[0]});
  h.hide();h.returnToApp();
  assert.equal(h.videos[0].plays,1);
  assert.equal(h.videos[0].paused,true);
 }
});
test('V3.6.78: conserva acciones, privacidad, cache-bust y cero reintentos de red',()=>{
 const item={id:'25',username:'autor',displayName:'Autor',
  video:'/uploads/reels/25.mp4',likes:0,comments:0};
 const html=renderPage([item],true);
 assert.match(html,/buffering=3\.6\.77&amp;resume=3\.6\.78/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon|setInterval/);
 assert.match(script,/syncPlayback\(resume\)/);
});
