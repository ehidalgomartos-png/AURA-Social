'use strict';

// Public editorial editions are separate from personal social posts.
// Publishing is human-triggered and only approved, attributed, original copy is surfaced.
const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureReviewSchema,isOriginalEditorial}=require('../routes/admin-editorial-review-v322');

const admin=express.Router();
const publicRouter=express.Router();
let schemaReady;
function ensurePublicationSchema(){
  if(!schemaReady){
    schemaReady=(async()=>{
      await ensureReviewSchema();
      await db.query("CREATE TABLE IF NOT EXISTS editorial_publications (id BIGSERIAL PRIMARY KEY,candidate_id BIGINT NOT NULL UNIQUE REFERENCES editorial_candidates(id) ON DELETE RESTRICT,profile_id BIGINT NOT NULL REFERENCES editorial_profiles(id) ON DELETE RESTRICT,title VARCHAR(220) NOT NULL,summary VARCHAR(1100) NOT NULL,source_url TEXT NOT NULL,source_name VARCHAR(100) NOT NULL,category VARCHAR(30) NOT NULL,published_by BIGINT REFERENCES users(id) ON DELETE SET NULL,published_at TIMESTAMPTZ NOT NULL DEFAULT now(),unpublished_at TIMESTAMPTZ,unpublished_by BIGINT REFERENCES users(id) ON DELETE SET NULL)");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_public_live ON editorial_publications(published_at DESC,id DESC) WHERE unpublished_at IS NULL');
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_public_profile ON editorial_publications(profile_id,published_at DESC) WHERE unpublished_at IS NULL');
    })().catch(e=>{schemaReady=null;throw e;});
  }
  return schemaReady;
}

function safeId(x){const v=String(x||'');return /^[1-9][0-9]{0,14}$/.test(v)?v:null;}
function esc(s=''){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function fail(status,code){const e=new Error(code);e.status=status;e.code=code;return e;}
function errorHandler(handler){return(req,res)=>Promise.resolve().then(()=>handler(req,res)).catch(e=>{
  if(e.status)return res.status(e.status).json({error:e.code});
  console.error('V3.2.3 editorial publication failed:',e);
  res.status(500).json({error:'editorial_publication_failed'});
});}
const confirmation=({revision,confirm})=>Number.isSafeInteger(revision)&&revision>=0&&confirm===true;
const publicationPath=id=>'/noticias/p/'+encodeURIComponent(id);
async function assertApprovedForPublication(client,id,revision){
  const r=await client.query(
    "SELECT c.*,s.name AS source_name,s.status AS source_status,s.rights_mode,s.profile_id AS source_profile_id,p.id AS profile_exists,p.status AS profile_status,p.category AS profile_category,p.community_id FROM editorial_candidates c JOIN editorial_sources s ON s.id=c.source_id JOIN editorial_profiles p ON p.id=c.profile_id WHERE c.id=$1 FOR UPDATE OF c",[id]
  );
  if(!r.rowCount)throw fail(404,'editorial_candidate_not_found');
  const row=r.rows[0];
  if(row.revision!==revision)throw fail(409,'editorial_review_stale');
  if(row.status!=='approved'||!row.reviewed_at||!row.reviewed_by)throw fail(409,'editorial_review_required');
  if(row.source_status!=='approved'||row.profile_status!=='ready')throw fail(409,'editorial_source_or_profile_not_ready');
  if(row.profile_category!==row.category || String(row.source_profile_id)!==String(row.profile_id)){
    throw fail(409,'editorial_profile_mismatch');
  }
  if(!isOriginalEditorial(row))throw fail(422,'editorial_original_draft_required');
  // We do not import the RSS image, embed its HTML or reproduce its synopsis.
  // Require HTTPS source article URL for external linking.
  let url;
  try{url=new URL(row.canonical_url);}catch(_){throw fail(422,'editorial_source_link_invalid');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||
      /\.(?:local|internal|localhost|test|invalid|example|onion)$/i.test(url.hostname))throw fail(422,'editorial_source_link_invalid');
  return row;
}
async function inTransaction(work){
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await work(client);
    await client.query('COMMIT');
    return result;
  }catch(e){try{await client.query('ROLLBACK');}catch(err){console.error('Editorial transaction rollback failed:',err);}throw e;
  }finally{client.release();}
}

admin.use(requireAdmin);
admin.use(async(_req,res,next)=>{try{await ensurePublicationSchema();next();}catch(e){console.error('Editorial publish schema failed:',e);res.status(500).json({error:'editorial_publication_unavailable'});}});

