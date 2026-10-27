'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function harness(){
 const start=social.indexOf('let postFocusRequestSequenceV3336=0;');
 const end=social.indexOf("$('#refreshCommunityConversations')",start);
 assert.ok(start>=0&&end>start);
 const classes=new Set(['hidden']);
 const modal={classList:{
  remove:k=>classes.delete(k),
  add:k=>classes.add(k),
  contains:k=>classes.has(k)
 }};
 const root={innerHTML:''},pending=[],bound=[];
 const ctx={me:{id:4},String,encodeURIComponent,
  $:k=>k==='#postFocusModal'?modal:k==='#postFocusContent'?root:null,
  api:url=>new Promise(resolve=>pending.push({url,resolve})),
  postHTML:p=>'<article>'+p.caption+'</article>',
  bindPostActions:()=>bound.push('bound')};
 vm.runInNewContext(social.slice(start,end)+'\nthis.open=openPostFocus;this.close=closePostFocus;',ctx);
 return {ctx,root,classes,pending,bound,
   open:id=>ctx.open(id),close:()=>ctx.close(),
   reply:(n,post)=>pending[n].resolve({r:{ok:!!post},d:{post}})};
}
test('only the most recently requested real post appears when responses arrive reversed',async()=>{
 const h=harness();
 const first=h.open(41),second=h.open(42);
 assert.deepEqual(h.pending.map(x=>x.url),
  ['/api/posts/detail/41','/api/posts/detail/42']);
 h.reply(1,{caption:'Nueva conversación'});await second;
 h.reply(0,{caption:'Respuesta antigua'});await first;
 assert.match(h.root.innerHTML,/Nueva conversación/);
 assert.doesNotMatch(h.root.innerHTML,/Respuesta antigua/);
 assert.equal(h.bound.length,1);
 assert.equal(h.classes.has('hidden'),false);
});
test('closing a post before its response arrives cannot reopen or render the dialog',async()=>{
 const h=harness(),task=h.open(51);
 h.close();
 h.reply(0,{caption:'Llega después de cerrar'});await task;
 assert.equal(h.classes.has('hidden'),true);
 assert.equal(h.root.innerHTML,'');
 assert.deepEqual(h.bound,[]);
});
test('a request from the previous account is discarded and the modal closes',async()=>{
 const h=harness(),task=h.open(61);
 h.ctx.me={id:5};
 h.reply(0,{caption:'Post de la cuenta anterior'});await task;
 assert.equal(h.classes.has('hidden'),true);
 assert.equal(h.root.innerHTML,'');
 assert.deepEqual(h.bound,[]);
});
test('newer error is shown but an older successful response cannot replace it',async()=>{
 const h=harness();
 const a=h.open(71),b=h.open(72);
 h.reply(1,null);await b;
 h.reply(0,{caption:'Contenido obsoleto'});await a;
 assert.match(h.root.innerHTML,/La publicación ya no está disponible/);
 assert.doesNotMatch(h.root.innerHTML,/Contenido obsoleto/);
});
test('existing comment navigation, server read permissions and layout remain unchanged',()=>{
 const posts=read('src/routes/posts.js'),html=read('public/app.html');
 assert.match(social,/async function openComments\(/);
 assert.match(social,/async function navigateNotification\(notification\)/);
 assert.match(social,/function closePostFocus\(\)/);
 assert.match(social,/bindPostActions\(root\)/);
 assert.match(posts,/router\.get\('\/detail\/:id'/);
 assert.match(html,/postfocus=3\.3\.36/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/post-focus-navigation-v3336\.test\.js/);
 const snippet=social.slice(social.indexOf('let postFocusRequestSequenceV3336=0;'),
  social.indexOf("$('#refreshCommunityConversations')",social.indexOf('let postFocusRequestSequenceV3336=0;')));
 assert.doesNotMatch(snippet,/setInterval|localStorage|sessionStorage|sendBeacon|requestPermission/);
});
