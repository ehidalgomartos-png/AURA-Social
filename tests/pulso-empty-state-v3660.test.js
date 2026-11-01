'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {createPulsoRouter,renderPage,cleanVideo,PUBLIC_VIDEO_SQL}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const reel=cleanVideo({id:42,username:'persona_publica',display_name:'Persona Pública',
 media_url:'/uploads/videos/reel.mp4',avatar_url:null,caption:'Vídeo real',like_count:0,comment_count:0});
async function serve(db,work){
 const app=express();app.use(createPulsoRouter({db}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 try{await work('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
test('V3.6.60: cuando no hay Reels reales no se deja un reproductor negro a pantalla completa',()=>{
 const html=renderPage([],false);
 assert.match(html,/class="pulso-layout pulso-layout-empty-v3660"/);
 assert.match(html,/class="pulso-feed pulso-feed-empty-v3660"/);
 assert.match(html,/id="pulsoEmptyHeadingV3660">Pulso está empezando/);
 assert.match(html,/Todavía no hay Reels públicos disponibles/);
 assert.match(html,/href="\/app\?view=reels&crear=reel" data-pulso-create>Publicar un vídeo<\/a>/);
 assert.match(html,/href="\/reels">Explorar la galería/);
 assert.match(html,/pulso-empty-v3660\.css\?v=3\.6\.60/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/class="pulso-footer-feed"/);
 assert.doesNotMatch(html,/id="pulsoMore"/);
 assert.doesNotMatch(html,/data-pulso-item/);
 assert.doesNotMatch(html,/usuarios online|publicaciones inventadas|10 vídeos disponibles/);
});
test('V3.6.60: con vídeos reales se conserva el visor vertical y el paginador',()=>{
 const html=renderPage([reel],true);
 assert.match(html,/class="pulso-layout"/);
 assert.match(html,/class="pulso-feed" id="pulsoFeed"/);
 assert.match(html,/class="pulso-card" data-pulso-item/);
 assert.match(html,/id="pulsoMore" type="button"/);
 assert.match(html,/class="pulso-footer-feed"/);
 assert.match(html,/data-pulso-like="42"/);
 assert.doesNotMatch(html,/pulso-layout-empty-v3660|id="pulsoEmptyHeadingV3660"/);
 assert.match(html,/name="robots" content="index,follow,max-video-preview:-1"/);
});
test('V3.6.60: error de consulta se distingue de cero vídeos y ofrece reintentar',async()=>{
 const failure=renderPage([],false,{unavailable:true});
 assert.match(failure,/id="pulsoEmptyHeadingV3660">No se pudieron cargar los vídeos/);
 assert.match(failure,/No podemos mostrar las publicaciones ahora/);
 assert.match(failure,/href="\/pulso">Volver a intentar/);
 assert.doesNotMatch(failure,/Todavía no hay Reels públicos disponibles/);
 await serve({query:async()=>{throw new Error('simulated database issue');}},async origin=>{
  const response=await fetch(origin+'/pulso');
  assert.equal(response.status,503);
  const html=await response.text();
  assert.match(html,/No se pudieron cargar los vídeos/);
  assert.doesNotMatch(html,/Pulso está empezando/);
 });
});
test('V3.6.60: estado vacío real servido sin inventar publicaciones',async()=>{
 await serve({query:async(sql,params)=>{
  assert.equal(sql,PUBLIC_VIDEO_SQL);assert.deepEqual(params,[13,0]);
  return {rows:[]};
 }},async origin=>{
  const response=await fetch(origin+'/pulso');
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Pulso está empezando/);
  assert.doesNotMatch(html,/class="pulso-card"/);
 });
});
test('V3.6.60: estilo vacío es compacto y accesible en móvil; no afecta a los vídeos',()=>{
 const css=read('public/pulso-empty-v3660.css');
 assert.match(css,/\.pulso-feed\.pulso-feed-empty-v3660\{/);
 assert.match(css,/height:auto;min-height:0;max-height:none;overflow:visible/);
 assert.match(css,/scroll-snap-type:none/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/\.pulso-layout-empty-v3660 \.pulso-feed\.pulso-feed-empty-v3660\{height:auto/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/min-height:49px/);
 const player=read('public/pulso-v3658.css');
 assert.match(player,/scroll-snap-type:y mandatory/);
 const legacyJs=read('public/pulso-v3658.js');
 assert.match(legacyJs,/if\(!feed\|\|!more\|\|!status\|\|!footer\)return/);
 const social=read('public/pulso-social-v3659.js');
 assert.match(social,/const feed=document\.getElementById\('pulsoFeed'\)/);
});
test('V3.6.60: los filtros públicos se mantienen alineados con la galería original',()=>{
 const old=read('src/public-media-seo-v182.js');
 for(const rule of ["p.moderation_status='published'","p.audience='public'",
  "p.content_level='normal'","p.post_kind='reel'","p.media_type='video'",
  "u.status='active'","u.is_admin=false","u.discoverable=true"]){
  assert.ok(PUBLIC_VIDEO_SQL.includes(rule),rule);
  assert.ok(old.includes(rule),rule);
 }
 assert.doesNotMatch(PUBLIC_VIDEO_SQL,/audience='private'|status='draft'|content_level='sensitive'/);
});
