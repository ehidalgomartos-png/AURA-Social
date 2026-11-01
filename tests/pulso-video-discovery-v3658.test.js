'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {
 createPulsoRouter,PUBLIC_VIDEO_SQL,cleanVideo,renderCard,renderPage,fetchVideos,
 pageParam,safeMediaUrl,PAGE_SIZE
}=require('../src/routes/pulso-v3658');
const read=filepath=>fs.readFileSync(path.join(__dirname,'..',filepath),'utf8');
const sample=(id=42,changes={})=>({
 id,caption:'Un momento de la comunidad',media_url:'/uploads/reels/video-42.mp4',
 username:'ana_vida',display_name:'Ana',avatar_url:'/uploads/avatars/ana.webp',
 like_count:2,comment_count:1,...changes
});
async function serve(db,fn){
 const app=express();app.use(createPulsoRouter({db}));
 const server=await new Promise(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 try{await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
function stub(rows){
 const calls=[];
 return {calls,db:{query:async(sql,params)=>{
  calls.push({sql,params});
  return {rows};
 }}};
}
test('V3.6.58: consulta SQL solo incluye Reels públicos normales de perfiles descubribles',()=>{
 for(const condition of [
  "p.moderation_status='published'","p.audience='public'",
  "p.content_level='normal'","p.post_kind='reel'",
  "p.media_type='video'","u.status='active'",
  "u.is_admin=false","u.discoverable=true"
 ])assert.ok(PUBLIC_VIDEO_SQL.includes(condition),condition);
 assert.match(PUBLIC_VIDEO_SQL,/LIMIT \$1 OFFSET \$2/);
 assert.match(PUBLIC_VIDEO_SQL,/ORDER BY p.created_at DESC,p.id DESC/);
 assert.doesNotMatch(PUBLIC_VIDEO_SQL,/SELECT \*|email|birth_date|private_message|password/);
 assert.equal(PAGE_SIZE,12);
});

test('V3.6.58: los vídeos usan rutas multimedia seguras y no ejecutan HTML del autor',()=>{
 assert.equal(safeMediaUrl('javascript:alert(1)'),null);
 assert.equal(safeMediaUrl('//evil.example/video.mp4'),null);
 assert.equal(safeMediaUrl('/private/other.mp4'),null);
 assert.equal(safeMediaUrl('http://bad.example/video.mp4'),null);
 assert.equal(safeMediaUrl('/uploads/reels/video-42.mp4'),'/uploads/reels/video-42.mp4');
 assert.equal(cleanVideo(sample(0)),null);
 assert.equal(cleanVideo(sample(5,{username:'x'})),null);
 const reel=cleanVideo(sample(42,{caption:'<script>alert("x")</script>',display_name:'<img src=x onerror=alert(1)>'}));
 const html=renderCard(reel);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script>alert\(|<img src=x onerror=/);
 assert.match(html,/href="\/reel\/42"/);
 assert.match(html,/src="\/uploads\/reels\/video-42.mp4"/);
 assert.match(html,/<video[^>]*preload="none" controls muted playsinline loop>/);
 assert.match(html,/aria-label="Compartir este vídeo"/);
});

test('V3.6.58: landing SSR, ruta pública y paginación limitada son reales y verificables',async()=>{
 const real=[sample(42),sample(43)];
 const fake=stub(real);
 await serve(fake.db,async origin=>{
  const page=await fetch(origin+'/pulso');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/text\/html/);
  assert.equal(page.headers.get('cache-control'),'no-store');
  const html=await page.text();
  assert.match(html,/<h1>Pulso<\/h1>/);
  assert.match(html,/id="pulsoFeed"/);
  assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/pulso"/);
  assert.match(html,/pulso-v3658.js\?v=3.6.58/);
  assert.match(html,/class="pulso-card" data-pulso-item/);
  assert.equal((html.match(/data-pulso-item/g)||[]).length,2);
  assert.match(html,/href="\/app\?view=reels&crear=reel"/);
  assert.doesNotMatch(html,/vídeos falsos|usuarios conectados ahora/);
  const api=await fetch(origin+'/api/pulso/public?page=2');
  assert.equal(api.status,200);
  assert.equal(api.headers.get('cache-control'),'no-store');
  assert.equal(api.headers.get('x-robots-tag'),'noindex,nofollow');
  const json=await api.json();
  assert.equal(json.page,2);
  assert.equal(json.items.length,2);
  assert.equal(json.items[0].id,'42');
  assert.equal(json.items[0].video,'/uploads/reels/video-42.mp4');
  assert.equal(json.items[0].likes,2);
  assert.ok(!('email' in json.items[0]));
  assert.equal(json.hasMore,false);
  const invalid=await fetch(origin+'/api/pulso/public?page=999');
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).error,'invalid_page');
  const redirect=await fetch(origin+'/pulso?page=999',{redirect:'manual'});
  assert.equal(redirect.status,302);
  assert.equal(redirect.headers.get('location'),'/pulso');
 });
 assert.equal(fake.calls.length,2);
 assert.deepEqual(fake.calls[0].params,[13,0]);
 assert.deepEqual(fake.calls[1].params,[13,12]);
});

test('V3.6.58: vacío significa sin publicaciones reales y sin cifras inventadas',async()=>{
 const data=await fetchVideos(stub([]).db,1);
 assert.deepEqual(data,{items:[],hasMore:false});
 const html=renderPage([],false);
 assert.match(html,/Aún no hay vídeos públicos en Pulso/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/id="pulsoMore" type="button" hidden/);
 assert.doesNotMatch(html,/id="pulsoMore"[^>]*>0 vídeos/);
});
test('V3.6.58: no expone identificadores externos y respeta límite de páginas',()=>{
 assert.equal(pageParam(undefined),1);
 assert.equal(pageParam('2'),2);
 for(const x of ['0','21','-1','1.2','1e3','0x10','2; DROP',''])assert.equal(pageParam(x),null);
 const data=Array.from({length:PAGE_SIZE+1},(_,i)=>sample(i+1));
 const db=stub(data);
 return fetchVideos(db.db,2).then(result=>{
  assert.equal(result.items.length,PAGE_SIZE);
  assert.equal(result.hasMore,true);
 });
});
test('V3.6.58: integración de Pulso con app Reels, portada, robots y sitemap',()=>{
 const app=read('public/app.html'),server=read('server.js'),home=read('public/index.html');
 const js=read('public/pulso-v3658.js'),css=read('public/pulso-v3658.css');
 assert.match(server,/app.use\(createPulsoRouter\(\{db\}\)\)/);
 assert.match(server,/Allow: \/pulso/);
 assert.match(server,/escapeHtml\(origin\+'\/pulso'\)/);
 assert.match(home,/href="\/pulso">Pulso<\/a>/);
 assert.match(app,/<button data-view="reels">▷ <span>Pulso<\/span><\/button>/);
 assert.match(app,/<section id="reelsView"[^>]*><div class="page-title">[\s\S]*?<h1>Pulso<\/h1>/);
 assert.match(app,/id="reelsFeed"/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/\.connection\?\.saveData/);
 assert.match(js,/IntersectionObserver/);
 assert.match(js,/document\.visibilityState/);
 assert.match(js,/credentials:'omit'/);
 assert.match(js,/textContent=String\(text\)/);
 assert.doesNotMatch(js,/\.innerHTML|localStorage|sessionStorage|sendBeacon/);
 assert.match(css,/scroll-snap-type:y mandatory/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/:focus-visible/);
});
