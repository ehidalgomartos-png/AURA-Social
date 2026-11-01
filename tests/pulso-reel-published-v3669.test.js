'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');

function harness(){
 const start=source.indexOf('function reelPublishedDestinationV3669(');
 const end=source.indexOf('function releaseEnabled(',start);
 assert.ok(start>0&&end>start,'Helper de confirmación presente');
 const classes=new Set(['hidden']);
 const el={children:[],offsetWidth:1,_text:'',
  get textContent(){return this._text;},
  set textContent(s){this._text=String(s);this.children=[];},
  append(...items){this.children.push(...items);},
  classList:{
   add(...names){names.forEach(name=>classes.add(name));},
   remove(...names){names.forEach(name=>classes.delete(name));},
   contains(name){return classes.has(name);}
  }
 };
 const timers=[];
 const context={
  toastTimer:null,
  $:selector=>selector==='#toast'?el:null,
  document:{createElement:tag=>({tagName:tag.toUpperCase(),href:'',textContent:'',className:''})},
  setTimeout:(callback,ms)=>{const timer={callback,ms};timers.push(timer);return timers.length;},
  clearTimeout:()=>{}
 };
 vm.runInNewContext(source.slice(start,end)+'\nthis.destination=reelPublishedDestinationV3669;this.show=toastPublishedReelV3669;this.toast=toast;',context,{timeout:3000});
 return {...context,el,classes,timers};
}
const published={id:25,post_kind:'reel',moderation_status:'published',media_type:'video',
 audience:'public',content_level:'normal'};
const choose=(h,post=published,extra={})=>h.destination({kind:'reel',publishMode:'now',waitingApprovals:false,post,...extra});

test('V3.6.69: un Reel realmente publicado abre su publicación propia y las acciones existentes',()=>{
 const h=harness(),result=choose(h);
 assert.equal(result.href,'/app?post=25');
 assert.equal(result.label,'Ver y compartir');
 h.show('Reel publicado',{kind:'reel',publishMode:'now',waitingApprovals:false,post:published});
 assert.equal(h.el.textContent,'Reel publicado');
 assert.equal(h.el.children.length,2);
 assert.equal(h.el.children[0],' · ');
 assert.equal(h.el.children[1].tagName,'A');
 assert.equal(h.el.children[1].href,'/app?post=25');
 assert.equal(h.el.children[1].textContent,'Ver y compartir');
 assert.ok(h.el.classList.contains('pulso-published-toast-v3669'));
 assert.equal(h.timers.at(-1).ms,8500);
});
test('V3.6.69: la vista propia sirve para Reels privados sin prometer compartir públicamente',()=>{
 const h=harness();
 for(const post of [
  {...published,audience:'connections'},
  {...published,content_level:'nudity'},
  {...published,audience:'circles'}
 ]){
  const result=choose(h,post);
  assert.equal(result.href,'/app?post=25');
  assert.equal(result.label,'Ver Reel');
 }
});
test('V3.6.69: Reels pendientes, borradores, programados o sin ID no reciben enlace',()=>{
 const h=harness();
 for(const opts of [
  {kind:'post'},
  {publishMode:'draft'},
  {publishMode:'scheduled'},
  {waitingApprovals:true},
  {post:{...published,moderation_status:'under_review'}},
  {post:{...published,post_kind:'post'}},
  {post:{...published,id:0}},
  {post:{...published,id:'25/evil'}},
  {post:{...published,id:'123456789012345678901'}}
 ]){
  assert.equal(choose(h,published,opts),null,JSON.stringify(opts));
 }
 h.show('Reel guardado. Esperando aprobaciones.',{
  kind:'reel',publishMode:'now',waitingApprovals:true,post:published
 });
 assert.equal(h.el.children.length,0);
 assert.equal(h.el.classList.contains('pulso-published-toast-v3669'),false);
});
test('V3.6.69: otra notificación limpia el enlace temporal sin efectos secundarios',()=>{
 const h=harness();
 h.show('Reel publicado',{kind:'reel',publishMode:'now',waitingApprovals:false,post:published});
 assert.equal(h.el.children.length,2);
 h.toast('Otra notificación');
 assert.equal(h.el.textContent,'Otra notificación');
 assert.equal(h.el.children.length,0);
 assert.equal(h.el.classList.contains('pulso-published-toast-v3669'),false);
});
test('V3.6.69: integración segura con respuesta 201 y visor autenticado, sin duplicar publicaciones',()=>{
 const html=read('public/app.html'),css=read('public/pulso-publish-confirm-v3669.css');
 const server=read('src/routes/posts.js');
 assert.match(html,/pulso-publish-confirm-v3669\.css\?v=3\.6\.69/);
 assert.match(source,/if\(kind==='reel'\)\{\s*const reelMessage=/);
 assert.match(source,/toastPublishedReelV3669\(reelMessage,\{/);
 assert.match(source,/post:d\.post/);
 assert.match(source,/Reel guardado\. Esperando aprobaciones/);
 assert.match(source,/Reel publicado/);
 assert.match(source,/\$\('#modal'\)\.classList\.add\('hidden'\)/);
 assert.match(source,/async function openPostFocus\(postId\)/);
 assert.match(source,/api\(\`\/api\/posts\/detail\/\$\{encodeURIComponent\(postId\)\}\`\)/);
 assert.match(source,/root\.innerHTML = postHTML\(d\.post\)/);
 assert.match(source,/bindPostActions\(root\)/);
 assert.match(source,/data-share-type=/);
 assert.match(server,/res\.status\(201\)\.json\(\{[\s\S]*?post,/);
 assert.match(css,/#toast\.pulso-published-toast-v3669/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.doesNotMatch(css,/position:fixed|object-fit:cover|transform:scale\(/);
 assert.doesNotMatch(source.slice(source.indexOf('function reelPublishedDestinationV3669('),source.indexOf('function toast(t)')),/fetch\(|api\(|Math\.random|localStorage|sessionStorage/);
});
