'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
function make({view='feed',hold=[],fail=[]}={}){
  const begin=source.indexOf('let startupHomeExtrasRequestedV337=false;');
  const end=source.indexOf('(async () => {',begin);
  assert.ok(begin>=0&&end>begin);
  const calls=[],waiting=new Map(),rejected=new Set(fail);
  const names={
    pulse:'loadReturnPulse',momentum:'loadHomeMomentum',
    growth:'loadGrowthPanel',communityReturn:'loadCommunityReturn',
    suggestions:'loadHomeSuggestions'
  };
  const ctx={activeViewName:view,Promise,window:{},setTimeout(){}};
  for(const [key,fn] of Object.entries(names)){
    ctx[fn]=()=>{
      calls.push(key);
      if(rejected.has(key)){rejected.delete(key);return Promise.reject(Error('temporary network failure'));}
      if(hold.includes(key))return new Promise(resolve=>waiting.set(key,resolve));
      return Promise.resolve();
    };
  }
  for(const key of ['loadConversations','loadCommunityConversations','loadNotifications'])ctx[key]=async()=>{};
  vm.runInNewContext(source.slice(begin,end)+
    '\nthis.home=loadStartupHomePanelsV337;this.inflight=homePanelInFlightV338;',ctx);
  return {ctx,calls,waiting,flush:async()=>{for(let i=0;i<8;i++)await Promise.resolve();}};
}
test('rapid repeats while requests are pending use a single request per real home panel',async()=>{
  const a=make({hold:['pulse','momentum','growth','communityReturn']});
  a.ctx.home();a.ctx.home();a.ctx.home();
  assert.deepEqual(a.calls,['pulse','momentum','growth','communityReturn','suggestions']);
  assert.equal(a.ctx.inflight.size,4);
  for(const resolver of a.waiting.values())resolver();
  await a.flush();
  assert.equal(a.ctx.inflight.size,0);
  a.ctx.home();
  assert.deepEqual(a.calls.slice(5),['pulse','momentum','growth','communityReturn']);
  assert.equal(a.calls.filter(x=>x==='suggestions').length,1);
});
test('a rejected request releases its lock and can be retried when returning to Inicio',async()=>{
  const a=make({fail:['growth']});
  a.ctx.home();a.ctx.home();
  assert.equal(a.calls.filter(x=>x==='growth').length,1);
  await a.flush();
  assert.equal(a.ctx.inflight.size,0);
  a.ctx.home();
  assert.equal(a.calls.filter(x=>x==='growth').length,2);
  await a.flush();
  assert.equal(a.ctx.inflight.size,0);
});
test('deep links do not launch home-only requests until switching back to feed',async()=>{
  const a=make({view:'messages'});
  a.ctx.home();await a.flush();
  assert.deepEqual(a.calls,[]);
  a.ctx.activeViewName='feed';
  a.ctx.home();
  assert.deepEqual(a.calls,['pulse','momentum','growth','communityReturn','suggestions']);
});
test('completion does not create a stale TTL or persist user data across sessions',async()=>{
  const a=make();
  a.ctx.home();await a.flush();
  a.ctx.home();await a.flush();
  assert.equal(a.calls.filter(x=>x==='pulse').length,2);
  assert.equal(a.calls.filter(x=>x==='momentum').length,2);
  assert.equal(a.ctx.inflight.size,0);
  const segment=source.slice(source.indexOf('const homePanelInFlightV338=new Map();'),
    source.indexOf('function loadStartupInboxV337()'));
  assert.doesNotMatch(segment,/localStorage|sessionStorage|indexedDB|setTimeout|Date\.now|INSERT INTO|autoFollow/);
  assert.match(segment,/Promise\.allSettled\(tasks\)/);
  assert.match(source,/if \(name === 'feed'\) loadStartupHomePanelsV337\(\)/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/mobile-home-single-flight-v338\.test\.js/);
});
