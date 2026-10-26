'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/pwa.js'),'utf8');
const head=source.slice(0,source.indexOf('(function initMobilePwaInstallV3239(){'));
function runHarness({registerReject=false,updateReject=false,offline=false,hidden=false}={}){
 const events={},clock={now:Date.parse('2026-10-26T17:00:00Z')},calls={register:0,update:0},pending=[];
 const DateStub=class extends Date{static now(){return clock.now}};
 const document={visibilityState:hidden?'hidden':'visible',addEventListener:(name,fn)=>{events[name]=fn}};
 const registration={update:()=>{
   calls.update++;
   if(updateReject)return Promise.reject(Error('offline'));
   if(pending.length){
     return new Promise(resolve=>{pending[pending.length-1]=resolve});
   }
   return Promise.resolve();
 }};
 const navigator={onLine:!offline,serviceWorker:{register:async(url,opts)=>{
   calls.register++;
   assert.equal(url,'/sw.js');assert.equal(opts.updateViaCache,'none');
   if(registerReject)throw Error('service worker unsupported');
   return registration;
 }}};
 const window={addEventListener:(name,fn)=>{events[name]=fn}};
 const ctx={window,document,navigator,Date:DateStub,Promise};
 vm.runInNewContext(head,ctx);
 return {ctx,events,clock,calls,document,navigator,
   load:()=>events.load(),
   visible:async()=>{
     document.visibilityState='visible';
     events.visibilitychange();
     await Promise.resolve();
     await Promise.resolve();
   },
   advance:ms=>clock.now+=ms,
   defer:()=>pending.push(null),
   settle:()=>{const callback=pending.pop();callback?.();}
 };
}
test('one registration and one version check after loading the app',async()=>{
 const h=runHarness();
 await h.load();
 assert.equal(h.calls.register,1);
 assert.equal(h.calls.update,1);
 await h.visible();
 await h.visible();
 assert.equal(h.calls.update,1,'tab switching does not trigger a new network request');
});
test('returning after one hour checks again without repeated writes or timers',async()=>{
 const h=runHarness();
 await h.load();
 h.advance(59*60*1000);await h.visible();
 assert.equal(h.calls.update,1);
 h.advance(60*1000);await h.visible();
 assert.equal(h.calls.update,2);
 await h.visible();
 assert.equal(h.calls.update,2);
 assert.match(head,/SW_UPDATE_INTERVAL_V336=60\*60\*1000/);
 assert.doesNotMatch(head,/setInterval|setTimeout/);
});
test('concurrent visibility events cannot start overlapping service worker updates',async()=>{
 const h=runHarness();h.defer();
 const work=h.load();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(h.calls.update,1);
 await h.visible();await h.visible();
 assert.equal(h.calls.update,1);
 h.settle();await work;
 h.advance(60*60*1000);await h.visible();
 assert.equal(h.calls.update,2);
});
test('offline and background state never initiate a redundant network update',async()=>{
 const h=runHarness({offline:true});
 await h.load();
 assert.equal(h.calls.register,1);
 assert.equal(h.calls.update,0);
 h.navigator.onLine=true;
 h.document.visibilityState='hidden';
 h.events.visibilitychange();await Promise.resolve();
 assert.equal(h.calls.update,0);
 await h.visible();await Promise.resolve();
 assert.equal(h.calls.update,1);
});
test('failed version check retries after five minutes, not on every tab switch',async()=>{
 const h=runHarness({updateReject:true});
 await h.load();
 assert.equal(h.calls.update,1);
 await h.visible();assert.equal(h.calls.update,1);
 h.advance(4*60*1000);await h.visible();
 assert.equal(h.calls.update,1);
 h.advance(60*1000);await h.visible();
 assert.equal(h.calls.update,2);
});
test('registration errors are nonfatal; installation and push routing remain unchanged',async()=>{
 const h=runHarness({registerReject:true});
 await h.load();
 await h.visible();
 assert.equal(h.calls.register,1);
 assert.equal(h.calls.update,0);
 assert.match(source,/beforeinstallprompt/);
 assert.match(source,/appinstalled/);
 const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
 assert.match(sw,/self\.addEventListener\('push'/);
 assert.match(sw,/self\.addEventListener\('notificationclick'/);
 assert.match(fs.readFileSync(path.join(__dirname,'../.github/workflows/validate-js.yml'),'utf8'),/tests\/mobile-pwa-update-budget-v336\.test\.js/);
});
