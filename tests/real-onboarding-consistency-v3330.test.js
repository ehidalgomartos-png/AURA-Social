'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function between(a,b){const i=social.indexOf(a),j=social.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return social.slice(i,j);}
function growthHarness(){
 const queue=[],calls=[],elements={};
 for(const selector of ['#growthPanel','#homeGrowthDetailsV3224','#homeWelcomeV32150']){
  elements[selector]={classList:{add:s=>calls.push([selector,'hide',s]),remove:s=>calls.push([selector,'show',s])}};
 }
 const ctx={me:{id:7},String,Promise,
  $:selector=>elements[selector]||null,
  api:()=>new Promise(resolve=>queue.push(resolve)),
  renderHomeWelcomeV32150:()=>calls.push(['welcome']),
  renderFirstPostHelperV32158:()=>calls.push(['helper']),
  firstPostHelperUserV32158:'7'};
 vm.runInNewContext(between('let growthPanelRequestSequenceV3330=0;', 'async function shareGrowthInvite(')+'\nthis.load=loadGrowthPanel;',ctx);
 return {ctx,queue,calls,load:ctx.load};
}
test('an outdated successful response cannot revive old recommendations after a newer failure',async()=>{
 const h=growthHarness();
 const old=h.load(),newer=h.load();
 h.queue[1]({r:{ok:false},d:{}});
 await newer;
 const afterNew=h.calls.length;
 assert.ok(afterNew>0);
 h.queue[0]({r:{ok:true},d:{steps:[{id:'post',done:false}]}});await old;
 assert.equal(h.calls.length,afterNew);
});
test('a response from an earlier account cannot expose its welcome or private invite',async()=>{
 const h=growthHarness();
 const old=h.load();
 h.ctx.me={id:8};
 h.queue[0]({r:{ok:true},d:{inviteCode:'former-user',inviteLink:{token:'old'}}});
 await old;
 assert.deepEqual(h.calls,[]);
 assert.equal(h.ctx.firstPostHelperUserV32158,'7');
});
test('confirmed follow refreshes growth even if profile and one other service fail',async()=>{
 const code=between('async function toggleSuggestedFollow(', 'async function loadInterestCatalog(');
 const actions=[],button={dataset:{suggestFollow:'4',following:'0'},disabled:false,textContent:'Seguir',
   classList:{toggle:()=>{}}};
 const roots={'#homeSuggestions':{},'#activePeople':{},'#growthPanel':{}};
 const ctx={String,Error,Promise,
  all:()=>[button],$:(q)=>roots[q]||null,
  api:async(url,options)=>{actions.push('follow:'+options.method);return {r:{ok:true}};},
  loadMe:async()=>{actions.push('me');throw Error('profile unavailable');},
  loadHomeSuggestions:async()=>{actions.push('suggestions');throw Error('temporarily offline');},
  loadActivePeople:async()=>{actions.push('active');},
  loadGrowthPanel:async()=>{actions.push('growth');},
  toast:()=>actions.push('toast')};
 vm.runInNewContext(code+'\nthis.follow=toggleSuggestedFollow;',ctx);
 await ctx.follow(button);
 assert.deepEqual(actions,['follow:POST','me','suggestions','active','growth']);
 assert.equal(button.dataset.following,'1');
 assert.equal(button.disabled,false);
});
test('growth responses remain private and recommendations continue excluding hidden accounts',()=>{
 const route=read('src/routes/growth.js');
 assert.match(route,/router\.get\('\/me', requireAuth/);
 for(const required of ["u.status='active'","u.is_admin=false","u.discoverable=true","FROM blocks b","FROM mutes m","FROM discovery_hidden_items h"]){
  assert.ok(route.includes(required),required);
 }
 assert.match(social,/viewerId!==String\(me\?\.id \?\? ''\)/);
 assert.match(social,/requestId!==growthPanelRequestSequenceV3330/);
 assert.doesNotMatch(between('let growthPanelRequestSequenceV3330=0;', 'async function shareGrowthInvite('),/setInterval|localStorage|sendBeacon/);
 assert.equal(read('public/app.html').split('growth=3.3.30').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/real-onboarding-consistency-v3330\.test\.js/);
});
