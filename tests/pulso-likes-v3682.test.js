'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const source=fs.readFileSync(path.join(__dirname,'../public/pulso-social-v3659.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({
 status,ok:status>=200&&status<300,json:async()=>data
});
function harness(){
 const feedListeners={},docListeners={},likeWrites=[],stateGets=[];
 let deferStates=false,nextStateStatus=null,mutation=null;
 const cards=[];
 function card(id){
  const attrs={'aria-pressed':'false'},classes=new Set(),count={textContent:'4'};
  const button={dataset:{pulsoLike:String(id)},disabled:false,attrs,classes,
   setAttribute(name,value){attrs[name]=value},
   classList:{toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name)}},
   querySelector(sel){return sel==='b'?count:null}
  };
  const result={dataset:{reelId:String(id)},button,count,
   querySelector(sel){return sel==='[data-pulso-like]'?button:null},
   matches(sel){return sel==='[data-pulso-item]'},
   querySelectorAll(){return []}
  };
  cards.push(result);return result;
 }
 const a=card(1),b=card(1),c=card(2);
 const notice={textContent:'',hidden:true};
 function dialog(){
  const d={open:false,attrs:{},listeners:{},
   showModal(){this.open=true},
   close(){this.open=false;this.listeners.close?.()},
   setAttribute(name,value){this.attrs[name]=value;this.open=true},
   removeAttribute(name){delete this.attrs[name];this.open=false},
   addEventListener(name,fn){this.listeners[name]=fn},
   querySelectorAll(){return [{textContent:'Ya tengo cuenta',href:''},
    {textContent:'Crear cuenta gratis',href:''}]}
  };
  return d;
 }
 const auth=dialog(),comments=dialog();
 const feed={
  querySelectorAll(sel){
   if(sel==='[data-pulso-item]')return cards;
   if(sel==='video.pulso-video')return [];
   return [];
  },
  addEventListener(name,fn){feedListeners[name]=fn}
 };
 const ids={pulsoFeed:feed,pulsoAuthDialog:auth,
  pulsoCommentsDialog:comments,pulsoCommentsList:{},
  pulsoCommentForm:{addEventListener(){}},
  pulsoCommentBody:{value:''},pulsoCommentStatus:{textContent:''},
  pulsoSocialNotice:notice};
 const document={
  activeElement:{isConnected:true,focus(){}},
  getElementById(id){return ids[id]||null},
  addEventListener(name,fn){docListeners[name]=fn}
 };
 async function fetch(url,options={}){
  if(url.startsWith('/api/pulso/state?ids=')){
   const reqIds=decodeURIComponent(url.split('ids=')[1]).split(',');
   const stateResponse=response({
    authenticated:true,
    states:Object.fromEntries(reqIds.map(id=>[id,{
     authorId:'99',liked:false,following:false,own:false
    }]))
   });
   if(nextStateStatus!==null){
    const status=nextStateStatus;nextStateStatus=null;
    return response({},status);
   }
   if(!deferStates)return stateResponse;
   return new Promise(resolve=>stateGets.push({ids:reqIds,resolve}));
  }
  if(url==='/api/pulso/session')return response({authenticated:true});
  const match=/^\/api\/posts\/([1-9][0-9]*)\/like$/.exec(url);
  if(match)return new Promise(resolve=>likeWrites.push({
   id:match[1],method:options.method,resolve
  }));
  throw Error('Unexpected fetch '+url);
 }
 class MutationObserver{
  constructor(fn){mutation=fn}
  observe(){}
 }
 vm.runInNewContext(source,{document,fetch,MutationObserver,URLSearchParams,
  setTimeout:()=>1,clearTimeout(){}},{timeout:2500});
 function clickLike(card){
  feedListeners.click({target:{
   closest(selector){return selector==='[data-pulso-like]'?card.button:null}
  },preventDefault(){}});
 }
 function append(id){
  const newCard=card(id);
  mutation?.([{addedNodes:[{
   nodeType:1,matches:sel=>sel==='[data-pulso-item]',
   dataset:{reelId:String(id)},querySelectorAll:()=>[]
  }]}]);
  return newCard;
 }
 function finish(index,data={liked:true,likeCount:5},status=200){
  assert.ok(likeWrites[index],String(index));
  likeWrites[index].resolve(response(data,status));
 }
 return {cards,a,b,c,auth,notice,clickLike,append,finish,likeWrites,
  stateGets,getStateIds:()=>stateGets.map(x=>x.ids),setDeferStates(v){deferStates=v},
  failNextState(status){nextStateStatus=status},tick};
}
test('V3.6.82: pulsar duplicados de un Reel genera una única operación',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);h.clickLike(h.b);h.clickLike(h.a);
 assert.equal(h.a.button.disabled,true);
 assert.equal(h.b.button.disabled,true);
 await tick();
 assert.equal(h.likeWrites.length,1);
 assert.equal(h.likeWrites[0].id,'1');
 assert.equal(h.likeWrites[0].method,'POST');
 h.finish(0,{liked:true,likeCount:'6'});await tick();
 for(const c of [h.a,h.b]){
  assert.equal(c.button.disabled,false);
  assert.equal(c.button.attrs['aria-pressed'],'true');
  assert.equal(c.count.textContent,'6');
  assert.ok(c.button.classes.has('is-liked'));
 }
});
test('V3.6.82: el siguiente toque quita Me gusta mediante DELETE',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);await tick();
 h.finish(0,{liked:true,likeCount:5});await tick();
 h.clickLike(h.b);await tick();
 assert.equal(h.likeWrites.length,2);
 assert.equal(h.likeWrites[1].method,'DELETE');
 h.finish(1,{liked:false,likeCount:4});await tick();
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
 assert.equal(h.b.button.attrs['aria-pressed'],'false');
 assert.equal(h.a.count.textContent,'4');
});
test('V3.6.82: distintos vídeos pueden actualizar Me gusta independientemente',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);h.clickLike(h.c);await tick();
 assert.deepEqual(h.likeWrites.map(w=>w.id),['1','2']);
 h.finish(1,{liked:true,likeCount:12});await tick();
 assert.equal(h.c.button.disabled,false);
 assert.equal(h.a.button.disabled,true);
 h.finish(0,{liked:true,likeCount:7});await tick();
 assert.equal(h.a.button.disabled,false);
 assert.equal(h.c.count.textContent,'12');
 assert.equal(h.a.count.textContent,'7');
});
test('V3.6.82: caída de conexión deja los contadores y estados previos intactos',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);await tick();
 h.finish(0,{error:'offline'},503);await tick();
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
 assert.equal(h.a.count.textContent,'4');
 assert.equal(h.b.count.textContent,'4');
 assert.equal(h.a.button.disabled,false);
 assert.match(h.notice.textContent,/No se pudo actualizar/);
 h.clickLike(h.b);await tick();
 assert.equal(h.likeWrites.length,2,'el botón permite reintentar manualmente');
});
test('V3.6.82: rechaza contadores inválidos en vez de pintar resultados ficticios',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);await tick();
 h.finish(0,{liked:true,likeCount:-1});await tick();
 assert.equal(h.a.count.textContent,'4');
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
});
test('V3.6.82: 401 descarta estado personal, libera los botones y ofrece entrada',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);await tick();
 h.finish(0,{},401);await tick();
 assert.equal(h.auth.open,true);
 assert.equal(h.a.button.disabled,false);
 assert.equal(h.b.button.disabled,false);
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
 h.clickLike(h.a);await tick();
 assert.equal(h.likeWrites.length,1,'no se hace otra escritura sin sesión');
});
test('V3.6.82: GET de estado atrasado no revierte Me gusta ya confirmado',async()=>{
 const h=harness();await tick();
 h.setDeferStates(true);
 const duplicate=h.append(1);await tick();
 assert.deepEqual(h.getStateIds(),[['1']]);
 h.clickLike(h.a);await tick();
 h.finish(0,{liked:true,likeCount:8});await tick();
 h.stateGets[0].resolve(response({authenticated:true,states:{
  '1':{authorId:'99',liked:false,following:false,own:false}
 }}));await tick();
 assert.equal(h.a.button.attrs['aria-pressed'],'true');
 assert.equal(h.b.button.attrs['aria-pressed'],'true');
 assert.equal(duplicate.button.attrs['aria-pressed'],'true');
 assert.equal(h.a.count.textContent,'8');
});
test('V3.6.82: un 401 de otro estado invalida la respuesta tardía del Me gusta',async()=>{
 const h=harness();await tick();
 h.clickLike(h.a);await tick();
 h.failNextState(401);
 h.append(3);await tick();
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
 h.finish(0,{liked:true,likeCount:11});await tick();
 assert.equal(h.a.button.attrs['aria-pressed'],'false');
 assert.equal(h.a.count.textContent,'4');
 assert.equal(h.a.button.disabled,false);
});
test('V3.6.82: mantiene las acciones sociales y la privacidad de Siguiendo',()=>{
 const html=renderPage([{id:'25',username:'autor',displayName:'Autor',
  video:'/uploads/reels/25.mp4',likes:2,comments:3}],true,{mode:'siguiendo'});
 assert.match(html,/comments=3\.6\.81&amp;likes=3\.6\.82/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(html,/noindex,nofollow/);
 assert.match(source,/credentials:'same-origin'/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon/);
});
