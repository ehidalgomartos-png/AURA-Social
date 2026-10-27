'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js');
function harness(){
 const at=js.indexOf('async function refreshActiveConversationLive() {');
 const end=js.indexOf('async function handleLiveActivity(',at);
 assert.ok(at>=0&&end>at);
 const code='const liveActivityRefreshInFlightV3337=new Set();\n'+js.slice(at,end)+'\nthis.refresh=refreshActiveConversationLive;';
 const pending=[],drawn=[],listUpdates=[];
 const thread={scrollHeight:180,scrollTop:70,clientHeight:100,
  get innerHTML(){return drawn.at(-1)||''},
  set innerHTML(v){drawn.push(v)}};
 const ctx={Set,String,Promise,encodeURIComponent,me:{id:11},
  activeConversationId:'1',activeViewName:'messages',openConversationSequenceV3244:1,
  activeConversationMeta:null,activeConversationSettings:null,activeConversationOther:null,
  api:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve})),
  $:sel=>sel==='#messageThread'?thread:null,
  messageHTML:m=>'<span>'+m.body+'</span>',
  bindMessageActions:()=>{},
  loadConversations:async()=>{listUpdates.push(ctx.activeConversationId)}};
 vm.runInNewContext(code,ctx);
 return {ctx,pending,drawn,listUpdates,refresh:()=>ctx.refresh(),
  complete:(n,body,ok=true)=>pending[n].resolve({
   r:{ok},d:{other:{display_name:'Persona'},conversation:{is_group:false},
    messages:[{body}],settings:{}}})};
}
test('switching between two real chats does not wait for the old chat live update',async()=>{
 const h=harness();
 const first=h.refresh();
 h.ctx.activeConversationId='2';h.ctx.openConversationSequenceV3244++;
 const second=h.refresh();
 assert.deepEqual(h.pending.map(x=>x.url),[
 '/api/messages/conversations/1/messages','/api/messages/conversations/2/messages']);
 h.complete(1,'Nuevo mensaje de B');await second;
 h.complete(0,'Mensaje tardío de A');await first;
 assert.match(h.drawn.at(-1),/Nuevo mensaje de B/);
 assert.doesNotMatch(h.drawn.join(''),/Mensaje tardío de A/);
 assert.deepEqual(h.listUpdates,['2']);
 assert.ok(h.pending.every(p=>p.options?.dedupe===false));
});
test('duplicate live signals for the same chat share one in-flight refresh',async()=>{
 const h=harness();
 const one=h.refresh(),two=h.refresh(),three=h.refresh();
 assert.equal(h.pending.length,1);
 h.complete(0,'Mensaje entrante');
 await Promise.all([one,two,three]);
 assert.equal(h.listUpdates.length,1);
 const next=h.refresh();
 assert.equal(h.pending.length,2);
 h.complete(1,'Otro mensaje');await next;
 assert.equal(h.listUpdates.length,2);
});
test('a prior account response is not rendered when switching identity, even for same conversation id',async()=>{
 const h=harness(),old=h.refresh();
 h.ctx.me={id:12};
 const newer=h.refresh();
 assert.equal(h.pending.length,2);
 h.complete(1,'Mensaje permitido de cuenta actual');await newer;
 h.complete(0,'Dato privado de otra cuenta');await old;
 assert.match(h.drawn.join(''),/Mensaje permitido/);
 assert.doesNotMatch(h.drawn.join(''),/Dato privado/);
 assert.deepEqual(h.listUpdates,['1']);
});
test('a closed chat, changed navigation generation or leaving Messages discards old response',async()=>{
 const h=harness();
 const closed=h.refresh();
 h.ctx.activeConversationId=null;
 h.complete(0,'Cerrada');await closed;
 h.ctx.activeConversationId='1';
 const reopened=h.refresh();h.ctx.openConversationSequenceV3244++;
 h.complete(1,'Navegación antigua');await reopened;
 const moved=h.refresh();h.ctx.activeViewName='feed';
 h.complete(2,'Se fue de mensajes');await moved;
 assert.deepEqual(h.drawn,[]);
 assert.deepEqual(h.listUpdates,[]);
});
test('live SSE remains read-only, gated to current account; existing mobile layout stays intact',()=>{
 const section=js.slice(js.indexOf('async function refreshActiveConversationLive() {'),
  js.indexOf('async function handleLiveActivity('));
 assert.match(section,/viewerId!==String\(me\?\.id \?\? 'guest'\)/);
 assert.match(section,/openSequence!==openConversationSequenceV3244/);
 assert.match(section,/activeViewName!=='messages'/);
 assert.match(section,/liveActivityRefreshInFlightV3337\.delete\(key\)/);
 assert.doesNotMatch(section,/setInterval|localStorage|sessionStorage|sendBeacon|method:'POST'/);
 const route=read('src/routes/messages.js');
 assert.match(route,/router\.get\('\/conversations\/:id\/messages'/);
 assert.match(route,/conversationDetails\(id,req\.user\.id\)/);
 assert.match(js,/class=\"mobile-chat-back\"/);
 assert.equal(read('public/app.html').split('chatlive=3.3.37').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/chat-live-switch-v3337\.test\.js/);
});
