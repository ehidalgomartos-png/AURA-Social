'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const navSource=read('public/pulso-navigation-v3664.js');
const playerSource=read('public/pulso-v3658.js');

function navHarness({effectiveType='4g',saveData=false,count=7}={}){
 const videos=[],cards=[],handlers={},documentHandlers={},connectionHandlers={};
 const connection={effectiveType,saveData,addEventListener(name,fn){connectionHandlers[name]=fn}};
 for(let i=0;i<count;i++){
  const video={preload:'none'};
  const card={isConnected:true,querySelector(selector){
   if(selector==='video.pulso-video')return video;
   return null;
  },setAttribute(){},removeAttribute(){},scrollIntoView(){}};
  cards.push(card);videos.push(video);
 }
 const buttons=()=>({disabled:false,addEventListener(name,fn){this[name]=fn},setAttribute(){}});
 const previous=buttons(),next=buttons(),counter={textContent:''};
 const feed={querySelectorAll(selector){
  assert.equal(selector,'[data-pulso-item]');return cards;
 },addEventListener(name,fn){handlers[name]=fn}};
 const more={hidden:false,disabled:false,click(){}};
 const elements={pulsoFeed:feed,pulsoPreviousV3664:previous,
  pulsoNextV3664:next,pulsoNavStatusV3664:counter,pulsoMore:more};
 const document={visibilityState:'visible',
  getElementById:id=>elements[id]||null,
  addEventListener(name,fn){documentHandlers[name]=fn}};
 class Observer{
  constructor(){this.targets=[];}
  observe(card){this.targets.push(card);}
  disconnect(){}
 }
 const window={navigator:{connection},matchMedia:()=>({matches:false}),
  IntersectionObserver:Observer,addEventListener(){}};
 vm.runInNewContext(navSource,{document,window,IntersectionObserver:Observer,
  requestAnimationFrame:fn=>fn()}, {timeout:2500});
 return {videos,cards,connection,connectionHandlers,previous,next,counter,document,documentHandlers};
}
function playbackHarness({effectiveType='4g',saveData=false}={}){
 const videos=[],cards=[],observers=[],listeners={};
 const connection={effectiveType,saveData};
 for(let i=0;i<3;i++){
  const video={paused:true,muted:true,playCalls:0,pauseCalls:0,
   matches:selector=>selector==='video.pulso-video',
   play(){this.paused=false;this.playCalls++;return Promise.resolve()},
   pause(){this.paused=true;this.pauseCalls++}};
  videos.push(video);
  cards.push({isConnected:true,querySelector:selector=>selector==='video.pulso-video'?video:null});
 }
 const feed={dataset:{pulsoMode:'para-ti'},
  addEventListener(name,fn){listeners[name]=fn},
  querySelectorAll(selector){
   if(selector==='video.pulso-video')return videos;
   if(selector==='[data-pulso-item]')return cards;
   return [];
  }};
 const elements={pulsoFeed:feed,pulsoMore:{hidden:true,addEventListener(){}},
  pulsoStatus:{textContent:''},pulsoFooter:{}};
 const document={visibilityState:'visible',getElementById:id=>elements[id]||null,
  addEventListener(){}};
 class Observer{
  constructor(fn){this.fn=fn;observers.push(this);}
  observe(){}disconnect(){}
  emit(entries){this.fn(entries)}
 }
 const window={navigator:{connection},matchMedia:()=>({matches:false}),
  IntersectionObserver:Observer,addEventListener(){}};
 vm.runInNewContext(playerSource,{window,document,IntersectionObserver:Observer,
  navigator:window.navigator,location:{origin:'https://redlibertad.com'}},{timeout:2500});
 const show=ratios=>observers[0].emit(cards.map((card,i)=>({
  target:card,isIntersecting:(ratios[i]||0)>0,intersectionRatio:ratios[i]||0
 })));
 return {videos,cards,show,connection,listeners};
}

