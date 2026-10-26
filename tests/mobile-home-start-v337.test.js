'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function harness({idle=true,view='feed'}={}){
 const a=social.indexOf('let startupHomeExtrasRequestedV337=false;');
 const b=social.indexOf('(async () => {',a);
 assert.ok(a>0&&b>a);
 const calls=[],callbacks=[],errors=[];
 const ctx={
  activeViewName:view,
  Promise,window:{requestIdleCallback:idle?(fn,options)=>{callbacks.push({fn,options});}:undefined},
  setTimeout:(fn,ms)=>{callbacks.push({fn,ms});},
  loadReturnPulse:async()=>{calls.push('pulse');},
  loadHomeMomentum:async()=>{calls.push('momentum');},
  loadGrowthPanel:async()=>{calls.push('growth');},
  loadCommunityReturn:async()=>{calls.push('communities');},
  loadHomeSuggestions:async()=>{calls.push('suggestions');},
  loadConversations:async()=>{calls.push('messages');},
  loadCommunityConversations:async()=>{calls.push('communityChats');},
  loadNotifications:async()=>{calls.push('notifications');},
  console:{error:e=>errors.push(e)}
 };
 vm.runInNewContext(social.slice(a,b)+'\nthis.start=scheduleStartupExtrasV337;this.home=loadStartupHomePanelsV337;',ctx);
 return {ctx,calls,callbacks,errors,runScheduled:async()=>{assert.equal(callbacks.length,1);callbacks[0].fn();await Promise.resolve();}};
}
test('offscreen work is deferred until idle and gives the browser a 1200ms deadline',async()=>{
 const h=harness();
 h.ctx.start();
 assert.deepEqual(h.calls,[]);
 assert.equal(h.callbacks.length,1);
 assert.equal(h.callbacks[0].options.timeout,1200);
 await h.runScheduled();
 assert.deepEqual(h.calls,['pulse','momentum','growth','communities','suggestions','messages','communityChats','notifications']);
});
test('fallback scheduling yields the first frame without inventing loading UI',async()=>{
 const h=harness({idle:false});
 h.ctx.start();
 assert.equal(h.callbacks.length,1);
 assert.equal(h.callbacks[0].ms,0);
 assert.equal(h.calls.length,0);
 await h.runScheduled();
 assert.equal(h.calls.length,8);
});
test('deep links avoid fetching feed-only home extras, and the first return to feed restores them',async()=>{
 const h=harness({view:'messages'});
 h.ctx.start();await h.runScheduled();
 assert.deepEqual(h.calls,['notifications']);
 h.ctx.activeViewName='feed';
 h.ctx.home();await Promise.resolve();
 assert.deepEqual(h.calls,['notifications','pulse','momentum','growth','communities','suggestions']);
 h.ctx.home();await Promise.resolve();
 assert.equal(h.calls.filter(x=>x==='suggestions').length,1);
 assert.equal(h.calls.filter(x=>x==='pulse').length,2,'returning home keeps its refresh behavior');
});
test('opening Notifications avoids duplicated list reads',async()=>{
 const h=harness({view:'notifications'});
 h.ctx.start();await h.runScheduled();
 assert.equal(h.calls.includes('notifications'),false);
 assert.equal(h.calls.includes('messages'),true);
});
test('startup paints feed and stories before inbox and optional panels without removing deep links',()=>{
 const init=social.slice(social.indexOf('(async () => {',social.indexOf('let startupHomeExtrasRequestedV337=false;')),social.indexOf("document.addEventListener('click',async event=>{",social.indexOf('let startupHomeExtrasRequestedV337=false;')));
 assert.match(init,/await Promise\.allSettled\(\[loadFeed\('latest'\),loadStories\(\)\]\)/);
 assert.match(init,/await handleInitialDeepLink\(\);\s*scheduleStartupExtrasV337\(\)/);
 assert.match(init,/startLiveActivity\(\)/);
 assert.match(init,/startPresenceHeartbeat\(\)/);
 assert.match(init,/await loadSavedPostIds\(\)/);
 assert.doesNotMatch(init,/Promise\.all\(\[loadStories\(\), loadFeed\('latest'\), loadConversations/);
 assert.match(social,/if \(name === 'feed'\) loadStartupHomePanelsV337\(\)/);
 assert.equal((read('public/app.html').match(/id="feedView"/g)||[]).length,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/mobile-home-start-v337\.test\.js/);
});