admin.get('/publication-queue',errorHandler(async(_req,res)=>{
  const data=await db.query(
    "SELECT c.id,c.revision,c.category,c.editorial_title,c.editorial_summary,c.canonical_url,c.reviewed_at,es.name AS source_name,es.status AS source_status,ep.name AS profile_name,ep.slug AS profile_slug,ep.status AS profile_status,p.id AS publication_id,p.unpublished_at,p.published_at FROM editorial_candidates c LEFT JOIN editorial_sources es ON es.id=c.source_id LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id LEFT JOIN editorial_publications p ON p.candidate_id=c.id WHERE c.status='approved' ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 100"
  );
  res.json({items:data.rows,manualOnly:true,autoPublishing:false});
}));

admin.post('/publish/:candidateId',errorHandler(async(req,res)=>{
  const id=safeId(req.params.candidateId);
  if(!id||!confirmation(req.body||{}))throw fail(400,'editorial_publish_confirmation_required');
  const result=await inTransaction(async client=>{
    const row=await assertApprovedForPublication(client,id,req.body.revision);
    const previous=await client.query('SELECT id,unpublished_at FROM editorial_publications WHERE candidate_id=$1 FOR UPDATE',[id]);
    if(previous.rowCount && !previous.rows[0].unpublished_at)throw fail(409,'editorial_already_published');
    // Serialize the global daily cap across concurrent admins and instances.
    await client.query('SELECT pg_advisory_xact_lock(323,1)');
    // Max 6 manually released articles per Madrid calendar day in the pilot.
    const daily=await client.query(
      "SELECT count(*)::int AS n FROM editorial_publications WHERE (published_at AT TIME ZONE 'Europe/Madrid')::date=(now() AT TIME ZONE 'Europe/Madrid')::date "
    );
    if(Number(daily.rows[0]?.n||0)>=6)throw fail(429,'editorial_daily_limit');
    let publication;
    if(previous.rowCount){
      const updated=await client.query(
        "UPDATE editorial_publications SET profile_id=$2,title=$3,summary=$4,source_url=$5,source_name=$6,category=$7,published_at=now(),unpublished_at=NULL,published_by=$8,unpublished_by=NULL WHERE candidate_id=$1 RETURNING id,published_at",
        [id,row.profile_id,row.editorial_title,row.editorial_summary,row.canonical_url,row.source_name,row.category,req.user.id]
      );publication=updated.rows[0];
    }else{
      const inserted=await client.query(
        'INSERT INTO editorial_publications(candidate_id,profile_id,title,summary,source_url,source_name,category,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,published_at',
        [id,row.profile_id,row.editorial_title,row.editorial_summary,row.canonical_url,row.source_name,row.category,req.user.id]
      );publication=inserted.rows[0];
    }
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'publish','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({publicationId:publication.id,reviewRevision:row.revision,sourceId:row.source_id})]
    );
    return publication;
  });
  res.status(201).json({ok:true,publicationId:result.id,url:publicationPath(result.id),publishedAt:result.published_at});
}));

