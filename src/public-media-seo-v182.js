const express=require('express');
const db=require('./db');
const router=express.Router();
let ready=null;

const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin=req=>String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');
const absolute=(req,v='')=>!v?'':/^https?:\/\//i.test(v)?v:origin(req)+(v.startsWith('/')?'':'/')+v;
const slug=(v='')=>String(v||'reel').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'reel';
const short=(v='',n=180)=>{const x=String(v||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n-1).trimEnd()+'…':x;};
const reelName=x=>short(x.caption||'',70)||('Reel de '+String(x.display_name||x.username||'RedLibertad'));
const reelPath=x=>'/reel/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(reelName(x)));
const publicFilter="p.moderation_status='published' AND p.audience='public' AND p.content_level='normal' AND p.media_url IS NOT NULL AND p.media_url<>'' AND u.status='active' AND u.is_admin=false AND u.discoverable=true";

async function ensure(){
  if(!ready)ready=(async()=>{
    await db.query("CREATE INDEX IF NOT EXISTS idx_posts_public_reels_v182 ON posts(created_at DESC,id) WHERE moderation_status='published' AND audience='public' AND content_level='normal' AND post_kind='reel' AND media_type='video'");
    await db.query("CREATE INDEX IF NOT EXISTS idx_posts_public_media_v182 ON posts(created_at DESC,id) WHERE moderation_status='published' AND audience='public' AND content_level='normal'");
  })().catch(e=>{ready=null;throw e;});
  return ready;
}

