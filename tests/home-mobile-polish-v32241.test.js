'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
const start=source.indexOf('async function loadHomeMomentum()');
const end=source.indexOf('\nfunction returnPulseCard(',start);
assert.ok(start>=0&&end>start,'Home momentum function must be present');
const momentum=source.slice(start,end);

function classes(){
 const values=new Set(['hidden']);
 return {
  contains:name=>values.has(name),
  add:name=>values.add(name),
  remove:name=>values.delete(name),
  toggle:(name,force)=>{
    if(force===undefined)force=!values.has(name);
    if(force)values.add(name);else values.delete(name);
    return force;
  }
 };
}
function harness({posts=[],users=[],error=false}={}){
 const root={innerHTML:'',classList:classes()};
 const title={textContent:''},subtitle={textContent:''};
 const head={classList:classes()},people={classList:classes()};
 const section={
  classList:classes(),
  querySelector:query=>({
   '.momentum-head':head,'.active-people-block':people
  })[query]||null
 };
 const nodes={
  '#homeMomentum':section,
  '#momentumPosts':root,
  '#momentumTitle':title,
  '#momentumSubtitle':subtitle
 };
 let visits=0;
 const sandbox={
  $:sel=>nodes[sel],
  readLastHomeVisit:()=>new Date('2026-10-09T12:00:00Z'),
  encodeURIComponent,Date,
  api:async()=>({r:{ok:!error},d:{catchup:posts,highlights:[]}}),
  loadActivePeople:async()=>users,
  momentumCardHTML:()=>'<article class="momentum-card">Post</article>',
  updateLatestModeBadge:()=>{},
  storeHomeVisit:()=>{visits++}
 };
 vm.runInNewContext(momentum+'\nthis.loadHomeMomentum=loadHomeMomentum;',sandbox);
 return {run:()=>sandbox.loadHomeMomentum(),root,title,subtitle,head,people,section,visits:()=>visits};
}
test('con cero destacados y personas activas no se presenta cabecera vacía',async()=>{
 const h=harness({posts:[],users:[{id:1}]});
 await h.run();
 assert.equal(h.section.classList.contains('hidden'),false);
 assert.equal(h.section.classList.contains('only-active-v32241'),true);
 assert.equal(h.head.classList.contains('hidden'),true);
 assert.equal(h.root.classList.contains('hidden'),true);
 assert.equal(h.people.classList.contains('hidden'),false);
 assert.equal(h.root.innerHTML,'');
 assert.equal(h.visits(),1);
});
test('con cero destacados y cero personas se oculta toda la sección',async()=>{
 const h=harness();
 await h.run();
 assert.equal(h.section.classList.contains('hidden'),true);
 assert.equal(h.head.classList.contains('hidden'),true);
 assert.equal(h.people.classList.contains('hidden'),true);
 assert.equal(h.visits(),1);
});
test('con publicaciones destacadas se mantienen título y tarjetas originales',async()=>{
 const h=harness({posts:[{id:10}],users:[{id:2}]});
 await h.run();
 assert.equal(h.section.classList.contains('hidden'),false);
 assert.equal(h.section.classList.contains('only-active-v32241'),false);
 assert.equal(h.head.classList.contains('hidden'),false);
 assert.equal(h.root.classList.contains('hidden'),false);
 assert.equal(h.people.classList.contains('hidden'),false);
 assert.ok(h.root.innerHTML.includes('momentum-card'));
 assert.equal(h.title.textContent,'Desde tu última visita');
});
test('fallo de endpoint con personas: el módulo reducido sigue disponible',async()=>{
 const h=harness({error:true,users:[{id:1}]});
 await h.run();
 assert.equal(h.section.classList.contains('hidden'),false);
 assert.equal(h.section.classList.contains('only-active-v32241'),true);
 assert.equal(h.head.classList.contains('hidden'),true);
 assert.equal(h.people.classList.contains('hidden'),false);
 assert.equal(h.root.classList.contains('hidden'),true);
});
test('fallo de endpoint sin personas oculta el módulo, sin cabeceras',async()=>{
 const h=harness({error:true});
 await h.run();
 assert.equal(h.section.classList.contains('hidden'),true);
 assert.equal(h.people.classList.contains('hidden'),true);
});
test('solo Tu Story activa modo compacto sin tocar las Stories múltiples ni controles',()=>{
 const storyStart=source.indexOf('async function loadStories()');
 const storyEnd=source.indexOf("\n$('#globalSearchForm')",storyStart);
 assert.ok(storyStart>=0&&storyEnd>storyStart);
 const stories=source.slice(storyStart,storyEnd);
 assert.ok(stories.includes("classList.toggle('solo-story-v32241',representatives.length===0)"));
 assert.ok(stories.includes('representatives.map(story =>'));
 assert.ok(stories.includes("bindCreateButtons()"));
 assert.ok(stories.includes("refreshVipSignal(visibleStories)"));
 assert.ok(stories.includes("data-story-user"));
 assert.ok(stories.includes('story.gated'));
});
test('reglas CSS aplican solo al Inicio y en móvil, sin tocar publicaciones',()=>{
 const css=read('public/social.css');
 assert.ok(css.includes('#feedView>.page-title'));
 assert.ok(css.includes('#feedView .stories.solo-story-v32241'));
 assert.ok(css.includes('#feedView .home-momentum.only-active-v32241 .active-people-block'));
 assert.ok(css.includes('#feedView .home-momentum.only-active-v32241 .active-people-strip'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.ok(css.includes('@media(max-width:390px)'));
 const app=read('public/app.html');
 assert.ok(app.includes('/social.css?v=3.2.28'));
 assert.ok(app.includes('/social.js?v=3.2.28'));
 assert.ok(app.includes('/editorial-home-v324.js?v=3.2.24.2'));
 assert.ok(app.includes('id="homeGrowthDetailsV3224"'));
});
test('alternancia 2:1, tipos de feed y controles originales permanecen',()=>{
 const mix=require('../public/editorial-interleave-v3224.js');
 assert.deepEqual(mix.slots(6,4),[2,4,6]);
 assert.equal(mix.allowedMode('vip'),false);
 assert.equal(mix.allowedMode('following'),false);
 assert.equal(mix.allowedMode('close'),false);
 assert.equal(mix.allowedMode('foryou'),true);
 const homepage=read('public/editorial-home-v324.js');
 assert.ok(homepage.includes('posts[insertAt[i]-1].after(card)'));
 assert.ok(homepage.includes("String(item.source_name||'Medio identificado')"));
 assert.ok(source.includes('bindPostActions(feedRoot)'));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.28');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.28'"));
});
