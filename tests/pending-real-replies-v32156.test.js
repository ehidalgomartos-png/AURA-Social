'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');
const notifications=read('src/routes/notifications.js');

test('server marks a real reply only if its parent comment belongs to the current authenticated user',()=>{
  assert.match(notifications,/router\.use\(requireAuth\)/);
  assert.match(notifications,/await ensureCommentNotificationTargetV32155\(\)/);
  assert.match(notifications,/n\.comment_id,n\.text,n\.read_at/);
  assert.match(notifications,/LEFT JOIN comments reply_comment ON reply_comment\.id=n\.comment_id/);
  assert.match(notifications,/LEFT JOIN comments reply_parent ON reply_parent\.id=reply_comment\.parent_comment_id/);
  assert.match(notifications,/reply_parent\.user_id=n\.user_id\) AS reply_to_me/);
  assert.match(notifications,/WHERE n\.user_id=\$1/);
  assert.match(notifications,/muted_id FROM mutes WHERE muter_id=\$1/);
  assert.doesNotMatch(notifications,/UPDATE notifications SET reply_to_me|INSERT INTO notifications/);
});

function harness(){
  const button={
    hidden:true,attrs:{},textContent:'',
    classList:{hidden:true,toggle(name,value){if(name==='hidden')this.hidden=value}},
    setAttribute(name,value){button.attrs[name]=value}
  };
  const sandbox={
    notificationCache:[],activeNotificationFilter:'all',pendingRepliesOnlyV32156:false,
    '$':selector=>selector==='#notificationReplyShortcutV32156'?button:null
  };
  const start=js.indexOf('function isPendingReplyV32156(');
  const end=js.indexOf('function renderNotifications()',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(js.slice(start,end)+
    '\nthis.isPending=isPendingReplyV32156;this.count=pendingReplyCountV32156;this.update=updateReplyShortcutV32156;',sandbox);
  return {sandbox,button};
}
function notification(id,extra={}){
  return {id,type:'comment',entity_type:'post',reply_to_me:true,read_at:null,...extra};
}
test('only unread server-confirmed replies count; no guessing by wording',()=>{
  const h=harness();
  const items=[
    notification(1),notification(2,{read_at:'2026-10-26T10:00:00Z'}),
    notification(3,{reply_to_me:false}),notification(4,{reply_to_me:null}),
    notification(5,{reply_to_me:'true'}),
    notification(6,{type:'like'}),notification(7,{entity_type:'community'}),
    {type:'comment',text:'Ha respondido a tu comentario.',read_at:null}
  ];
  assert.equal(h.sandbox.count(items),1);
  assert.equal(h.sandbox.isPending(items[0]),true);
  assert.equal(h.sandbox.isPending(items[1]),false);
  assert.equal(h.sandbox.isPending(items[7]),false);
});
test('compact button is hidden unless actual unread replies exist and current tab is relevant',()=>{
  const h=harness();
  h.sandbox.update();
  assert.equal(h.button.hidden,true);
  h.sandbox.notificationCache=[notification(11)];
  h.sandbox.update();
  assert.equal(h.button.hidden,false);
  assert.equal(h.button.textContent,'1 respuesta pendiente');
  assert.equal(h.button.attrs['aria-pressed'],'false');
  h.sandbox.activeNotificationFilter='mentions';
  h.sandbox.update();
  assert.equal(h.button.hidden,true);
  h.sandbox.activeNotificationFilter='conversations';
  h.sandbox.pendingRepliesOnlyV32156=true;
  h.sandbox.notificationCache=[];
  h.sandbox.update();
  assert.equal(h.button.hidden,false);
  assert.equal(h.button.textContent,'← Todas las conversaciones');
  assert.equal(h.button.attrs['aria-pressed'],'true');
  h.sandbox.pendingRepliesOnlyV32156=false;
  h.sandbox.update();
  assert.equal(h.button.hidden,true);
});
test('button toggles opt-in-only filtering and resets when a normal tab is selected',()=>{
  const from=js.indexOf("$('#notificationReplyShortcutV32156')?.addEventListener('click'");
  const to=js.indexOf("all('[data-message-filter]')",from);
  assert.ok(from>0&&to>from);
  const callbacks={};let renderCount=0;
  const buttons=[
    {dataset:{notificationFilter:'unread'}},
    {dataset:{notificationFilter:'conversations'}}
  ];
  const sandbox={
    activeNotificationFilter:'all',pendingRepliesOnlyV32156:false,
    pendingReplyCountV32156:()=>2,
    renderNotifications:()=>renderCount++,
    '$':selector=>selector==='#notificationReplyShortcutV32156'?{
      addEventListener:(_type,fn)=>callbacks.shortcut=fn
    }:null,
    all:selector=>selector==='[data-notification-filter]'?buttons:[]
  };
  vm.runInNewContext(js.slice(from,to),sandbox);
  callbacks.shortcut();
  assert.equal(sandbox.pendingRepliesOnlyV32156,true);
  assert.equal(sandbox.activeNotificationFilter,'conversations');
  callbacks.shortcut();
  assert.equal(sandbox.pendingRepliesOnlyV32156,false);
  callbacks.shortcut();
  buttons[0].onclick();
  assert.equal(sandbox.pendingRepliesOnlyV32156,false);
  assert.equal(sandbox.activeNotificationFilter,'unread');
  assert.equal(renderCount,4);
});
test('filter uses existing notifications only, updates after read and provides honest empty state',()=>{
  const code=js.slice(js.indexOf('function renderNotifications()'),js.indexOf('async function navigateNotification('));
  assert.match(code,/updateReplyShortcutV32156\(\)/);
  assert.match(code,/notificationMatches\(notification,activeNotificationFilter\)/);
  assert.match(code,/!pendingRepliesOnlyV32156 \|\| isPendingReplyV32156\(notification\)/);
  assert.match(code,/No tienes respuestas pendientes/);
  assert.match(code,/if\(activeNotificationFilter==='unread'\)renderNotifications\(\)/);
  assert.match(code,/else if\(pendingRepliesOnlyV32156\)renderNotifications\(\)/);
  assert.match(code,/updateNotificationBadge\(liveActivityState\.notificationUnread\)/);
  assert.doesNotMatch(code,/POST.*comments|autoPublish|requestSubmit\(/);
});
test('mobile-first, accessible and confined to existing notifications panel',()=>{
  const from=html.indexOf('id="notificationsView"');
  const to=html.indexOf('id="publicProfileView"',from);
  const section=html.slice(from,to);
  assert.equal((html.match(/id="notificationReplyShortcutV32156"/g)||[]).length,1);
  assert.match(section,/id="notificationReplyShortcutV32156"[^>]*aria-pressed="false" hidden/);
  assert.ok(section.indexOf('id="notificationReplyShortcutV32156"')>
    section.indexOf('data-notification-filter="conversations"'));
  assert.match(css,/#notificationsView \.notification-reply-shortcut-v32156\.hidden/);
  assert.match(css,/#notificationsView \.notification-reply-shortcut-v32156:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/pending-real-replies-v32156\.test\.js/);
});
