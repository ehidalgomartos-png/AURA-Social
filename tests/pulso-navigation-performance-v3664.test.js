'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const client=read('public/pulso-navigation-v3664.js');
const css=read('public/pulso-navigation-v3664.css');
const sample=(id)=>({
 id:String(id),caption:'Vídeo real',username:'autor_real',
 displayName:'Autor real',video:'/uploads/reels/'+id+'.mp4',avatar:null,likes:1,comments:2
});

function harness({count=4,saveData=false,reducedMotion=false,hasMore=true}={}){
 const listeners={};
 const observers=[];
 const mutations=[];
 const created=[];
 const videos=[];
 const cards=[];
 const documentListeners={};
 const windowListeners={};
 const element=(tag)=>({
  tagName:tag.toUpperCase(),className:'',attributes:{},children:[],textContent:'',
  setAttribute(k,v){this.attributes[k]=String(v);},
  getAttribute(k){return this.attributes[k]??null;},
  append(child){this.children.push(child);}
 });
 const makeCard=id=>{
  const video={
   preload:'none',closest:()=>card,
   matches:s=>s==='video.pulso-video',
  };
  const link={getAttribute:()=>'/reel/'+id};
  const card={
   id,isConnected:true,attrs:{},video,scrollCalls:[],added:[],
   querySelector(s){
    if(s==='video.pulso-video')return video;
    if(s==='.pulso-error-v3664')return this.added[0]||null;
    if(s==='a.pulso-detail')return link;
    return null;
   },
   setAttribute(k,v){this.attrs[k]=String(v);},
   removeAttribute(k){delete this.attrs[k];},
   scrollIntoView(args){this.scrollCalls.push(args);},
   append(item){this.added.push(item);}
  };
  videos.push(video);
  return card;
 };
 for(let i=1;i<=count;i++)cards.push(makeCard(i));
 const feed={
  handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},
  querySelectorAll(selector){assert.equal(selector,'[data-pulso-item]');return cards;},
  getBoundingClientRect:()=>({top:0,bottom:650})
 };
 const button=()=>({
  disabled:false,handlers:{},
  addEventListener(name,cb){this.handlers[name]=cb;},
  setAttribute(name,value){this[name]=String(value)}
 });
 const previous=button(),next=button();
 const counter={textContent:''};
 const more={hidden:!hasMore,disabled:false,clickCount:0,click(){this.clickCount++;}};
 const byId={pulsoFeed:feed,pulsoPreviousV3664:previous,pulsoNextV3664:next,pulsoNavStatusV3664:counter,pulsoMore:more};
 const doc={
  visibilityState:'visible',
  getElementById:id=>byId[id]||null,
  addEventListener:(type,fn)=>{documentListeners[type]=fn;},
  createElement:tag=>{const e=element(tag);created.push(e);return e;}
 };
 class Observer{
  constructor(cb,opts){this.cb=cb;this.opts=opts;this.targets=[];observers.push(this);}
  observe(el){this.targets.push(el);}
  disconnect(){this.disconnected=true;}
  emit(entries){this.cb(entries);}
 }
 class Mutation{
  constructor(cb){this.cb=cb;mutations.push(this);}
  observe(node,opts){this.node=node;this.opts=opts;}
  emit(records){this.cb(records);}
 }
 const windowObj={
  navigator:{connection:{saveData}},
  matchMedia:()=>({matches:reducedMotion}),
  IntersectionObserver:Observer,
  addEventListener:(type,fn)=>{windowListeners[type]=fn;}
 };
 vm.runInNewContext(client,{
  document:doc,window:windowObj,IntersectionObserver:Observer,MutationObserver:Mutation,
  requestAnimationFrame:fn=>fn()
 },{timeout:2000});
 return {cards,videos,feed,previous,next,counter,more,doc,observers,mutations,created,windowListeners,makeCard};
}

