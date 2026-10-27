'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const pwa=read('public/pwa.js'),badge=read('public/pwa-badges-v3323.js');
const app=read('public/app.html'),index=read('public/index.html');
function swHarness(){
 const hooks={},state={online:false,visible:true,now:300000},calls={updates:0,register:0};
 const document={visibilityState:'visible',addEventListener:(type,fn)=>hooks['doc:'+type]=fn};
 const registration={update:()=>{calls.updates++;return Promise.resolve();}};
 const navigator={onLine:false,serviceWorker:{register:async()=>{calls.register++;return registration;}}};
 const window={addEventListener:(type,fn)=>hooks['win:'+type]=fn};
 const DateStub=class extends Date{static now(){return state.now;}};
 vm.runInNewContext(pwa.slice(0,pwa.indexOf('(function initMobilePwaInstallV3239(){')),{window,document,navigator,Date:DateStub,Promise});
 return {hooks,state,calls,document,navigator,load:async()=>hooks['win:load'](),flush:async()=>{for(let i=0;i<12;i++)await Promise.resolve();}};
}
test('reconnecting while visible runs the due PWA update without a new interval or registration',async()=>{
 const h=swHarness();await h.load();
 assert.equal(h.calls.updates,0);
 h.navigator.onLine=true;h.hooks['win:online']();await h.flush();
 assert.equal(h.calls.updates,1);
 h.hooks['win:online']();await h.flush();
 assert.equal(h.calls.updates,1,'hourly budget prevents duplicate reconnect checks');
 assert.equal(h.calls.register,1);
 h.state.now+=60*60*1000;h.document.visibilityState='hidden';
 h.hooks['win:online']();await h.flush();assert.equal(h.calls.updates,1);
 h.document.visibilityState='visible';h.hooks['win:online']();await h.flush();
 assert.equal(h.calls.updates,2);
});
test('installed app reads real badge on online only when visible and authenticated',async()=>{
 const hooks={},calls=[],pending=[];
 const document={visibilityState:'visible',addEventListener:(type,fn)=>hooks['doc:'+type]=fn};
 const navigator={standalone:true,onLine:false,setAppBadge:async n=>calls.push(['set',n]),clearAppBadge:async()=>calls.push(['clear'])};
 const window={matchMedia:()=>({matches:true}),addEventListener:(type,fn)=>hooks['win:'+type]=fn};
 vm.runInNewContext(badge,{window,document,navigator,Promise,Number,String,Date,
  fetch:async()=>{calls.push(['fetch']);return new Promise(resolve=>pending.push(resolve));}});
 const api=window.RedLibertadPwaBadgeV3323;
 api.setUser(5);for(let i=0;i<8;i++)await Promise.resolve();
 hooks['win:online']();await Promise.resolve();assert.equal(pending.length,0);
 navigator.onLine=true;hooks['win:online']();await Promise.resolve();
 assert.equal(pending.length,1);
 pending[0]({ok:true,json:async()=>({badgeUnread:3})});
 await Promise.resolve();for(let i=0;i<12;i++)await Promise.resolve();
 assert.deepEqual(calls.filter(c=>c[0]==='set'),[['set',3]]);
 document.visibilityState='hidden';hooks['win:online']();await Promise.resolve();
 assert.equal(pending.length,1);
});
test('cache version updated for public landing and social app, no polling or unwanted navigation',()=>{
 assert.equal(app.split('/pwa.js?v=3.2.39&amp;online=3.3.27').length-1,1);
 assert.equal(index.split('/pwa.js?v=3.2.39&amp;online=3.3.27').length-1,1);
 assert.equal(app.split('session=3.3.25&amp;online=3.3.27').length-1,1);
 assert.match(pwa,/SW_UPDATE_INTERVAL_V336=60\*60\*1000/);
 assert.doesNotMatch(pwa.slice(0,pwa.indexOf('(function initMobilePwaInstallV3239(){')),/setInterval|setTimeout|location\./);
 assert.doesNotMatch(badge,/setInterval|setTimeout|localStorage|sessionStorage|requestPermission/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/pwa-online-recovery-v3327\.test\.js/);
});
