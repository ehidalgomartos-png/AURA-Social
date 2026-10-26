'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');

function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a, 'missing function boundaries: '+start);
  return source.slice(a,b);
}
function messagesHarness(){
  const pending=[],badges=[],opened=[];
  const root={innerHTML:'Vista original',setAttribute(name,value){this[name]=value}};
  const ctx={
    messageConversationFilter:'all',messageConversationSearch:'',conversationListRequestSequenceV339:0,
    URLSearchParams,
    $:key=>key==='#conversationList'?root:null,
    all:()=>[],api:url=>new Promise(resolve=>pending.push({url,resolve})),
    uiStateHTML:({title})=>'Error: '+title,
    updateMessageBadge:n=>badges.push(n),liveActivityState:{},
    conversationListIdentity:()=>({}),conversationPresence:()=>null,
    conversationPreviewText:()=>'',esc:String,
    updateConversationPresenceBadges:()=>{},
    openConversation:async id=>opened.push(id),Number,String
  };
  vm.runInNewContext(section('async function loadConversations(openId = null) {','function groupParticipantsSummary(')+
    '\nthis.load=loadConversations;',ctx);
  return {ctx,pending,badges,opened,root};
}
function notificationsHarness(){
  const pending=[],badges=[],rendered=[];
  const root={innerHTML:'Notificaciones anteriores',setAttribute(name,value){this[name]=value}};
  const ctx={
    notificationListRequestSequenceV339:0,
    notificationCache:[],liveActivityState:{latestNotificationId:'0'},
    $:key=>key==='#notificationsList'?root:null,
    api:url=>new Promise(resolve=>pending.push({url,resolve})),
    uiStateHTML:({title})=>'Error: '+title,
    updateNotificationBadge:n=>badges.push(n),
    renderNotifications:()=>rendered.push(ctx.notificationCache.map(x=>x.id))
  };
  vm.runInNewContext(section('async function loadNotifications() {',"$('#notificationReplyShortcutV32156')")+
    '\nthis.load=loadNotifications;',ctx);
  return {ctx,pending,badges,rendered,root};
}
test('messages: older filter response cannot overwrite the latest list or badge',async()=>{
  const h=messagesHarness();
  const first=h.ctx.load();
  h.ctx.messageConversationFilter='unread';
  const second=h.ctx.load();
  assert.match(h.pending[0].url,/filter=all/);
  assert.match(h.pending[1].url,/filter=unread/);
  h.pending[1].resolve({r:{ok:true},d:{conversations:[],summary:{unread:2}}});
  await second;
  assert.match(h.root.innerHTML,/No hay conversaciones en este filtro/);
  assert.equal(h.root['aria-busy'],'false');
  assert.deepEqual(h.badges,[0]);
  h.pending[0].resolve({r:{ok:false},d:{error:'request_timeout'}});
  await first;
  assert.doesNotMatch(h.root.innerHTML,/Error:/);
  assert.deepEqual(h.badges,[0]);
});
test('messages: older response must never open a stale deep-link conversation',async()=>{
  const h=messagesHarness();
  const old=h.ctx.load('41');
  h.ctx.messageConversationSearch='fotografía';
  const current=h.ctx.load();
  h.pending[1].resolve({r:{ok:true},d:{conversations:[]}});
  await current;
  h.pending[0].resolve({r:{ok:true},d:{conversations:[]}});
  await old;
  assert.deepEqual(h.opened,[]);
  assert.equal(h.ctx.messageConversationSearch,'fotografía');
});
test('messages: changed search invalidates pending results before debounce finishes',async()=>{
  const h=messagesHarness();
  const pending=h.ctx.load();
  h.ctx.messageConversationSearch='nuevo';
  h.pending[0].resolve({r:{ok:true},d:{conversations:[]}});
  await pending;
  assert.equal(h.root.innerHTML,'Vista original');
  assert.deepEqual(h.badges,[]);
});
test('notifications: old successful response never rolls back recent unread count or list',async()=>{
  const h=notificationsHarness();
  const first=h.ctx.load(),second=h.ctx.load();
  h.pending[1].resolve({r:{ok:true},d:{notifications:[{id:11}],unread:1}});
  await second;
  h.pending[0].resolve({r:{ok:true},d:{notifications:[{id:8}],unread:5}});
  await first;
  assert.deepEqual(h.badges,[1]);
  assert.deepEqual(h.rendered,[[11]]);
  assert.equal(h.ctx.liveActivityState.latestNotificationId,'11');
  assert.equal(h.root['aria-busy'],'false');
});
test('notifications: old network error cannot replace newer successful content',async()=>{
  const h=notificationsHarness();
  const first=h.ctx.load(),second=h.ctx.load();
  h.pending[1].resolve({r:{ok:true},d:{notifications:[],unread:0}});
  await second;
  h.pending[0].resolve({r:{ok:false},d:{error:'offline'}});
  await first;
  assert.deepEqual(h.badges,[0]);
  assert.deepEqual(h.rendered,[[]]);
  assert.equal(h.root.innerHTML,'Notificaciones anteriores');
});
test('no new tracking, side-effecting API, UI duplication or cached private data',()=>{
  const a=section('async function loadConversations(openId = null) {','function groupParticipantsSummary(');
  const b=section('async function loadNotifications() {',"$('#notificationReplyShortcutV32156')");
  assert.match(a,/requestId!==conversationListRequestSequenceV339/);
  assert.match(a,/filter!==messageConversationFilter \|\| search!==messageConversationSearch/);
  assert.match(b,/requestId!==notificationListRequestSequenceV339/);
  assert.doesNotMatch(a+b,/localStorage|sessionStorage|INSERT INTO|autoFollow|sendBeacon|navigator\.sendBeacon/);
  assert.equal((read('public/app.html').match(/id="conversationList"/g)||[]).length,1);
  assert.equal((read('public/app.html').match(/id="notificationsList"/g)||[]).length,1);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/mobile-async-lists-v339\.test\.js/);
});
