'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html');
const code=read('public/social.js');
const css=read('public/social.css');

test('global search remains usable but is not a third always-open mobile search box',()=>{
  assert.match(html,/id="exploreView" class="view hidden" data-explore-section="content" data-global-search-open="false"/);
  assert.match(html,/id="globalSearchOpenV3233" aria-expanded="false" aria-controls="globalSearchPanelV3233"/);
  assert.match(html,/id="globalSearchPanelV3233" class="global-social-search"/);
  assert.match(html,/id="globalSearchForm"/);
  assert.match(html,/id="globalSearchInput"/);
  assert.match(html,/data-global-search-type="communities"/);
  assert.match(html,/data-global-search-type="events"/);
  assert.match(html,/id="globalSearchResults"/);
  assert.match(html,/id="globalSearchHistory"/);
});
test('mobile hide rule is scoped to Explore; desktop search remains visible',()=>{
  assert.match(css,/\.global-search-mobile-toggle-v3233\{display:none\}/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/#exploreView \.global-search-mobile-toggle-v3233\{\s*display:block/);
  assert.match(css,/#exploreView\[data-global-search-open="false"\] #globalSearchPanelV3233\{display:none!important\}/);
  assert.match(css,/#exploreView\[data-global-search-open="true"\] #globalSearchPanelV3233/);
  assert.match(css,/min-height:48px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
function harness(){
  const root={dataset:{globalSearchOpen:'false'}},button={attrs:{},setAttribute(k,v){this.attrs[k]=v}},input={focuses:0,focus(){this.focuses++}};
  const sandbox={
    globalSearchMobileOpen:false,
    '$':q=>({
      '#exploreView':root,
      '#globalSearchOpenV3233':button,
      '#globalSearchInput':input
    })[q]||null
  };
  const begin=code.indexOf('function setGlobalSearchMobileOpen(');
  const end=code.indexOf('\nfunction setExploreMobileSection(',begin);
  assert.ok(begin>0 && end>begin);
  vm.runInNewContext(code.slice(begin,end)+'\nthis.set=setGlobalSearchMobileOpen',sandbox);
  return {root,button,input,sandbox};
}
test('global search can open, focus and close; choice persists in session memory',()=>{
  const h=harness();
  assert.equal(h.sandbox.set(true,{focus:true}),true);
  assert.equal(h.root.dataset.globalSearchOpen,'true');
  assert.equal(h.button.attrs['aria-expanded'],'true');
  assert.equal(h.input.focuses,1);
  assert.equal(h.sandbox.globalSearchMobileOpen,true);
  assert.equal(h.sandbox.set(false),true);
  assert.equal(h.root.dataset.globalSearchOpen,'false');
  assert.equal(h.button.attrs['aria-expanded'],'false');
  assert.equal(h.input.focuses,1);
  assert.equal(h.sandbox.globalSearchMobileOpen,false);
});
test('mobile control click toggles and Explore navigation retains state',()=>{
  assert.match(code,/\$\('#globalSearchOpenV3233'\)\?\.addEventListener\('click',\(\)=>\{/);
  assert.match(code,/setGlobalSearchMobileOpen\(!globalSearchMobileOpen,\{focus:true\}\)/);
  assert.match(code,/if \(name === 'explore'\) \{\s*setExploreMobileSection\(exploreMobileSection\);\s*setGlobalSearchMobileOpen\(globalSearchMobileOpen\);\s*loadExplore\(\);/);
});
test('section search, user discovery and editorial feed are left as they were',()=>{
  assert.match(html,/id="exploreContentPaneV3232"/);
  assert.match(html,/id="explorePeoplePaneV3232"/);
  assert.match(html,/id="postSearchForm"/);
  assert.match(html,/id="peopleSearchForm"/);
  assert.match(html,/data-content-mode="active"/);
  assert.match(html,/data-discussion-scope="mine"/);
  assert.match(code,/async function runGlobalSearch/);
  assert.match(code,/async function searchPosts/);
  assert.match(code,/async function loadPeopleSuggestions/);
  assert.match(code,/async function loadDiscoveryContent/);
  assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
});
test('version and CI include V3.2.36',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.36');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.36'/);
  assert.match(html,/\/social\.js\?v=3\.2\.36/);
  assert.match(html,/\/social\.css\?v=3\.2\.36/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:mobile-global-search/);
});