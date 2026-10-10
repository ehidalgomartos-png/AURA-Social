'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const mix=require('../public/editorial-interleave-v3224.js');

test('intercalar una noticia después de cada dos publicaciones sin alterar el orden de las personas',()=>{
  assert.deepEqual(mix.slots(0,3),[]);
  assert.deepEqual(mix.slots(1,3),[]);
  assert.deepEqual(mix.slots(2,3),[2]);
  assert.deepEqual(mix.slots(3,3),[2]);
  assert.deepEqual(mix.slots(4,3),[2,4]);
  assert.deepEqual(mix.slots(6,3),[2,4,6]);
  assert.deepEqual(mix.slots(100,3),[2,4,6]); // máximo 3 noticias
  assert.deepEqual(mix.slots(12,1),[2]); // nunca relleno artificial
});
test('el feed Siguiendo/Cercanas/VIP nunca recibe noticias editoriales ajenas',()=>{
  for(const mode of ['foryou','latest'])assert.equal(mix.allowedMode(mode),true);
  for(const mode of ['following','close','vip','',null,'random'])assert.equal(mix.allowedMode(mode),false);
});
test('sin duplicados y sin repetir noticias vistas en esta sesión',()=>{
  const entries=[{id:1},{id:'2'},{id:2},{id:3},{id:4},{id:'bad'},null];
  assert.deepEqual(mix.unseenNews(entries,['1',4]).map(x=>String(x.id)),['2','3']);
  assert.deepEqual(mix.unseenNews(entries,['1','2','3','4']),[]);
  const original=JSON.stringify(entries);
  mix.unseenNews(entries,['1']);
  assert.equal(JSON.stringify(entries),original);
});
test('Inicio pone publicaciones antes de paneles secundarios y elimina la sección de noticias independiente',()=>{
  const html=read('public/app.html');
  const at=id=>html.indexOf('id="'+id+'"');
  assert.ok(at('feed')>at('stories'));
  assert.ok(at('feed')>at('homeGrowthDetailsV3224'));
  assert.ok(at('feed')<at('returnPulse'));
  assert.ok(at('feed')<at('communityReturn'));
  assert.ok(at('feed')<at('homeMomentum'));
  assert.ok(at('editorialHomeBlock')>at('feed'));
  assert.ok(html.includes('id="editorialHomeBlock" aria-label="Noticias para conversar" hidden'));
  assert.ok(html.includes('id="homeGrowthHeadlineV3224"'));
  assert.ok(html.includes('editorial-interleave-v3224.js?v=3.2.24'));
  assert.ok(html.indexOf('/editorial-interleave-v3224.js?v=3.2.24') <
    html.indexOf('/editorial-home-v324.js?v=3.2.24'));
});
test('las noticias son tarjetas en el feed, no publicaciones falsas ni imágenes externas',()=>{
  const script=read('public/editorial-home-v324.js');
  for(const term of [
   "document.getElementById('feed')", "classList.contains('post')",
   "const insertAt=planner.slots(posts.length,available.length,3)",
   "posts[insertAt[i]-1].after(card)",
   "planner.allowedMode(mode)",
   "planner.unseenNews(newsItems,seenMemory)",
   "sessionStorage.getItem(storageKey)",
   "sessionStorage.setItem(storageKey",
   "const url='/noticias/p/'",
   "editorial-home-card editorial-feed-card-v3224",
   "String(item.source_name||'Medio identificado')",
   "Number(item.like_count)",
   "Number(item.comment_count)",
   "localImage(item.image_url)",
   "root.hidden=true"
  ])assert.ok(script.includes(term),term);
  assert.doesNotMatch(script,/INSERT INTO posts|\/api\/posts\/create|document\.createElement\('script'\)/);
  assert.doesNotMatch(script,/innerHTML\s*=/);
});
test('post feed original continúa manejando acciones, filtros, y señaliza el nuevo render sin tocar privacidad',()=>{
  const source=read('public/social.js');
  const start=source.indexOf('async function loadFeed(');
  const end=source.indexOf('function renderStoryViewer()',start);
  assert.ok(start>0&&end>start);
  const feed=source.slice(start,end);
  assert.ok(feed.includes('posts.map((post,index)=>postHTML(post'));
  assert.ok(feed.includes('bindPostActions(feedRoot)'));
  assert.ok(feed.includes("new CustomEvent('redlibertad:feed-updated'"));
  assert.ok(feed.includes("detail:{mode,postCount:posts.length}"));
  assert.ok(feed.includes("if(mode==='vip')markVipSeen()"));
});
test('onboarding ligero no pierde herramientas ni muestra destacados vacíos',()=>{
  const social=read('public/social.js');
  const html=read('public/app.html');
  const css=read('public/social.css');
  assert.ok(html.includes('id="growthPanel"'));
  assert.ok(html.includes('id="growthStarterCommunities"'));
  assert.ok(html.includes('id="growthInviteNative"'));
  assert.ok(html.includes('<details id="homeGrowthDetailsV3224"'));
  assert.ok(social.includes("homeGrowth.classList.remove('hidden')"));
  assert.ok(social.includes("if(!posts.length&&!activeUsers.length)"));
  assert.ok(css.includes('#feedView #feed>.editorial-feed-card-v3224'));
  assert.ok(css.includes('#feedView .home-growth-details-v3224'));
  assert.ok(css.includes('@media(max-width:760px)'));
});
test('release and existing RSS/video privacy gates unchanged',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.31');
  assert.ok(read('server.js').includes("APP_VERSION='3.2.31'"));
  assert.ok(read('src/routes/editorial-social-v324.js').includes("p.unpublished_at IS NULL AND ep.status='ready'"));
  assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
});
