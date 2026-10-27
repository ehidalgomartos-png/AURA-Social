'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
const begin=source.indexOf('// V3.3.12: mobile Explore only loads the visible tab');
const end=source.indexOf('// V3.2.165: discard stale requests',begin);
assert.ok(begin>0&&end>begin,'missing Explore coordinator');
function harness({mobile=true,selected='content',pending=false,throwOn=null}={}){
 const calls=[],deferred=[],buttons=[];
 const root={dataset:{exploreSection:selected}};
 for(const mode of ['content','people'])buttons.push({
  dataset:{exploreMobileSection:mode},
  classList:{toggle(){}},setAttribute(){}
 });
 const ctx={Promise,Map,Set,activeViewName:'explore',
   exploreMobileSection:selected,activeExploreInterest:'Arte',activeContentMode:'foryou',
   window:{matchMedia:query=>{assert.equal(query,'(max-width:760px)');return {matches:mobile}}},
   $:sel=>sel==='#exploreView'?root:null,
   all:sel=>sel==='[data-explore-mobile-section]'?buttons:[],
   initGlobalSearch:()=>calls.push('searchInit')
 };
 for(const [name,fn] of [
  ['connections','loadConnections'],['people','loadPeopleSuggestions'],
  ['trends','loadTrendChips'],['posts','loadDiscoveryContent']
 ]){
  ctx[fn]=arg=>{
   calls.push(name);
   if(throwOn===name)return Promise.reject(Error('offline'));
   if(pending)return new Promise(resolve=>deferred.push({name,resolve}));
   return Promise.resolve(arg);
  };
 }
 vm.runInNewContext(source.slice(begin,end)+
  '\nthis.start=loadExplore;this.tab=setExploreMobileSection;this.fetchTab=loadExploreTabV3312;this.pending=explorePendingTabsV3312;this.loaded=exploreLoadedTabsV3312;',ctx);
 return {ctx,calls,root,buttons,deferred,settle:()=>deferred.splice(0).forEach(x=>x.resolve())};
}
test('failed HTTP responses from existing loaders never mark a mobile tab complete',async()=>{
 const h=harness();
 h.ctx.loadTrendChips=()=>{h.calls.push('trends-failed');return Promise.resolve(false);};
 await h.ctx.start();
 assert.equal(h.ctx.loaded.has('content'),false);
 await h.ctx.fetchTab('content');
 assert.equal(h.calls.filter(x=>x==='trends-failed').length,2);
 h.ctx.loadTrendChips=()=>Promise.resolve(true);
 await h.ctx.fetchTab('content');
 assert.equal(h.ctx.loaded.has('content'),true);
});

test('real Explore loaders preserve private circles on HTTP failure and expose retries',()=>{
 assert.match(source,/if\(!r\.ok\)return false;[\s\S]*?connectionCircles=Array\.isArray\(d\.circles\)/);
 assert.match(source,/if\(await loadConnectionCircles\(\)===false\)return false/);
 assert.match(source,/if\(!r\.ok\)return false; \/\/ Do not hide real connections/);
 assert.match(source,/if\(!r\.ok\)throw Error\('suggestions_unavailable'\)/);
 assert.match(source,/return false;[\s\S]*?\/\/ V3\.3\.12: mobile Explore/);
 assert.match(source,/data-ui-retry="explore-content"/);
 assert.match(source,/else if\(action==='explore-content'\)/);
});

test('mobile opens only selected publications; switching to people requests only real people and circles',async()=>{
 const h=harness();
 await h.ctx.start();
 assert.deepEqual(h.calls,['searchInit','trends','posts']);
 assert.equal(h.ctx.tab('people',{load:true}),true);
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.deepEqual(h.calls,['searchInit','trends','posts','connections','people']);
 h.ctx.tab('content',{load:true});
 h.ctx.tab('people',{load:true});
 assert.equal(h.calls.length,5,'returning to a loaded tab should not refetch');
 assert.equal(h.root.dataset.exploreSection,'people');
});
test('deep-linked people tab is selected before open without prematurely fetching',async()=>{
 const h=harness({selected:'content'});
 h.ctx.tab('people');
 assert.equal(h.calls.length,0);
 await h.ctx.start();
 assert.deepEqual(h.calls,['searchInit','connections','people']);
});
test('desktop continues to load all sources regardless of the remembered mobile tab',async()=>{
 const h=harness({mobile:false,selected:'people'});
 await h.ctx.start();
 assert.deepEqual(h.calls,['searchInit','connections','people','trends','posts']);
});
test('rapid tab switching while a load is in flight does not launch duplicate requests',async()=>{
 const h=harness({pending:true});
 const start=h.ctx.start();
 h.ctx.tab('content',{load:true});
 h.ctx.tab('people',{load:true});
 h.ctx.tab('content',{load:true});
 assert.deepEqual(h.calls,['searchInit','trends','posts','connections','people']);
 h.settle();await start;
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(h.ctx.pending.size,0);
 assert.equal(h.ctx.loaded.size,2);
});
test('a rejected tab load is not cached forever; switching back can retry',async()=>{
 const h=harness({throwOn:'people',selected:'people'});
 await h.ctx.start();
 assert.equal(h.ctx.loaded.has('people'),false);
 h.ctx.tab('content',{load:true});
 for(let i=0;i<8;i++)await Promise.resolve();
 h.ctx.tab('people',{load:true});
 assert.equal(h.calls.filter(x=>x==='people').length,2);
});
test('re-entering Explore refreshes only current pane and preserves scroll/push/search behavior',async()=>{
 const h=harness();
 await h.ctx.start();
 await h.ctx.start();
 assert.deepEqual(h.calls,['searchInit','trends','posts','searchInit','trends','posts']);
 assert.match(source,/if \(name === 'explore'\) \{[\s\S]*?loadExplore\(\)/);
 assert.match(source,/button\.onclick=\(\)=>setExploreMobileSection\(button\.dataset\.exploreMobileSection,\{load:true\}\)/);
 assert.match(source,/if\(load&&activeViewName==='explore'&&exploreIsMobileV3312\(\)\)/);
 const block=source.slice(begin,end);
 assert.doesNotMatch(block,/localStorage|sessionStorage|analytics|sendBeacon|POST|DELETE|UPDATE/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/explore-on-demand-v3312\.test\.js/);
});
