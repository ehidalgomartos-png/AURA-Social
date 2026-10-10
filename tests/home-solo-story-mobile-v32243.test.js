'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
const start=source.indexOf('async function loadStories()');
const end=source.indexOf("\n$('#globalSearchForm')",start);
assert.ok(start>=0&&end>start,'Story loader exists');
const loadStoriesSource=source.slice(start,end);

function runStoryLoader(stories){
 const classes=new Set();
 const container={innerHTML:'',classList:{toggle:(name,value)=>{if(value)classes.add(name);else classes.delete(name)}}};
 let rebinds=0,refreshes=0;
 const context={
   Map,Array,me:null,
   visibleStories:[],storyGroups:new Map(),
   $:selector=>selector==='#stories'?container:null,
   api:async()=>({d:{stories}}),
   bindCreateButtons:()=>{rebinds++},
   all:()=>[],
   refreshVipSignal:async()=>{refreshes++},
   esc:s=>String(s),
   initials:s=>String(s||'?').slice(0,1),
   gateText:()=> 'Story protegida'
 };
 vm.runInNewContext(loadStoriesSource+'\nthis.run=loadStories',context);
 return context.run().then(()=>({container,classes,rebinds,refreshes}));
}
test('sin Stories ajenas: Tu Story activa una tarjeta móvil accesible y la acción de crear',async()=>{
 const result=await runStoryLoader([]);
 assert.equal(result.classes.has('solo-story-v32241'),true);
 assert.match(result.container.innerHTML,/class="story" data-action="create" aria-label="Crear tu Story"/);
 assert.match(result.container.innerHTML,/story-solo-copy-v32243/);
 assert.match(result.container.innerHTML,/Crear una Story/);
 assert.match(result.container.innerHTML,/Comparte una foto o vídeo · 24 h/);
 assert.equal(result.rebinds,1);
 assert.equal(result.refreshes,1);
});
test('con Stories de otras personas se mantiene el carrusel y sus controles',async()=>{
 const result=await runStoryLoader([
   {id:101,user_id:8,username:'maria',display_name:'María',audience:'public',viewed_by_me:false},
   {id:102,user_id:9,username:'luis',display_name:'Luis',audience:'vip',viewed_by_me:false}
 ]);
 assert.equal(result.classes.has('solo-story-v32241'),false);
 assert.match(result.container.innerHTML,/data-story-user="8"/);
 assert.match(result.container.innerHTML,/data-story-user="9"/);
 assert.match(result.container.innerHTML,/has-vip-story/);
 assert.match(result.container.innerHTML,/data-action="create"/);
 assert.equal(result.rebinds,1);
 assert.equal(result.refreshes,1);
});
test('el formato horizontal solo se aplica al Inicio móvil y mantiene un botón táctil amplio',()=>{
 const css=read('public/social.css');
 assert.match(css,/\.story-solo-copy-v32243,\.story-solo-chevron-v32243\{display:none\}/);
 const start=css.indexOf('/* V3.2.24.3 — A lone');
 assert.ok(start>=0);
 const rules=css.slice(start);
 assert.ok(rules.includes('@media(max-width:760px)'));
 assert.ok(rules.includes('#feedView .stories.solo-story-v32241 .story{'));
 assert.ok(rules.includes('min-height:62px'));
 assert.ok(rules.includes('width:calc(100% - 24px)'));
 assert.ok(rules.includes('#feedView .stories.solo-story-v32241 .story>small{display:none}'));
 assert.ok(rules.includes('focus-visible'));
 assert.ok(!rules.includes('#profileView'));
});
test('solo se versionan assets de Inicio y no se toca la mezcla de noticias ni los posts',()=>{
 const html=read('public/app.html');
 assert.ok(html.includes('/social.css?v=3.2.27'));
 assert.ok(html.includes('/social.js?v=3.2.27'));
 assert.ok(html.includes('/editorial-home-v324.js?v=3.2.24.2'));
 assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.27');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.27'"));
});