admin.post('/unpublish/:candidateId',errorHandler(async(req,res)=>{
  const id=safeId(req.params.candidateId);
  if(!id||req.body?.confirm!==true)throw fail(400,'editorial_unpublish_confirmation_required');
  const result=await inTransaction(async client=>{
    const r=await client.query('SELECT id,unpublished_at FROM editorial_publications WHERE candidate_id=$1 FOR UPDATE',[id]);
    if(!r.rowCount||r.rows[0].unpublished_at)throw fail(409,'editorial_not_published');
    await client.query('UPDATE editorial_publications SET unpublished_at=now(),unpublished_by=$2 WHERE id=$1',[r.rows[0].id,req.user.id]);
    // Keep public community links from pointing to an article that is no longer live.
    const sharesTable=await client.query("SELECT to_regclass('public.editorial_community_shares') AS rel");
    if(sharesTable.rows[0]?.rel){
      await client.query(
        "UPDATE community_posts SET moderation_status='removed',updated_at=now() WHERE id IN (SELECT community_post_id FROM editorial_community_shares WHERE publication_id=$1) AND moderation_status='published'",
        [r.rows[0].id]
      );
    }
    await client.query("INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'unpublish','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({publicationId:r.rows[0].id})]);
    return r.rows[0];
  });
  res.json({ok:true,publicationId:result.id,unpublished:true});
}));

// Public pages are human-readable, server rendered and show only live editorial snapshots.
function origin(){
  try{const u=new URL(process.env.APP_ORIGIN||'https://redlibertad.com');return u.protocol==='https:'?u.origin:'https://redlibertad.com';}
  catch(_){return 'https://redlibertad.com';}
}
function page({title,description,pathname,body,noindex=false}){
  const base=origin();
  const canonical=base+pathname;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title)+' · RedLibertad</title><meta name="description" content="'+esc(description.slice(0,155))+'">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+(noindex?'<meta name="robots" content="noindex,follow">':'')+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+esc(title)+'">'+
    '<meta property="og:description" content="'+esc(description.slice(0,190))+'"><meta property="og:url" content="'+esc(canonical)+'">'+
    '<link rel="stylesheet" href="/editorial-v323.css"></head><body>'+
    '<header class="ed-head"><a href="/" class="ed-brand">RedLibertad</a><nav aria-label="Explorar"><a href="/noticias">Noticias</a><a href="/comunidades">Comunidades</a><a href="/app">Entrar</a></nav></header>'+
    '<main class="ed-main">'+body+'</main><footer class="ed-footer">RedLibertad · Contenido editorial automatizado con revisión humana · <a href="/legal/">Aviso legal</a> · <a href="/privacy/">Privacidad</a></footer>'+
    '</body></html>';
}
function linkOut(url,label){return '<a href="'+esc(url)+'" rel="noopener noreferrer external" target="_blank">'+esc(label)+'</a>';}
function card(row){
  const profilePath='/noticias/perfil/'+encodeURIComponent(row.profile_slug);
  const date=new Date(row.published_at).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Madrid'});
  return '<article class="ed-card"><div class="ed-meta"><span>'+esc(row.category)+'</span><span>'+esc(date)+'</span><span>Editorial revisado</span></div>'+
    '<h2><a href="'+publicationPath(row.id)+'">'+esc(row.title)+'</a></h2><p>'+esc(row.summary)+'</p>'+
    '<p class="ed-source">Por <a href="'+profilePath+'">'+esc(row.profile_name)+'</a> · Fuente: '+esc(row.source_name)+'</p></article>';
}
async function liveItems(extra='',params=[]){
  return db.query(
    "SELECT pub.id,pub.title,pub.summary,pub.category,pub.published_at,pub.source_url,pub.source_name,ep.name AS profile_name,ep.slug AS profile_slug,ep.bio,ep.community_id,c.name AS community_name FROM editorial_publications pub JOIN editorial_profiles ep ON ep.id=pub.profile_id LEFT JOIN communities c ON c.id=ep.community_id AND c.privacy='public' WHERE pub.unpublished_at IS NULL AND ep.status='ready' "+extra+" ORDER BY pub.published_at DESC,pub.id DESC LIMIT 50",
    params
  );
}
publicRouter.use(async(_req,res,next)=>{try{await ensurePublicationSchema();next();}catch(e){console.error('Public editorial schema bootstrap failed:',e);res.status(503).type('text/plain').send('Noticias temporalmente no disponibles');}});
publicRouter.get('/',async(_req,res)=>{
  try{
    const items=await liveItems();
    const cards=items.rows.map(card).join('')||'<div class="ed-empty">Todavía no hay noticias publicadas. Puedes explorar las comunidades mientras tanto.</div>';
    res.type('html').send(page({title:'Noticias y actualidad',description:'Noticias originales revisadas por el equipo editorial de RedLibertad, con enlaces a las fuentes originales.',pathname:'/noticias',body:
      '<section class="ed-hero"><span class="ed-label">Centro Editorial · RedLibertad</span><h1>Noticias y actualidad</h1><p>Publicaciones editoriales con fuentes identificadas, revisión humana y enlaces a la información original.</p></section><section class="ed-stack">'+cards+'</section>',noindex:items.rows.length===0}));
  }catch(e){console.error('Editorial listing failed:',e);res.status(503).send('No disponible');}
});
publicRouter.get('/sitemap.xml',async(_req,res)=>{
  try{
    const items=await liveItems();
    const uniqueProfiles=new Set(items.rows.map(r=>r.profile_slug));
    const urls=[
      '<url><loc>'+esc(origin()+'/noticias')+'</loc><changefreq>daily</changefreq></url>',
      ...[...uniqueProfiles].map(slug=>'<url><loc>'+esc(origin()+'/noticias/perfil/'+encodeURIComponent(slug))+'</loc><changefreq>weekly</changefreq></url>'),
      ...items.rows.map(row=>'<url><loc>'+esc(origin()+publicationPath(row.id))+'</loc><lastmod>'+new Date(row.published_at).toISOString()+'</lastmod></url>')
    ];
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>');
  }catch(e){console.error('Editorial sitemap failed:',e);res.status(503).type('text/plain').send('Unavailable');}
});
publicRouter.get('/perfil/:slug',async(req,res)=>{
  const slug=String(req.params.slug||'');
  if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug))return res.status(404).send('No encontrado');
  try{
    const profile=await db.query("SELECT id,name,slug,bio,category FROM editorial_profiles WHERE slug=$1 AND status='ready' LIMIT 1",[slug]);
    if(!profile.rowCount)return res.status(404).send('No encontrado');
    const items=await liveItems('AND ep.id=$1',[profile.rows[0].id]);
    const p=profile.rows[0];
    res.type('html').send(page({title:p.name,description:p.bio||'Perfil editorial automatizado y supervisado.',pathname:'/noticias/perfil/'+encodeURIComponent(slug),body:
      '<section class="ed-hero"><span class="ed-label">Perfil editorial automatizado · Revisado</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.bio||'Noticias y artículos sobre '+p.category)+'</p></section><section class="ed-stack">'+(items.rows.map(card).join('')||'<div class="ed-empty">Sin publicaciones todavía.</div>')+'</section>',noindex:items.rows.length===0}));
  }catch(e){console.error('Editorial profile public failed:',e);res.status(503).send('No disponible');}
});
publicRouter.get('/p/:id',async(req,res)=>{
  const id=safeId(req.params.id);
  if(!id)return res.status(404).send('No encontrado');
  try{
    const r=await liveItems('AND pub.id=$1',[id]);
    if(!r.rowCount)return res.status(404).send('No encontrado');
    const p=r.rows[0];
    const community=p.community_name&&p.community_id?'<p class="ed-community">Participa en la <a href="/comunidad/'+encodeURIComponent(p.community_id)+'">'+esc(p.community_name)+'</a>.</p>':'';
    const body='<article class="ed-article"><span class="ed-label">Contenido editorial automatizado · Revisado por una persona</span>'+
      '<h1>'+esc(p.title)+'</h1><p class="ed-byline">Por <a href="/noticias/perfil/'+encodeURIComponent(p.profile_slug)+'">'+esc(p.profile_name)+'</a> · '+esc(p.category)+'</p>'+
      '<p class="ed-summary">'+esc(p.summary)+'</p><div class="ed-attribution"><b>Fuente original: '+esc(p.source_name)+'</b><p>'+linkOut(p.source_url,'Leer noticia original ↗')+'</p>'+
      '<small>Este resumen es una elaboración editorial propia. Para consultar todos los detalles, visita el medio de origen.</small></div>'+community+
      '<section class="ed-social" id="editorialSocial" data-article-id="'+esc(id)+'" data-community-id="'+(p.community_name&&p.community_id?esc(p.community_id):'')+'">'+
        '<div class="ed-social-actions"><button type="button" id="edLike">♡ Me gusta</button><span id="edLikeCount">0 Me gusta</span><button type="button" id="edShare">↗ Compartir enlace</button>'+
        (p.community_name&&p.community_id?'<button type="button" id="edCommunityShare">Compartir en comunidad</button>':'')+'</div>'+
        '<div id="edFeedback" class="ed-feedback" role="status" aria-live="polite"></div>'+
        '<h2>Conversación</h2><p id="edCommentCount" class="ed-byline">Comentarios de usuarios reales</p>'+
        '<form id="edCommentForm"><label for="edCommentText">Añade tu opinión (pública)</label>'+
        '<textarea id="edCommentText" maxlength="600" minlength="2" required rows="3" placeholder="Comparte una opinión respetuosa…"></textarea>'+
        '<button type="submit">Comentar</button></form><div id="edComments" class="ed-discussion">Cargando comentarios…</div></section>'+
      '<p><a href="/noticias">← Ver más noticias</a></p></article>';
    res.type('html').send(page({title:p.title,description:p.summary,pathname:publicationPath(id),body}) .replace('</body></html>','<script src="/editorial-social-v324.js" defer></script></body></html>'));
  }catch(e){console.error('Public editorial article failed:',e);res.status(503).send('No disponible');}
});
module.exports={admin,publicRouter,ensurePublicationSchema,esc,safeId,page,assertApprovedForPublication,confirmation};
