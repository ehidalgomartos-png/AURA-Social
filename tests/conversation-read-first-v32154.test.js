'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const social=read('public/social.js');

test('the invited real conversation opens at first comment without forcing the keyboard',()=>{
  const handler=social.slice(social.indexOf("$('#returnConversationOpenV32152')?.addEventListener"),social.indexOf("$('#returnConversationSnoozeV32152')?.addEventListener"));
  assert.match(handler,/openComments\(id,\{focusComposer:false,initialPosition:'start'\}\)/);
  assert.match(handler,/api\('\/api\/posts\/detail\/'/);
  assert.doesNotMatch(handler,/\.focus\(|requestSubmit\(|\.submit\(/);
});
test('existing comment entry points retain latest-by-default while allowing optional start',()=>{
  assert.match(social,/async function openComments\(postId,\{focusComposer=false,initialPosition='latest'\}=\{\}\)/);
  assert.match(social,/await loadComments\(value,\{initialPosition\}\)/);
  assert.match(social,/if\(focusComposer\)\$\('#commentBody'\)\.focus\(\{preventScroll:true\}\)/);
});
function harness(){
  const list={scrollTop:0,scrollHeight:900,clientHeight:300,
    setAttribute(){},innerHTML:'',items:[]};
  const refresh={disabled:false},status={textContent:''};
  const modal={classList:{contains:()=>false}};
  const context={
    Set,Map,String,Number,
    activeCommentsPostId:19,
    '$':key=>({'#commentsList':list,'#commentsRefreshV3236':refresh,'#commentsRefreshStatusV3236':status,'#commentsModal':modal})[key]||null,
    all:()=>[],
    api:async()=>({r:{ok:true},d:{comments:[{id:11},{id:12}]}}),
    commentHTML:comment=>'<article data-comment-id="'+comment.id+'"></article>',
    startCommentReply:()=>{},
    updateCommentJumpV3237:()=>{},
    updateNewCommentJumpV3238:()=>{},
    resetUnseenCommentsV3238:()=>{},
    rememberNewCommentsV3238:()=>{}
  };
  const from=social.indexOf('function captureCommentPositionV3236(');
  const to=social.indexOf("\n$('#commentsList')?.addEventListener('click'",from);
  assert.ok(from>=0&&to>from);
  vm.runInNewContext("let commentsRequestSequence=0;\nfunction commentsRequestIsCurrent(req,id){return req===commentsRequestSequence && String(activeCommentsPostId)===String(id)}\n"+social.slice(from,to)+"\nthis.load=loadComments;",context);
  return {list,context};
}
test('initial start position reads first real comment; ordinary conversations still jump to latest',async()=>{
  const h=harness();
  await h.context.load(19,{initialPosition:'start'});
  assert.equal(h.list.scrollTop,0);
  await h.context.load(19);
  assert.equal(h.list.scrollTop,900);
});
test('refresh keeps scroll restoration and never writes comments automatically',()=>{
  const fragment=social.slice(social.indexOf('async function loadComments('),social.indexOf("\n$('#commentsList')?.addEventListener('click'",social.indexOf('async function loadComments(')));
  assert.match(fragment,/restoreCommentPositionV3236\(list,position\)/);
  assert.match(fragment,/list\.scrollTop=initialPosition==='start'\?0:list\.scrollHeight/);
  assert.doesNotMatch(fragment,/method:\s*'POST'|\.submit\(|requestSubmit\(/);
});
