'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function harness(){
  const draftInput={value:'',placeholder:'Escribe un comentario...',focuses:0,focus(){this.focuses++}};
  const hint={classList:{hidden:true,toggle(name,hide){this.hidden=hide},add(name){this.hidden=true},remove(name){this.hidden=false}}};
  const replyContext={classList:{hidden:true,add(){this.hidden=true},remove(){this.hidden=false}}};
  const replyName={textContent:''},submit={disabled:false,textContent:'Comentar'};
  const fields={'#commentBody':draftInput,'#commentDraftHintV3235':hint,'#commentReplyContext':replyContext,'#commentReplyName':replyName,'#commentForm button[type="submit"]':submit};
  const context={
    Map,Number,String,
    me:{id:1},activeCommentsPostId:11,activeCommentReply:null,
    commentDraftOwnerV3235:null,commentDraftsV3235:new Map(),
    '$':key=>fields[key]||null
  };
  const start=js.indexOf('function clearCommentReply()');
  const end=js.indexOf('// Prevent outdated requests from replacing a newly opened comment thread.',start);
  assert.ok(start>0&&end>start);
  vm.runInNewContext(js.slice(start,end)+'\nthis.save=saveCommentDraftV3235;this.restore=restoreCommentDraftV3235;this.startReply=startCommentReply;this.clearReply=clearCommentReply;',context);
  return {context,draftInput,hint,replyContext,replyName,submit};
}
test('independent drafts for distinct posts are restored, not persisted to disk',()=>{
  const h=harness();
  h.draftInput.value='Primera idea';h.context.save(11);
  h.context.activeCommentsPostId=22;h.draftInput.value='Segunda idea';
  h.context.save(22);
  h.context.clearReply();h.draftInput.value='';
  assert.equal(h.context.restore(11),true);
  assert.equal(h.draftInput.value,'Primera idea');
  assert.equal(h.hint.classList.hidden,false);
  h.draftInput.value='';
  assert.equal(h.context.restore(22),true);
  assert.equal(h.draftInput.value,'Segunda idea');
  assert.equal(h.context.commentDraftsV3235.size,2);
  const block=js.slice(js.indexOf('function ensureCommentDraftOwnerV3235('),js.indexOf('// Prevent outdated requests from replacing a newly opened comment thread.'));
  assert.doesNotMatch(block,/localStorage|sessionStorage|fetch\(|api\(/);
});
test('reply target restores without raising keyboard and cannot become a root comment',()=>{
  const h=harness();
  h.context.startReply({dataset:{replyComment:'91',replyUsername:'ana',replyDisplay:'Ana'}},{focus:false});
  h.draftInput.value='En respuesta a Ana';h.context.save(11);
  h.context.clearReply();h.draftInput.value='';
  assert.equal(h.context.restore(11),true);
  assert.equal(h.context.activeCommentReply.id,91);
  assert.equal(h.context.activeCommentReply.username,'ana');
  assert.equal(h.draftInput.placeholder,'Responde a Ana...');
  assert.equal(h.submit.textContent,'Responder');
  assert.equal(h.draftInput.focuses,0);
});
test('changing account clears memory; empty draft removed; bounded at twenty',()=>{
  const h=harness();
  h.draftInput.value='Texto';h.context.save(11);
  h.context.me={id:2};h.draftInput.value='';
  assert.equal(h.context.restore(11),false);
  assert.equal(h.context.commentDraftsV3235.size,0);
  for(let i=1;i<=23;i++){h.draftInput.value='texto '+i;h.context.save(i)}
  assert.equal(h.context.commentDraftsV3235.size,20);
  assert.equal(h.context.commentDraftsV3235.has('1'),false);
  assert.equal(h.context.commentDraftsV3235.has('23'),true);
  h.draftInput.value=' ';h.context.save(23);
  assert.equal(h.context.commentDraftsV3235.has('23'),false);
});
test('opening and closing comments preserves correct thread without surprise keyboard',()=>{
  assert.match(js,/if\(activeCommentsPostId\)saveCommentDraftV3235\(activeCommentsPostId\)/);
  assert.match(js,/restoreCommentDraftV3235\(value\)/);
  assert.match(js,/if\(focusComposer\)\$\('#commentBody'\)\.focus\(\{preventScroll:true\}\)/);
  assert.match(js,/\$\('#closeCommentsModal'\)\.onclick = \(\) => \{\s*saveCommentDraftV3235\(\)/);
  assert.match(js,/\$\('#commentBody'\)\?\.addEventListener\('input'/);
  assert.match(js,/saveCommentDraftV3235\(commentPostId\)/);
  assert.match(js,/if\(matchesSent\)commentDraftsV3235\.delete\(String\(commentPostId\)\)/);
  assert.match(js,/const sameComposer=\$\('#commentBody'\)\.value\.trim\(\)===body/);
  assert.match(js,/parentCommentId:commentReplyId/);
  assert.match(js,/\$\('#logout'\)\.onclick = async \(\) => \{\s*commentDraftsV3235\.clear\(\)/);
});
test('restoration notice is non-intrusive and version is wired',()=>{
  assert.match(html,/id="commentDraftHintV3235"[^>]*role="status"/);
  assert.match(css,/#commentsModal \.comment-draft-hint-v3235/);
  assert.match(css,/\.comment-draft-hint-v3235\.hidden\{display:none!important\}/);
  assert.equal(JSON.parse(read('package.json')).version,'3.2.35');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.35'/);
  assert.match(html,/\/social\.js\?v=3\.2\.35/);
  assert.match(html,/\/social\.css\?v=3\.2\.35/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:comment-drafts/);
});