test('V3.6.64: HTML real incluye botones de navegación solo cuando hay Reels',()=>{
 const html=renderPage([sample(41),sample(42)],false);
 assert.match(html,/id="pulsoNavStatusV3664" role="status" aria-live="polite"/);
 assert.match(html,/id="pulsoPreviousV3664" aria-label="Vídeo anterior" disabled/);
 assert.match(html,/id="pulsoNextV3664" aria-label="Siguiente vídeo"/);
 assert.match(html,/Vídeo 1 de 2 cargados/);
 assert.match(html,/pulso-navigation-v3664\.js\?v=3.6.64/);
 assert.match(html,/pulso-navigation-v3664\.css\?v=3.6.64/);
 assert.match(html,/data-pulso-mode="para-ti"/);
 const following=renderPage([sample(41)],false,{mode:'siguiendo'});
 assert.match(following,/id="pulsoNextV3664"/);
 assert.match(following,/data-pulso-mode="siguiendo"/);
 const empty=renderPage([],false);
 assert.doesNotMatch(empty,/id="pulsoNavStatusV3664"|id="pulsoPreviousV3664"/);
 assert.match(empty,/pulso-feed-empty-v3660/);
});
test('V3.6.64: anterior/siguiente y teclado desplazan el vídeo completo sin interferir con controles',()=>{
 const h=harness({count:4,hasMore:false});
 assert.equal(h.counter.textContent,'Vídeo 1 de 4 cargados');
 assert.equal(h.previous.disabled,true);
 assert.equal(h.next.disabled,false);
 assert.equal(h.videos[0].preload,'metadata');
 assert.equal(h.videos[1].preload,'metadata');
 assert.equal(h.videos[2].preload,'none');
 h.next.handlers.click();
 assert.equal(h.counter.textContent,'Vídeo 2 de 4 cargados');
 assert.equal(h.cards[1].scrollCalls.length,1);
 assert.equal(h.previous.disabled,false);
 assert.equal(h.videos[2].preload,'metadata');
 let prevented=false;
 h.feed.handlers.keydown({
  target:h.feed,key:'PageDown',altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,
  preventDefault(){prevented=true;}
 });
 assert.equal(prevented,true);
 assert.equal(h.counter.textContent,'Vídeo 3 de 4 cargados');
 h.feed.handlers.keydown({
  target:{tagName:'TEXTAREA'},key:'ArrowDown',
  altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){throw Error('must not hijack form');}
 });
 assert.equal(h.counter.textContent,'Vídeo 3 de 4 cargados');
 h.previous.handlers.click();
 assert.equal(h.counter.textContent,'Vídeo 2 de 4 cargados');
});
test('V3.6.64: el botón siguiente reutiliza la paginación y avanza solo después de recibir nuevos Reels',()=>{
 const h=harness({count:2,hasMore:true});
 h.next.handlers.click();
 assert.equal(h.counter.textContent,'Vídeo 2 de 2 cargados');
 h.next.handlers.click();
 assert.equal(h.more.clickCount,1);
 const third=h.makeCard(3);
 h.cards.push(third);
 h.mutations[0].emit([{addedNodes:[third]}]);
 assert.equal(h.counter.textContent,'Vídeo 3 de 3 cargados');
 assert.equal(third.scrollCalls.length,1);
 assert.equal(h.observers[0].targets.length,3);
});
test('V3.6.64: no precarga Reels lejanos ni vecinos con ahorro de datos',()=>{
 const normal=harness({count:6});
 assert.deepEqual(normal.videos.map(v=>v.preload),['metadata','metadata','none','none','none','none']);
 const saver=harness({count:6,saveData:true});
 assert.ok(saver.videos.every(v=>v.preload==='none'));
 const reduced=harness({count:3,reducedMotion:true});
 reduced.next.handlers.click();
 assert.equal(reduced.cards[1].scrollCalls[0].behavior,'auto');
 normal.doc.visibilityState='hidden';
 normal.doc.addEventListener && normal.doc.visibilityState;
 // La visibilidad se aplica a través del evento registrado por el visor.
 const privateScript=client;
 assert.match(privateScript,/document\.addEventListener\('visibilitychange'/);
 assert.doesNotMatch(privateScript,/Math\.random|localStorage|sessionStorage|sendBeacon|\/api\/likes/);
});
test('V3.6.64: error de vídeo tiene salida al Reel original, sin modificar fuentes ni datos',()=>{
 const h=harness({count:1});
 const video=h.videos[0],card=h.cards[0];
 h.feed.handlers.error({target:video});
 assert.equal(card.added.length,1);
 assert.equal(card.added[0].attributes.role,'alert');
 assert.equal(card.added[0].children[0].textContent,'No se pudo reproducir este vídeo aquí.');
 assert.equal(card.added[0].children[1].href,'/reel/1');
 h.feed.handlers.error({target:video});
 assert.equal(card.added.length,1);
});
test('V3.6.64: diseño móvil mantiene los controles fuera de la imagen y el feed sin cortes',()=>{
 assert.match(css,/\.pulso-nav-v3664/);
 assert.match(css,/\.pulso-center-v3662 \.pulso-feed/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/\.pulso-error-v3664/);
 assert.doesNotMatch(css,/object-fit:cover|position:fixed|transform:scale/);
 const old=read('public/pulso-v3658.js');
 assert.match(old,/const observer=playback\(\)/);
 assert.match(old,/credentials:'omit'/);
 assert.match(old,/credentials:'same-origin'/);
});
