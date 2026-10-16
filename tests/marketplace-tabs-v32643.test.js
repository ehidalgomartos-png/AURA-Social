'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('public/marketplace-v3250.js','utf8');
const html=fs.readFileSync('public/marketplace.html','utf8');
const tabs=['discover','mine','favorites','reports'].map(mode=>({
 dataset:{mode},
 classList:{state:false,toggle(name,on){assert.equal(name,'active');this.state=on;}}
}));
const extra=[{classList:{toggle(name,on){this.hidden=name==='hidden'?on:false;}}}];
const seller={hidden:true};
const filters={classList:{toggle(name,on){this.hidden=on;}}};
const state={authenticated:true,mode:'discover'};
const selectors={'#marketSellerTools':seller,'#filters':filters};
const $=selector=>selectors[selector]||null;
const $$=selector=>selector==='[data-mode]'?tabs:selector==='.tabs,.market-deals'?extra:[];
test('All three Marketplace tabs update UI state and request the correct content',async()=>{
 const start=src.indexOf('function setMode(mode){');
 const end=src.indexOf('function syncKind(){',start);
 assert.ok(start>0&&end>start);
 const calls=[];
 const context={state,$,$$,updateQuickFiltersV3265:()=>{},load:()=>{calls.push(state.mode);return Promise.resolve();}};
 vm.createContext(context);
 vm.runInContext(src.slice(start,end),context);
 for(const [mode,visibleTools,hiddenFilters] of [
  ['mine',false,true],['favorites',true,true],['discover',true,false]]){
  await context.setMode(mode);
  assert.equal(state.mode,mode);
  assert.equal(seller.hidden,visibleTools);
  assert.equal(filters.classList.hidden,hiddenFilters);
  for(const btn of tabs)assert.equal(btn.classList.state,btn.dataset.mode===mode,btn.dataset.mode);
 }
 assert.deepEqual(calls,['mine','favorites','discover']);
 assert.equal(extra[0].classList.hidden,false);
});
test('Marketplace async responses cannot overwrite a newer tab',()=>{
 assert.match(src,/const requestId=\+\+marketplaceLoadRequestV32643/);
 assert.match(src,/if\(requestId!==marketplaceLoadRequestV32643\)return;/);
 assert.match(src,/if\(state.mode==='mine'\)path\+='\/mine'/);
 assert.match(src,/else if\(state.mode==='favorites'\)path\+='\/favorites'/);
 assert.match(src,/if\(state.mode==='reports'\)/);
});
test('Client bundle cache is invalidated for V3.2.64.3 and release version matches',()=>{
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.75/);
 assert.equal(JSON.parse(fs.readFileSync('package.json','utf8')).version,'3.2.75');
 assert.match(fs.readFileSync('server.js','utf8'),/APP_VERSION='3\.2\.75'/);
 assert.doesNotThrow(()=>new vm.Script(src));
});
