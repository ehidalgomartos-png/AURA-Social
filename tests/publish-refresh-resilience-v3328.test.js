'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function section(a,b){const i=social.indexOf(a),j=social.indexOf(b,i+1);assert.ok(i>=0&&j>i,a);return social.slice(i,j);}
test('confirmed comment is still a success when optional comments/feed/growth reloads fail',async()=>{
 let submit;const status={textContent:''},body={value:'Mi respuesta'},button={disabled:false,textContent:'Publicar'};
 const calls=[];
 const form={addEventListener:(type,handler)=>{if(type==='submit')submit=handler;},
  querySelector:()=>button};
 const $=id=>({
  '#commentForm':form,'#commentBody':body,'#commentStatus':status,
  '#commentDraftHintV3235':{classList:{add:()=>{}}},'#growthPanel':{}
 }[id]||null);
 const ctx={$ ,activeCommentsPostId:8,activeCommentReply:null,commentDraftsV3235:new Map(),
  runSocialSubmitOnce:async(_,work)=>work(),saveCommentDraftV3235:()=>{},
  ensureCommentDraftOwnerV3235:()=>{},clearCommentReply:()=>{},currentMode:'latest',
  api:async()=>({r:{ok:true},d:{comment:{id:14}}}),
  loadComments:async()=>{calls.push('comments');throw Error('offline');},
  loadFeed:async()=>{calls.push('feed');throw Error('offline');},
  loadGrowthPanel:async()=>{calls.push('growth');throw Error('offline');},
  String,Map};
 vm.runInNewContext(section("$('#commentForm').addEventListener('submit'","$('#closeReportModal')"),ctx);
 await submit({preventDefault(){},currentTarget:form});
 assert.equal(status.textContent,'Comentario publicado.');
 assert.equal(body.value,'');
 assert.equal(button.textContent,'Publicar');assert.equal(button.disabled,false);
 assert.deepEqual(calls,['comments','feed','growth']);
});
test('confirmed public post resets composer once even if all three post-save reads fail',async()=>{
 let submit;const status={textContent:''},modal={classList:{add:()=>{calls.push('close')}}};
 const calls=[],form={addEventListener:(type,fn)=>{if(type==='submit')submit=fn;},
  reset:()=>calls.push('reset')};
 const $=id=>({
  '#createForm':form,'#createMessage':status,'#mediaFile':{files:[]},
  '#modal':modal
 }[id]||null);
 const data={caption:'Una idea',kind:'post',audience:'public',communityType:'none',contentLevel:'normal'};
 const FormDataStub=class{get(key){return data[key]??null;}};
 const ctx={$ ,FormData:FormDataStub,me:{creator_verified:false},
  currentMode:'latest',connectionCircles:[],runSocialSubmitOnce:async(_,work)=>work(),
  selectedAudienceCircleIds:()=>[],api:async(url,opts)=>{calls.push('post');return {r:{ok:true},d:{}};},
  toast:s=>calls.push('toast:'+s),clearFirstPostTextV3318:()=>calls.push('clear-draft'),
  clearPostMedia:()=>{},updateCreateCounter:()=>{},updateCommunityComposeFields:()=>{},
  syncAudienceCirclePicker:()=>{},renderAudienceCircleOptions:()=>{},
  loadFeed:async()=>{calls.push('feed');throw Error('network');},
  loadMe:async()=>{calls.push('me');throw Error('network');},
  loadGrowthPanel:async()=>{calls.push('growth');throw Error('network');},
  String,Number,Set,Date};
 vm.runInNewContext(section("$('#createForm').addEventListener('submit'","$('#storyForm').addEventListener('submit'"),ctx);
 await submit({preventDefault(){},currentTarget:form,target:form});
 assert.equal(calls.filter(x=>x==='post').length,1);
 assert.deepEqual(calls.slice(-3),['feed','me','growth']);
 assert.ok(calls.includes('toast:Publicado'));assert.ok(calls.includes('reset'));
 assert.ok(calls.includes('clear-draft'));
 assert.equal(status.textContent,'Publicando...','no false send-failed message');
});
test('publish operations remain single-flight and drafts are not cleared on unsuccessful writes',()=>{
 const guard=section('async function runSocialSubmitOnce(form,action)','$(\'#commentForm\').addEventListener');
 assert.match(guard,/socialSubmittingForms\.has\(form\)/);
 assert.match(guard,/socialSubmittingForms\.delete\(form\)/);
 const post=section("$('#createForm').addEventListener('submit'","$('#storyForm').addEventListener('submit'");
 assert.ok(post.indexOf("if (!r.ok) throw new Error")<post.indexOf("toast(successMessage)"));
 assert.ok(post.indexOf("toast(successMessage)")<post.indexOf("clearFirstPostTextV3318()"));
 assert.match(read('public/app.html'),/publish=3\.3\.28/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/publish-refresh-resilience-v3328\.test\.js/);
 assert.doesNotMatch(post,/setInterval|autoPublish|localStorage|sendBeacon/);
});