test('V3.6.75: red rápida conserva precarga limitada a tres vídeos vecinos',()=>{
 const h=navHarness({effectiveType:'4g'});
 assert.deepEqual(h.videos.map(v=>v.preload),['metadata','metadata','none','none','none','none','none']);
 h.next.click();
 assert.deepEqual(h.videos.map(v=>v.preload),['metadata','metadata','metadata','none','none','none','none']);
});
test('V3.6.75: 3G precarga únicamente el Reel visible',()=>{
 const h=navHarness({effectiveType:'3g'});
 assert.deepEqual(h.videos.map(v=>v.preload),['metadata','none','none','none','none','none','none']);
 h.next.click();
 assert.deepEqual(h.videos.map(v=>v.preload),['none','metadata','none','none','none','none','none']);
});
test('V3.6.75: 2G, slow-2g y ahorro de datos evitan precargar',()=>{
 for(const config of [{effectiveType:'2g'},{effectiveType:'slow-2g'},
  {effectiveType:'4g',saveData:true}]){
  const h=navHarness(config);
  h.next.click();h.next.click();
  assert.ok(h.videos.every(v=>v.preload==='none'),JSON.stringify(config));
 }
});
test('V3.6.75: cambios de red actualizan precarga sin añadir controles',()=>{
 const h=navHarness({effectiveType:'4g'});
 h.next.click();
 h.connection.effectiveType='2g';
 h.connectionHandlers.change();
 assert.ok(h.videos.every(v=>v.preload==='none'));
 h.connection.effectiveType='3g';
 h.connectionHandlers.change();
 assert.deepEqual(h.videos.map(v=>v.preload),['none','metadata','none','none','none','none','none']);
 h.connection.effectiveType='4g';
 h.connectionHandlers.change();
 assert.deepEqual(h.videos.map(v=>v.preload),['metadata','metadata','metadata','none','none','none','none']);
 assert.equal(h.counter.textContent,'Vídeo 2 de 7 cargados');
});
test('V3.6.75: red lenta y ahorro de datos impiden autoplay, no el control manual',()=>{
 for(const config of [{effectiveType:'2g'},{effectiveType:'slow-2g'},
  {effectiveType:'4g',saveData:true}]){
  const h=playbackHarness(config);
  h.show([.9,.02,0]);
  assert.equal(h.videos[0].playCalls,0);
  h.videos[0].play();
  h.listeners.play({target:h.videos[0]});
  assert.equal(h.videos[0].paused,false);
  assert.equal(h.videos[1].paused,true);
 }
});
test('V3.6.75: al cambiar de red lenta a rápida no arranca el vídeo anterior solo',()=>{
 const h=playbackHarness({effectiveType:'2g'});
 h.show([.9,.01,0]);
 assert.equal(h.videos[0].playCalls,0);
 h.connection.effectiveType='4g';
 h.show([.85,.02,0]);
 assert.equal(h.videos[0].playCalls,0);
 h.show([.12,.9,.03]);
 assert.equal(h.videos[1].playCalls,1);
 assert.equal(h.videos[0].paused,true);
});
test('V3.6.75: 3G permite autoplay visible pero sin precargar vecinos',()=>{
 const h=playbackHarness({effectiveType:'3g'});
 h.show([.91,.01,0]);
 assert.equal(h.videos[0].playCalls,1);
 assert.equal(h.videos[1].playCalls,0);
});
test('V3.6.75: conserva privacidad, acciones y versiones de JS',()=>{
 const item={id:'25',username:'autor',displayName:'Autor',video:'/uploads/reels/25.mp4',likes:0,comments:1};
 const publicHtml=renderPage([item],true);
 const followingHtml=renderPage([item],true,{mode:'siguiendo'});
 assert.match(publicHtml,/network=3\.6\.75/);
 assert.match(publicHtml,/data-pulso-like="25"/);
 assert.match(publicHtml,/data-pulso-comments="25"/);
 assert.match(publicHtml,/data-pulso-share="\/reel\/25"/);
 assert.match(playerSource,/credentials:'same-origin'/);
 assert.match(playerSource,/credentials:'omit'/);
 assert.doesNotMatch(navSource,/localStorage|sessionStorage|sendBeacon/);
 assert.doesNotMatch(playerSource,/localStorage|sessionStorage|sendBeacon/);
 assert.ok(followingHtml.includes('Pulso'));
});