function shell(req,{title,desc,canonical,robots='index,follow,max-image-preview:large,max-video-preview:-1',ld='',body,video=''}) {
  const o=origin(req),vm=video?'<meta property="og:video" content="'+esc(video)+'">':'';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'"><meta name="robots" content="'+esc(robots)+'"><link rel="canonical" href="'+esc(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(o+'/assets/og-redlibertad.png')+'">'+vm+'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(desc)+'"><meta name="twitter:image" content="'+esc(o+'/assets/og-redlibertad.png')+'"><link rel="stylesheet" href="/styles.css"><script defer src="/public-share-v187.js"></script>'+ld+'<style>.md{min-height:100vh;background:var(--bg);color:var(--navy)}.mt{display:flex;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:var(--paper);position:sticky;top:0;z-index:5}.mb{display:flex;gap:8px;align-items:center;font-weight:900;color:inherit;text-decoration:none}.mb img{width:32px}.ma{display:flex;gap:7px;flex-wrap:wrap}.ms{width:min(1120px,calc(100% - 28px));margin:auto;padding:38px 0 70px}.mh{display:grid;grid-template-columns:1fr minmax(300px,.7fr);gap:20px;align-items:end}.mh h1{font:800 clamp(30px,5vw,50px) Manrope,sans-serif;margin:6px 0}.mf{display:grid;grid-template-columns:1fr auto auto;gap:7px;padding:7px;border:1px solid var(--line);border-radius:15px;background:var(--paper)}.mf input,.mf select{border:0;background:transparent;padding:10px;min-width:0}.mg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.mc{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--paper)}.mc a{color:inherit;text-decoration:none}.mv{aspect-ratio:4/5;background:#071522;position:relative;overflow:hidden}.mv img,.mv video{width:100%;height:100%;object-fit:cover;display:block}.mp{position:absolute;left:10px;bottom:10px;background:#071522dd;color:#fff;border-radius:99px;padding:6px 9px;font-size:11px;font-weight:800}.cp{padding:13px}.tag{display:inline-block;background:#2bb7a91d;color:#0c675b;border-radius:99px;padding:5px 8px;font-size:10px}.muted{color:var(--muted);line-height:1.55}.pager{display:flex;justify-content:center;gap:8px;margin-top:22px}.empty{padding:30px;text-align:center;border:1px dashed var(--line);border-radius:16px;margin-top:16px}.rh{display:grid;grid-template-columns:minmax(0,.72fr) minmax(280px,.45fr);gap:22px}.rp{background:#071522;border-radius:20px;overflow:hidden}.rp video{display:block;width:100%;max-height:78vh}.rm{padding:20px;border:1px solid var(--line);border-radius:20px;background:var(--paper)}.creator{display:flex;gap:10px;align-items:center;margin:16px 0}.creator img,.creator .av{width:46px;height:46px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff}@media(max-width:850px){.mg{grid-template-columns:repeat(2,1fr)}.mh,.rh{grid-template-columns:1fr}}@media(max-width:620px){.ms{width:calc(100% - 20px)}.mg{grid-template-columns:1fr}.mf{grid-template-columns:1fr}.ma .ghost:nth-child(-n+4){display:none}}</style></head><body><main class="md"><header class="mt"><a class="mb" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="ma"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="ms">'+body+'</div></main></body></html>';
}

function card(req,x){
  const src=absolute(req,x.media_url);
  const visual=x.media_type==='image'?'<img src="'+esc(src)+'" loading="lazy" decoding="async" alt="">':'<video src="'+esc(src)+'" preload="metadata" muted playsinline></video><span class="mp">▶ '+(x.post_kind==='reel'?'Reel':'Vídeo')+'</span>';
  const href=x.post_kind==='reel'?reelPath(x):'/p/'+encodeURIComponent(x.id);
  return '<article class="mc"><a href="'+esc(href)+'"><div class="mv">'+visual+'</div><div class="cp"><span class="tag">'+(x.post_kind==='reel'?'REEL':x.media_type==='image'?'FOTO':'VÍDEO')+'</span><h2>'+esc(short(x.caption||('Contenido de '+x.display_name),90))+'</h2><div class="muted">@'+esc(x.username)+' · '+Number(x.like_count||0)+' me gusta · '+Number(x.comment_count||0)+' comentarios'+(x.post_kind==='reel'?' · '+Number(x.view_count||0)+' vistas':'')+'</div></div></a></article>';
}

async function list(req,res,mode){
  await ensure();
  const o=origin(req),q=String(req.query.q||'').trim().slice(0,100),tipo=mode==='media'&&['all','image','video'].includes(String(req.query.tipo||''))?String(req.query.tipo):'all';
  const pageReq=Math.max(1,Math.min(500,parseInt(req.query.page||'1',10)||1)),size=24,pattern=q?'%'+q.toLowerCase()+'%':null;
  const extra=mode==='reels'?" AND p.post_kind='reel' AND p.media_type='video'":" AND ($2::text='all' OR p.media_type=$2)";
  const search=" AND ($1::text IS NULL OR lower(p.caption) LIKE $1 OR lower(u.display_name) LIKE $1 OR lower(u.username) LIKE $1)";
  const from=' FROM posts p JOIN users u ON u.id=p.user_id WHERE '+publicFilter+extra+search;
  const baseParams=mode==='reels'?[pattern]:[pattern,tipo];
  const cr=await db.query('SELECT count(*)::int n'+from,baseParams),total=Number(cr.rows[0]?.n||0),pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pageReq,pages),offset=(page-1)*size;
  const lim=mode==='reels'?'$2':'$3',off=mode==='reels'?'$3':'$4';
  const select="SELECT p.id,p.caption,p.media_url,p.media_type,p.post_kind,p.created_at,u.username,u.display_name,(SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,(SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,(SELECT count(*)::int FROM reel_views rv WHERE rv.post_id=p.id) view_count";
  const order=mode==='reels'?" ORDER BY view_count DESC,p.created_at DESC,p.id DESC":" ORDER BY p.created_at DESC,p.id DESC";
  const r=await db.query(select+from+order+' LIMIT '+lim+' OFFSET '+off,[...baseParams,size,offset]);
  const base=mode==='reels'?'/reels':'/multimedia',filtered=!!q||(mode==='media'&&tipo!=='all'),canonical=page>1&&!filtered?o+base+'?page='+page:o+base;
  const title=mode==='reels'?'Reels públicos — RedLibertad':'Multimedia pública — RedLibertad',desc=mode==='reels'?'Descubre Reels públicos normales de perfiles descubribles en RedLibertad.':'Explora fotos y vídeos públicos normales compartidos en RedLibertad.';
  const params=n=>{const p=new URLSearchParams();if(n>1)p.set('page',n);if(q)p.set('q',q);if(mode==='media'&&tipo!=='all')p.set('tipo',tipo);return base+(p.toString()?'?'+p:'');};
  const filter=mode==='media'?'<select name="tipo"><option value="all" '+(tipo==='all'?'selected':'')+'>Todo</option><option value="image" '+(tipo==='image'?'selected':'')+'>Fotos</option><option value="video" '+(tipo==='video'?'selected':'')+'>Vídeos</option></select>':'<input type="hidden" name="tipo" value="all">';
  const ld=!filtered&&page===1?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:title.replace(' — RedLibertad',''),itemListElement:r.rows.map((x,i)=>({'@type':'ListItem',position:i+1,url:o+(x.post_kind==='reel'?reelPath(x):'/p/'+x.id),name:short(x.caption||reelName(x),100)}))}).replace(/</g,'\\u003c')+'</script>':'';
  const body='<section class="mh"><div><span class="eyebrow">'+(mode==='reels'?'REELS · VÍDEO PÚBLICO':'FOTOS · VÍDEOS · REELS')+'</span><h1>'+(mode==='reels'?'Reels públicos':'Multimedia pública')+'</h1><p class="muted">'+esc(desc)+'</p><a class="button ghost small" href="'+(mode==='reels'?'/multimedia':'/reels')+'">'+(mode==='reels'?'Ver toda la multimedia':'Ver solo Reels')+'</a></div><form class="mf" action="'+base+'" method="get"><input name="q" value="'+esc(q)+'" placeholder="Buscar contenido o creador">'+filter+'<button class="button">Buscar</button></form></section><p class="muted">'+total+' resultados públicos</p>'+(r.rows.length?'<section class="mg">'+r.rows.map(x=>card(req,x)).join('')+'</section>':'<div class="empty"><b>No encontramos contenido público.</b></div>')+'<nav class="pager">'+(page>1?'<a class="button ghost small" rel="prev" href="'+esc(params(page-1))+'">← Anterior</a>':'')+'<span class="muted">Página '+page+' de '+pages+'</span>'+(page<pages?'<a class="button ghost small" rel="next" href="'+esc(params(page+1))+'">Siguiente →</a>':'')+'</nav>';
  res.type('html').send(shell(req,{title,desc,canonical,robots:filtered?'noindex,follow':'index,follow,max-image-preview:large,max-video-preview:-1',ld,body}));
}

