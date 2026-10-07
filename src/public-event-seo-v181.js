const express=require('express');
const db=require('./db');

const router=express.Router();
let ready=null;

function e(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function origin(req){return String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');}
function abs(req,v=''){if(!v)return '';if(/^https?:\/\//i.test(v))return v;return origin(req)+(v.startsWith('/')?'':'/')+v;}
function slug(v=''){return String(v||'evento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'evento';}
function pathFor(x){return '/evento/'+encodeURIComponent(x.id)+'/'+encodeURIComponent(slug(x.title));}
function communityPath(x){return x.community_id&&x.community_name?'/comunidad/'+encodeURIComponent(x.community_id)+'/'+encodeURIComponent(slug(x.community_name)):'';}
function fmt(v){try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}).format(new Date(v));}catch(_){return new Date(v).toISOString();}}
function isRecentOrFuture(x){const end=x.ends_at?new Date(x.ends_at).getTime():new Date(x.starts_at).getTime();return Number.isFinite(end)&&end>=Date.now()-30*24*60*60*1000;}

async function ensure(){
  if(!ready){
    ready=(async()=>{
      await db.query("CREATE INDEX IF NOT EXISTS idx_social_events_public_start_v181 ON social_events(starts_at,id) WHERE visibility='public' AND cancelled_at IS NULL");
      await db.query("CREATE INDEX IF NOT EXISTS idx_social_events_public_updated_v181 ON social_events(updated_at DESC,id) WHERE visibility='public' AND cancelled_at IS NULL");
    })().catch(err=>{ready=null;throw err;});
  }
  return ready;
}

function eligibility(alias='e'){
  return alias+".visibility='public' AND "+alias+".cancelled_at IS NULL AND creator.status='active' AND creator.discoverable=true AND ("+alias+".community_id IS NULL OR EXISTS(SELECT 1 FROM communities pc JOIN users pc_owner ON pc_owner.id=pc.owner_id WHERE pc.id="+alias+".community_id AND pc.privacy='public' AND pc_owner.status='active' AND pc_owner.is_admin=false AND pc_owner.discoverable=true))";
}

function shell(req,{title,description,canonical,robots='index,follow,max-image-preview:large',jsonLd='',body}){
  const o=origin(req);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+e(title)+'</title><meta name="description" content="'+e(description)+'"><meta name="robots" content="'+e(robots)+'"><link rel="canonical" href="'+e(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website"><meta property="og:title" content="'+e(title)+'"><meta property="og:description" content="'+e(description)+'"><meta property="og:url" content="'+e(canonical)+'"><meta property="og:image" content="'+e(o+'/assets/og-redlibertad.png')+'"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+e(title)+'"><meta name="twitter:description" content="'+e(description)+'"><meta name="twitter:image" content="'+e(o+'/assets/og-redlibertad.png')+'"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><script defer src="/public-share-v187.js"></script>'+jsonLd+'<style>.pe{min-height:100vh;background:var(--bg);color:var(--navy)}.pet{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.95);backdrop-filter:blur(14px)}.peb{display:flex;gap:8px;align-items:center;text-decoration:none;color:inherit;font-weight:900}.peb img{width:32px;height:32px}.pea{display:flex;gap:7px;flex-wrap:wrap}.pes{width:min(1120px,calc(100% - 28px));margin:auto;padding:40px 0 70px}.peh{display:grid;grid-template-columns:1fr minmax(320px,.7fr);gap:20px;align-items:end;margin-bottom:24px}.peh h1{font:800 clamp(30px,5vw,50px) Manrope,sans-serif;margin:4px 0 8px}.muted{color:var(--muted);line-height:1.6}.pef{display:grid;grid-template-columns:1fr auto auto;gap:7px;padding:7px;border:1px solid var(--line);border-radius:15px;background:var(--paper)}.pef input,.pef select{min-width:0;border:0;background:transparent;padding:10px;outline:0;font:inherit}.peg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.pec{border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 9px 25px rgba(13,34,56,.05);overflow:hidden}.pec a.main{display:block;padding:16px;color:inherit;text-decoration:none}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:10px;margin:2px 4px 2px 0}.pec h2{font-size:18px;margin:8px 0}.when{font-weight:800;margin:8px 0}.stats{font-size:11px;color:var(--muted);margin-top:10px}.pager{display:flex;justify-content:center;gap:8px;align-items:center;margin-top:22px}.hero{display:grid;grid-template-columns:1fr minmax(280px,.48fr);gap:20px;padding:22px;border:1px solid var(--line);border-radius:22px;background:var(--paper)}.meta{display:grid;gap:10px}.meta div{padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.45)}.section{margin-top:24px}.creator{display:flex;gap:10px;align-items:center}.creator img,.creator span.av{width:46px;height:46px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900}.empty{padding:30px;border:1px dashed var(--line);border-radius:16px;text-align:center;color:var(--muted);background:var(--paper)}@media(max-width:900px){.peg{grid-template-columns:repeat(2,1fr)}.peh,.hero{grid-template-columns:1fr}}@media(max-width:620px){.pes{width:calc(100% - 20px);padding-top:24px}.peg{grid-template-columns:1fr}.pet{padding:9px 10px}.pea .ghost:nth-child(-n+3){display:none}.pef{grid-template-columns:1fr}.pef .button{width:100%}}</style></head><body><main class="pe"><header class="pet"><a class="peb" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="pea"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="pes">'+body+'</div></main></body></html>';
}

router.get('/eventos',async(req,res)=>{
  try{
    await ensure();
    const o=origin(req);
    const q=String(req.query.q||'').trim().slice(0,100);
    const tipo=['all','in_person','online'].includes(String(req.query.tipo||''))?String(req.query.tipo):'all';
    const requested=Math.max(1,Math.min(500,parseInt(req.query.page||'1',10)||1));
    const size=24,pattern=q?'%'+q.toLowerCase()+'%':null;
    const filter=eligibility('e')+" AND e.starts_at>=now()-interval '2 hours' AND ($1::text IS NULL OR lower(e.title) LIKE $1 OR lower(e.description) LIKE $1 OR lower(COALESCE(e.location_label,'')) LIKE $1 OR lower(creator.display_name) LIKE $1 OR lower(creator.username) LIKE $1) AND ($2::text='all' OR e.event_type=$2)";
    const cr=await db.query('SELECT count(*)::int n FROM social_events e JOIN users creator ON creator.id=e.creator_id WHERE '+filter,[pattern,tipo]);
    const total=Number(cr.rows[0]?.n||0),pages=Math.max(1,Math.ceil(total/size)),page=Math.min(requested,pages),offset=(page-1)*size;
    const r=await db.query("SELECT e.id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,e.location_label,e.attendee_visibility,e.updated_at,creator.username,creator.display_name,creator.avatar_url,e.community_id,c.name AS community_name,CASE WHEN e.attendee_visibility='public' THEN (SELECT count(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='going') ELSE NULL END going_count,CASE WHEN e.attendee_visibility='public' THEN (SELECT count(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='interested') ELSE NULL END interested_count FROM social_events e JOIN users creator ON creator.id=e.creator_id LEFT JOIN communities c ON c.id=e.community_id WHERE "+filter+" ORDER BY e.starts_at ASC,e.id ASC LIMIT $3 OFFSET $4",[pattern,tipo,size,offset]);
    const filtered=Boolean(q)||tipo!=='all';
    const canonical=page>1&&!filtered?o+'/eventos?page='+page:o+'/eventos';
    const title=q?'Buscar eventos: '+q+' — RedLibertad':tipo!=='all'?'Eventos '+(tipo==='online'?'online':'presenciales')+' — RedLibertad':page>1?'Eventos públicos — Página '+page+' — RedLibertad':'Eventos públicos — RedLibertad';
    const desc=q?'Resultados públicos para “'+q+'” entre los próximos eventos de RedLibertad.':'Descubre próximos eventos públicos en RedLibertad sin exponer eventos privados, de círculos o comunidades cerradas.';
    const cards=r.rows.map(x=>{
      const community=communityPath(x)?'<span class="badge">'+e(x.community_name)+'</span>':'';
      const location=x.event_type==='online'?'Online':e(x.location_label||'Lugar por confirmar');
      const stats=x.attendee_visibility==='public'?'<div class="stats">'+Number(x.going_count||0)+' asistirán · '+Number(x.interested_count||0)+' interesados</div>':'<div class="stats">Asistentes protegidos por privacidad</div>';
      return '<article class="pec"><a class="main" href="'+e(pathFor(x))+'"><span class="badge">'+(x.event_type==='online'?'ONLINE':'PRESENCIAL')+'</span>'+community+'<h2>'+e(x.title)+'</h2><div class="when">'+e(fmt(x.starts_at))+'</div><p class="muted">'+e(String(x.description||'').slice(0,180))+'</p><div class="stats">'+location+' · por @'+e(x.username)+'</div>'+stats+'</a></article>';
    }).join('');
    function qs(target){const p=new URLSearchParams();if(target>1)p.set('page',String(target));if(q)p.set('q',q);if(tipo!=='all')p.set('tipo',tipo);const x=p.toString();return '/eventos'+(x?'?'+x:'');}
    const prev=page>1?qs(page-1):'',next=page<pages?qs(page+1):'';
    const indexable=!filtered;
    const ld=indexable&&page===1?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:'Próximos eventos públicos en RedLibertad',itemListElement:r.rows.map((x,i)=>({'@type':'ListItem',position:i+1,url:o+pathFor(x),name:x.title}))}).replace(/</g,'\\u003c')+'</script>':'';
    const body='<section class="peh"><div><span class="eyebrow">EVENTOS · ENCUENTROS</span><h1>Próximos eventos públicos</h1><p>'+e(desc)+'</p></div><form class="pef" method="get" action="/eventos"><input name="q" value="'+e(q)+'" maxlength="100" placeholder="Buscar evento, lugar o creador" aria-label="Buscar eventos"><select name="tipo" aria-label="Tipo de evento"><option value="all" '+(tipo==='all'?'selected':'')+'>Todos</option><option value="in_person" '+(tipo==='in_person'?'selected':'')+'>Presenciales</option><option value="online" '+(tipo==='online'?'selected':'')+'>Online</option></select><button class="button" type="submit">Buscar</button></form></section><p class="muted">'+total+' eventos públicos próximos</p>'+(cards?'<section class="peg" aria-label="Eventos públicos">'+cards+'</section>':'<div class="empty"><b>No encontramos eventos públicos.</b><p>Prueba otra búsqueda o vuelve más tarde.</p></div>')+'<nav class="pager" aria-label="Paginación">'+(prev?'<a class="button ghost small" rel="prev" href="'+e(prev)+'">← Anterior</a>':'')+'<span class="muted">Página '+page+' de '+pages+'</span>'+(next?'<a class="button ghost small" rel="next" href="'+e(next)+'">Siguiente →</a>':'')+'</nav>';
    res.type('html').send(shell(req,{title,description:desc,canonical,robots:indexable?'index,follow,max-image-preview:large':'noindex,follow',jsonLd:ld,body}));
  }catch(err){
    console.error('RedLibertad public events directory error:',err);
    res.status(500).send('No se pudo cargar el directorio de eventos.');
  }
});

