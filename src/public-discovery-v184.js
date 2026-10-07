const express=require('express');
const db=require('./db');

const router=express.Router();

const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin=req=>String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');
const abs=(req,v='')=>!v?'':/^https?:\/\//i.test(v)?v:origin(req)+(v.startsWith('/')?'':'/')+v;
const slug=(v='')=>String(v||'contenido').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'contenido';
const short=(v='',n=150)=>{const x=String(v||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n-1).trimEnd()+'…':x;};
const reelName=x=>short(x.caption||'',70)||('Reel de '+String(x.display_name||x.username||'RedLibertad'));
const reelPath=x=>'/reel/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(reelName(x)));
const communityPath=x=>'/comunidad/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.name));
const eventPath=x=>'/evento/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.title));

function shell(req,{title,description,body,jsonLd=''}) {
  const o=origin(req),canonical=o+'/descubrir';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1"><link rel="canonical" href="'+esc(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(o+'/assets/og-redlibertad.png')+'"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css">'+jsonLd+'<style>.dh{min-height:100vh;background:var(--bg);color:var(--navy)}.dt{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.95);backdrop-filter:blur(14px)}.db{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-weight:900}.db img{width:32px;height:32px}.da{display:flex;gap:7px;flex-wrap:nowrap}.da .button{min-width:0;white-space:nowrap;padding:9px 12px}.wrap{width:min(1120px,calc(100% - 28px));margin:auto;padding:38px 0 72px}.disc-hero{display:grid;grid-template-columns:1fr minmax(300px,.65fr);gap:24px;align-items:end;padding:22px 0 10px}.disc-hero h1{font:800 clamp(34px,5vw,54px) Manrope,sans-serif;line-height:1.02;margin:6px 0 10px}.muted{color:var(--muted);line-height:1.6}.searchbox{display:flex;gap:8px;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--paper)}.searchbox input{flex:1;min-width:0;border:0;background:transparent;padding:10px;outline:0;font:inherit}.section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:11px}.section h2{font-size:22px;margin:0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 9px 25px rgba(13,34,56,.05);overflow:hidden}.card a.main{display:block;color:inherit;text-decoration:none;padding:15px}.visual{aspect-ratio:16/10;background:#071522;overflow:hidden}.visual img,.visual video{display:block;width:100%;height:100%;object-fit:cover}.row{display:flex;gap:10px;align-items:center}.avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900;flex:none}.tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:10px;font-weight:800;margin:2px 4px 2px 0}.card h3{font-size:16px;margin:7px 0}.stats{font-size:11px;color:var(--muted);margin-top:7px}.hashtags{display:flex;flex-wrap:wrap;gap:8px}.hashtags a{display:inline-flex;padding:9px 12px;border:1px solid var(--line);border-radius:999px;background:var(--paper);text-decoration:none;color:inherit;font-weight:800}.empty{padding:26px;border:1px dashed var(--line);border-radius:16px;background:var(--paper);color:var(--muted);text-align:center}.quick{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:22px}.quick a{display:block;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--paper);color:inherit;text-decoration:none}.quick b{display:block;margin-bottom:5px}@media(max-width:900px){.disc-hero{grid-template-columns:1fr}.grid,.quick{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.wrap{width:calc(100% - 20px);padding-top:22px}.grid,.quick{grid-template-columns:1fr}.da .ghost:nth-child(-n+5){display:none}.dt{padding:9px 10px}.searchbox{display:grid;grid-template-columns:1fr}.searchbox .button{width:100%}}</style></head><body><main class="dh"><header class="dt"><a class="db" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="da"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="wrap">'+body+'</div></main></body></html>';
}

function section(title,more,html){
  if(!html)return '';
  return '<section class="section"><div class="section-head"><h2>'+esc(title)+'</h2>'+(more?'<a href="'+esc(more)+'">Ver más</a>':'')+'</div>'+html+'</section>';
}