router.get('/reels',async(req,res)=>{try{await list(req,res,'reels');}catch(e){console.error('RedLibertad public reels error:',e);res.status(500).send('No se pudo cargar Reels.');}});
router.get('/multimedia',async(req,res)=>{try{await list(req,res,'media');}catch(e){console.error('RedLibertad public multimedia error:',e);res.status(500).send('No se pudo cargar multimedia.');}});

router.get(['/reel/:id','/reel/:id/:slug'],async(req,res)=>{
  try{
    await ensure();
    const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(404).send('Reel no encontrado.');
    const r=await db.query("SELECT p.id,p.caption,p.media_url,p.created_at,p.updated_at,u.username,u.display_name,u.avatar_url,u.creator_verified,(SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,(SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,(SELECT count(*)::int FROM reposts rp WHERE rp.post_id=p.id) repost_count,(SELECT count(*)::int FROM reel_views rv WHERE rv.post_id=p.id) view_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND "+publicFilter+" AND p.post_kind='reel' AND p.media_type='video' LIMIT 1",[id]);
    if(!r.rowCount)return res.status(404).send('Reel no encontrado.');
    const x=r.rows[0],wanted=slug(reelName(x)),path=reelPath(x);if(req.params.slug!==wanted)return res.redirect(301,path);
    const o=origin(req),video=absolute(req,x.media_url),canonical=o+path,desc=short(x.caption||('Reel público de '+x.display_name+' en RedLibertad.'),180);
    const avatar=x.avatar_url?'<img src="'+esc(absolute(req,x.avatar_url))+'" alt="">':'<span class="av">'+esc(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>';
    const ld='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'VideoObject',name:reelName(x),description:desc,uploadDate:new Date(x.created_at).toISOString(),contentUrl:video,thumbnailUrl:o+'/assets/og-redlibertad.png',author:{'@type':'Person',name:x.display_name||x.username,url:o+'/perfil/'+encodeURIComponent(x.username)}}).replace(/</g,'\\u003c')+'</script>';
    const body='<section class="rh"><div class="rp"><video src="'+esc(video)+'" controls playsinline preload="metadata"></video></div><aside class="rm"><span class="eyebrow">REEL PÚBLICO</span><h1>'+esc(reelName(x))+'</h1><a class="creator" href="/perfil/'+encodeURIComponent(x.username)+'">'+avatar+'<span><b>'+esc(x.display_name||x.username)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+esc(x.username)+'</span></span></a><p class="muted">'+esc(x.caption||'Sin texto adicional.').replace(/\n/g,'<br>')+'</p><p class="muted"><b>'+Number(x.view_count||0)+'</b> vistas · <b>'+Number(x.like_count||0)+'</b> me gusta · <b>'+Number(x.comment_count||0)+'</b> comentarios · <b>'+Number(x.repost_count||0)+'</b> republicaciones</p><a class="button" href="/#registro">Crear cuenta para participar</a> <button type="button" class="button ghost" data-public-share data-share-title="'+esc(reelName(x)+' — Reel en RedLibertad')+'" data-share-text="'+esc(desc)+'">Compartir Reel</button> <a class="button ghost" href="/reels">Más Reels</a></aside></section>';
    res.type('html').send(shell(req,{title:reelName(x)+' — Reel en RedLibertad',desc,canonical,ld,body,video}));
  }catch(e){console.error('RedLibertad public reel page error:',e);res.status(500).send('No se pudo cargar el Reel.');}
});

router.get('/sitemap-reels.xml',async(req,res)=>{
  try{
    await ensure();const o=origin(req);
    const r=await db.query("SELECT p.id,p.caption,p.updated_at,u.username,u.display_name FROM posts p JOIN users u ON u.id=p.user_id WHERE "+publicFilter+" AND p.post_kind='reel' AND p.media_type='video' ORDER BY p.updated_at DESC,p.id DESC LIMIT 5000");
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+r.rows.map(x=>'<url><loc>'+esc(o+reelPath(x))+'</loc><lastmod>'+new Date(x.updated_at).toISOString()+'</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>').join('')+'</urlset>');
  }catch(e){console.error('RedLibertad reels sitemap error:',e);res.status(500).type('text/plain').send('Reels sitemap unavailable');}
});

module.exports=router;
