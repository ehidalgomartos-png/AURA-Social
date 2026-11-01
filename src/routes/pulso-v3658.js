'use strict';
// V3.6.58 — Pulso, visor público de vídeos reales de RedLibertad.
// El feed privado y la creación siguen viviendo en /app?view=reels.
const express=require('express');
const defaultDb=require('../db');
const {requireAuth:requireMember}=require('../middleware/auth');
const PULSO_STATE_SQL=[
 "SELECT p.id::text AS id,p.user_id::text AS author_id,",
 "EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,",
 "EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.user_id AND f.follower_id=$1) AS following",
 "FROM posts p JOIN users u ON u.id=p.user_id",
 "WHERE p.id=ANY($2::bigint[]) AND p.moderation_status='published'",
 "AND p.audience='public' AND p.content_level='normal'",
 "AND p.post_kind='reel' AND p.media_type='video' AND p.media_url IS NOT NULL AND p.media_url<>''",
 "AND u.status='active' AND u.is_admin=false AND u.discoverable=true",
 "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE",
 " (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocked_id=$1 AND b.blocker_id=p.user_id))",
 "AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=p.user_id)",
 "ORDER BY p.created_at DESC LIMIT 12"
].join(' ');
function requestedPublicIds(raw){
 if(typeof raw!=='string'||raw.length>210)return null;
 const ids=raw.split(',');
 if(!ids.length||ids.length>12||ids.some(id=>!/^[1-9][0-9]{0,15}$/.test(id)))return null;
 return [...new Set(ids)];
}


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
  '<button type="button" class="pulso-follow" data-pulso-follow="'+esc(item.id)+'" hidden>Seguir</button>'+
  (item.caption?'<p class="pulso-caption" id="pulso-caption-'+esc(item.id)+'">'+esc(item.caption)+'</p>'+ 
    (item.caption.length>135?'<button type="button" class="pulso-caption-toggle-v3661" aria-expanded="false" aria-controls="pulso-caption-'+esc(item.id)+'" data-pulso-caption-toggle>Ver descripción completa</button>':''):'')+
  '<a class="pulso-detail" href="'+esc(reel)+'">Ver vídeo y participar</a></div>'+
  '<div class="pulso-actions">'+
  '<button type="button" class="pulso-count pulso-like" data-pulso-like="'+esc(item.id)+'" aria-pressed="false" aria-label="Me gusta: '+item.likes+'">♥ <b>'+item.likes+'</b></button>'+
  '<button type="button" class="pulso-comments-open" data-pulso-comments="'+esc(item.id)+'" aria-label="Ver comentarios: '+item.comments+'">◌ <b>'+item.comments+'</b></button>'+
  '<button type="button" class="pulso-share" data-pulso-share="'+esc(reel)+'" aria-label="Compartir este vídeo">↗<small>Compartir</small></button>'+
  '</div></article>';
}
function renderPage(items,more,{unavailable=false}={}){
 const isEmpty=items.length===0;
 const cards=isEmpty?'<section class="pulso-empty" aria-labelledby="pulsoEmptyHeadingV3660">'+
  '<div class="pulso-empty-icon-v3660" aria-hidden="true">▶</div>'+
  '<span class="pulso-empty-eyebrow-v3660">PULSO · REDLIBERTAD</span>'+
  '<h2 id="pulsoEmptyHeadingV3660">'+(unavailable?'No se pudieron cargar los vídeos':'Pulso está empezando')+'</h2>'+
  '<p>'+(unavailable?'No podemos mostrar las publicaciones ahora. Puedes probar a recargar Pulso.':
   'Todavía no hay Reels públicos disponibles. Los vídeos aparecerán aquí cuando sus autores los publiquen para todo el mundo.')+'</p>'+
  '<div class="pulso-empty-links-v3660">'+
  '<a class="pulso-empty-primary-v3660" href="/app?view=reels&crear=reel" data-pulso-create>Publicar un vídeo</a>'+
  '<a class="pulso-empty-secondary-v3660" href="'+(unavailable?'/pulso':'/reels')+'">'+
  (unavailable?'Volver a intentar':'Explorar la galería')+'</a></div>'+
  '<p class="pulso-empty-note-v3660">Con tu cuenta habitual de RedLibertad · Sin vídeos inventados</p></section>':
  items.map(renderCard).join('');
 const robots=isEmpty?'noindex,follow':'index,follow,max-video-preview:-1';
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
  '<link rel="stylesheet" href="/pulso-social-v3659.css?v=3.6.59">'+
  '<link rel="stylesheet" href="/pulso-empty-v3660.css?v=3.6.60">'+
  '<link rel="stylesheet" href="/pulso-mobile-v3661.css?v=3.6.61">'+
  '<script src="/pulso-v3658.js?v=3.6.58" defer></script>'+
  '<script src="/pulso-social-v3659.js?v=3.6.59" defer></script>'+
  '<script src="/pulso-mobile-v3661.js?v=3.6.61" defer></script></head>'+
  '<body><a class="pulso-skip" href="#pulsoFeed">Saltar a los vídeos</a>'+
  '<header class="pulso-top"><a class="pulso-brand" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a>'+
  '<span class="pulso-name">Pulso <span>●</span></span>'+
  '<nav aria-label="Navegación de Pulso"><a href="/reels">Reels</a><a href="/app?view=reels&crear=reel" class="pulso-create" data-pulso-create>Publicar vídeo</a><a class="pulso-join" href="/#registro">Crear cuenta</a></nav></header>'+
  '<main class="pulso-layout'+(isEmpty?' pulso-layout-empty-v3660':'')+'"><div class="pulso-heading"><p>LO QUE MUEVE A REDLIBERTAD</p><h1>Pulso</h1><span>'+(isEmpty?'Un espacio para compartir tus historias reales.':'Desliza para descubrir vídeos auténticos. Toca el vídeo para controlarlo.')+'</span></div>'+
  '<div class="pulso-feed'+(isEmpty?' pulso-feed-empty-v3660':'')+'" id="pulsoFeed" tabindex="0" aria-label="Vídeos cortos de la comunidad">'+cards+
  (isEmpty?'':'<div class="pulso-footer-feed" id="pulsoFooter">'+
  '<button id="pulsoMore" type="button"'+(!more?' hidden':'')+'>Ver más vídeos</button>'+
  '<p id="pulsoStatus" role="status" aria-live="polite"></p></div>')+'</div>'+
  '<div class="pulso-side-note"><p>Voces reales, sin cuentas inventadas.</p>'+
  '<a href="/app?view=reels&crear=reel" data-pulso-create>Publicar un vídeo</a><a href="/reels">Explorar la galería</a></div>'+
  '</main><p id="pulsoSocialNotice" class="pulso-social-notice" role="status" aria-live="polite" hidden></p><dialog id="pulsoAuthDialog" class="pulso-dialog pulso-login-dialog" aria-labelledby="pulsoAuthTitle">'+
  '<button type="button" class="pulso-close" data-pulso-close aria-label="Cerrar">×</button>'+
  '<h2 id="pulsoAuthTitle">Participa en Pulso</h2><p>Inicia sesión para dar Me gusta, comentar o seguir a un creador. Tu cuenta de RedLibertad sirve también aquí.</p>'+
  '<div class="pulso-dialog-links"><a href="/?next=%2Fpulso#acceso">Ya tengo cuenta</a><a href="/?next=%2Fpulso#registro">Crear cuenta gratis</a></div></dialog>'+
  '<dialog id="pulsoCommentsDialog" class="pulso-dialog" aria-labelledby="pulsoCommentsTitle">'+
  '<button type="button" class="pulso-close" data-pulso-close aria-label="Cerrar comentarios">×</button>'+
  '<h2 id="pulsoCommentsTitle">Comentarios</h2><div id="pulsoCommentsList" class="pulso-comments-list" aria-live="polite"></div>'+
  '<form id="pulsoCommentForm"><label for="pulsoCommentBody">Tu comentario</label>'+
  '<textarea id="pulsoCommentBody" name="body" maxlength="1000" required rows="3" placeholder="Escribe con respeto…"></textarea>'+
  '<button type="submit">Publicar comentario</button></form>'+
  '<p id="pulsoCommentStatus" role="status" aria-live="polite"></p></dialog>'+
  '<footer class="pulso-bottom">Pulso es parte de RedLibertad · <a href="/community-guidelines/">Normas</a> · <a href="/privacy/">Privacidad</a></footer>'+
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
function createPulsoRouter({db=defaultDb,auth=requireMember}={}){
 const router=express.Router();
 router.get('/pulso',async(req,res)=>{
  try{
   const page=pageParam(req.query.page);
   if(page!==1)return res.redirect(302,'/pulso');
   const data=await fetchVideos(db,1);
   res.set('Cache-Control','no-store').type('html').send(renderPage(data.items,data.hasMore));
  }catch(err){
   console.error('Pulso public feed unavailable');
   res.status(503).type('html').send(renderPage([],false,{unavailable:true}));
  }
 });
 router.get('/api/pulso/session',auth,(req,res)=>{
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow');
  return res.json({authenticated:true});
 });
 router.get('/api/pulso/state',auth,async(req,res)=>{
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow');
  const ids=requestedPublicIds(req.query.ids);
  if(!ids)return res.status(400).json({error:'invalid_video_ids'});
  try{
   const r=await db.query(PULSO_STATE_SQL,[req.user.id,ids]);
   const states={};
   for(const row of (r.rows||[])){
    const id=String(row.id||''),authorId=String(row.author_id||'');
    if(!ids.includes(id)||!/^[1-9][0-9]{0,15}$/.test(authorId))continue;
    states[id]={authorId,liked:row.liked===true,following:row.following===true,own:authorId===String(req.user.id)};
   }
   return res.json({authenticated:true,states});
  }catch(_){
   console.error('Pulso social states unavailable');
   return res.status(503).json({error:'social_state_unavailable'});
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
module.exports={createPulsoRouter,PUBLIC_VIDEO_SQL,PULSO_STATE_SQL,requestedPublicIds,PAGE_SIZE,MAX_PAGE,esc,safeMediaUrl,cleanVideo,renderCard,renderPage,pageParam,fetchVideos};
