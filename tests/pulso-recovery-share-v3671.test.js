'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function navHarness(){
 const handlers={},windowListeners={},observed=[];
 const card={marker:true,isConnected:true,dataset:{reelId:'25'},_alert:null,
  attrs:{},setAttribute(k,v){this.attrs[k]=String(v)},removeAttribute(k){delete this.attrs[k]},
  querySelector(selector){
   if(selector==='video.pulso-video')return video;
   if(selector==='.pulso-error-v3664')return this._alert;
   return null;
  },
  append(el){el.parentNode=this;this._alert=el},
  scrollIntoView(){}
 };
 const video={preload:'none',paused:true,loadCalls:0,playCalls:0,
  matches:s=>s==='video.pulso-video',closest:()=>card,
  load(){this.loadCalls++},
  play(){this.playCalls++;this.paused=false;return Promise.resolve()},
  pause(){this.paused=true}
 };
 function element(tag){
  return {tagName:tag.toUpperCase(),children:[],dataset:{},attributes:{},
   setAttribute(k,v){this.attributes[k]=String(v)},
   append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node)}},
   closest(selector){
    if(selector!=='[data-pulso-item]')return null;
    let node=this;
    while(node){if(node.marker)return node;node=node.parentNode;}
    return null;
   },
   querySelector(selector){
    if(selector==='p')return this.children.find(x=>x.tagName==='P')||null;
    if(selector==='[data-pulso-retry]')return this.children.find(x=>x.dataset?.pulsoRetry==='')||null;
    return null;
   },
   remove(){if(this.parentNode?.marker)this.parentNode._alert=null;this.removed=true}
  };
 }
 const feed={handlers,querySelectorAll:sel=>sel==='[data-pulso-item]'?[card]:[],
  addEventListener(name,fn){handlers[name]=fn},
  getBoundingClientRect:()=>({top:0,bottom:600})};
 const button=()=>({disabled:false,addEventListener(){},setAttribute(){}});
 const prev=button(),next=button(),more={hidden:true,disabled:false};
 const ids={pulsoFeed:feed,pulsoPreviousV3664:prev,pulsoNextV3664:next,
  pulsoNavStatusV3664:{textContent:''},pulsoMore:more};
 const document={visibilityState:'visible',
  getElementById:id=>ids[id]||null,
  addEventListener(){},
  createElement:element};
 class Observer{
  constructor(){this.targets=[];observed.push(this)}
  observe(node){this.targets.push(node)}
  disconnect(){this.disconnected=true}
 }
 const window={navigator:{connection:{saveData:false}},
  matchMedia:()=>({matches:false}),
  IntersectionObserver:Observer,
  addEventListener:(event,fn)=>{windowListeners[event]=fn}};
 vm.runInNewContext(read('public/pulso-navigation-v3664.js'),{
  document,window,IntersectionObserver:Observer,requestAnimationFrame:fn=>fn()
 },{timeout:2000});
 return {card,video,feed,windowListeners,observed};
}
function shareHarness(){
 const handlers={},events=[],prompts=[];
 const feed={dataset:{pulsoMode:'para-ti'},handlers,
  addEventListener(name,fn){handlers[name]=fn},
  querySelectorAll:()=>[],
  dispatchEvent(event){events.push(event);return true}};
 const more={hidden:true,addEventListener(){}};
 const status={textContent:''};
 const ids={pulsoFeed:feed,pulsoMore:more,pulsoStatus:status,pulsoFooter:{}};
 const document={visibilityState:'visible',
  getElementById:id=>ids[id]||null,addEventListener(){}};
 class Observer{observe(){} disconnect(){}}
 class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail}}
 const navigator={connection:{saveData:false}};
 const window={navigator,matchMedia:()=>({matches:false}),
  IntersectionObserver:Observer,addEventListener(){},
  prompt(...args){prompts.push(args)}};
 vm.runInNewContext(read('public/pulso-v3658.js'),{
  document,window,navigator,IntersectionObserver:Observer,CustomEvent,
  location:{origin:'https://redlibertad.com'}
 },{timeout:2000});
 const button={dataset:{pulsoShare:'/reel/25'},disabled:false};
 const click=()=>handlers.click({target:{
  closest:selector=>selector==='[data-pulso-share]'?button:null
 }});
 return {button,click,navigator,status,events,prompts};
}

