'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');

function part(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a,'Missing social logic: '+start);
  return source.slice(a,b);
}

const submitOnce=new Function(
  part('const socialSubmittingForms=new WeakSet();',"$('#commentForm').addEventListener('submit'")+
  '\nreturn runSocialSubmitOnce;'
)();

function formWithButtons(disabled=false){
  const button={disabled};
  return {button,form:{querySelectorAll:()=>[button]}};
}
function deferred(){
  let resolve;
  const promise=new Promise(res=>{resolve=res;});
  return {promise,resolve};
}

test('two rapid submissions use only one request and restore submit state',async()=>{
  const {form,button}=formWithButtons();
  const gate=deferred();
  let count=0;
  const first=submitOnce(form,async()=>{count++;await gate.promise;});
  const second=submitOnce(form,async()=>{count++;});
  await second;
  assert.equal(count,1);
  assert.equal(button.disabled,true);
  gate.resolve();
  await first;
  assert.equal(button.disabled,false);
  await submitOnce(form,async()=>{count++;});
  assert.equal(count,2);
});

test('a previously disabled button is not re-enabled by the submit guard',async()=>{
  const {form,button}=formWithButtons(true);
  await submitOnce(form,async()=>{});
  assert.equal(button.disabled,true);
});

test('failed submit restores controls and permits a later retry',async()=>{
  const {form,button}=formWithButtons();
  await assert.rejects(()=>submitOnce(form,async()=>{throw Error('offline');}),/offline/);
  assert.equal(button.disabled,false);
  let count=0;
  await submitOnce(form,async()=>{count++;});
  assert.equal(count,1);
});

test('create post, story and comments all use guarded submit handlers',()=>{
  assert.match(source,/runSocialSubmitOnce\(event\.currentTarget,async\(\)=>\{/);
  assert.match(source,/runSocialSubmitOnce\(e\.currentTarget,async\(\)=>\{/);
  assert.match(source,/\$\('#createForm'\)\.addEventListener\('submit'/);
  assert.match(source,/\$\('#storyForm'\)\.addEventListener\('submit'/);
  assert.match(source,/\$\('#commentForm'\)\.addEventListener\('submit'/);
});

function commentHarness(api){
  const listeners={};
  let closed=false;
  const list={
    innerHTML:'',scrollTop:0,scrollHeight:42,attributes:{},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(name,fn){listeners[name]=fn;}
  };
  const modal={classList:{contains:()=>closed}};
  const $=selector=>selector==='#commentsList'?list:selector==='#commentsModal'?modal:null;
  const js=part('// Prevent outdated requests from replacing a newly opened comment thread.','function openReport(postId) {');
  const factory=new Function('api','$','all','commentHTML','startCommentReply','listeners',
    'let activeCommentsPostId=null;\n'+js+
    '\nreturn {load:loadComments,setPostId(id){activeCommentsPostId=id;},close(){closed=true;commentsRequestSequence++;},listeners};');
  const harness=factory(api,$,()=>[],row=>'<article>'+row.body+'</article>',()=>{},listeners);
  return {...harness,list};
}

test('comments failure provides a reattempt button without losing conversation context',async()=>{
  const harness=commentHarness(async()=>({r:{ok:false},d:{error:'network_error'}}));
  harness.setPostId(45);
  await harness.load(45);
  assert.match(harness.list.innerHTML,/No se pudieron cargar los comentarios/);
  assert.match(harness.list.innerHTML,/data-comments-retry/);
  assert.equal(harness.list.attributes['aria-busy'],'false');
  assert.equal(typeof harness.listeners.click,'function');
});

test('successful comments and empty comments both render correctly',async()=>{
  const harness=commentHarness(async url=>({r:{ok:true},d:{comments:url.includes('/11/')?[{body:'Comentario correcto'}]:[]}}));
  harness.setPostId(11);
  await harness.load(11);
  assert.match(harness.list.innerHTML,/Comentario correcto/);
  harness.setPostId(12);
  await harness.load(12);
  assert.match(harness.list.innerHTML,/Todavía no hay comentarios/);
});

test('older response does not replace comments from a newly opened post',async()=>{
  const a=deferred(),b=deferred();
  const harness=commentHarness(url=>url.includes('/1/')?a.promise:b.promise);
  harness.setPostId(1);
  const old=harness.load(1);
  harness.setPostId(2);
  const recent=harness.load(2);
  b.resolve({r:{ok:true},d:{comments:[{body:'POST 2 NUEVO'}]}});
  await recent;
  a.resolve({r:{ok:true},d:{comments:[{body:'POST 1 ANTIGUO'}]}});
  await old;
  assert.match(harness.list.innerHTML,/POST 2 NUEVO/);
  assert.doesNotMatch(harness.list.innerHTML,/POST 1 ANTIGUO/);
});

test('closing comments invalidates responses still in flight',async()=>{
  const gate=deferred();
  const harness=commentHarness(()=>gate.promise);
  harness.setPostId(10);
  const pending=harness.load(10);
  harness.close();
  gate.resolve({r:{ok:true},d:{comments:[{body:'STALE'}]}});
  await pending;
  assert.doesNotMatch(harness.list.innerHTML,/STALE/);
});

test('navigation validates destination before hiding active sections',()=>{
  const block=part('function showView(name) {',"all('[data-view]').forEach(b => b.onclick");
  assert.match(block,/document\.getElementById/);
  assert.match(block,/if\(!view\|\|!view\.classList\.contains\('view'\)\)return/);
  assert.ok(block.indexOf('getElementById')<block.indexOf("all('.view').forEach"));
});

test('replaced preview URLs are revoked and reset safely',()=>{
  const revoked=[];
  const preview=new Function('URL',part('let postMediaPreviewUrl=null;','function clearPostMedia() {')+
    '\nreturn {set(value){postMediaPreviewUrl=value;},revoke:revokePostMediaPreview,get(){return postMediaPreviewUrl;}};')({
      revokeObjectURL:url=>revoked.push(url)
    });
  preview.set('blob:old-photo');
  preview.revoke();preview.revoke();
  assert.equal(revoked.length,1);
  assert.equal(revoked[0],'blob:old-photo');
  assert.equal(preview.get(),null);
  assert.match(source,/postMediaPreviewUrl=u/);
});

test('comment responses cannot erase a draft from a different post',()=>{
  assert.match(source,/const commentPostId=activeCommentsPostId/);
  assert.match(source,/String\(activeCommentsPostId\|\|''\)!==String\(commentPostId\)/);
});

test('support feedback uses the live app version and not a stale constant',()=>{
  assert.match(source,/clientAppVersion=String\(d\.version\)\.slice\(0,32\)/);
  assert.match(source,/appVersion:clientAppVersion/);
  assert.doesNotMatch(part('function supportContext(){','function renderSupportMine('),/appVersion:'1\.72\.0'/);
});
