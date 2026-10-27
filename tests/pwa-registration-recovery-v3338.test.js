'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const pwa=read('public/pwa.js');
const head=pwa.slice(0,pwa.indexOf('(function initMobilePwaInstallV3239(){'));
function harness({offline=true,hidden=false,fail=false}={}){
 const hooks={},calls={register:0,update:0};
 let now=300000;
 const document={visibilityState:hidden?'hidden':'visible',addEventListener:(type,fn)=>hooks[type]=fn};
 const navigator={onLine:!offline,serviceWorker:{register:async()=>{
   calls.register++;if(fail)throw Error('offline');return {update:async()=>{calls.update++;}};
 }}};
 const window={addEventListener:(type,fn)=>hooks[type]=fn};
 const DateStub=class extends Date{static now(){return now;}};
 vm.runInNewContext(head,{window,document,navigator,Date:DateStub,Promise});
 return {calls,hooks,document,navigator,
   setFailure:v=>{fail=v;},advance:ms=>{now+=ms;},
   flush:async()=>{for(let i=0;i<35;i++)await Promise.resolve();},
   load:()=>hooks.load()};
}
test('offline startup registration fails, then online restores SW without page reload',async()=>{
 const h=harness({offline:true,fail:true});
 await h.load();
 assert.equal(h.calls.register,1);
 assert.equal(h.calls.update,0);
 h.setFailure(false);h.navigator.onLine=true;
 h.hooks.online();await h.flush();
 assert.equal(h.calls.register,2);
 assert.equal(h.calls.update,1);
 h.hooks.online();await h.flush();
 assert.equal(h.calls.register,2);
 assert.equal(h.calls.update,1);
});
test('online registration error is throttled for five minutes, no timer or repeated requests',async()=>{
 const h=harness({offline:false,fail:true});
 await h.load();assert.equal(h.calls.register,1);
 h.hooks.online();await h.flush();
 assert.equal(h.calls.register,1);
 h.advance(4*60*1000);h.hooks.online();await h.flush();
 assert.equal(h.calls.register,1);
 h.advance(60*1000);h.setFailure(false);
 h.hooks.online();await h.flush();
 assert.equal(h.calls.register,2);
 assert.equal(h.calls.update,1);
});
test('reconnect while hidden or still offline never re-registers',async()=>{
 const h=harness({offline:true,fail:true});
 await h.load();
 h.document.visibilityState='hidden';h.navigator.onLine=true;
 h.hooks.online();await h.flush();assert.equal(h.calls.register,1);
 h.document.visibilityState='visible';h.navigator.onLine=false;
 h.hooks.online();await h.flush();assert.equal(h.calls.register,1);
 h.navigator.onLine=true;h.setFailure(false);
 h.hooks.online();await h.flush();assert.equal(h.calls.register,2);
});
test('a successful registration still honors hourly update budget and serializes online events',async()=>{
 const h=harness({offline:false});
 await h.load();
 h.hooks.online();h.hooks.online();await h.flush();
 assert.equal(h.calls.register,1);
 assert.equal(h.calls.update,1);
 h.advance(60*60*1000);h.hooks.online();await h.flush();
 assert.equal(h.calls.update,2);
});
test('no extra polling, no prompts, same PWA installer and private cache protection',()=>{
 assert.match(head,/SW_UPDATE_INTERVAL_V336=60\*60\*1000/);
 assert.match(head,/SW_ERROR_RETRY_V336=5\*60\*1000/);
 assert.doesNotMatch(head,/setTimeout|setInterval|requestPermission/);
 assert.match(pwa,/beforeinstallprompt/);
 assert.match(pwa,/appinstalled/);
 assert.match(read('public/sw.js'),/function shouldBypass\(url,request\)/);
 for(const file of ['public/app.html','public/index.html'])
  assert.equal(read(file).split('retry=3.3.38').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/pwa-registration-recovery-v3338\.test\.js/);
});
