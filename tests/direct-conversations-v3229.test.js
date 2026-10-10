'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const script=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');

function matches(notification,filter){
  const start=script.indexOf('function notificationMatches(');
  const end=script.indexOf('function renderNotifications()',start);
  assert.ok(start>=0&&end>start);
  const sandbox={};
  vm.runInNewContext(script.slice(start,end)+'\nthis.matches=notificationMatches;',sandbox);
  return !!sandbox.matches(notification,filter);
}
test('Conversaciones shows actual post comments and post mentions, never unrelated signals',()=>{
  assert.equal(matches({type:'comment',entity_type:'post'},'conversations'),true);
  assert.equal(matches({type:'mention',entity_type:'post'},'conversations'),true);
  assert.equal(matches({type:'circle_mention',entity_type:'post'},'conversations'),true);
  for(const event of [
    {type:'like',entity_type:'post'},
    {type:'repost',entity_type:'post'},
    {type:'follow',entity_type:'user'},
    {type:'message',entity_type:'conversation'},
    {type:'mention',entity_type:'community'},
    {type:'comment',entity_type:'community'}
  ])assert.equal(matches(event,'conversations'),false,JSON.stringify(event));
});
test('Previous activity filters still behave exactly as before',()=>{
  assert.equal(matches({type:'like',entity_type:'post'},'interactions'),true);
  assert.equal(matches({type:'comment',entity_type:'post'},'interactions'),true);
  assert.equal(matches({type:'message'},'messages'),true);
  assert.equal(matches({type:'mention'},'mentions'),true);
  assert.equal(matches({type:'circle_mention'},'mentions'),true);
  assert.equal(matches({type:'comment',read_at:null},'unread'),true);
  assert.equal(matches({type:'comment',read_at:'2026-10-10T10:00:00Z'},'unread'),false);
});
async function navigation(notification){
 const start=script.indexOf('async function navigateNotification(');
 const end=script.indexOf('async function loadNotifications()',start);
 assert.ok(start>=0&&end>start);
 const calls=[];
 const sandbox={
   openComments:async id=>{calls.push(['comments',id])},
   openPostFocus:async id=>{calls.push(['post',id])},
   openPublicProfile:async username=>{calls.push(['profile',username])},
   showView:()=>{},
   setTimeout:()=>{},
   document:{querySelector:()=>null},
   String
 };
 vm.runInNewContext(script.slice(start,end)+'\nthis.navigate=navigateNotification;',sandbox);
 await sandbox.navigate(notification);
 return calls;
}
test('Tapping a comment notification goes straight to the existing authenticated discussion',async()=>{
 const calls=await navigation({type:'comment',entity_type:'post',entity_id:123});
 assert.deepEqual(calls,[['comments',123]]);
});
test('Mentions and likes still open publication; missing identifiers do not open comments',async()=>{
 assert.deepEqual(await navigation({type:'mention',entity_type:'post',entity_id:13}),[['post',13]]);
 assert.deepEqual(await navigation({type:'like',entity_type:'post',entity_id:8}),[['post',8]]);
 assert.deepEqual(await navigation({type:'comment',entity_type:'post',entity_id:null}),[]);
});
test('View publication closes the comments dialog before opening the post, without stale references',async()=>{
 const lines=script.split('\n');
 const start=lines.findIndex(s=>s.includes("$('#commentsOpenPostV3229')?.addEventListener"));
 assert.ok(start>=0);
 const snippet=lines.slice(start,start+6).join('\n');
 const calls=[];
 const close={click:()=>calls.push('close')};
 const button={addEventListener:(_event,listener)=>{button.callback=listener}};
 const sandbox={
   '$':key=>key==='#commentsOpenPostV3229'?button:key==='#closeCommentsModal'?close:null,
   activeCommentsPostId:42,
   openPostFocus:async id=>calls.push(['post',id])
 };
 vm.runInNewContext(snippet,sandbox);
 await button.callback();
 assert.deepEqual(calls,['close',['post',42]]);
});
test('Comments still load through the original authenticated endpoint with error states',()=>{
 const comments=script.slice(script.indexOf('async function loadComments('),script.indexOf('async function openComments('));
 assert.match(comments,/api\('\/api\/posts\/\$\{encodeURIComponent\(postId\)\}\/comments'/);
 assert.match(comments,/No se pudieron cargar los comentarios/);
 const notifications=read('src/routes/notifications.js');
 assert.match(notifications,/router\.use\(requireAuth\)/);
 assert.match(notifications,/WHERE n\.user_id=\$1/);
});
test('Notification toolbar and comments modal remain accessible on narrow screens',()=>{
 assert.ok(html.includes('data-notification-filter="conversations"'));
 assert.ok(html.includes('id="commentsOpenPostV3229"'));
 assert.ok(css.includes('#commentsModal .comments-heading-v3229'));
 assert.ok(css.includes('min-height:44px'));
 assert.ok(css.includes('@media(max-width:420px)'));
 assert.ok(html.includes('/social.js?v=3.2.29'));
 assert.ok(html.includes('/social.css?v=3.2.29'));
});
test('Release, creator and 2:1 editorial feed remain unaffected',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.29');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.29'"));
 assert.ok(html.includes('data-composer-tab="reel"'));
 assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
});
