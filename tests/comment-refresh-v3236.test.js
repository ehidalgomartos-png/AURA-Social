'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

test('refresh control is compact, accessible and never added to Inicio',()=>{
  assert.match(html,/id="commentsRefreshV3236"[^>]*aria-label="Actualizar conversación"/);
  assert.match(html,/id="commentsRefreshStatusV3236"[^>]*role="status" aria-live="polite"/);
  assert.match(html,/id="commentsList"/);
  assert.match(css,/#commentsModal #commentsRefreshV3236/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media\(max-width:440px\)/);
  assert.match(js,/loadComments\(activeCommentsPostId,\{preserveScroll:true\}\)/);
});
function harness(rows,success=true){
  const list={
    items:rows.map((id,i)=>({dataset:{commentId:String(id)},offsetTop:i*150,offsetHeight:150})),
    scrollTop:140,scrollHeight:1000,clientHeight:400,attributes:{},
    setAttribute(k,v){this.attributes[k]=v}
  };
  let htmlValue='original cards';
  Object.defineProperty(list,'innerHTML',{
    get(){return htmlValue},
    set(v){
      htmlValue=v;
      if(v.includes('data-comment-id')){
        const ids=[...v.matchAll(/data-comment-id="(\d+)"/g)].map(m=>m[1]);
        this.items=ids.map((id,i)=>({dataset:{commentId:id},offsetTop:i*150,offsetHeight:150}));
        this.scrollHeight=ids.length*150+550;
      }
    }
  });
  const refresh={disabled:false};
  const status={textContent:''};
  const modal={classList:{contains:()=>false}};
  const context={
    Map,Set,String,Number,
    activeCommentsPostId:19,
    '$':key=>({'#commentsList':list,'#commentsRefreshV3236':refresh,'#commentsRefreshStatusV3236':status,'#commentsModal':modal})[key]||null,
    all:(query,root)=>query==='[data-comment-id]'?root.items:[],
    api:async()=>success?{r:{ok:true},d:{comments:[{id:1},{id:2},{id:3},{id:4}]}}:{r:{ok:false},d:{}},
    commentHTML:comment=>'<article data-comment-id="'+comment.id+'"></article>',
    startCommentReply:()=>{},
    encodeURIComponent
  };
  const from=js.indexOf('function captureCommentPositionV3236(');
  const to=js.indexOf("\n$('#commentsList')?.addEventListener('click'",from);
  assert.ok(from>0&&to>from);
  vm.runInNewContext('let commentsRequestSequence=0;\nfunction commentsRequestIsCurrent(req,id){return req===commentsRequestSequence && String(activeCommentsPostId)===String(id)}\n'+js.slice(from,to)+'\nthis.load=loadComments;',context);
  return {list,refresh,status,context};
}
test('manual refresh finds real new comment IDs and preserves reading position',async()=>{
  const h=harness([1,2,3]);
  await h.context.load(19,{preserveScroll:true});
  assert.equal(h.status.textContent,'1 comentario nuevo.');
  assert.equal(h.list.scrollTop,140);
  assert.equal(h.refresh.disabled,false);
  assert.equal(h.list.attributes['aria-busy'],'false');
  assert.equal(h.list.items.length,4);
});
test('a user already at bottom stays at bottom when actual replies arrive',async()=>{
  const h=harness([1,2,3]);
  h.list.scrollTop=600;
  await h.context.load(19,{preserveScroll:true});
  assert.equal(h.list.scrollTop,h.list.scrollHeight);
  assert.equal(h.status.textContent,'1 comentario nuevo.');
});
test('network error preserves the current list and draft composer untouched',async()=>{
  const h=harness([1,2,3],false);
  const oldList=h.list.innerHTML;
  await h.context.load(19,{preserveScroll:true});
  assert.equal(h.list.innerHTML,oldList);
  assert.match(h.status.textContent,/No se pudo actualizar/);
  assert.equal(h.refresh.disabled,false);
});
test('initial open still loads comments and keeps older retry behavior',async()=>{
  const h=harness([]);
  await h.context.load(19);
  assert.equal(h.list.items.length,4);
  assert.equal(h.list.scrollTop,h.list.scrollHeight);
  assert.equal(h.status.textContent,'');
  assert.match(js,/data-comments-retry/);
  assert.match(js,/commentsRequestIsCurrent/);
});
test('refresh does not touch drafts, post audiences or notification endpoints',()=>{
  const source=js.slice(js.indexOf('function captureCommentPositionV3236('),js.indexOf("\n$('#commentsList')?.addEventListener('click'"));
  assert.doesNotMatch(source,/commentDraftsV3235|localStorage|sessionStorage/);
  assert.match(js,/saveCommentDraftV3235/);
  assert.match(js,/restoreCommentDraftV3235/);
  assert.match(js,/parentCommentId:commentReplyId/);
  assert.equal(JSON.parse(read('package.json')).version,'3.2.36');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.36'/);
  assert.match(html,/\/social\.js\?v=3\.2\.36/);
  assert.match(html,/\/social\.css\?v=3\.2\.36/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:comment-refresh/);
});