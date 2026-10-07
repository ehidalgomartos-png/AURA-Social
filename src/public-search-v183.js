const express=require('express');
const db=require('./db');

const router=express.Router();

function e(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function origin(req){return String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');}
function abs(req,v=''){if(!v)return '';if(/^https?:\/\//i.test(v))return v;return origin(req)+(v.startsWith('/')?'':'/')+v;}
function slug(v=''){return String(v||'contenido').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'contenido';}
function short(v='',n=160){const x=String(v||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n-1).trimEnd()+'…':x;}
function reelName(x){return short(x.caption||'',70)||('Reel de '+String(x.display_name||x.username||'RedLibertad'));}
function reelPath(x){return '/reel/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(reelName(x)));}
function communityPath(x){return '/comunidad/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.name));}
function eventPath(x){return '/evento/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.title));}

function shell(req,{title,description,canonical,robots,body,jsonLd=''}) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+e(title)+'</title><meta name="description" content="'+e(description)+'"><meta name="robots" content="'+e(robots)+'"><link rel="canonical" href="'+e(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website"><meta property="og:title" content="'+e(title)+'"><meta property="og:description" content="'+e(description)+'"><meta property="og:url" content="'+e(canonical)+'"><meta property="og:image" content="'+e(origin(req)+'/assets/og-redlibertad.png')+'"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css">'+jsonLd+'<style>.ps{min-height:100vh;background:var(--bg);color:var(--navy)}.pt{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.95);backdrop-filter:blur(14px)}.pb{display:flex;gap:8px;align-items:center;color:inherit;text-decoration:none;font-weight:900}.pb img{width:32px;height:32px}.pa{display:flex;gap:7px;flex-wrap:nowrap}.pa .button{min-width:0;white-space:nowrap;padding:9px 12px}.wrap{width:min(1120px,calc(100% - 28px));margin:auto;padding:40px 0 70px}.search-hero{display:grid;grid-template-columns:1fr minmax(360px,.8fr);gap:22px;align-items:end;margin-bottom:22px}.search-hero h1{font:800 clamp(32px,5vw,52px) Manrope,sans-serif;margin:5px 0 9px}.muted{color:var(--muted);line-height:1.6}.sf{display:grid;grid-template-columns:1fr auto auto;gap:7px;padding:7px;border:1px solid var(--line);border-radius:16px;background:var(--paper)}.sf input,.sf select{min-width:0;border:0;background:transparent;padding:11px;outline:0;font:inherit}.tabs{display:flex;gap:7px;flex-wrap:wrap;margin:18px 0}.tabs a{padding:8px 11px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:inherit;font-size:12px;font-weight:800;background:var(--paper)}.tabs a.active{background:var(--navy);color:#fff}.section{margin-top:26px}.section-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:10px}.section h2{margin:0;font-size:21px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.card{border:1px solid var(--line);border-radius:16px;background:var(--paper);box-shadow:0 8px 22px rgba(13,34,56,.05);overflow:hidden}.card a.main{display:block;padding:14px;color:inherit;text-decoration:none}.row{display:flex;gap:11px;align-items:center}.avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900;flex:none}.media{aspect-ratio:16/10;background:#071522;overflow:hidden}.media img,.media video{width:100%;height:100%;object-fit:cover;display:block}.card h3{margin:7px 0;font-size:16px}.tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:10px;font-weight:800;margin:2px 4px 2px 0}.stats{font-size:11px;color:var(--muted);margin-top:7px}.empty{padding:34px;border:1px dashed var(--line);border-radius:16px;text-align:center;background:var(--paper);color:var(--muted)}.intro{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-top:24px}.intro a{display:block;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--paper);color:inherit;text-decoration:none}.notice{padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--paper);margin-top:12px}@media(max-width:900px){.search-hero{grid-template-columns:1fr}.grid,.intro{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.wrap{width:calc(100% - 20px);padding-top:24px}.grid,.intro{grid-template-columns:1fr}.sf{grid-template-columns:1fr}.pa .ghost:nth-child(-n+5){display:none}.pt{padding:9px 10px}}</style></head><body><main class="ps"><header class="pt"><a class="pb" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="pa"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="wrap">'+body+'</div></main></body></html>';
}

function section(title,count,viewMore,html){
  if(!html)return '';
  return '<section class="section"><div class="section-head"><h2>'+e(title)+'</h2><span class="muted">'+Number(count||0)+' resultado'+(Number(count||0)===1?'':'s')+(viewMore?' · <a href="'+e(viewMore)+'">Ver más</a>':'')+'</span></div><div class="grid">'+html+'</div></section>';
}

router.get('/buscar',async(req,res)=>{
  try{
    const raw=String(req.query.q||'').normalize('NFKC').trim().slice(0,100);
    const type=['all','people','posts','reels','hashtags','communities','events'].includes(String(req.query.type||''))?String(req.query.type):'all';
    const o=origin(req),hasQuery=raw.length>0,valid=raw.length>=2,like='%'+raw+'%',prefix=raw+'%',limit=type==='all'?6:24;
    const wants=x=>type==='all'||type===x;
    const empty={rows:[]};

    let people=empty,posts=empty,reels=empty,communities=empty,events=empty,hashtags=[];
    if(valid){
      [people,posts,reels,communities,events]=await Promise.all([
        wants('people')?db.query(`
          SELECT u.username,u.display_name,u.bio,u.avatar_url,u.creator_headline,u.creator_verified,u.age_verified,
                 (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count
          FROM users u
          WHERE u.status='active' AND u.is_admin=false AND u.discoverable=true
            AND (u.username ILIKE $1 OR u.display_name ILIKE $1 OR u.bio ILIKE $1 OR u.creator_headline ILIKE $1)
          ORDER BY CASE WHEN u.username ILIKE $2 THEN 0 WHEN u.display_name ILIKE $2 THEN 1 ELSE 2 END,u.creator_verified DESC,u.username
          LIMIT $3
        `,[like,prefix,limit]):Promise.resolve(empty),
        wants('posts')?db.query(`
          SELECT p.id,p.caption,p.created_at,u.username,u.display_name,u.avatar_url,u.creator_verified,
                 (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
                 (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
          FROM posts p JOIN users u ON u.id=p.user_id
          WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
            AND p.post_kind<>'reel' AND u.status='active' AND u.is_admin=false AND u.discoverable=true
            AND (p.caption ILIKE $1 OR u.username ILIKE $1 OR u.display_name ILIKE $1)
          ORDER BY CASE WHEN p.caption ILIKE $2 THEN 0 ELSE 1 END,p.created_at DESC,p.id DESC
          LIMIT $3
        `,[like,prefix,limit]):Promise.resolve(empty),
        wants('reels')?db.query(`
          SELECT p.id,p.caption,p.media_url,p.created_at,u.username,u.display_name,u.avatar_url,u.creator_verified,
                 (SELECT count(*)::int FROM reel_views rv WHERE rv.post_id=p.id) view_count
          FROM posts p JOIN users u ON u.id=p.user_id
          WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
            AND p.post_kind='reel' AND p.media_type='video' AND p.media_url IS NOT NULL AND p.media_url<>''
            AND u.status='active' AND u.is_admin=false AND u.discoverable=true
            AND (p.caption ILIKE $1 OR u.username ILIKE $1 OR u.display_name ILIKE $1)
          ORDER BY CASE WHEN p.caption ILIKE $2 THEN 0 ELSE 1 END,view_count DESC,p.created_at DESC,p.id DESC
          LIMIT $3
        `,[like,prefix,limit]):Promise.resolve(empty),
        wants('communities')?db.query(`
          SELECT c.id,c.name,c.description,c.avatar_url,c.category,c.updated_at,
                 (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) member_count
          FROM communities c JOIN users owner ON owner.id=c.owner_id
          WHERE c.privacy='public' AND owner.status='active' AND owner.is_admin=false AND owner.discoverable=true
            AND (c.name ILIKE $1 OR c.description ILIKE $1 OR c.category ILIKE $1 OR EXISTS(
              SELECT 1 FROM community_interests ci WHERE ci.community_id=c.id AND ci.interest ILIKE $1
            ))
          ORDER BY CASE WHEN c.name ILIKE $2 THEN 0 ELSE 1 END,c.updated_at DESC,c.id DESC
          LIMIT $3
        `,[like,prefix,limit]):Promise.resolve(empty),
        wants('events')?db.query(`
          SELECT ev.id,ev.title,ev.description,ev.event_type,ev.starts_at,ev.location_label,creator.username,creator.display_name
          FROM social_events ev JOIN users creator ON creator.id=ev.creator_id
          WHERE ev.visibility='public' AND ev.cancelled_at IS NULL AND ev.starts_at>=now()-interval '2 hours'
            AND creator.status='active' AND creator.discoverable=true
            AND (ev.community_id IS NULL OR EXISTS(
              SELECT 1 FROM communities pc JOIN users po ON po.id=pc.owner_id
              WHERE pc.id=ev.community_id AND pc.privacy='public' AND po.status='active' AND po.is_admin=false AND po.discoverable=true
            ))
            AND (ev.title ILIKE $1 OR ev.description ILIKE $1 OR COALESCE(ev.location_label,'') ILIKE $1 OR creator.username ILIKE $1 OR creator.display_name ILIKE $1)
          ORDER BY CASE WHEN ev.title ILIKE $2 THEN 0 ELSE 1 END,ev.starts_at ASC,ev.id ASC
          LIMIT $3
        `,[like,prefix,limit]):Promise.resolve(empty)
      ]);

      if(wants('hashtags')){
        const hr=await db.query(`
          SELECT p.caption
          FROM posts p JOIN users u ON u.id=p.user_id
          WHERE p.moderation_status='published' AND p.audience='public' AND p.content_level='normal'
            AND u.status='active' AND u.is_admin=false AND u.discoverable=true
            AND p.caption ILIKE $1
          ORDER BY p.created_at DESC
          LIMIT 160
        `,['%#%'+raw.replace(/^#/,'')+'%']);
        const needle=raw.replace(/^#/,'').toLowerCase(),counts=new Map(),rx=/#([\\p{L}\\p{N}_]{2,40})/gu;
        for(const row of hr.rows){
          for(const m of String(row.caption||'').matchAll(rx)){
            const tag=m[1].normalize('NFKC').toLowerCase();
            if(!tag.includes(needle))continue;
            counts.set(tag,(counts.get(tag)||0)+1);
          }
        }
        hashtags=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es')).slice(0,limit).map(([tag,count])=>({tag,count}));
      }
    }

    const personCards=people.rows.map(x=>'<article class="card"><a class="main row" href="/perfil/'+encodeURIComponent(x.username)+'">'+(x.avatar_url?'<img class="avatar" src="'+e(abs(req,x.avatar_url))+'" alt="">':'<span class="avatar">'+e(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>')+'<span><b>'+e(x.display_name)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+e(x.username)+'</span><div class="stats">'+Number(x.follower_count||0)+' seguidores</div></span></a></article>').join('');
    const postCards=posts.rows.map(x=>'<article class="card"><a class="main" href="/p/'+encodeURIComponent(x.id)+'"><span class="tag">PUBLICACIÓN</span><h3>'+e(short(x.caption||('Publicación de '+x.display_name),100))+'</h3><div class="muted">@'+e(x.username)+'</div><div class="stats">'+Number(x.like_count||0)+' me gusta · '+Number(x.comment_count||0)+' comentarios</div></a></article>').join('');
    const reelCards=reels.rows.map(x=>'<article class="card"><a class="main" href="'+e(reelPath(x))+'">'+(x.media_url?'<div class="media"><video src="'+e(abs(req,x.media_url))+'" muted playsinline preload="metadata"></video></div>':'')+'<span class="tag">REEL</span><h3>'+e(reelName(x))+'</h3><div class="muted">@'+e(x.username)+'</div><div class="stats">'+Number(x.view_count||0)+' vistas</div></a></article>').join('');
    const communityCards=communities.rows.map(x=>'<article class="card"><a class="main" href="'+e(communityPath(x))+'"><span class="tag">'+e(String(x.category||'General').toUpperCase())+'</span><h3>'+e(x.name)+'</h3><p class="muted">'+e(short(x.description||'',110))+'</p><div class="stats">'+Number(x.member_count||0)+' miembros</div></a></article>').join('');
    const eventCards=events.rows.map(x=>'<article class="card"><a class="main" href="'+e(eventPath(x))+'"><span class="tag">'+(x.event_type==='online'?'ONLINE':'PRESENCIAL')+'</span><h3>'+e(x.title)+'</h3><p class="muted">'+e(short(x.description||'',110))+'</p><div class="stats">'+e(new Date(x.starts_at).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}))+' · @'+e(x.username)+'</div></a></article>').join('');
    const hashtagCards=hashtags.map(x=>'<article class="card"><a class="main" href="/hashtag/'+encodeURIComponent(x.tag)+'"><span class="tag">HASHTAG</span><h3>#'+e(x.tag)+'</h3><div class="stats">'+Number(x.count||0)+' coincidencias recientes</div></a></article>').join('');

    const total=people.rows.length+posts.rows.length+reels.rows.length+communities.rows.length+events.rows.length+hashtags.length;
    const typeLabel={all:'Todo',people:'Personas',posts:'Publicaciones',reels:'Reels',hashtags:'Hashtags',communities:'Comunidades',events:'Eventos'}[type]||'Todo';
    const tabs=['all','people','posts','reels','hashtags','communities','events'].map(x=>{
      const label={all:'Todo',people:'Personas',posts:'Publicaciones',reels:'Reels',hashtags:'# Hashtags',communities:'Comunidades',events:'Eventos'}[x];
      const href=raw?'/buscar?q='+encodeURIComponent(raw)+'&type='+x:'/buscar';
      return '<a class="'+(type===x?'active':'')+'" href="'+e(href)+'">'+label+'</a>';
    }).join('');

    const form='<form class="sf" method="get" action="/buscar"><input name="q" value="'+e(raw)+'" maxlength="100" placeholder="Buscar personas, publicaciones, comunidades..." aria-label="Buscar en RedLibertad"><select name="type" aria-label="Tipo de resultado">'+['all','people','posts','reels','hashtags','communities','events'].map(x=>'<option value="'+x+'" '+(type===x?'selected':'')+'>'+({all:'Todo',people:'Personas',posts:'Publicaciones',reels:'Reels',hashtags:'Hashtags',communities:'Comunidades',events:'Eventos'}[x])+'</option>').join('')+'</select><button class="button" type="submit">Buscar</button></form>';

    let results='';
    if(!hasQuery){
      results='<section class="intro"><a href="/descubrir"><b>Descubrir ahora</b><p class="muted">Tendencias, personas nuevas, Reels, comunidades y eventos.</p></a><a href="/perfiles"><b>Personas</b><p class="muted">Perfiles que han elegido ser descubribles.</p></a><a href="/publicaciones"><b>Publicaciones</b><p class="muted">Contenido público normal.</p></a><a href="/reels"><b>Reels</b><p class="muted">Vídeos públicos de la comunidad.</p></a><a href="/comunidades"><b>Comunidades</b><p class="muted">Grupos públicos por intereses.</p></a><a href="/eventos"><b>Eventos</b><p class="muted">Encuentros públicos próximos.</p></a><a href="/multimedia"><b>Multimedia</b><p class="muted">Fotos y vídeos públicos.</p></a></section>';
    }else if(!valid){
      results='<div class="notice">Escribe al menos 2 caracteres para buscar.</div>';
    }else if(total===0){
      results='<div class="empty"><b>No encontramos resultados públicos para “'+e(raw)+'”.</b><p>Prueba con otro término o una categoría distinta.</p></div>';
    }else{
      const more=(kind,path)=>type==='all'&&raw?path+'?q='+encodeURIComponent(raw):'';
      results=section('Personas',people.rows.length,more('people','/perfiles'),personCards)
        +section('Publicaciones',posts.rows.length,more('posts','/publicaciones'),postCards)
        +section('Reels',reels.rows.length,more('reels','/reels'),reelCards)
        +section('Hashtags',hashtags.length,'',hashtagCards)
        +section('Comunidades',communities.rows.length,more('communities','/comunidades'),communityCards)
        +section('Eventos',events.rows.length,more('events','/eventos'),eventCards);
    }

    const title=hasQuery?'Buscar “'+raw+'” — RedLibertad':'Buscar en RedLibertad';
    const description=hasQuery?'Resultados públicos para “'+raw+'” en RedLibertad.':'Busca personas, publicaciones, Reels, hashtags, comunidades y eventos públicos en RedLibertad.';
    const canonical=o+'/buscar';
    const robots=hasQuery||type!=='all'?'noindex,follow':'index,follow,max-image-preview:large';
    const jsonLd=!hasQuery?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'RedLibertad',url:o,potentialAction:{'@type':'SearchAction',target:o+'/buscar?q={search_term_string}','query-input':'required name=search_term_string'}}).replace(/</g,'\\u003c')+'</script>':'';
    const body='<section class="search-hero"><div><span class="eyebrow">DESCUBRIR · BUSCAR</span><h1>Busca en RedLibertad</h1><p class="muted">'+e(description)+'</p></div>'+form+'</section>'+(hasQuery?'<div class="tabs">'+tabs+'</div><p class="muted">'+total+' resultados públicos · '+e(typeLabel)+'</p>':'')+results;
    res.type('html').send(shell(req,{title,description,canonical,robots,body,jsonLd}));
  }catch(err){
    console.error('RedLibertad public search error:',err);
    res.status(500).send('No se pudo completar la búsqueda pública.');
  }
});

module.exports=router;
