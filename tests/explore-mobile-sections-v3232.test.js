'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html');
const js=read('public/social.js');
const css=read('public/social.css');

test('mobile Explore has two visible first-class section controls with sensible content default',()=>{
  assert.match(html,/id="exploreView" class="view hidden" data-explore-section="content"/);
  assert.match(html,/id="exploreMobileSwitchV3232"/);
  assert.match(html,/data-explore-mobile-section="content" aria-pressed="true" aria-controls="exploreContentPaneV3232">Publicaciones/);
  assert.match(html,/data-explore-mobile-section="people" aria-pressed="false" aria-controls="explorePeoplePaneV3232">Personas/);
  assert.match(html,/id="explorePeoplePaneV3232"/);
  assert.match(html,/id="exploreContentPaneV3232"/);
  assert.match(html,/data-view-jump="explore" data-explore-target="people">Explorar personas/);
});
test('mobile hides only the nonselected Explore section and keeps desktop both visible',()=>{
  assert.match(css,/\.explore-mobile-switch-v3232\{display:none\}/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/#exploreView \.explore-mobile-switch-v3232\{\s*display:grid/);
  assert.match(css,/#exploreView\[data-explore-section="content"\] #connectionsSection/);
  assert.match(css,/#exploreView\[data-explore-section="content"\] #explorePeoplePaneV3232/);
  assert.match(css,/#exploreView\[data-explore-section="people"\] #exploreContentPaneV3232/);
  assert.match(css,/min-height:48px/);
  assert.match(css, /focus-visible/);
  assert.match(html,/data-discussion-scope="mine"/);
  assert.match(html,/data-content-mode="active"/);
  const tabs=html.slice(html.indexOf('<div class="content-tabs"'),html.indexOf('</div>',html.indexOf('<div class="content-tabs"')));
  for(const [first,second] of [['foryou','active'],['active','latest'],['latest','saved'],['saved','trending']]){
    assert.ok(tabs.indexOf('data-content-mode="'+first+'"') < tabs.indexOf('data-content-mode="'+second+'"'));
  }
});
test('section choice is remembered in memory, updates pressed state and rejects invalid values',()=>{
  const start=js.indexOf('function setExploreMobileSection(');
  const end=js.indexOf('\nasync function loadExplore(',start);
  assert.ok(start>0 && end>start);
  const root={dataset:{exploreSection:'content'}};
  const buttons=['content','people'].map(mode=>({
    dataset:{exploreMobileSection:mode},classes:new Set(),attributes:{},
    classList:{toggle(_name,selected){this.selected=selected}},
    setAttribute(name,value){this.attributes[name]=value}
  }));
  const context={
    exploreMobileSection:'content',
    '$':q=>q==='#exploreView'?root:null,
    all:q=>q==='[data-explore-mobile-section]'?buttons:[]
  };
  vm.runInNewContext(js.slice(start,end)+'\nthis.set=setExploreMobileSection',context);
  assert.equal(context.set('people'),true);
  assert.equal(context.exploreMobileSection,'people');
  assert.equal(root.dataset.exploreSection,'people');
  assert.equal(buttons[0].attributes['aria-pressed'],'false');
  assert.equal(buttons[1].attributes['aria-pressed'],'true');
  assert.equal(context.set('content'),true);
  assert.equal(root.dataset.exploreSection,'content');
  assert.equal(buttons[0].attributes['aria-pressed'],'true');
  assert.equal(context.set('unknown'),false);
  assert.equal(root.dataset.exploreSection,'content');
});
test('navigation respects explicit Personas entry and restores section on Explore return',()=>{
  assert.match(js,/if\(jump\.dataset\.viewJump==='explore' && jump\.dataset\.exploreTarget==='people'\)\{\s*setExploreMobileSection\('people'\)/);
  assert.match(js,/all\('\[data-explore-mobile-section\]'\)\.forEach\(button=>\{/);
  assert.match(js,/button\.onclick=\(\)=>setExploreMobileSection\(button\.dataset\.exploreMobileSection\)/);
  assert.match(js,/if \(name === 'explore'\) \{\s*setExploreMobileSection\(exploreMobileSection\);\s*loadExplore\(\);/);
});
test('previous filters and unrelated flows remain available without backend modifications',()=>{
  assert.match(js, /\/api\/posts\/trending\?sort=active/);
  assert.match(js, /selectedScope==='mine'/);
  assert.match(js, /async function loadPeopleSuggestions/);
  assert.match(js, /async function loadDiscoveryContent/);
  assert.match(js, /async function runGlobalSearch/);
  assert.match(html,/id="globalSearchForm"/);
  assert.match(html,/id="connectionsSection"/);
  assert.match(html,/id="trendChips"/);
  assert.match(html,/id="postSearchForm"/);
  assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
});
test('version and CI are registered',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.32');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.32'/);
  assert.match(html,/\/social\.js\?v=3\.2\.32/);
  assert.match(html,/\/social\.css\?v=3\.2\.32/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:explore-mobile-sections/);
});