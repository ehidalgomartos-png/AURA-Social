'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderPage}=require('../src/routes/pulso-v3658');
const script=fs.readFileSync(path.join(__dirname,'../public/pulso-social-v3659.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({status,ok:status>=200&&status<300,json:async()=>data});
function harness(){
 const feedHandlers={},formHandlers={},documentHandlers={},reads=[],writes=[];
 const cards=[1,2,3].map(id=>{
  const count={textContent:'0'};
  return {dataset:{reelId:String(id)},count,
   querySelector(selector){
    if(selector==='[data-pulso-comments] b')return count;
    return null;
   }};
 });
 function node(tag){
  return {tag,children:[],textContent:'',className:'',hidden:false,
   append(...items){this.children.push(...items)},
   replaceChildren(...items){this.children=[...items]},
   setAttribute(name,value){this[name]=value},
   removeAttribute(name){delete this[name]}
  };
 }
 function dialog(){
  const d=node('dialog');
  d.open=false;d.listeners={};
  d.showModal=()=>{d.open=true};
  d.close=()=>{d.open=false;d.listeners.close?.()};
  d.addEventListener=(name,fn)=>{d.listeners[name]=fn};
  d.querySelectorAll=()=>[];
  return d;
 }
 const auth=dialog(),comments=dialog(),list=node('div'),notice=node('p'),status=node('p');
 const composer={value:''},submitButton={disabled:false};
 const form={addEventListener(name,fn){formHandlers[name]=fn},
  querySelector(selector){assert.equal(selector,'[type="submit"]');return submitButton}};
 const feed={
  dataset:{pulsoMode:'para-ti'},
  querySelectorAll(selector){
   if(selector==='[data-pulso-item]')return cards;
   if(selector==='video.pulso-video')return [];
   return [];
  },
  addEventListener(name,fn){feedHandlers[name]=fn}
 };
 const ids={pulsoFeed:feed,pulsoAuthDialog:auth,pulsoCommentsDialog:comments,
  pulsoCommentsList:list,pulsoCommentForm:form,pulsoCommentBody:composer,
  pulsoCommentStatus:status,pulsoSocialNotice:notice};
 const document={
  activeElement:{isConnected:true,focus(){}},
  getElementById(name){return ids[name]||null},
  addEventListener(name,fn){documentHandlers[name]=fn},
  createElement:node
 };
 async function fetch(url,options={}){
  if(url.startsWith('/api/pulso/state?ids=')){
   const ids=decodeURIComponent(url.split('ids=')[1]).split(',');
   return response({authenticated:true,states:Object.fromEntries(ids.map(id=>[id,{
    authorId:'101',liked:false,following:false,own:false}]))});
  }
  if(url==='/api/pulso/session')return response({authenticated:true});
  const match=/^\/api\/posts\/([1-9][0-9]*)\/comments$/.exec(url);
  if(match&&(!options.method||options.method==='GET')){
   return new Promise(resolve=>reads.push({id:match[1],resolve}));
  }
  if(match&&options.method==='POST'){
   return new Promise(resolve=>writes.push({id:match[1],body:JSON.parse(options.body).body,resolve}));
  }
  throw Error('Unexpected request: '+url);
 }
 vm.runInNewContext(script,{document,fetch,
  setTimeout:()=>1,clearTimeout(){},URLSearchParams},{timeout:2500});
 async function clickComments(id){
  const button={dataset:{pulsoComments:String(id)}};
  feedHandlers.click({target:{closest(selector){
   if(selector==='[data-pulso-comments]')return button;
   return null;
  }},preventDefault(){}});
  await tick();
 }
 function close(){
  const button={closest(selector){return selector==='dialog'?comments:null}};
  documentHandlers.click({target:{closest(selector){
   if(selector==='[data-pulso-close]')return button;
   return null;
  }}});
 }
 function finishGet(requestIndex,{id,body,success=true}={}){
  const req=reads[requestIndex];assert.ok(req);
  req.resolve(success?response({comments:[{
   username:'autor',display_name:'Autor',body:body||('Comentario '+(id||req.id))
  }]}):response({error:'error'},503));
 }
 function commentBodies(){
  return list.children.flatMap(child=>child.children?.filter(item=>item.tag==='p')
   .map(item=>item.textContent)||[]);
 }
 async function submit(body){
  composer.value=body;
  await formHandlers.submit({preventDefault(){}});
 }
 return {cards,reads,writes,auth,comments,list,composer,status,submitButton,
  documentHandlers,feedHandlers,formHandlers,clickComments,close,finishGet,
  commentBodies,submit};
}
test('V3.6.81: una respuesta vieja de A no sustituye comentarios del Reel B',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);
 await h.clickComments(2);
 assert.deepEqual(h.reads.map(r=>r.id),['1','2']);
 h.finishGet(1,{body:'El vídeo B'});await tick();
 assert.deepEqual(h.commentBodies(),['El vídeo B']);
 h.finishGet(0,{body:'El vídeo A antiguo'});await tick();
 assert.deepEqual(h.commentBodies(),['El vídeo B']);
});
test('V3.6.81: cerrar mientras espera GET impide renderizar contenido tardío',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);
 h.close();
 assert.equal(h.comments.open,false);
 h.finishGet(0,{body:'Respuesta tras cerrar'});await tick();
 assert.ok(!h.commentBodies().includes('Respuesta tras cerrar'));
});
test('V3.6.81: cerrar y reabrir el mismo Reel solo acepta la consulta más reciente',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);
 h.close();
 await h.clickComments(1);
 assert.equal(h.reads.length,2);
 h.finishGet(1,{body:'Contenido actual'});await tick();
 assert.deepEqual(h.commentBodies(),['Contenido actual']);
 h.finishGet(0,{body:'Contenido anterior'});await tick();
 assert.deepEqual(h.commentBodies(),['Contenido actual']);
});
test('V3.6.81: error tardío de A tampoco oculta los comentarios de B',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);await h.clickComments(2);
 h.finishGet(1,{body:'B válido'});await tick();
 h.finishGet(0,{success:false});await tick();
 assert.deepEqual(h.commentBodies(),['B válido']);
});
test('V3.6.81: un POST de A terminado después de abrir B no altera su borrador',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);
 h.finishGet(0,{body:'Antes'});await tick();
 const pending=h.submit('Comentario escrito en A');
 await tick();assert.equal(h.writes.length,1);
 assert.equal(h.writes[0].id,'1');
 await h.clickComments(2);
 h.finishGet(1,{body:'Comentarios de B'});await tick();
 h.composer.value='Borrador de B';
 h.writes[0].resolve(response({success:true}));await pending;await tick();
 assert.equal(h.composer.value,'Borrador de B','el POST de A no borra B');
 assert.equal(h.status.textContent,'','el POST de A no publica estados en B');
 assert.equal(h.cards[0].count.textContent,'1','el contador del Reel A sí se actualiza');
 assert.equal(h.cards[1].count.textContent,'0');
 assert.deepEqual(h.commentBodies(),['Comentarios de B']);
 assert.equal(h.reads.length,2,'no pide comentarios adicionales de B');
});
test('V3.6.81: POST fallido de A no muestra un error falso en B',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);h.finishGet(0,{body:'Antes'});await tick();
 const pending=h.submit('Comentario en A');await tick();
 await h.clickComments(2);h.finishGet(1,{body:'B'});await tick();
 h.writes[0].resolve(response({error:'failed'},503));
 await pending;await tick();
 assert.equal(h.status.textContent,'');
 assert.deepEqual(h.commentBodies(),['B']);
 assert.equal(h.submitButton.disabled,false);
});
test('V3.6.81: mantiene el flujo habitual de publicación y refresco de A',async()=>{
 const h=harness();await tick();
 await h.clickComments(1);
 h.finishGet(0,{body:'Original'});await tick();
 const pending=h.submit('Nuevo comentario');await tick();
 h.writes[0].resolve(response({ok:true}));await tick();
 assert.equal(h.reads.length,2);
 h.finishGet(1,{body:'Nuevo comentario'});await pending;
 assert.deepEqual(h.commentBodies(),['Nuevo comentario']);
 assert.equal(h.cards[0].count.textContent,'1');
 assert.equal(h.composer.value,'');
 assert.equal(h.status.textContent,'Comentario publicado.');
 assert.equal(h.submitButton.disabled,false);
});
test('V3.6.81: botones, privacidad y cache-bust se mantienen',()=>{
 const html=renderPage([{
  id:'25',username:'autor',displayName:'Autor',video:'/uploads/reels/25.mp4',
  likes:0,comments:0
 }],true);
 assert.match(html,/pulso-social-v3659\.js\?v=3\.6\.59&amp;notice=3\.6\.71&amp;comments=3\.6\.81/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.match(script,/credentials:'same-origin'/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|sendBeacon/);
});
