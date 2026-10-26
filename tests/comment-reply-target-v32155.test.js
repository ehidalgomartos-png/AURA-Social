'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const social=read('public/social.js');
const posts=read('src/routes/posts.js');
const notifications=read('src/routes/notifications.js');
const service=read('src/services/comment-notification-target-v32155.js');
const schema=read('db/schema.sql');
const css=read('public/social.css');

test('new comment targets are private, nullable and backward-compatible',()=>{
  assert.match(schema,/ALTER TABLE notifications ADD COLUMN IF NOT EXISTS comment_id BIGINT REFERENCES comments\(id\) ON DELETE SET NULL/);
  assert.match(service,/let ready=null/);
  assert.match(service,/ready=null;throw error/);
  assert.match(notifications,/await ensureCommentNotificationTargetV32155\(\)/);
  assert.match(notifications,/SELECT n\.id,n\.type,n\.entity_type,n\.entity_id,n\.comment_id/);
  assert.match(notifications,/WHERE n\.user_id=\$1/);
  assert.match(notifications,/router\.use\(requireAuth\)/);
  assert.match(notifications,/muted_id FROM mutes/);
});
test('both existing notification recipients get the exact new comment id only after authorization',()=>{
  const handler=posts.slice(posts.indexOf("router.post('/:id/comments'"),posts.indexOf('module.exports = router;'));
  assert.match(handler,/const visiblePost=await accessiblePublishedPost\(req\.params\.id,req\.user\.id\)/);
  assert.match(handler,/await ensureCommentNotificationTargetV32155\(\)/);
  assert.match(handler,/INSERT INTO comments/);
  const pointer=(handler.match(/user_id,actor_id,type,entity_type,entity_id,comment_id,text/g)||[]).length;
  assert.equal(pointer,2);
  assert.match(handler,/\[replyTargetId,req\.user\.id,req\.params\.id,result\.rows\[0\]\.id\]/);
  assert.match(handler,/req\.params\.id,\s*result\.rows\[0\]\.id,/);
  assert.match(handler,/String\(replyTargetId\)!==String\(req\.user\.id\)/);
  assert.match(handler,/String\(ownerId\)!==String\(req\.user\.id\)/);
  assert.doesNotMatch(handler,/automatic_reply|autoComment/);
});
async function navigate(notification){
  const from=social.indexOf('async function navigateNotification(');
  const to=social.indexOf('async function loadNotifications()',from);
  assert.ok(from>0&&to>from);
  const calls=[];
  const ctx={String,
    openComments:async id=>calls.push('comments:'+id),
    openCommentTargetV32155:async (postId,commentId)=>calls.push('target:'+postId+':'+commentId),
    openPostFocus:async id=>calls.push('post:'+id),
    showView:()=>{},setTimeout:()=>{},
    document:{querySelector:()=>null},
    openPublicProfile:async()=>{},
  };
  vm.runInNewContext(social.slice(from,to)+'\nthis.navigate=navigateNotification;',ctx);
  await ctx.navigate(notification);
  return calls;
}
test('comment notifications navigate to exact reply; legacy and bad pointers open normal discussion',async()=>{
  assert.deepEqual(await navigate({type:'comment',entity_type:'post',entity_id:41,comment_id:513}),['target:41:513']);
  assert.deepEqual(await navigate({type:'comment',entity_type:'post',entity_id:41}),['comments:41']);
  assert.deepEqual(await navigate({type:'comment',entity_type:'post',entity_id:41,comment_id:'<script>'}),['comments:41']);
  assert.deepEqual(await navigate({type:'comment',entity_type:'post',entity_id:41,comment_id:'0'}),['comments:41']);
  assert.deepEqual(await navigate({type:'comment',entity_type:'post',entity_id:null,comment_id:10}),[]);
  assert.deepEqual(await navigate({type:'mention',entity_type:'post',entity_id:9}),['post:9']);
});
function targetHarness({withTarget=true,hidden=false,retry=false,activePost=41}={}){
  const calls=[],row={dataset:{commentId:'513'},offsetTop:230,
    classList:{add:value=>calls.push('highlight:'+value)}};
  const list={scrollTop:0,querySelector:()=>retry?{}:null,
    focus:opts=>calls.push('focus:'+opts.preventScroll)};
  const modal={classList:{contains:()=>hidden}};
  const ctx={String,Math,activeCommentsPostId:activePost,
    '$':key=>({'#commentsList':list,'#commentsModal':modal})[key]||null,
    all:()=>withTarget?[row]:[],
    openComments:async (id,opts)=>calls.push('open:'+id+':'+String(opts?.focusComposer)),
    toast:value=>calls.push('toast:'+value)
  };
  const from=social.indexOf('async function openCommentTargetV32155(');
  const to=social.indexOf('\nfunction openReport(',from);
  assert.ok(from>0&&to>from);
  vm.runInNewContext(social.slice(from,to)+'\nthis.target=openCommentTargetV32155;',ctx);
  return {run:(post,comment)=>ctx.target(post,comment),calls,list};
}
test('focus is applied only to a real rendered reply, without keyboard or network side effects',async()=>{
  const h=targetHarness();await h.run(41,513);
  assert.deepEqual(h.calls,['open:41:false','highlight:comment-target-v32155','focus:true']);
  assert.equal(h.list.scrollTop,218);
});
test('removed reply, closed or different thread never highlight unrelated content',async()=>{
  const removed=targetHarness({withTarget:false});await removed.run(41,513);
  assert.equal(removed.calls.some(x=>x.startsWith('highlight:')),false);
  assert.equal(removed.calls.some(x=>x.startsWith('toast:')),true);
  for(const opts of [{hidden:true},{retry:true},{activePost:42}]){
    const h=targetHarness(opts);await h.run(41,513);
    assert.equal(h.calls.some(x=>x.startsWith('highlight:')),false);
    assert.equal(h.calls.some(x=>x.startsWith('toast:')),false);
  }
});
test('mobile highlight stays inside modal, with no new Home banners or auto comments',()=>{
  assert.match(css,/#commentsModal \.comment-item\.comment-target-v32155/);
  const block=social.slice(social.indexOf('async function openCommentTargetV32155('),social.indexOf('function openReport(',social.indexOf('async function openCommentTargetV32155(')));
  assert.doesNotMatch(block,/method:\s*'POST'|requestSubmit\(|\.submit\(|localStorage|fetch\(/);
  assert.match(block,/await openComments\(postId,\{focusComposer:false\}\)/);
  assert.match(block,/data-comment-id/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/comment-reply-target-v32155\.test\.js/);
});
