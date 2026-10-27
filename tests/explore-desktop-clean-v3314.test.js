'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html'),css=read('public/social.css'),js=read('public/social.js');
const start=css.indexOf('/* V3.3.14 — Explorar de escritorio:');
assert.ok(start>0,'desktop Explore rules exist');
const rules=css.slice(start);
const desktop=rules.slice(0,rules.indexOf('@media(min-width:761px) and (max-width:1120px)'));
test('desktop shows people first, private connections next, and retains global search and content',()=>{
  const expected=[
    ['.page-title',0],['#globalSearchPanelV3233',1],['#explorePeoplePaneV3232',2],
    ['#connectionsSection',3],['#exploreContentPaneV3232',4],
    ['.marketplace-explore-entry-v3250',5],['.editorial-discovery-entry',6]
  ];
  for(const [selector,order] of expected){
    const match=desktop.match(new RegExp('#exploreView '+selector.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'\\s*\\{[^}]*order:'+order+';'));
    assert.ok(match,selector+' order '+order);
  }
  for(const id of ['explorePeoplePaneV3232','connectionsSection','exploreContentPaneV3232',
    'globalSearchPanelV3233','connectionsExpandV3311','connectionsList','connectionCircleFilters'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
});
test('a small light summary replaces giant dark connections panel until explicitly expanded',()=>{
  assert.match(desktop,/#exploreView #connectionsExpandV3311\s*\{[^}]*display:inline-flex/);
  assert.match(desktop,/#exploreView #connectionsSection\[data-expanded="false"\]\s*\{[^}]*background:var\(--paper\)/);
  assert.match(desktop,/#exploreView #connectionsSection\[data-expanded="false"\] #connectionsList,/);
  assert.match(desktop,/#exploreView #connectionsSection\[data-expanded="false"\] #connectionCircleFilters,/);
  assert.match(desktop,/display:none!important;/);
  assert.match(html,/id="connectionsExpandV3311"[^>]*aria-expanded="false"/);
  const begin=js.indexOf('// Collapsible summary only in Explorar mobile.');
  const end=js.indexOf('async function loadConnections()',begin);
  assert.ok(begin>=0&&end>begin);
  const coordinator=js.slice(begin,end);
  assert.match(coordinator,/dataset\.expanded=String\(expanded\)/);
  assert.match(coordinator,/button\.setAttribute\('aria-expanded',String\(expanded\)\)/);
  assert.doesNotMatch(coordinator,/api\(|localStorage|sessionStorage/);
  assert.match(html,/data-view-jump="connections"/);
});
test('profile grid keeps actions in separate row at desktop widths',()=>{
  assert.match(desktop,/#exploreView #peopleSuggestions \.explore-person-v3311\s*\{[^}]*grid-template-columns:48px minmax\(0,1fr\);[^}]*grid-template-rows:minmax\(0,1fr\) auto;/);
  assert.match(desktop,/#exploreView #peopleSuggestions \.explore-person-v3311 \.person-card-actions\s*\{[^}]*grid-column:1 \/ -1;grid-row:2;/);
  assert.match(desktop,/#exploreView #peopleSuggestions \.explore-person-profile-v3311\s*\{[^}]*display:inline-flex;[^}]*white-space:nowrap;/);
  assert.match(desktop,/#exploreView #peopleSuggestions \.person-card-actions \.person-follow\s*\{[^}]*width:auto;[^}]*min-height:38px;/);
  assert.match(desktop,/#exploreView #peopleSuggestions \.person-card-actions \.person-hide-suggestion\s*\{[^}]*width:38px;height:38px;/);
  assert.match(rules,/@media\(min-width:761px\) and \(max-width:1120px\)/);
  assert.match(rules,/@media\(min-width:761px\) and \(max-width:850px\)/);
});
test('real profile links, follow and hide actions are retained, no fake accounts',()=>{
 const a=js.indexOf('function personCardHTML('),b=js.indexOf('async function hideDiscoveryPerson(',a);
 assert.ok(a>0&&b>a);
 const ctx={Number,Array,esc:x=>String(x??''),profileLink:(_,markup,cls)=>'<a class="'+cls+'">'+markup+'</a>',
 avatarHTML:()=>'<span>avatar</span>',interestPillsHTML:()=>''};
 vm.runInNewContext(js.slice(a,b)+'\nthis.card=personCardHTML;',ctx);
 const card=ctx.card({id:17,display_name:'Nombre largo de ejemplo',username:'persona',following:false,interests:['Cultura']},false,'for_you',true);
 for(const name of ['explore-person-v3311','explore-person-profile-v3311','person-card-actions',
    'data-suggest-follow="17"','data-discovery-hide-person="17"'])assert.ok(card.includes(name),name);
 assert.doesNotMatch(desktop,/fetch\(|api\(|localStorage|INSERT INTO|autoFollow/);
});
test('phone styles stay scoped to 760px, desktop cache version changes',()=>{
 assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?#exploreView #peopleSuggestions/);
 assert.match(desktop,/@media\(min-width:761px\)/);
 assert.doesNotMatch(desktop,/@media\(max-width:760px\)/);
 assert.match(html,/home-cards=3\.3\.13\.1&amp;explore-desktop=3\.3\.14/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/explore-desktop-clean-v3314\.test\.js/);
});
