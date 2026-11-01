'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const script=read('public/pulso-v3658.js');
const styles=read('public/pulso-buffering-v3677.css');

function harness({count=3,saveData=false}={}){
 const videos=[],cards=[],observers=[],feedHandlers={},documentHandlers={},windowHandlers={};
 const timers=new Map();
 let nextTimer=1,scans=0;
 for(let i=0;i<count;i++){
  const card={isConnected:true,children:[],querySelector(selector){
   if(selector==='video.pulso-video')return videos[i];
   if(selector==='.pulso-error-v3664')return null;
   return null;
  },append(node){this.children.push(node)}};
  const video={paused:true,muted:true,playCalls:0,pauseCalls:0,
   matches:selector=>selector==='video.pulso-video',
   closest:selector=>selector==='[data-pulso-item]'?card:null,
   play(){this.playCalls++;this.paused=false;return Promise.resolve()},
   pause(){this.pauseCalls++;this.paused=true;}
  };
  cards.push(card);videos.push(video);
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  querySelectorAll(selector){
   if(selector==='video.pulso-video'){scans++;return videos}
   if(selector==='[data-pulso-item]')return cards;
   return [];
  },
  addEventListener(name,fn,capture){feedHandlers[name]={fn,capture}}
 };
 const ids={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={visibilityState:'visible',
  getElementById:id=>ids[id]||null,
  addEventListener(name,fn){documentHandlers[name]=fn},
  createElement(tag){
   return {tag,attrs:{},removed:false,className:'',textContent:'',
    setAttribute(name,value){this.attrs[name]=value},
    remove(){this.removed=true}
   };
  }
 };
 class Observer{
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(){}disconnect(){}
  emit(entries){this.fn(entries)}
 }
 const window={navigator:{connection:{saveData,effectiveType:'4g'}},
  matchMedia:()=>({matches:false}),IntersectionObserver:Observer,
  addEventListener(name,fn){windowHandlers[name]=fn}};
 vm.runInNewContext(script,{window,document,navigator:window.navigator,
  IntersectionObserver:Observer,location:{origin:'https://redlibertad.com'},
  setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,ms});return id;},
  clearTimeout(id){timers.delete(id)}
 },{timeout:2500});
 function show(ratios){
  observers[0].emit(cards.map((card,i)=>({
   target:card,isIntersecting:(ratios[i]||0)>0,intersectionRatio:ratios[i]||0
  })));
 }
 function emit(name,i=0){
  assert.ok(feedHandlers[name],name+' listener');
  feedHandlers[name].fn({target:videos[i]});
 }
 function flush(){
  for(const [id,task] of [...timers]){timers.delete(id);task.fn();}
 }
 function notices(i=0){return cards[i].children.filter(x=>x.className==='pulso-buffering-v3677')}
 return {videos,cards,feedHandlers,document,documentHandlers,windowHandlers,
  timers,show,emit,flush,notices,scans:()=>scans};
}
test('V3.6.77: una espera corta no muestra aviso y se cancela al reanudarse',()=>{
 const h=harness();
 h.show([.9,.02,0]);
 h.emit('waiting');
 assert.equal(h.timers.size,1);
 assert.equal([...h.timers.values()][0].ms,1600);
 h.emit('playing');
 assert.equal(h.timers.size,0);
 h.flush();
 assert.equal(h.notices().length,0);
});
test('V3.6.77: stalled y waiting repetidos mantienen un solo aviso, sin recargas',()=>{
 const h=harness();
 h.show([.91,0,0]);
 h.emit('waiting');h.emit('stalled');h.emit('waiting');
 assert.equal(h.timers.size,1);
 h.flush();
 const notes=h.notices();
 assert.equal(notes.length,1);
 assert.equal(notes[0].textContent,'Cargando vídeo…');
 assert.equal(notes[0].attrs.role,'status');
 h.emit('stalled');
 assert.equal(h.timers.size,0,'sin cadena de temporizadores');
 h.emit('canplay');
 assert.equal(notes[0].removed,true);
});
test('V3.6.77: al deslizar a otro Reel se elimina el aviso anterior',()=>{
 const h=harness();
 h.show([.91,0,0]);
 h.emit('waiting');h.flush();
 const first=h.notices()[0];
 h.show([.03,.92,0]);
 assert.equal(first.removed,true);
 h.emit('waiting',0);
 assert.equal(h.timers.size,0,'un vídeo antiguo no crea avisos');
 h.emit('waiting',1);
 assert.equal(h.timers.size,1);
 h.flush();
 assert.equal(h.notices(1).length,1);
});
test('V3.6.77: ocultar pestaña cancela avisos y no mantiene temporizadores',()=>{
 const h=harness();
 h.show([.9,0,0]);
 h.emit('waiting');
 h.document.visibilityState='hidden';
 h.documentHandlers.visibilitychange();
 assert.equal(h.timers.size,0);
 h.flush();
 assert.equal(h.notices().length,0);
 h.document.visibilityState='visible';
 h.documentHandlers.visibilitychange();
 h.emit('waiting');
 h.flush();
 const notice=h.notices()[0];
 assert.ok(notice);
 h.windowHandlers.pagehide();
 assert.equal(notice.removed,true);
});
test('V3.6.77: pausa manual, error y fin retiran el aviso',()=>{
 for(const event of ['pause','error','ended','canplay','playing']){
  const h=harness();
  h.show([.9,0,0]);
  h.emit('waiting');h.flush();
  const notice=h.notices()[0];
  h.emit(event);
  assert.equal(notice.removed,true,event);
 }
});
test('V3.6.77: un vídeo fuera de pantalla o pausado no muestra carga',()=>{
 const h=harness();
 h.show([.9,0,0]);
 h.emit('waiting',1);
 assert.equal(h.timers.size,0);
 h.videos[0].pause();
 h.emit('stalled',0);
 assert.equal(h.timers.size,0);
});
test('V3.6.77: si hay un error real evita superponer el aviso de carga',()=>{
 const h=harness();
 h.show([.9,0,0]);
 h.cards[0].querySelector=selector=>selector==='.pulso-error-v3664'?{}:
  selector==='video.pulso-video'?h.videos[0]:null;
 h.emit('waiting');h.flush();
 assert.equal(h.notices().length,0);
});
test('V3.6.77: avisos de red no escanean ni reintentan los 150 vídeos',()=>{
 const h=harness({count:150});
 h.show([.9]);
 const before=h.scans();
 for(let i=0;i<20;i++)h.emit('waiting');
 h.flush();
 assert.equal(h.scans(),before);
 assert.equal(h.notices().length,1);
 assert.equal(h.videos[0].playCalls,1);
});
test('V3.6.77: es una indicación visual no interactiva y mantiene privacidad',()=>{
 const item={id:'25',username:'autor',displayName:'Autor real',
  video:'/uploads/reels/25.mp4',likes:0,comments:1};
 const html=renderPage([item],true);
 assert.match(html,/pulso-buffering-v3677\.css\?v=3\.6\.77/);
 assert.match(html,/swipe=3\.6\.76&amp;buffering=3\.6\.77/);
 assert.match(styles,/pointer-events:none/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/credentials:'omit'/);
 assert.doesNotMatch(script,/sendBeacon|localStorage|sessionStorage/);
 assert.doesNotMatch(script,/setInterval|\.load\(\)/);
});
