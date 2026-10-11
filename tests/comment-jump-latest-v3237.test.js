'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

test('button is modal-only, hidden until needed and keyboard accessible',()=>{
  const modal=html.slice(html.indexOf('id="commentsModal"'),html.indexOf('id="deleteCommentModal"'));
  assert.match(modal,/id="commentsList" class="comments-list" tabindex="-1"/);
  assert.match(modal,/id="commentsJumpLatestV3237"[^>]* hidden aria-label="Ir a los comentarios más recientes"/);
  assert.match(css,/#commentsModal #commentsJumpLatestV3237\[hidden\]\{display:none!important\}/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/#commentsModal #commentsJumpLatestV3237:focus-visible/);
  assert.match(js,/\$\('#commentsList'\)\?\.addEventListener\('scroll',updateCommentJumpV3237,\{passive:true\}\)/);
});
function harness(){
  const list={scrollHeight:900,clientHeight:280,scrollTop:0,focuses:0,focus(opts){this.focuses++;this.focusOpts=opts}};
  const jump={hidden:true};
  const modal={classList:{contains:()=>false}};
  const ctx={
    activeCommentsPostId:42,
    '$':key=>({'#commentsList':list,'#commentsJumpLatestV3237':jump,'#commentsModal':modal})[key]||null
  };
  const from=js.indexOf('function updateCommentJumpV3237(');
  const to=js.indexOf('// Preserve the first visible comment',from);
  assert.ok(from>0&&to>from);
  vm.runInNewContext(js.slice(from,to)+'\nthis.update=updateCommentJumpV3237;',ctx);
  return {list,jump,modal,ctx};
}
test('appears when content overflows and reading position is far from latest',()=>{
  const h=harness();
  assert.equal(h.ctx.update(),true);
  assert.equal(h.jump.hidden,false);
  h.list.scrollTop=520;
  assert.equal(h.ctx.update(),false);
  assert.equal(h.jump.hidden,true);
  h.list.scrollHeight=280;
  h.list.scrollTop=0;
  assert.equal(h.ctx.update(),false);
  h.list.scrollHeight=900;
  h.list.scrollTop=0;
  h.ctx.activeCommentsPostId=null;
  assert.equal(h.ctx.update(),false);
});
test('hidden when closed or missing',()=>{
  const h=harness();
  h.modal.classList.contains=()=>true;
  assert.equal(h.ctx.update(),false);
  assert.equal(h.jump.hidden,true);
  h.modal.classList.contains=()=>false;
  h.ctx.$=key=>key==='#commentsModal'?null:({'#commentsList':h.list,'#commentsJumpLatestV3237':h.jump})[key]||null;
  assert.equal(h.ctx.update(),false);
});
test('jump only scrolls within comments and never affects drafts or network',()=>{
  const from=js.indexOf("$('#commentsJumpLatestV3237')?.addEventListener('click'");
  const to=js.indexOf("\n$('#commentsRefreshV3236')?.addEventListener('click'",from);
  assert.ok(from>0&&to>from);
  const source=js.slice(from,to);
  assert.match(source,/list\.scrollTop=list\.scrollHeight/);
  assert.match(source,/list\.focus\(\{preventScroll:true\}\)/);
  assert.match(source,/updateCommentJumpV3237\(\)/);
  assert.doesNotMatch(source,/fetch\(|api\(|loadComments\(|commentBody|commentDrafts/);
  assert.match(js,/if\(\$\('#commentsJumpLatestV3237'\)\)\$\('#commentsJumpLatestV3237'\)\.hidden=true/);
});
test('refresh, reading position and private drafts remain intact',()=>{
  assert.match(js,/restoreCommentPositionV3236\(list,position\)/);
  assert.match(js,/if\(commentsRequestIsCurrent\(requestId,postId\)\)\{\s*list\.setAttribute\('aria-busy','false'\);\s*if\(refresh\)refresh\.disabled=false;\s*updateCommentJumpV3237\(\)/);
  assert.match(js,/loadComments\(activeCommentsPostId,\{preserveScroll:true\}\)/);
  assert.match(js,/saveCommentDraftV3235/);
  assert.match(js,/restoreCommentDraftV3235/);
  assert.match(js,/parentCommentId:commentReplyId/);
});
test('version and workflow registered',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.37');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.37'/);
  assert.match(html,/\/social\.js\?v=3\.2\.37/);
  assert.match(html,/\/social\.css\?v=3\.2\.37/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:comment-jump-latest/);
});