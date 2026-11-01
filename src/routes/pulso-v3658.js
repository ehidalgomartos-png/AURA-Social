'use strict';
// V3.6.58 — Pulso, visor público de vídeos reales de RedLibertad.
// El feed privado y la creación siguen viviendo en /app?view=reels.
const express=require('express');
const defaultDb=require('../db');

const PAGE_SIZE=12;
const MAX_PAGE=20;
const PUBLIC_VIDEO_SQL=[
 "SELECT p.id,p.caption,p.media_url,p.created_at,",
 "u.username,u.display_name,u.avatar_url,",
 "(SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,",
 "(SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count",
 "FROM posts p JOIN users u ON u.id=p.user_id",
 "WHERE p.moderation_status='published' AND p.audience='public'",
 "AND p.content_level='normal' AND p.post_kind='reel' AND p.media_type='video'",
 "AND p.media_url IS NOT NULL AND p.media_url<>''",
 "AND u.status='active' AND u.is_admin=false AND u.discoverable=true",
 "ORDER BY p.created_at DESC,p.id DESC LIMIT $1 OFFSET $2"
].join(' ');

const esc=(value='')=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function safeMediaUrl(value){
 const raw=String(value||'').trim();
 if(!raw||raw.length>2048||/[\s<>"'\\]/.test(raw))return null;
 if(/^\/(?!\/)(?:uploads|assets|api\/media)\/[a-z0-9_~!$&()*+,;=:@%./-]+$/i.test(raw))return raw;
 if(/^https:\/\/[a-z0-9.-]+(?::443)?\/[a-z0-9_~!$&()*+,;=:@%/?#-]+$/i.test(raw))return raw;
 return null;
}
function safeCount(value){
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:0;
}
function cleanVideo(row){
 const id=String(row?.id??'');
 const media=safeMediaUrl(row?.media_url);
 const username=String(row?.username||'').trim();
 if(!/^[1-9][0-9]{0,15}$/.test(id)||!media||!/^[\p{L}\p{N}_.-]{2,60}$/u.test(username))return null;
 return {
  id,video:media,avatar:safeMediaUrl(row.avatar_url),
  username,displayName:String(row.display_name||username).slice(0,80),
  caption:String(row.caption||'').trim().slice(0,700),
  likes:safeCount(row.like_count),comments:safeCount(row.comment_count)
 };
}
function publicReelPath(item){return '/reel/'+encodeURIComponent(item.id);}
function renderCard(item){
 const profile='/perfil/'+encodeURIComponent(item.username);
 const reel=publicReelPath(item);
 const avatar=item.avatar?'<img src="'+esc(item.avatar)+'" alt="" loading="lazy">':'<span aria-hidden="true">◉</span>';
 return '<article class="pulso-card" data-pulso-item data-reel-id="'+esc(item.id)+'">'+
  '<video class="pulso-video" src="'+esc(item.video)+'" preload="none" controls muted playsinline loop></video>'+
  '<div class="pulso-shade" aria-hidden="true"></div>'+
  '<div class="pulso-item-info"><a class="pulso-creator" href="'+esc(profile)+'">'+avatar+'<span>'+esc(item.displayName)+'</span></a>'+
  (item.caption?'<p class="pulso-caption">'+esc(item.caption)+'</p>':'')+
  '<a class="pulso-detail" href="'+esc(reel)+'">Ver vídeo y participar</a></div>'+
  '<div class="pulso-actions">'+
  '<span class="pulso-count" aria-label="'+item.likes+' me gusta">♥ <b>'+item.likes+'</b></span>'+
  '<a href="'+esc(reel)+'" aria-label="Ver '+item.comments+' comentarios">◌ <b>'+item.comments+'</b></a>'+
  '<button type="button" class="pulso-share" data-pulso-share="'+esc(reel)+'" aria-label="Compartir este vídeo">↗<small>Compartir</small></button>'+
  '</div></article>';
}
function renderPage(items,more){
 const cards=items.length?items.map(renderCard).join(''):'<section class="pulso-empty"><strong>Aún no hay vídeos públicos en Pulso.</strong><p>Cuando alguien comparta un Reel público que pueda mostrarse, aparecerá aquí.</p><a href="/app?view=reels">Entrar y crear un Reel</a></section>';
 const robots=items.length?'index,follow,max-video-preview:-1':'noindex,follow';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
  '<meta name="theme-color" content="#0b1c2b">'+
  '<meta name="robots" content="'+robots+'">'+
  '<title>Pulso | Vídeos cortos de RedLibertad</title>'+
  '<meta name="description" content="Descubre vídeos cortos compartidos públicamente por personas reales en Pulso, el espacio de vídeo de RedLibertad.">'+
  '<link rel="canonical" href="https://redlibertad.com/pulso">'+
  '<meta property="og:title" content="Pulso — Vídeos de RedLibertad">'+
  '<meta property="og:description" content="Vídeos, historias y experiencias reales de la comunidad.">'+
  '<meta property="og:image" content="https://redlibertad.com/assets/og-redlibertad-v1922.jpg">'+
  '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'+
  '<link rel="stylesheet" href="/pulso-v3658.css?v=3.6.58">'+
  '<script src="/pulso-v3658.js?v=3.6.58" defer></script></head>'+
  '<body><a class="pulso-skip" href="#pulsoFeed">Saltar a los vídeos</a>'+
  '<header class="pulso-top"><a class="pulso-brand" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a>'+
  '<span class="pulso-name">Pulso <span>●</span></span>'+
  '<nav aria-label="Navegación de Pulso"><a href="/reels">Reels</a><a href="/app?view=reels">Mis vídeos</a><a class="pulso-join" href="/#registro">Crear cuenta</a></nav></header>'+
  '<main class="pulso-layout"><div class="pulso-heading"><p>LO QUE MUEVE A REDLIBERTAD</p><h1>Pulso</h1><span>Desliza para descubrir vídeos auténticos. Toca el vídeo para controlarlo.</span></div>'+
  '<div class="pulso-feed" id="pulsoFeed" tabindex="0" aria-label="Vídeos cortos de la comunidad">'+cards+
  '<div class="pulso-footer-feed" id="pulsoFooter">'+
  '<button id="pulsoMore" type="button"'+(!more?' hidden':'')+'>Ver más vídeos</button>'+
  '<p id="pulsoStatus" role="status" aria-live="polite"></p></div></div>'+
  '<div class="pulso-side-note"><p>Voces reales, sin cuentas inventadas.</p>'+
  '<a href="/app?view=reels">Publicar un vídeo en RedLibertad</a><a href="/reels">Explorar la galería</a></div>'+
  '</main><footer class="pulso-bottom">Pulso es parte de RedLibertad · <a href="/community-guidelines/">Normas</a> · <a href="/privacy/">Privacidad</a></footer>'+
  '</body></html>';
}
function pageParam(raw){
 if(raw===undefined)return 1;
 if(!/^[1-9][0-9]?$/.test(String(raw)))return null;
 const n=Number(raw);return n<=MAX_PAGE?n:null;
}
async function fetchVideos(db,page){
 const query=await db.query(PUBLIC_VIDEO_SQL,[PAGE_SIZE+1,(page-1)*PAGE_SIZE]);
 const clean=(query.rows||[]).map(cleanVideo).filter(Boolean);
 return {items:clean.slice(0,PAGE_SIZE),hasMore:page<MAX_PAGE&&query.rows.length>PAGE_SIZE};
}
function createPulsoRouter({db=defaultDb}={}){
 const router=express.Router();
 router.get('/pulso',async(req,res)=>{
  try{
   const page=pageParam(req.query.page);
   if(page!==1)return res.redirect(302,'/pulso');
   const data=await fetchVideos(db,1);
   res.set('Cache-Control','no-store').type('html').send(renderPage(data.items,data.hasMore));
  }catch(err){
   console.error('Pulso public feed unavailable');
   res.status(503).type('html').send(renderPage([],false).replace('Aún no hay vídeos públicos en Pulso.','Pulso no está disponible en este momento.'));
  }
 });
 router.get('/api/pulso/public',async(req,res)=>{
  const page=pageParam(req.query.page);
  if(!page)return res.status(400).json({error:'invalid_page'});
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow');
  try{
   const {items,hasMore}=await fetchVideos(db,page);
   res.json({items,hasMore,page});
  }catch(err){
   console.error('Pulso public pagination unavailable');
   res.status(503).json({error:'temporarily_unavailable'});
  }
 });
 return router;
}
module.exports={createPulsoRouter,PUBLIC_VIDEO_SQL,PAGE_SIZE,MAX_PAGE,esc,safeMediaUrl,cleanVideo,renderCard,renderPage,pageParam,fetchVideos};
