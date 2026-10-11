'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');

test('only genuine active discussion Participate actions request keyboard focus',()=>{
  const index=social.indexOf('function bindPostActions(');
  assert.ok(index>0);
  const from=social.slice(index,index+1600);
  assert.match(from,/all\('\[data-comments\]', root\)\.forEach\(b => \{/);
  assert.match(from,/focusComposer:b\.classList\.contains\('discovery-discussion-cta-v3230'\)/);
  assert.match(social,/button\.classList\.add\('discovery-discussion-cta-v3230'\)/);
  assert.match(social,/data-comments/);
});
function makeHarness(){
  const events=[];
  const textarea={value:'draft from old thread',focus(options){events.push(['focus',options?.preventScroll])}};
  const status={textContent:'old status'};
  const modal={classList:{remove(cls){events.push(['open',cls])}}};
  const sandbox={
    Number,
    activeCommentsPostId:null,
    '$':sel=>({'#commentBody':textarea,'#commentStatus':status,'#commentsModal':modal})[sel]||null,
    clearCommentReply:()=>events.push(['clearReply']),
    loadComments:async id=>events.push(['load',id])
  };
  const start=social.indexOf('async function openComments(');
  const end=social.indexOf('\nfunction openReport(',start);
  assert.ok(start>=0 && end>start);
  vm.runInNewContext(social.slice(start,end)+'\nthis.open=openComments;',sandbox);
  return {sandbox,textarea,status,events};
}
test('explicit Participar opens thread and focuses composer before loading, without scroll jump',async()=>{
  const h=makeHarness();
  await h.sandbox.open(24,{focusComposer:true});
  assert.equal(h.sandbox.activeCommentsPostId,24);
  assert.equal(h.textarea.value,'');
  assert.equal(h.status.textContent,'');
  assert.deepEqual(h.events.map(e=>e[0]),['clearReply','open','focus','load']);
  assert.equal(h.events[2][1],true);
  assert.equal(h.events[3][1],24);
});
test('ordinary comments and notifications open without keyboard, invalid ids never open',async()=>{
  const h=makeHarness();
  await h.sandbox.open(81);
  assert.deepEqual(h.events.map(e=>e[0]),['clearReply','open','load']);
  assert.equal(h.events[2][1],81);
  h.events.length=0;
  await h.sandbox.open('not-a-post',{focusComposer:true});
  assert.equal(h.events.length,0);
});
test('responsive bottom-sheet keeps actual comments scrollable and composer on screen',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/#commentsModal \.comments-modal-card\{/);
  assert.match(css,/--visual-vh,100dvh/);
  assert.match(css,/#commentsModal \.comments-list\{\s*flex:1 1 auto;min-height:0;max-height:none/);
  assert.match(css,/#commentsModal \.comment-form\{\s*flex:0 0 auto/);
  assert.match(css,/#commentsModal #commentBody\{/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/min-height:46px/);
  assert.match(css,/:focus-visible/);
  assert.match(html,/id="commentBody"[^>]*aria-label="Escribe tu comentario"/);
  assert.match(html,/id="commentStatus"[^>]*role="status" aria-live="polite"/);
});
test('reply, retry, privacy and other comment flows are preserved',()=>{
  assert.match(social,/function startCommentReply/);
  assert.match(social,/function clearCommentReply/);
  assert.match(social,/data-comments-retry/);
  assert.match(social,/commentsRequestIsCurrent/);
  assert.match(social,/runSocialSubmitOnce\(event\.currentTarget/);
  assert.match(social,/parentCommentId:commentReplyId/);
  assert.match(social,/\$\('#commentsOpenPostV3229'\)/);
  assert.match(html,/id="cancelCommentReply"/);
  assert.match(html,/id="commentsOpenPostV3229"/);
});
test('version and GitHub Actions include V3.2.34',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.34');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.34'/);
  assert.match(html,/\/social\.js\?v=3\.2\.34/);
  assert.match(html,/\/social\.css\?v=3\.2\.34/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:mobile-comment-participation/);
});