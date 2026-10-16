'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function harness(){
 const elements=[1,2,3,4,5].map((id,i)=>({dataset:{commentId:String(id)},offsetTop:i*160,classList:{marked:false,add(name){this.marked=true}}}));
 const jump={hidden:true,textContent:'↓ Últimos comentarios',attrs:{},setAttribute(k,v){this.attrs[k]=v}};
 const list={items:elements,scrollHeight:1250,clientHeight:320,scrollTop:200,focuses:0,focus(){this.focuses++}};
 const modal={classList:{contains:()=>false}};
 const ctx={
  Set,Map,String,
  activeCommentsPostId:42,
  unseenCommentIdsV3238:new Set(),
  unseenCommentPostV3238:null,
  '$':s=>({'#commentsList':list,'#commentsJumpLatestV3237':jump,'#commentsModal':modal})[s]||null,
  all:(q,root)=>q==='[data-comment-id]'?root.items:[]
 };
 const from=js.indexOf('function resetUnseenCommentsV3238(');
 const to=js.indexOf('// Contextual shortcut: only when reading older comments',from);
 assert.ok(from>0&&to>from);
 vm.runInNewContext(js.slice(from,to)+'\nthis.remember=rememberNewCommentsV3238;this.reset=resetUnseenCommentsV3238;this.first=firstNewCommentV3238;this.update=updateNewCommentJumpV3238;',ctx);
 return {ctx,list,jump,modal,elements};
}
test('new replies interleaved above recent roots are addressable by actual id',()=>{
 const h=harness();
 h.ctx.remember(42,['2','4'],[1,2,3,4,5]);
 assert.equal(h.ctx.update(),true);
 assert.equal(h.jump.textContent,'↓ Ver 2 comentarios nuevos');
 assert.equal(h.jump.attrs['aria-label'],'Ir al primer comentario nuevo');
 assert.equal(h.ctx.first(h.list).dataset.commentId,'2');
 assert.equal(h.jump.hidden,false);
});
test('pending IDs survive a second refresh but disappear when deleted or acknowledged',()=>{
 const h=harness();
 h.ctx.remember(42,['2'],[1,2,3,4,5]);
 h.ctx.remember(42,['4'],[1,2,3,4,5]);
 assert.equal(h.jump.textContent,'↓ Últimos comentarios');
 h.ctx.update();
 assert.match(h.jump.textContent,/2 comentarios nuevos/);
 h.ctx.remember(42,[],[1,3,4,5]);
 h.ctx.update();
 assert.match(h.jump.textContent,/1 comentario nuevo$/);
 assert.equal(h.ctx.first(h.list).dataset.commentId,'4');
 h.ctx.reset();
 assert.equal(h.ctx.update(),false);
 assert.equal(h.jump.textContent,'↓ Últimos comentarios');
});
test('new comment state never bleeds between posts or closed modals',()=>{
 const h=harness();
 h.ctx.remember(42,['3'],[1,2,3]);
 h.ctx.activeCommentsPostId=43;
 assert.equal(h.ctx.update(),false);
 h.ctx.activeCommentsPostId=42;
 h.modal.classList.contains=()=>true;
 assert.equal(h.ctx.update(),false);
 h.modal.classList.contains=()=>false;
 h.ctx.remember(43,['4'],[1,2,3,4]);
 assert.equal(h.ctx.update(),false);
 h.ctx.activeCommentsPostId=43;
 assert.equal(h.ctx.update(),true);
});
test('button jumps to first new reply rather than bottom and never touches composer',()=>{
 const from=js.indexOf("$('#commentsJumpLatestV3237')?.addEventListener('click'");
 const to=js.indexOf("\n$('#commentsRefreshV3236')?.addEventListener('click'",from);
 assert.ok(from>0&&to>from);
 const slice=js.slice(from,to);
 assert.match(slice,/const firstNew=firstNewCommentV3238\(list\)/);
 assert.match(slice,/list\.scrollTop=Math\.max\(0,firstNew\.offsetTop-12\)/);
 assert.match(slice,/firstNew\.classList\.add\('comment-new-arrival-v3238'\)/);
 assert.match(slice,/resetUnseenCommentsV3238\(\)/);
 assert.match(slice,/list\.scrollTop=list\.scrollHeight/);
 assert.match(slice,/list\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(slice,/fetch\(|api\(|loadComments\(|commentBody|commentDrafts/);
});
test('refresher accounts for actual new IDs and keeps previous list / drafts',()=>{
 assert.match(js,/const newlySeenIds=position/);
 assert.match(js,/rememberNewCommentsV3238\(postId,newlySeenIds,comments\.map\(comment=>comment\.id\)\)/);
 assert.match(js,/restoreCommentPositionV3236\(list,position\)/);
 assert.match(js,/updateCommentJumpV3237\(\);\s*updateNewCommentJumpV3238\(\)/);
 assert.match(js,/resetUnseenCommentsV3238\(\);\s*activeCommentsPostId=value/);
 assert.match(js,/saveCommentDraftV3235/);
 assert.match(js,/restoreCommentDraftV3235/);
 assert.match(js,/parentCommentId:commentReplyId/);
 assert.match(css,/#commentsModal \.comment-item\.comment-new-arrival-v3238/);
});
test('version and CI updated without new server routes',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.71');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.69\.1'/);
 assert.match(html,/\/social\.js\?v=3\.2\.69\.1/);
 assert.match(html,/\/social\.css\?v=3\.2\.69\.1/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:new-comment-navigation/);
});
