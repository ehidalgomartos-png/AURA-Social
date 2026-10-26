'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html'),css=read('public/social.css'),social=read('public/social.js');
const scoped=css.slice(css.indexOf('/* V3.3.11 — Explorar mobile-first:'));
test('search, existing mobile sections, people filters, follow actions and private connections remain accessible',()=>{
 for(const id of ['exploreView','exploreMobileSwitchV3232','peopleSearchForm','peopleSearchInput',
  'interestFilters','peopleSuggestions','connectionsSection','connectionsList','connectionCircleFilters',
  'connectionsExpandV3311','globalSearchOpenV3233','exploreContentPaneV3232']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/id="connectionsExpandV3311"[^>]+aria-expanded="false"[^>]+aria-controls="connectionsList connectionCircleFilters"/);
 assert.match(html,/data-expanded="false"/);
 assert.match(html,/data-people-mode="active"/);
 assert.match(html,/data-people-mode="new"/);
 assert.match(html,/data-view-jump="communities"/);
 assert.match(html,/href="\/marketplace"/);
 assert.match(html,/href="\/noticias"/);
});
test('mobile ordering prioritises people and content above secondary shortcuts and connections',()=>{
 assert.match(scoped,/@media\(max-width:760px\)/);
 const expected=[
  ['#exploreMobileSwitchV3232',1],
  ['#explorePeoplePaneV3232',2],
  ['#connectionsSection',3],
  ['marketplace-explore-entry-v3250',4],
  ['editorial-discovery-entry',5],
  ['global-search-mobile-toggle-v3233',6]
 ];
 for(const [name,order] of expected){
  assert.ok(scoped.includes(name),name);
  assert.match(scoped,new RegExp('order:'+order+';'),name);
 }
 assert.match(scoped,/#exploreView:not\(\.hidden\)/);
 assert.match(scoped,/\.people-search\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto;/);
 assert.match(scoped,/\.interest-filters\{gap:6px;flex-wrap:nowrap;overflow-x:auto/);
});
function person(user,compact=false,mode='for_you',isExplore=true){
 const a=social.indexOf('function personCardHTML('),b=social.indexOf('async function hideDiscoveryPerson(',a);
 assert.ok(a>=0&&b>a);
 const context={Number,Array,
  esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  profileLink:(_,markup,cls='')=>'<a class="'+cls+'">'+markup+'</a>',
  avatarHTML:()=>'<span>avatar</span>',
  interestPillsHTML:()=>'<div class="standard-interest-list">Unchanged</div>'};
 vm.runInNewContext(social.slice(a,b)+'\nthis.render=personCardHTML;',context);
 return context.render(user,compact,mode,isExplore);
}
test('compact cards reveal two real interests and accurate remainder, keep profile/follow/hide',()=>{
 const s=person({id:7,username:'una',display_name:'Una',interests:['Arte','Fotografía','Música','Viajes'],bio:'Me gusta compartir ideas.',following:false});
 assert.match(s,/explore-person-v3311/);
 assert.match(s,/Arte/);assert.match(s,/Fotografía/);assert.doesNotMatch(s,/>Música</);assert.doesNotMatch(s,/>Viajes</);
 assert.match(s,/explore-interest-extra-v3311">\+2/);
 assert.match(s,/explore-person-profile-v3311/);
 assert.match(s,/data-suggest-follow="7"/);
 assert.match(s,/data-discovery-hide-person="7"/);
 assert.match(s,/Me gusta compartir ideas/);
 assert.doesNotMatch(s,/onclick=/);
 const untouched=person({id:2,username:'dos',display_name:'Dos',interests:['Arte']},false,'for_you',false);
 assert.doesNotMatch(untouched,/explore-person-v3311/);
 assert.match(untouched,/standard-interest-list/);
 assert.match(social,/users\.map\(user=>personCardHTML\(user,false,peopleDiscoveryMode,true\)\)/);
 assert.match(social,/users\.map\(user=>personCardHTML\(user,false,'for_you',true\)\)/);
});
test('connections can expand and collapse without changing backend, contacts or persistence',()=>{
 const start=social.indexOf("// Collapsible summary only in Explorar mobile."),end=social.indexOf("async function loadConnections()",start);
 assert.ok(start>0&&end>start);
 let onClick;
 const btn={attributes:{},textContent:'Ver conexiones',setAttribute:(k,v)=>btn.attributes[k]=v};
 const section={dataset:{expanded:'false'},classList:{contains:()=>false}};
 const context={document:{addEventListener:(type,fn)=>{if(type==='click')onClick=fn}},
  $:key=>key==='#connectionsSection'?section:null};
 vm.runInNewContext(social.slice(start,end),context);
 const event={target:{closest:key=>key==='#connectionsExpandV3311'?btn:null}};
 onClick(event);assert.equal(section.dataset.expanded,'true');assert.equal(btn.attributes['aria-expanded'],'true');
 assert.equal(btn.textContent,'Mostrar menos');
 onClick(event);assert.equal(section.dataset.expanded,'false');assert.equal(btn.attributes['aria-expanded'],'false');
 assert.equal(btn.textContent,'Ver conexiones');
 assert.match(scoped,/connectionsSection\[data-expanded="false"\] \.connection-card:not\(:first-child\)/);
 assert.match(scoped,/connectionsSection\[data-expanded="true"\] \.connections-strip/);
 assert.doesNotMatch(social.slice(start,end),/localStorage|fetch\(|api\(|INSERT INTO/);
});
test('narrow cards retain 40px tap targets and bottom dock spacing without new screens',()=>{
 assert.match(scoped,/#exploreView \.explore-person-v3311 \.person-follow\{[\s\S]*?min-height:40px/);
 assert.match(scoped,/#exploreView \.explore-person-v3311 \.person-hide-suggestion\{[\s\S]*?min-height:40px/);
 assert.match(scoped,/--mobile-dock-space,112px/);
 assert.match(html,/social\.css\?v=3\.3\.11/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/explore-mobile-compact-v3311\.test\.js/);
});
