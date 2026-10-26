'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
function fragment(begin,end){
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,begin);
 return source.slice(a,b);
}
function deferred(){
 let resolve;const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
test('home recommendations ignore stale responses and do not mislabel connection failures as empty',async()=>{
 const root={innerHTML:'Perfiles anteriores'},pending=[];
 const ctx={$:name=>name==='#homeSuggestions'?root:null,
   api:()=>{const p=deferred();pending.push(p);return p.promise},
   personCardHTML:u=>'<b>'+u.username+'</b>',
   Array};
 vm.runInNewContext(fragment('let homeSuggestionsRequestSequenceV3310=0;','async function renderInterestFilters(')+
   '\nthis.load=loadHomeSuggestions;',ctx);
 const first=ctx.load(),second=ctx.load();
 pending[1].resolve({r:{ok:true},d:{users:[{username:'ana'}]}});await second;
 pending[0].resolve({r:{ok:true},d:{users:[{username:'older'}]}});await first;
 assert.match(root.innerHTML,/ana/);assert.doesNotMatch(root.innerHTML,/older/);
 const failed=ctx.load();
 pending[2].resolve({r:{ok:false},d:{error:'offline'}});await failed;
 assert.match(root.innerHTML,/ana/);
 const empty=ctx.load();pending[3].resolve({r:{ok:true},d:{users:[]}});await empty;
 assert.match(root.innerHTML,/Ya conoces a todos/);
});
test('community suggestions keep last good state when refresh fails and discard older results',async()=>{
 const list={innerHTML:'',children:[]};
 Object.defineProperty(list,'innerHTML',{get(){return this._html||''},set(v){this._html=v;this.children=v?[{}]:[]}});
 const section={classList:{toggle() {}}},pending=[];
 const ctx={$:key=>key==='#communityReturn'?section:key==='#communityReturnList'?list:null,
   api:()=>{const p=deferred();pending.push(p);return p.promise},
   communityReturnCard:entry=>'<article>'+entry.name+'</article>',Array};
 vm.runInNewContext(fragment('let communityReturnRequestSequenceV3310=0;',"$('#communityReturnRefresh')")+
  '\nthis.load=loadCommunityReturn;',ctx);
 const first=ctx.load(),second=ctx.load();
 pending[1].resolve({r:{ok:true},d:{items:[{name:'Actual'}]}});await second;
 pending[0].resolve({r:{ok:false},d:{}});await first;
 assert.match(list.innerHTML,/Actual/);
 const failed=ctx.load();pending[2].resolve({r:{ok:false},d:{}});await failed;
 assert.match(list.innerHTML,/Actual/);
});
test('home momentum does not mark a visit after navigation away from the feed',async()=>{
 const root={innerHTML:'Sin cambios',classList:{add(){},toggle(){}}};
 const section={classList:{toggle(){},add(){},remove(){}},
   querySelector:()=>({classList:{add(){},toggle(){}}})};
 const pending=[],visited=[];
 const ctx={activeViewName:'feed',Promise,Date,
   $:key=>key==='#homeMomentum'?section:key==='#momentumPosts'?root:
     key==='#momentumTitle'||key==='#momentumSubtitle'?{textContent:''}:null,
   api:()=>{const p=deferred();pending.push(p);return p.promise},
   readLastHomeVisit:()=>new Date('2026-10-26T10:00:00Z'),
   loadActivePeople:async()=>[],
   storeHomeVisit:date=>visited.push(date),updateLatestModeBadge:()=>{},
   momentumCardHTML:post=>'<p>'+post.caption+'</p>'};
 vm.runInNewContext(fragment('let homeMomentumRequestSequenceV3310=0;','function communityReturnCard(')+
   '\nthis.load=loadHomeMomentum;',ctx);
 const outdated=ctx.load();
 ctx.activeViewName='messages';
 pending[0].resolve({r:{ok:true},d:{catchup:[{caption:'Anterior'}],highlights:[]}});await outdated;
 assert.equal(root.innerHTML,'Sin cambios');
 assert.equal(visited.length,0);
 ctx.activeViewName='feed';
 const current=ctx.load();
 pending[1].resolve({r:{ok:true},d:{catchup:[],highlights:[]}});await current;
 assert.equal(visited.length,1);
});
test('older momentum reply cannot update the new feed visit timestamp',async()=>{
 const root={innerHTML:'Actual',classList:{add(){},toggle(){}}},seen=[],pending=[];
 const section={classList:{toggle(){},add(){},remove(){}},
   querySelector:()=>({classList:{add(){},toggle(){}}})};
 const ctx={activeViewName:'feed',Promise,Date,
   $:key=>key==='#homeMomentum'?section:key==='#momentumPosts'?root:
     key==='#momentumTitle'||key==='#momentumSubtitle'?{textContent:''}:null,
   api:()=>{const d=deferred();pending.push(d);return d.promise},
   readLastHomeVisit:()=>new Date('2026-10-26T10:00:00Z'),
   loadActivePeople:async()=>[],
   storeHomeVisit:date=>seen.push(date),updateLatestModeBadge:()=>{},
   momentumCardHTML:x=>'<p>'+x.caption+'</p>'};
 vm.runInNewContext(fragment('let homeMomentumRequestSequenceV3310=0;','function communityReturnCard(')+
  '\nthis.load=loadHomeMomentum;',ctx);
 const old=ctx.load(),latest=ctx.load();
 pending[1].resolve({r:{ok:true},d:{catchup:[],highlights:[]}});await latest;
 pending[0].resolve({r:{ok:true},d:{catchup:[{caption:'Obsoleto'}],highlights:[]}});await old;
 assert.equal(seen.length,1);
 assert.doesNotMatch(root.innerHTML,/Obsoleto/);
});
test('no added storage, fake activity, email or new onboarding cards',()=>{
 const file=read('public/app.html'),ci=read('.github/workflows/validate-js.yml');
 const home=source.slice(source.indexOf('let activePeopleRequestSequenceV3310=0;'),
   source.indexOf("$('#communityReturnRefresh')"));
 assert.doesNotMatch(home,/INSERT INTO posts|sendBeacon|setInterval|autoFollow/);
 assert.match(home,/activeViewName!=='feed'/);
 assert.match(home,/requestId!==homeMomentumRequestSequenceV3310/);
 assert.match(ci,/tests\/mobile-home-refresh-v3310\.test\.js/);
 assert.equal((file.match(/id="homeMomentum"/g)||[]).length,1);
 assert.equal((file.match(/id="homeSuggestions"/g)||[]).length,1);
});