router.get('/descubrir',async(req,res)=>{
  try{
    const [peopleR,postsR,reelsR,communitiesR,eventsR,hashtagsR]=await Promise.all([
      db.query(`
        SELECT u.username,u.display_name,u.bio,u.avatar_url,u.creator_verified,u.created_at,
               (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count
        FROM users u
        WHERE u.status='active' AND u.is_admin=false AND u.discoverable=true
        ORDER BY u.created_at DESC,u.id DESC
        LIMIT 6
      `),
      db.query(`
        SELECT p.id,p.caption,p.media_url,p.media_type,p.created_at,u.username,u.display_name,
               (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
               (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
          AND p.post_kind<>'reel' AND p.created_at>=now()-interval '30 days'
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
        ORDER BY ((SELECT count(*) FROM likes l WHERE l.post_id=p.id)*2+(SELECT count(*) FROM comments c WHERE c.post_id=p.id)*3) DESC,p.created_at DESC,p.id DESC
        LIMIT 6
      `),
      db.query(`
        SELECT p.id,p.caption,p.media_url,p.created_at,u.username,u.display_name,
               (SELECT count(*)::int FROM reel_views rv WHERE rv.post_id=p.id) view_count,
               (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
          AND p.post_kind='reel' AND p.media_type='video' AND p.media_url IS NOT NULL AND p.media_url<>''
          AND p.created_at>=now()-interval '30 days'
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
        ORDER BY ((SELECT count(*) FROM reel_views rv WHERE rv.post_id=p.id)+(SELECT count(*) FROM likes l WHERE l.post_id=p.id)*2) DESC,p.created_at DESC,p.id DESC
        LIMIT 6
      `),
      db.query(`
        SELECT c.id,c.name,c.description,c.avatar_url,c.category,c.updated_at,
               (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) member_count,
               (SELECT count(*)::int FROM community_posts cp WHERE cp.community_id=c.id AND cp.moderation_status='published' AND cp.content_level='normal') public_post_count
        FROM communities c JOIN users owner ON owner.id=c.owner_id
        WHERE c.privacy='public' AND owner.status='active' AND owner.is_admin=false AND owner.discoverable=true
        ORDER BY public_post_count DESC,member_count DESC,c.updated_at DESC,c.id DESC
        LIMIT 6
      `),
      db.query(`
        SELECT ev.id,ev.title,ev.description,ev.event_type,ev.starts_at,ev.location_label,creator.username
        FROM social_events ev JOIN users creator ON creator.id=ev.creator_id
        WHERE ev.visibility='public' AND ev.cancelled_at IS NULL AND ev.starts_at>=now()-interval '2 hours'
          AND creator.status='active' AND creator.discoverable=true
          AND (ev.community_id IS NULL OR EXISTS(
            SELECT 1 FROM communities pc JOIN users po ON po.id=pc.owner_id
            WHERE pc.id=ev.community_id AND pc.privacy='public' AND po.status='active' AND po.is_admin=false AND po.discoverable=true
          ))
        ORDER BY ev.starts_at ASC,ev.id ASC
        LIMIT 6
      `),
      db.query(`
        SELECT p.caption
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
          AND p.created_at>=now()-interval '30 days'
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
          AND p.caption LIKE '%#%'
        ORDER BY p.created_at DESC
        LIMIT 240
      `)
    ]);

    const tagCounts=new Map(),rx=/#([\p{L}\p{N}_]{2,40})/gu;
    for(const row of hashtagsR.rows){
      for(const m of String(row.caption||'').matchAll(rx)){
        const tag=m[1].normalize('NFKC').toLowerCase();
        tagCounts.set(tag,(tagCounts.get(tag)||0)+1);
      }
    }
    const tags=[...tagCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es')).slice(0,14);

    const people=peopleR.rows.map(x=>'<article class="card"><a class="main row" href="/perfil/'+encodeURIComponent(x.username)+'">'+(x.avatar_url?'<img class="avatar" src="'+esc(abs(req,x.avatar_url))+'" alt="">':'<span class="avatar">'+esc(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>')+'<span><b>'+esc(x.display_name)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+esc(x.username)+'</span><div class="stats">'+Number(x.follower_count||0)+' seguidores · nuevo por aquí</div></span></a></article>').join('');

    const posts=postsR.rows.map(x=>{
      const visual=x.media_url?(x.media_type==='image'?'<div class="visual"><img src="'+esc(abs(req,x.media_url))+'" loading="lazy" alt=""></div>':'<div class="visual"><video src="'+esc(abs(req,x.media_url))+'" muted playsinline preload="metadata"></video></div>'):'';
      return '<article class="card">'+visual+'<a class="main" href="/p/'+encodeURIComponent(x.id)+'"><span class="tag">PUBLICACIÓN</span><h3>'+esc(short(x.caption||('Publicación de '+x.display_name),100))+'</h3><div class="muted">@'+esc(x.username)+'</div><div class="stats">'+Number(x.like_count||0)+' me gusta · '+Number(x.comment_count||0)+' comentarios</div></a></article>';
    }).join('');

    const reels=reelsR.rows.map(x=>'<article class="card"><div class="visual"><video src="'+esc(abs(req,x.media_url))+'" muted playsinline preload="metadata"></video></div><a class="main" href="'+esc(reelPath(x))+'"><span class="tag">REEL</span><h3>'+esc(reelName(x))+'</h3><div class="muted">@'+esc(x.username)+'</div><div class="stats">'+Number(x.view_count||0)+' vistas · '+Number(x.like_count||0)+' me gusta</div></a></article>').join('');

    const communities=communitiesR.rows.map(x=>'<article class="card"><a class="main" href="'+esc(communityPath(x))+'"><span class="tag">'+esc(String(x.category||'General').toUpperCase())+'</span><h3>'+esc(x.name)+'</h3><p class="muted">'+esc(short(x.description||'',110))+'</p><div class="stats">'+Number(x.member_count||0)+' miembros · '+Number(x.public_post_count||0)+' publicaciones</div></a></article>').join('');

    const events=eventsR.rows.map(x=>'<article class="card"><a class="main" href="'+esc(eventPath(x))+'"><span class="tag">'+(x.event_type==='online'?'ONLINE':'PRESENCIAL')+'</span><h3>'+esc(x.title)+'</h3><p class="muted">'+esc(short(x.description||'',110))+'</p><div class="stats">'+esc(new Date(x.starts_at).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}))+' · @'+esc(x.username)+'</div></a></article>').join('');

    const hashtags=tags.map(([tag,count])=>'<a href="/hashtag/'+encodeURIComponent(tag)+'">#'+esc(tag)+' <span class="muted">· '+Number(count)+'</span></a>').join('');

    const description='Descubre personas nuevas, publicaciones, Reels, hashtags, comunidades y eventos públicos que están moviendo RedLibertad.';
    const jsonLd='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:'Descubrir en RedLibertad',description,url:origin(req)+'/descubrir',isPartOf:{'@type':'WebSite',name:'RedLibertad',url:origin(req)}}).replace(/</g,'\\u003c')+'</script>';
    const body='<section class="disc-hero"><div><span class="eyebrow">DESCUBRIR · AHORA</span><h1>Lo que está pasando en RedLibertad</h1><p class="muted">'+esc(description)+'</p></div><form class="searchbox" action="/buscar" method="get"><input name="q" minlength="2" placeholder="Buscar en RedLibertad" aria-label="Buscar en RedLibertad"><button class="button" type="submit">Buscar</button></form></section><section class="quick"><a href="/perfiles"><b>Personas</b><span class="muted">Encuentra nuevos perfiles.</span></a><a href="/reels"><b>Reels</b><span class="muted">Vídeos públicos destacados.</span></a><a href="/eventos"><b>Eventos</b><span class="muted">Próximos encuentros públicos.</span></a><a href="/temas"><b>Temas</b><span class="muted">Explora intereses y comunidades.</span></a></section>'
      +section('Personas nuevas','/perfiles',people?'<div class="grid">'+people+'</div>':'<div class="empty">Todavía no hay perfiles públicos para mostrar.</div>')
      +section('Publicaciones que destacan','/publicaciones',posts?'<div class="grid">'+posts+'</div>':'<div class="empty">Todavía no hay publicaciones públicas recientes.</div>')
      +section('Reels en movimiento','/reels',reels?'<div class="grid">'+reels+'</div>':'<div class="empty">Todavía no hay Reels públicos recientes.</div>')
      +section('Hashtags del momento','',hashtags?'<div class="hashtags">'+hashtags+'</div>':'<div class="empty">Todavía no hay hashtags públicos recientes.</div>')
      +section('Comunidades activas','/comunidades',communities?'<div class="grid">'+communities+'</div>':'<div class="empty">Todavía no hay comunidades públicas activas.</div>')
      +section('Próximos eventos','/eventos',events?'<div class="grid">'+events+'</div>':'<div class="empty">Todavía no hay eventos públicos próximos.</div>');

    res.type('html').send(shell(req,{title:'Descubrir — RedLibertad',description,body,jsonLd}));
  }catch(err){
    console.error('RedLibertad public discovery error:',err);
    res.status(500).send('No se pudo cargar Descubrir.');
  }
});

module.exports=router;
