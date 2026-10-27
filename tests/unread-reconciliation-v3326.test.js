'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
const html=read('public/app.html');
function part(a,b){const i=social.indexOf(a),j=social.indexOf(b,i+1);assert.ok(i>=0&&j>i,a);return social.slice(i,j);}
test('filtered and search results cannot replace the global message badge with a partial count',async()=>{
 const calls=[],pending=[];
 const list={innerHTML:'Anterior',setAttribute(){}};
 const ctx={messageConversationFilter:'unread',messageConversationSearch:'ana',
  conversationListRequestSequenceV339:0,URLSearchParams,Number,String,
  $:q=>q==='#conversationList'?list:null,all:()=>[],
  api:url=>new Promise(resolve=>pending.push(resolve)),
  updateMessageBadge:n=>calls.push(n),liveActivityState:{messageUnread:7},
  conversationListIdentity:()=>({}),conversationPresence:()=>null,
  conversationPreviewText:()=>'',esc:String,updateConversationPresenceBadges:()=>{},
  openConversation:async()=>{},uiStateHTML:()=>''};
 vm.runInNewContext(part('async function loadConversations(openId = null) {','function groupParticipantsSummary(')+'\nthis.load=loadConversations;',ctx);
 const job=ctx.load();
 pending[0]({r:{ok:true},d:{conversations:[],summary:{unread:3}}});
 await job;
 assert.deepEqual(calls,[]);
 assert.equal(ctx.liveActivityState.messageUnread,7);
 assert.match(list.innerHTML,/No hay conversaciones/);
});
test('successful individual notification read reconciles PWA icon, errors do not',()=>{
 const notification=part('function renderNotifications() {','async function navigateNotification(');
 assert.match(notification,/if\(r\.ok\)\{[\s\S]*?notification\.read_at=[\s\S]*?RedLibertadPwaBadgeV3323\?\.refresh\(\{force:true\}\)/);
 assert.match(notification,/else\{\s*toast\('No se pudo marcar como leída/);
});
test('read all and opening a chat reconcile the icon only after successful server action',()=>{
 const all=part("$('#readAllNotifications').onclick", 'function conversationListIdentity(');
 assert.ok(all.indexOf("if(!r.ok)throw Error('read_all_failed')")<all.indexOf('RedLibertadPwaBadgeV3323?.refresh({force:true})'));
 const chat=part('async function openConversation(id) {','async function ');
 assert.ok(chat.indexOf('if(!r.ok){')<chat.indexOf('RedLibertadPwaBadgeV3323?.refresh({force:true})'));
 assert.match(chat,/activeConversationId=conversationId;[\s\S]{0,240}RedLibertadPwaBadgeV3323/);
});
test('existing SSE remains source of truth, no new polling, private data caching or visual additions',()=>{
 const list=part('async function loadConversations(openId = null) {','function groupParticipantsSummary(');
 assert.doesNotMatch(list,/liveActivityState\.messageUnread\s*=/);
 assert.doesNotMatch(list,/updateMessageBadge\(/);
 assert.match(social,/updateMessageBadge\(liveActivityState\.messageUnread\)/);
 assert.match(social,/RedLibertadPwaBadgeV3323\?\.sync\(me\?\.id,payload\.badgeUnread\)/);
 assert.match(read('src/routes/live.js'),/router\.get\('\/badge',requireAuth/);
 assert.equal((html.match(/unread=3\.3\.26/g)||[]).length,1);
 assert.doesNotMatch(list,/setInterval|localStorage|sessionStorage|sendBeacon|fetch\(/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/unread-reconciliation-v3326\.test\.js/);
});