test('V3.6.71: el error muestra un solo reintento, mantiene el enlace original y evita bucles',()=>{
 const h=navHarness();
 h.feed.handlers.error({target:h.video});
 const alert=h.card._alert;
 assert.ok(alert);
 assert.equal(alert.attributes.role,'alert');
 assert.equal(alert.children[0].textContent,'No se pudo reproducir este vídeo aquí.');
 assert.equal(alert.children[1].href,'/reel/25');
 const retry=alert.children[2];
 assert.equal(retry.dataset.pulsoRetry,'');
 assert.equal(retry.textContent,'Reintentar vídeo');
 h.feed.handlers.error({target:h.video});
 assert.equal(h.card._alert,alert);
 h.feed.handlers.click({target:retry});
 assert.equal(h.video.loadCalls,1);
 assert.equal(h.video.playCalls,1);
 assert.equal(retry.disabled,true);
 h.feed.handlers.error({target:h.video});
 assert.match(alert.children[0].textContent,/sigue sin poder/);
 assert.equal(retry.hidden,true);
 h.feed.handlers.click({target:retry});
 assert.equal(h.video.loadCalls,1);
 h.feed.handlers.canplay({target:h.video});
 assert.equal(h.card._alert,null);
 h.feed.handlers.error({target:h.video});
 assert.equal(h.card._alert.children.length,2,'una segunda falla ofrece solo enlace al Reel');
});
test('V3.6.71: el observador de navegación se recupera tras volver del historial',()=>{
 const h=navHarness();
 const initial=h.observed[0].targets.length;
 h.windowListeners.pagehide();
 assert.equal(h.observed[0].disconnected,true);
 h.windowListeners.pageshow({persisted:false});
 assert.equal(h.observed[0].targets.length,initial);
 h.windowListeners.pageshow({persisted:true});
 assert.equal(h.observed[0].targets.length,initial+1);
});
test('V3.6.71: compartir desde móvil usa el menú nativo sin abrir otro',async()=>{
 const h=shareHarness();
 let times=0,release;
 h.navigator.share=()=>{times++;return new Promise(resolve=>{release=resolve})};
 h.navigator.clipboard={writeText(){throw Error('Must not copy during native share')}};
 const first=h.click(),second=h.click();
 await second;
 assert.equal(times,1);
 assert.equal(h.button.disabled,true);
 release();await first;
 assert.equal(h.button.disabled,false);
 assert.equal(h.events.length,0);
 assert.equal(h.prompts.length,0);
});
test('V3.6.71: cancelar el menú del móvil no copia ni abre ventanas',async()=>{
 const h=shareHarness();
 h.navigator.share=async()=>{const err=new Error('cancel');err.name='AbortError';throw err};
 h.navigator.clipboard={writeText(){throw Error('Must not copy if canceled')}};
 await h.click();
 assert.equal(h.events.length,0);
 assert.equal(h.prompts.length,0);
 assert.equal(h.button.disabled,false);
});
test('V3.6.71: copiar comparte el enlace auténtico y muestra el aviso móvil',async()=>{
 const h=shareHarness();const copied=[];
 h.navigator.clipboard={writeText:async url=>copied.push(url)};
 await h.click();
 assert.deepEqual(copied,['https://redlibertad.com/reel/25']);
 assert.equal(h.status.textContent,'Enlace copiado para compartir.');
 assert.equal(h.events.length,1);
 assert.equal(h.events[0].type,'pulso:notice');
 assert.equal(h.events[0].detail.text,'Enlace copiado. Ya puedes compartirlo.');
 assert.equal(h.prompts.length,0);
 assert.equal(h.button.disabled,false);
});
test('V3.6.71: el fallo de compartir/copia ofrece selección manual, sin afirmar copia',async()=>{
 const h=shareHarness();
 h.navigator.share=async()=>{throw new Error('Unsupported web share')};
 h.navigator.clipboard={writeText:async()=>{throw new Error('denied')}};
 await h.click();
 assert.equal(h.events.length,0);
 assert.equal(h.prompts.length,1);
 assert.equal(h.prompts[0][1],'https://redlibertad.com/reel/25');
 assert.equal(h.button.disabled,false);
});
test('V3.6.71: los enlaces inválidos no se comparten',async()=>{
 const h=shareHarness();
 h.button.dataset.pulsoShare='/reel/25/../../privado';
 h.navigator.share=async()=>{throw Error('Must not share invalid URL')};
 await h.click();
 assert.equal(h.events.length,0);
 assert.equal(h.prompts.length,0);
});
test('V3.6.71: Pulso conserva edición, comentarios, diseño y privacidad',()=>{
 const sample={id:'25',video:'/uploads/25.mp4',username:'autor_real',
  displayName:'Autor',caption:'Un vídeo auténtico',avatar:null,likes:1,comments:2};
 const html=renderPage([sample],true);
 const nav=read('public/pulso-navigation-v3664.js');
 const social=read('public/pulso-social-v3659.js');
 const css=read('public/pulso-retry-v3671.css');
 assert.match(html,/pulso-retry-v3671\.css\?v=3\.6\.71/);
 assert.match(html,/pulso-navigation-v3664\.js\?v=3\.6\.64&amp;recovery=3\.6\.71/);
 assert.match(html,/pulso-v3658\.js\?v=3\.6\.58&amp;playback=3\.6\.70&amp;share=3\.6\.71/);
 assert.match(html,/pulso-social-v3659\.js\?v=3\.6\.59&amp;notice=3\.6\.71/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/href="\/app\?view=reels&crear=reel"/);
 assert.match(social,/feed\.addEventListener\('pulso:notice'/);
 assert.match(social,/message\('Enlace copiado\. Ya puedes compartirlo\.'\)/);
 assert.match(nav,/new WeakSet\(\)/);
 assert.match(nav,/video\.load\(\)/);
 assert.match(nav,/feed\.addEventListener\('canplay'|for\(const name of \['canplay','playing'\]\)/);
 assert.match(css,/\.pulso-retry-v3671/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/object-fit:cover|transform:scale\(/);
 assert.doesNotMatch(nav,/Math\.random|sendBeacon|localStorage/);
});
