const express=require('express');
const db=require('./db');

const router=express.Router();

const INTERESTS=['Arte','Fotografía','Naturismo','Moda','Fitness','Viajes','Música','Lifestyle','Belleza','Creatividad','Tecnología','Bienestar'];

const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin=req=>String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');
const abs=(req,v='')=>!v?'':/^https?:\/\//i.test(v)?v:origin(req)+(v.startsWith('/')?'':'/')+v;
const slug=(v='')=>String(v||'tema').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'tema';
const short=(v='',n=150)=>{const x=String(v||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n-1).trimEnd()+'…':x;};
const topicFor=s=>INTERESTS.find(x=>slug(x)===String(s||'').toLowerCase())||null;
const reelName=x=>short(x.caption||'',70)||('Reel de '+String(x.display_name||x.username||'RedLibertad'));
const reelPath=x=>'/reel/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(reelName(x)));
const communityPath=x=>'/comunidad/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.name));

function shell(req,{title,description,canonical,robots='index,follow,max-image-preview:large,max-video-preview:-1',body,jsonLd=''}) {
  const o=origin(req);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+esc(robots)+'"><link rel="canonical" href="'+esc(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(o+'/assets/og-redlibertad.png')+'"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"><script defer src="/public-share-v187.js"></script>'+jsonLd+'<style>.th{min-height:100vh;background:var(--bg);color:var(--navy)}.tt{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.95);backdrop-filter:blur(14px)}.tb{display:flex;gap:8px;align-items:center;color:inherit;text-decoration:none;font-weight:900}.tb img{width:32px;height:32px}.ta{display:flex;gap:7px;flex-wrap:nowrap}.ta .button{min-width:0;white-space:nowrap;padding:9px 12px}.wrap{width:min(1120px,calc(100% - 28px));margin:auto;padding:38px 0 72px}.topic-hero{display:grid;grid-template-columns:1fr minmax(300px,.6fr);gap:22px;align-items:end;margin-bottom:22px}.topic-hero h1{font:800 clamp(34px,5vw,54px) Manrope,sans-serif;line-height:1.04;margin:6px 0 10px}.muted{color:var(--muted);line-height:1.6}.topic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.topic-card,.card{border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 9px 25px rgba(13,34,56,.05);overflow:hidden}.topic-card a,.card a.main{display:block;color:inherit;text-decoration:none;padding:16px}.topic-card h2,.card h3{margin:7px 0}.tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:10px;font-weight:800}.stats{font-size:11px;color:var(--muted);margin-top:8px}.section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:11px}.section h2{font-size:22px;margin:0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.row{display:flex;gap:10px;align-items:center}.avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900;flex:none}.visual{aspect-ratio:16/10;background:#071522;overflow:hidden}.visual img,.visual video{width:100%;height:100%;object-fit:cover;display:block}.empty{padding:28px;border:1px dashed var(--line);border-radius:16px;background:var(--paper);color:var(--muted);text-align:center}.searchbox{display:flex;gap:8px;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--paper)}.searchbox input{flex:1;min-width:0;border:0;background:transparent;padding:10px;outline:0;font:inherit}@media(max-width:900px){.topic-hero{grid-template-columns:1fr}.topic-grid,.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.wrap{width:calc(100% - 20px);padding-top:22px}.topic-grid,.grid{grid-template-columns:1fr}.ta .ghost:nth-child(-n+5){display:none}.tt{padding:9px 10px}.searchbox{display:grid}.searchbox .button{width:100%}}</style></head><body><main class="th"><header class="tt"><a class="tb" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="ta"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="wrap">'+body+'</div></main></body></html>';
}

async function allCounts(){
  const r=await db.query(`
    SELECT t.topic,
      (SELECT count(*)::int
         FROM user_interests ui JOIN users u ON u.id=ui.user_id
        WHERE lower(ui.interest)=lower(t.topic)
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true) people,
      (SELECT count(*)::int
         FROM community_interests ci
         JOIN communities c ON c.id=ci.community_id
         JOIN users owner ON owner.id=c.owner_id
        WHERE lower(ci.interest)=lower(t.topic)
          AND c.privacy='public'
          AND owner.status='active' AND owner.is_admin=false AND owner.discoverable=true) communities,
      (SELECT count(*)::int
         FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
          AND (lower(p.caption) LIKE '%#'||lower(t.topic)||'%' OR lower(p.caption) LIKE '%#'||t.topic_slug||'%')) posts
    FROM unnest($1::text[],$2::text[]) AS t(topic,topic_slug)
  `,[INTERESTS,INTERESTS.map(slug)]);
  return r.rows.map(x=>({topic:x.topic,people:Number(x.people||0),communities:Number(x.communities||0),posts:Number(x.posts||0)}));
}
async function countsFor(topic){
  const rows=await allCounts();
  return rows.find(x=>x.topic===topic)||{topic,people:0,communities:0,posts:0};
}

router.get('/temas',async(req,res)=>{
  try{
    const all=await allCounts();
    const ranked=all.sort((a,b)=>(b.people+b.communities+b.posts)-(a.people+a.communities+a.posts)||a.topic.localeCompare(b.topic,'es'));
    const cards=ranked.map(x=>{
      const total=x.people+x.communities+x.posts;
      return '<article class="topic-card"><a href="/tema/'+encodeURIComponent(slug(x.topic))+'"><span class="tag">TEMA</span><h2>'+esc(x.topic)+'</h2><p class="muted">Personas, comunidades y contenido público relacionado.</p><div class="stats">'+x.people+' personas · '+x.communities+' comunidades · '+x.posts+' publicaciones'+(total<2?' · nuevo':'')+'</div></a></article>';
    }).join('');
    const o=origin(req),description='Explora temas e intereses en RedLibertad y descubre personas, comunidades y contenido público relacionado.';
    const jsonLd='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:'Temas en RedLibertad',itemListElement:ranked.map((x,i)=>({'@type':'ListItem',position:i+1,url:o+'/tema/'+slug(x.topic),name:x.topic}))}).replace(/</g,'\\u003c')+'</script>';
    const body='<section class="topic-hero"><div><span class="eyebrow">TEMAS · INTERESES</span><h1>Encuentra tu tema</h1><p class="muted">'+esc(description)+'</p></div><form class="searchbox" action="/buscar" method="get"><input name="q" minlength="2" placeholder="Buscar en RedLibertad" aria-label="Buscar en RedLibertad"><button class="button" type="submit">Buscar</button></form></section><section class="topic-grid">'+cards+'</section>';
    res.type('html').send(shell(req,{title:'Temas e intereses — RedLibertad',description,canonical:o+'/temas',body,jsonLd}));
  }catch(err){
    console.error('RedLibertad public topics directory error:',err);
    res.status(500).send('No se pudieron cargar los temas.');
  }
});

router.get('/tema/:slug',async(req,res)=>{
  try{
    const topic=topicFor(req.params.slug);
    if(!topic)return res.status(404).send('Tema no encontrado.');
    const canonicalPath='/tema/'+slug(topic);
    if(req.path!==canonicalPath)return res.redirect(301,canonicalPath);
    const [counts,peopleR,communitiesR,postsR]=await Promise.all([
      countsFor(topic),
      db.query(`
        SELECT u.username,u.display_name,u.bio,u.avatar_url,u.creator_verified,
               (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count
        FROM user_interests ui JOIN users u ON u.id=ui.user_id
        WHERE lower(ui.interest)=lower($1)
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
        ORDER BY u.creator_verified DESC,follower_count DESC,u.updated_at DESC
        LIMIT 12
      `,[topic]),
      db.query(`
        SELECT c.id,c.name,c.description,c.avatar_url,c.category,
               (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) member_count
        FROM community_interests ci
        JOIN communities c ON c.id=ci.community_id
        JOIN users owner ON owner.id=c.owner_id
        WHERE lower(ci.interest)=lower($1)
          AND c.privacy='public'
          AND owner.status='active' AND owner.is_admin=false AND owner.discoverable=true
        ORDER BY member_count DESC,c.updated_at DESC,c.id DESC
        LIMIT 12
      `,[topic]),
      db.query(`
        SELECT p.id,p.caption,p.media_url,p.media_type,p.post_kind,p.created_at,u.username,u.display_name,
               (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
               (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
          AND u.status='active' AND u.is_admin=false AND u.discoverable=true
          AND (lower(p.caption) LIKE $1 OR lower(p.caption) LIKE $2)
        ORDER BY p.created_at DESC,p.id DESC
        LIMIT 12
      `,['%#'+topic.toLowerCase()+'%','%#'+slug(topic)+'%'])
    ]);

    const people=peopleR.rows.map(x=>'<article class="card"><a class="main row" href="/perfil/'+encodeURIComponent(x.username)+'">'+(x.avatar_url?'<img class="avatar" src="'+esc(abs(req,x.avatar_url))+'" alt="">':'<span class="avatar">'+esc(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>')+'<span><b>'+esc(x.display_name)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+esc(x.username)+'</span><div class="stats">'+Number(x.follower_count||0)+' seguidores</div></span></a></article>').join('');
    const communities=communitiesR.rows.map(x=>'<article class="card"><a class="main" href="'+esc(communityPath(x))+'"><span class="tag">'+esc(String(x.category||'General').toUpperCase())+'</span><h3>'+esc(x.name)+'</h3><p class="muted">'+esc(short(x.description||'',110))+'</p><div class="stats">'+Number(x.member_count||0)+' miembros</div></a></article>').join('');
    const posts=postsR.rows.map(x=>{
      const href=x.post_kind==='reel'?reelPath(x):'/p/'+encodeURIComponent(x.id);
      const visual=x.media_url?(x.media_type==='image'?'<div class="visual"><img src="'+esc(abs(req,x.media_url))+'" loading="lazy" alt=""></div>':'<div class="visual"><video src="'+esc(abs(req,x.media_url))+'" muted playsinline preload="metadata"></video></div>'):'';
      return '<article class="card">'+visual+'<a class="main" href="'+esc(href)+'"><span class="tag">'+(x.post_kind==='reel'?'REEL':'PUBLICACIÓN')+'</span><h3>'+esc(short(x.caption||('Contenido de '+x.display_name),100))+'</h3><div class="muted">@'+esc(x.username)+'</div><div class="stats">'+Number(x.like_count||0)+' me gusta · '+Number(x.comment_count||0)+' comentarios</div></a></article>';
    }).join('');

    const total=counts.people+counts.communities+counts.posts,indexable=total>=2,o=origin(req),canonical=o+canonicalPath;
    const description='Descubre personas, comunidades y contenido público sobre '+topic+' en RedLibertad.';
    const jsonLd=indexable?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:topic+' en RedLibertad',description,url:canonical,isPartOf:{'@type':'WebSite',name:'RedLibertad',url:o}}).replace(/</g,'\\u003c')+'</script>':'';
    const body='<section class="topic-hero"><div><span class="eyebrow">TEMA · '+esc(topic.toUpperCase())+'</span><h1>'+esc(topic)+'</h1><p class="muted">'+esc(description)+'</p><div class="stats">'+counts.people+' personas · '+counts.communities+' comunidades · '+counts.posts+' publicaciones</div></div><p><a class="button ghost" href="/temas">← Todos los temas</a> <button type="button" class="button ghost" data-public-share data-share-title="'+esc(topic+' — Temas en RedLibertad')+'" data-share-text="'+esc(description)+'">Compartir tema</button> <a class="button" href="/buscar?q='+encodeURIComponent(topic)+'">Buscar '+esc(topic)+'</a></p></section>'
      +'<section class="section"><div class="section-head"><h2>Personas interesadas</h2><a href="/perfiles">Ver personas</a></div>'+(people?'<div class="grid">'+people+'</div>':'<div class="empty">Todavía no hay perfiles públicos para este tema.</div>')+'</section>'
      +'<section class="section"><div class="section-head"><h2>Comunidades</h2><a href="/comunidades">Ver comunidades</a></div>'+(communities?'<div class="grid">'+communities+'</div>':'<div class="empty">Todavía no hay comunidades públicas para este tema.</div>')+'</section>'
      +'<section class="section"><div class="section-head"><h2>Contenido con #'+esc(slug(topic))+'</h2><a href="/publicaciones">Ver publicaciones</a></div>'+(posts?'<div class="grid">'+posts+'</div>':'<div class="empty">Todavía no hay publicaciones públicas etiquetadas con este tema.</div>')+'</section>';
    res.type('html').send(shell(req,{title:topic+' — Temas en RedLibertad',description,canonical,robots:indexable?'index,follow,max-image-preview:large,max-video-preview:-1':'noindex,follow',body,jsonLd}));
  }catch(err){
    console.error('RedLibertad public topic page error:',err);
    res.status(500).send('No se pudo cargar el tema.');
  }
});

router.get('/sitemap-topics.xml',async(req,res)=>{
  try{
    const o=origin(req),eligible=(await allCounts()).filter(c=>c.people+c.communities+c.posts>=2).map(c=>c.topic);
    const urls=eligible.map(topic=>'<url><loc>'+esc(o+'/tema/'+slug(topic))+'</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>');
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>');
  }catch(err){
    console.error('RedLibertad topics sitemap error:',err);
    res.status(500).type('text/plain').send('Topics sitemap unavailable');
  }
});

module.exports=router;