router.get(['/evento/:id','/evento/:id/:slug'],async(req,res)=>{
  try{
    await ensure();
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(404).send('Evento no encontrado.');
    const r=await db.query("SELECT e.id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,e.location_label,e.attendee_visibility,e.updated_at,e.community_id,creator.username,creator.display_name,creator.avatar_url,creator.creator_verified,c.name AS community_name,CASE WHEN e.attendee_visibility='public' THEN (SELECT count(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='going') ELSE NULL END going_count,CASE WHEN e.attendee_visibility='public' THEN (SELECT count(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='interested') ELSE NULL END interested_count FROM social_events e JOIN users creator ON creator.id=e.creator_id LEFT JOIN communities c ON c.id=e.community_id WHERE e.id=$1 AND "+eligibility('e')+" LIMIT 1",[id]);
    if(!r.rowCount)return res.status(404).send('Evento no encontrado.');
    const x=r.rows[0],wanted=slug(x.title),canonicalPath=pathFor(x);
    if(req.params.slug!==wanted)return res.redirect(301,canonicalPath);
    const o=origin(req),canonical=o+canonicalPath,indexable=isRecentOrFuture(x);
    const desc=String(x.description||('Evento público '+x.title+' en RedLibertad.')).trim().slice(0,180);
    const location=x.event_type==='online'?'Evento online · el acceso se muestra dentro de RedLibertad':String(x.location_label||'Lugar por confirmar');
    const community=communityPath(x)?'<a class="badge" href="'+e(communityPath(x))+'">'+e(x.community_name)+'</a>':'';
    const av=x.avatar_url?'<img src="'+e(abs(req,x.avatar_url))+'" alt="">':'<span class="av">'+e(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>';
    const stats=x.attendee_visibility==='public'?'<div><b>'+Number(x.going_count||0)+'</b> asistirán · <b>'+Number(x.interested_count||0)+'</b> interesados</div>':'<div>La lista y cifras de asistentes están protegidas.</div>';
    const eventLd={'@context':'https://schema.org','@type':'Event',name:x.title,description:desc,startDate:new Date(x.starts_at).toISOString(),eventStatus:'https://schema.org/EventScheduled',eventAttendanceMode:x.event_type==='online'?'https://schema.org/OnlineEventAttendanceMode':'https://schema.org/OfflineEventAttendanceMode',url:canonical,organizer:{'@type':'Person',name:x.display_name||x.username,url:o+'/perfil/'+encodeURIComponent(x.username)}};
    if(x.ends_at)eventLd.endDate=new Date(x.ends_at).toISOString();
    if(x.event_type==='in_person'&&x.location_label)eventLd.location={'@type':'Place',name:x.location_label};
    const ld=indexable?'<script type="application/ld+json">'+JSON.stringify(eventLd).replace(/</g,'\\u003c')+'</script>':'';
    const body='<section class="hero"><div><span class="eyebrow">EVENTO PÚBLICO · '+(x.event_type==='online'?'ONLINE':'PRESENCIAL')+'</span><h1>'+e(x.title)+'</h1><p class="muted">'+e(desc)+'</p><div><span class="badge">'+e(fmt(x.starts_at))+'</span>'+community+'</div><p><a class="button" href="/#registro">Crear cuenta para participar</a> <button type="button" class="button ghost" data-public-share data-share-title="'+e(x.title+' — Evento en RedLibertad')+'" data-share-text="'+e(desc)+'">Compartir evento</button> <a class="button ghost" href="/#acceso">Entrar</a></p></div><aside class="meta"><div><b>Cuándo</b><br>'+e(fmt(x.starts_at))+(x.ends_at?' — '+e(fmt(x.ends_at)):'')+'</div><div><b>Dónde</b><br>'+e(location)+'</div>'+stats+'</aside></section><section class="section"><h2>Organiza</h2><a class="creator" href="/perfil/'+encodeURIComponent(x.username)+'">'+av+'<span><b>'+e(x.display_name||x.username)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+e(x.username)+'</span></span></a></section><section class="section"><h2>Sobre el evento</h2><p class="muted">'+e(x.description||'Sin descripción adicional.').replace(/\n/g,'<br>')+'</p></section>';
    res.type('html').send(shell(req,{title:x.title+' — Evento en RedLibertad',description:desc,canonical,robots:indexable?'index,follow,max-image-preview:large':'noindex,follow',jsonLd:ld,body}));
  }catch(err){
    console.error('RedLibertad public event page error:',err);
    res.status(500).send('No se pudo cargar el evento.');
  }
});

router.get('/sitemap-events.xml',async(req,res)=>{
  try{
    await ensure();
    const o=origin(req);
    const r=await db.query("SELECT e.id,e.title,e.updated_at FROM social_events e JOIN users creator ON creator.id=e.creator_id WHERE "+eligibility('e')+" AND e.starts_at>=now()-interval '2 hours' ORDER BY e.starts_at ASC,e.id ASC LIMIT 5000");
    const urls=r.rows.map(x=>'<url><loc>'+e(o+pathFor(x))+'</loc><lastmod>'+new Date(x.updated_at).toISOString()+'</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>');
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>');
  }catch(err){
    console.error('RedLibertad events sitemap error:',err);
    res.status(500).type('text/plain').send('Events sitemap unavailable');
  }
});

module.exports=router;
