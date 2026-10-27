'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function section(a,b){const i=social.indexOf(a),j=social.indexOf(b,i+1);assert.ok(i>=0&&j>i,a);return social.slice(i,j);}
test('two rapid submits create a single private conversation and open the saved chat once',async()=>{
 let submit,reply;const calls=[],status={textContent:''},button={disabled:false},
 form={querySelectorAll:()=>[button],addEventListener:(event,fn)=>{if(event==='submit')submit=fn;}};
 const $=key=>({'#newMessageForm':form,'#newMessageStatus':status,
  '#newMessageRecipientV3244':{dataset:{exactUsername:'ana'}}}[key]||null);
 const FormDataStub=class{get(key){return key==='username'?'ana':null;}};
 const ctx={$ ,WeakSet,FormData:FormDataStub,String,
  api:()=>{calls.push('POST');return new Promise(resolve=>{reply=resolve;});},
  closeNewConversationModal:()=>calls.push('close'),
  showView:()=>calls.push('show'),
  openConversation:async id=>calls.push('open:'+id),
  loadConversations:async()=>calls.push('list')};
 vm.runInNewContext(section('const socialSubmittingForms=new WeakSet();',"$('#commentForm').addEventListener")
  +'\n'+section("$('#newMessageForm').addEventListener('submit'","$('#newGroupForm')"),ctx);
 const e={preventDefault(){},currentTarget:form,target:form};
 const first=submit(e),second=submit(e);
 assert.deepEqual(calls,['POST']);
 assert.equal(button.disabled,true);
 reply({r:{ok:true},d:{conversationId:17}});
 await Promise.all([first,second]);
 assert.deepEqual(calls,['POST','close','show','open:17']);
 assert.equal(button.disabled,false);
});
test('failed creation retains entered account and can be retried; no duplicate fetch',async()=>{
 let submit,reply;const calls=[],status={textContent:''},button={disabled:false},
 form={querySelectorAll:()=>[button],addEventListener:(event,fn)=>{if(event==='submit')submit=fn;}};
 const $=key=>({'#newMessageForm':form,'#newMessageStatus':status,
  '#newMessageRecipientV3244':{dataset:{exactUsername:'ana'}}}[key]||null);
 const ctx={$ ,WeakSet,String,FormData:class{get(){return 'ana';}},
  api:()=>{calls.push('POST');return new Promise(resolve=>{reply=resolve;});},
  closeNewConversationModal:()=>calls.push('close'),
  showView:()=>calls.push('show'),openConversation:async()=>calls.push('open')};
 vm.runInNewContext(section('const socialSubmittingForms=new WeakSet();',"$('#commentForm').addEventListener")
  +'\n'+section("$('#newMessageForm').addEventListener('submit'","$('#newGroupForm')"),ctx);
 const e={preventDefault(){},currentTarget:form,target:form};
 const first=submit(e);reply({r:{ok:false},d:{error:'message_privacy_denied'}});await first;
 assert.match(status.textContent,/no acepta nuevas conversaciones/);
 assert.equal(button.disabled,false);
 const retry=submit(e);assert.equal(calls.length,2);
 reply({r:{ok:true},d:{conversationId:33}});await retry;
 assert.deepEqual(calls,['POST','POST','close','show','open']);
});
test('retains actual server access/privacy checks, no fake messages or new screens',()=>{
 const code=section("$('#newMessageForm').addEventListener('submit'","$('#newGroupForm')");
 assert.match(code,/api\('\/api\/messages\/conversations'/);
 assert.match(code,/runSocialSubmitOnce\(event\.currentTarget/);
 assert.match(code,/await openConversation\(d\.conversationId\)/);
 assert.doesNotMatch(code,/loadConversations\(d\.conversationId\)/);
 assert.doesNotMatch(code,/setInterval|fake|automated|sendPush|localStorage/);
 assert.match(read('public/app.html'),/chat=3\.3\.29/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/chat-entry-single-flight-v3329\.test\.js/);
});
