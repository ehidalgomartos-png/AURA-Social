'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function replyHarness(){
 const replyContext={classList:{hidden:true,add(){this.hidden=true},remove(){this.hidden=false}}};
 const excerpt={textContent:'',hidden:true},replyName={textContent:''};
 const composer={value:'Texto personal que ya estaba escrito',placeholder:'Escribe un comentario...',focuses:0,focus(){this.focuses++;}};
 const submit={disabled:false,textContent:'Comentar'};
 const els={'#commentReplyContext':replyContext,'#commentReplyExcerptV3321':excerpt,
  '#commentReplyName':replyName,'#commentBody':composer,
  '#commentForm button[type="submit"]':submit};
 const ctx={Map,Number,String,me:{id:2},activeCommentsPostId:14,activeCommentReply:null,
   commentDraftsV3235:new Map(),commentDraftOwnerV3235:null,
   $:key=>els[key]||null};
 const start=js.indexOf('function clearCommentReply()');
 const end=js.indexOf('// Prevent outdated requests from replacing a newly opened comment thread.',start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(js.slice(start,end)+
  '\nthis.start=startCommentReply;this.clear=clearCommentReply;this.save=saveCommentDraftV3235;',ctx);
 return {ctx,replyContext,excerpt,replyName,composer,submit};
}
function replyButton(text){
 return {dataset:{replyComment:'51',replyUsername:'ana',replyDisplay:'Ana'},
  closest:()=>({querySelector:()=>({textContent:text})})};
}
test('real comment context appears only after explicit reply click and cannot override a draft',()=>{
 const h=replyHarness();
 h.ctx.start(replyButton('   Un comentario auténtico sobre   Valencia   '),{focus:false});
 assert.equal(h.excerpt.textContent,'Un comentario auténtico sobre Valencia');
 assert.equal(h.excerpt.hidden,false);
 assert.equal(h.composer.value,'Texto personal que ya estaba escrito');
 assert.equal(h.composer.focuses,0);
 assert.equal(h.submit.textContent,'Responder');
 assert.equal(h.ctx.activeCommentReply.id,51);
 h.ctx.clear();
 assert.equal(h.excerpt.textContent,'');
 assert.equal(h.excerpt.hidden,true);
 assert.equal(h.submit.textContent,'Comentar');
});
test('excerpt is short and inserted strictly as text; restored draft has no invented quote',()=>{
 const h=replyHarness();
 h.ctx.start(replyButton('<script>alert(1)</script> '+('x'.repeat(200))),{focus:false});
 assert.ok(h.excerpt.textContent.length<=120);
 assert.ok(h.excerpt.textContent.startsWith('<script>'));
 assert.equal(h.excerpt.hidden,false);
 h.ctx.clear();
 h.ctx.start({dataset:{replyComment:'51',replyUsername:'ana',replyDisplay:'Ana'}},{focus:false});
 assert.equal(h.excerpt.hidden,true);
});
function highlightHarness(){
 const calls=[];
 const rows=[1,5,9].map((id,i)=>({
  dataset:{commentId:String(id)},offsetTop:55+i*200,
  classList:{add:cls=>calls.push(id+':'+cls)}
 }));
 const list={scrollTop:0,scrollHeight:750};
 const ctx={Number,String,Math,all:()=>rows};
 const begin=js.indexOf('function highlightPublishedCommentV3321(');
 const end=js.indexOf('async function loadComments(',begin);
 assert.ok(begin>0&&end>begin);
 vm.runInNewContext(js.slice(begin,end)+'\nthis.highlight=highlightPublishedCommentV3321;',ctx);
 return {ctx,rows,list,calls};
}
test('a confirmed comment is highlighted at its actual location, not at the end of the thread',()=>{
 const h=highlightHarness();
 assert.equal(h.ctx.highlight(h.list,5),true);
 assert.equal(h.list.scrollTop,243);
 assert.deepEqual(h.calls,['5:comment-target-v32155']);
 assert.equal(h.ctx.highlight(h.list,999),false);
 assert.equal(h.ctx.highlight(h.list,'bad'),false);
 assert.equal(h.ctx.highlight(h.list,null),false);
 assert.deepEqual(h.calls,['5:comment-target-v32155']);
});
test('only server-returned ID after publication triggers focus, preserving retries and refresh',()=>{
 const start=js.indexOf("$('#commentForm').addEventListener('submit'");
 assert.ok(start>0);
 const submit=js.slice(start,start+4400);
 assert.match(submit,/if \(!r\.ok\)/);
 assert.match(submit,/loadComments\(activeCommentsPostId,\{highlightCommentId:d\?\.comment\?\.id\}\)/);
 assert.match(submit,/parentCommentId:commentReplyId/);
 assert.match(submit,/if\(String\(activeCommentsPostId\|\|''\)!==String\(commentPostId\)\)return/);
 assert.match(js,/loadComments\(activeCommentsPostId,\{preserveScroll:true\}\)/);
 assert.match(js,/saveCommentDraftV3235/);
 assert.match(js,/restoreCommentDraftV3235/);
 assert.match(read('src/routes/posts.js'),/res\.status\(201\)\.json\(\{\s*ok:true,\s*comment:\{/);
 assert.match(js,/if\(!highlightPublishedCommentV3321\(list,highlightCommentId\)\)/);
});
test('interface reuses existing reply context and notification target highlight; no extra endpoints',()=>{
 const modal=html.slice(html.indexOf('id="commentsModal"'),html.indexOf('id="deleteCommentModal"'));
 assert.equal((html.match(/id="commentReplyExcerptV3321"/g)||[]).length,1);
 assert.match(modal,/id="commentReplyExcerptV3321" hidden/);
 assert.match(css,/#commentsModal #commentReplyExcerptV3321\[hidden\]/);
 assert.match(css,/@media\(max-width:440px\)/);
 assert.match(css,/#commentsModal \.comment-item\.comment-target-v32155/);
 assert.match(html,/social\.js\?[^"]*comments=3\.3\.21/);
 assert.match(html,/social\.css\?[^"]*comments=3\.3\.21/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/real-comment-participation-v3321\.test\.js/);
});
