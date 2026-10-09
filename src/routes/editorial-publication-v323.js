'use strict';

// Public editorial editions are separate from personal social posts.
// Publishing is human-triggered and only approved, attributed, original copy is surfaced.
const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureReviewSchema,isOriginalEditorial}=require('../routes/admin-editorial-review-v322');
const {ensureQualitySchema,qualityReady}=require('../services/editorial-quality-v325');
const {sourceMatchV3221,eligibleSourcesV3221}=require('../services/editorial-source-relink-v3221');
const {editorialAlignmentV32181}=require('../services/editorial-alignment-v32181');

const admin=express.Router();
const publicRouter=express.Router();
let schemaReady;
function ensurePublicationSchema(){
  if(!schemaReady){
    schemaReady=(async()=>{
      await ensureReviewSchema();
      await db.query("CREATE TABLE IF NOT EXISTS editorial_publications (id BIGSERIAL PRIMARY KEY,candidate_id BIGINT NOT NULL UNIQUE REFERENCES editorial_candidates(id) ON DELETE RESTRICT,profile_id BIGINT NOT NULL REFERENCES editorial_profiles(id) ON DELETE RESTRICT,title VARCHAR(220) NOT NULL,summary VARCHAR(1100) NOT NULL,source_url TEXT NOT NULL,source_name VARCHAR(100) NOT NULL,category VARCHAR(30) NOT NULL,published_by BIGINT REFERENCES users(id) ON DELETE SET NULL,published_at TIMESTAMPTZ NOT NULL DEFAULT now(),unpublished_at TIMESTAMPTZ,unpublished_by BIGINT REFERENCES users(id) ON DELETE SET NULL)");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_public_live ON editorial_publications(published_at DESC,id DESC) WHERE unpublished_at IS NULL');
      await db.query("ALTER TABLE editorial_publications ADD COLUMN IF NOT EXISTS image_url TEXT");
      await db.query("ALTER TABLE editorial_publications ADD COLUMN IF NOT EXISTS image_alt VARCHAR(220)");
      await db.query("ALTER TABLE editorial_publications ADD COLUMN IF NOT EXISTS image_credit VARCHAR(200)");
      await db.query("ALTER TABLE editorial_publications ADD COLUMN IF NOT EXISTS image_rights_reference VARCHAR(1000)");
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
    "SELECT c.*,s.name AS source_name,s.status AS source_status,s.rights_mode,s.profile_id AS source_profile_id,s.category AS source_category,p.id AS profile_exists,p.status AS profile_status,p.category AS profile_category,p.community_id,sp.status AS source_profile_status,sp.category AS source_profile_category,qa.decision AS quality_decision,qa.candidate_revision AS quality_candidate_revision FROM editorial_candidates c JOIN editorial_sources s ON s.id=c.source_id JOIN editorial_profiles p ON p.id=c.profile_id LEFT JOIN editorial_profiles sp ON sp.id=s.profile_id LEFT JOIN editorial_quality_assessments qa ON qa.candidate_id=c.id WHERE c.id=$1 FOR UPDATE OF c",[id]
  );
  if(!r.rowCount)throw fail(404,'editorial_candidate_not_found');
  const row=r.rows[0];
  if(row.revision!==revision)throw fail(409,'editorial_review_stale');
  if(row.status!=='approved'||!row.reviewed_at||!row.reviewed_by)throw fail(409,'editorial_review_required');
  if(row.source_status!=='approved'||row.profile_status!=='ready')throw fail(409,'editorial_source_or_profile_not_ready');
  if(!editorialAlignmentV32181(row).ok){
    throw fail(409,'editorial_profile_mismatch');
  }
  if(!isOriginalEditorial(row))throw fail(422,'editorial_original_draft_required');
  if(!qualityReady(row))throw fail(409,'editorial_quality_clearance_required');
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
admin.use(async(_req,res,next)=>{try{await ensurePublicationSchema();await ensureQualitySchema(db);next();}catch(e){console.error('Editorial publish schema failed:',e);res.status(500).json({error:'editorial_publication_unavailable'});}});

admin.get('/publication-queue',errorHandler(async(_req,res)=>{
  const data=await db.query(
    "SELECT c.id,c.revision,c.status,c.category,c.source_id,c.removed_source_id,c.profile_id,c.editorial_title,c.editorial_summary,c.source_image_url,c.editorial_image_url,c.editorial_image_alt,c.editorial_image_credit,c.canonical_url,c.reviewed_at,COALESCE(es.name,c.source_name_snapshot) AS source_name,es.category AS source_category,es.profile_id AS source_profile_id,es.status AS source_status,ep.name AS profile_name,ep.slug AS profile_slug,ep.status AS profile_status,ep.category AS profile_category,sp.name AS source_profile_name,sp.status AS source_profile_status,sp.category AS source_profile_category,p.id AS publication_id,p.unpublished_at,p.published_at,qa.decision AS quality_decision,qa.candidate_revision AS quality_revision FROM editorial_candidates c LEFT JOIN editorial_sources es ON es.id=c.source_id LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id LEFT JOIN editorial_profiles sp ON sp.id=es.profile_id LEFT JOIN editorial_publications p ON p.candidate_id=c.id LEFT JOIN editorial_quality_assessments qa ON qa.candidate_id=c.id WHERE c.status='approved' ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 100"
  );
  res.json({items:data.rows.map(row=>({...row,alignment:editorialAlignmentV32181(row)})),manualOnly:true,autoPublishing:false});
}));

// Reconcile only at a human administrator's explicit request. Never
// silently reclassify already approved content or circumvent quality review.
// V3.2.21 — admin-only relink of a candidate with a deleted RSS source.
// A strict HTTPS hostname match + category and profile readiness are required;
// the selected source NEVER re-approves or publishes the article.
const sourceRelinkInputV3221=z.object({
  sourceId:z.number().int().positive().safe(),
  revision:z.number().int().min(0).safe(),
  confirm:z.literal(true),
  reason:z.string().trim().min(12).max(500)
}).strict();
const availableRelinkSourcesV3221=async client=>{
  const r=await client.query(
    "SELECT s.id,s.name,s.feed_url,s.category,s.profile_id,s.status,p.status AS profile_status,"+
    "p.category AS profile_category,p.name AS profile_name FROM editorial_sources s "+
    "LEFT JOIN editorial_profiles p ON p.id=s.profile_id WHERE s.status='approved' "+
    "ORDER BY s.name ASC,s.id ASC LIMIT 250"
  );
  return r.rows;
};
admin.get('/source-relink/:candidateId/options',errorHandler(async(req,res)=>{
  const id=safeId(req.params.candidateId);
  if(!id)throw fail(400,'editorial_candidate_invalid');
  const [candidate,sources,live]=await Promise.all([
    db.query('SELECT id,source_id,category,canonical_url,source_name_snapshot,revision,status FROM editorial_candidates WHERE id=$1',[id]),
    availableRelinkSourcesV3221(db),
    db.query('SELECT 1 FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL LIMIT 1',[id])
  ]);
  if(!candidate.rowCount)throw fail(404,'editorial_candidate_not_found');
  const row=candidate.rows[0],blocked=live.rowCount>0;
  res.set('Cache-Control','no-store');
  res.json({
    ok:true,candidateId:String(row.id),revision:row.revision,
    removedSource:row.source_id==null,livePublication:blocked,
    sourceNameSnapshot:row.source_name_snapshot||null,
    options:row.source_id==null&&!blocked?eligibleSourcesV3221(row,sources):[],
    rule:'A source with matching HTTPS article/feed hostname and category is required. Matching is not a fact, copyright or editorial verification.'
  });
}));
admin.post('/source-relink/:candidateId',errorHandler(async(req,res)=>{
  const id=safeId(req.params.candidateId);
  if(!id)throw fail(400,'editorial_candidate_invalid');
  const parsed=sourceRelinkInputV3221.safeParse(req.body);
  if(!parsed.success)throw fail(400,'editorial_source_relink_invalid_data');
  const d=parsed.data;
  const result=await inTransaction(async client=>{
    const r=await client.query(
      'SELECT id,source_id,category,canonical_url,source_name_snapshot,revision,status FROM editorial_candidates WHERE id=$1 FOR UPDATE',[id]
    );
    if(!r.rowCount)throw fail(404,'editorial_candidate_not_found');
    const candidate=r.rows[0];
    if(Number(candidate.revision)!==d.revision)throw fail(409,'editorial_review_stale');
    if(candidate.source_id!=null)throw fail(409,'editorial_source_already_linked');
    const publications=await client.query(
      'SELECT id,unpublished_at FROM editorial_publications WHERE candidate_id=$1 FOR UPDATE',[id]
    );
    if(publications.rows.some(pub=>!pub.unpublished_at))
      throw fail(409,'editorial_unpublish_before_reopen');
    // Source/profile locks prevent simultaneous disabling, reclassification,
    // or deletion of the target while the candidate is re-linked.
    const source=await client.query(
      "SELECT s.id,s.name,s.feed_url,s.category,s.profile_id,s.status,p.status AS profile_status,"+
      "p.category AS profile_category,p.name AS profile_name FROM editorial_sources s "+
      "JOIN editorial_profiles p ON p.id=s.profile_id WHERE s.id=$1 FOR SHARE OF s,p",
      [d.sourceId]
    );
    if(!source.rowCount||!sourceMatchV3221(candidate,source.rows[0]))
      throw fail(409,'editorial_source_relink_incompatible');
    const target=source.rows[0];
    const saved=await client.query(
      "UPDATE editorial_candidates SET source_id=$2,profile_id=$3,status='pending',"+
      "reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,edited_at=now() "+
      "WHERE id=$1 RETURNING id,source_id,profile_id,status,revision",
      [id,target.id,target.profile_id]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
      "VALUES($1,'relink_source','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({
        previousRemovedSourceName:candidate.source_name_snapshot||null,
        priorStatus:candidate.status,newSourceId:target.id,
        newSourceName:target.name,previousRevision:candidate.revision,
        newRevision:saved.rows[0].revision,reason:d.reason
      })]
    );
    return saved.rows[0];
  });
  res.set('Cache-Control','no-store');
  res.json({ok:true,candidate:result,published:false,requiresNewReview:true,
    requiresNewQuality:true,requiresNewRightsVerification:true});
}));

admin.post('/reconcile/:candidateId',errorHandler(async(req,res)=>{
  const id=safeId(req.params.candidateId);
  if(!id||!confirmation(req.body||{}))throw fail(400,'editorial_reconcile_confirmation_required');
  const result=await inTransaction(async client=>{
    const r=await client.query(
      "SELECT c.id,c.source_id,c.profile_id,c.category,c.status,c.revision,s.status AS source_status,s.category AS source_category,s.profile_id AS source_profile_id,sp.status AS source_profile_status,sp.category AS source_profile_category,p.status AS profile_status,p.category AS profile_category FROM editorial_candidates c JOIN editorial_sources s ON s.id=c.source_id LEFT JOIN editorial_profiles sp ON sp.id=s.profile_id LEFT JOIN editorial_profiles p ON p.id=c.profile_id WHERE c.id=$1 FOR UPDATE OF c",[id]
    );
    if(!r.rowCount)throw fail(404,'editorial_candidate_not_found');
    const row=r.rows[0];
    if(row.revision!==req.body.revision)throw fail(409,'editorial_review_stale');
    if(row.status!=='approved')throw fail(409,'editorial_review_required');
    // Protect anything that has a public snapshot, including republished records.
    const existing=await client.query(
      'SELECT id,unpublished_at FROM editorial_publications WHERE candidate_id=$1 FOR UPDATE',[id]
    );
    if(existing.rows.some(pub=>!pub.unpublished_at))throw fail(409,'editorial_unpublish_before_reopen');
    const alignment=editorialAlignmentV32181({
      ...row,publication_id:existing.rows[0]?.id,
      unpublished_at:existing.rows[0]?.unpublished_at
    });
    if(alignment.ok)throw fail(409,'editorial_assignment_already_valid');
    if(!alignment.canReconcile)throw fail(409,'editorial_source_assignment_invalid');
    const updated=await client.query(
      "UPDATE editorial_candidates SET profile_id=$2,category=$3,status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,edited_at=now() WHERE id=$1 RETURNING id,revision,category,profile_id,status",
      [id,row.source_profile_id,row.source_category]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'reconcile_assignment','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({
        oldProfileId:row.profile_id,newProfileId:row.source_profile_id,
        oldCategory:row.category,newCategory:row.source_category,
        oldRevision:row.revision,newRevision:updated.rows[0].revision
      })]
    );
    return updated.rows[0];
  });
  res.json({ok:true,candidate:result,published:false,requiresNewReview:true,requiresNewQuality:true});
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
  const communityPublicUrl='/comunidades?volver='+encodeURIComponent(pathname);
  const nav=[
    ['Inicio','/app'],['Noticias','/noticias'],['Comunidades',communityPublicUrl]
  ];
  const desktop=nav.map(([label,href])=>
    '<a href="'+esc(href)+'"'+(label==='Comunidades'?' data-ed-route="communities" data-ed-news-return="'+esc(pathname)+'"':'')+(pathname.startsWith('/noticias')&&href==='/noticias'?' aria-current="page"':'')+'>'+label+'</a>'
  ).join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="theme-color" content="#0d2238">'+
    '<title>'+esc(title)+' · RedLibertad</title><meta name="description" content="'+esc(description.slice(0,155))+'">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+(noindex?'<meta name="robots" content="noindex,follow">':'')+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+esc(title)+'">'+
    '<meta property="og:description" content="'+esc(description.slice(0,190))+'"><meta property="og:url" content="'+esc(canonical)+'">'+
    '<link rel="stylesheet" href="/editorial-v323.css?v=3.2.14"><script src="/editorial-session-v3212.js?v=3.2.14" defer></script></head><body>'+
    '<a class="ed-skip" href="#ed-main">Saltar al contenido</a>'+
    '<header class="ed-head"><a href="/app" class="ed-brand"><img src="/assets/logo-mark.svg" alt="" width="32" height="32"><span>RedLibertad</span></a>'+
    '<nav class="ed-head-nav" aria-label="Navegación principal">'+desktop+'<a class="ed-head-login" data-ed-auth-link data-ed-logged-label="Mi perfil" href="/app">Entrar</a></nav></header>'+
    '<div class="ed-layout"><aside class="ed-side" aria-label="Explorar RedLibertad">'+
    '<p class="ed-side-title">TU COMUNIDAD</p><nav aria-label="Secciones de RedLibertad">'+
    '<a href="/app"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2z"/></svg></span> Inicio</a>'+
    '<a href="/noticias"'+(pathname.startsWith('/noticias')?' class="active" aria-current="page"':'')+'><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h5M7 16h10"/></svg></span> Noticias</a>'+
    '<a data-ed-route="communities" data-ed-news-return="'+esc(pathname)+'" href="'+esc(communityPublicUrl)+'"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/></svg></span> Comunidades</a>'+
    '<a href="/descubrir" data-ed-route="explore"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span> Descubrir</a></nav>'+
    '<div class="ed-side-note"><b>RedLibertad Noticias</b><p>Actualidad seleccionada a partir de fuentes identificadas y revisada antes de publicar.</p></div></aside>'+
    '<main id="ed-main" class="ed-main">'+body+'</main></div>'+
    '<footer class="ed-footer">RedLibertad · Contenido editorial identificado y revisado · <a href="/legal/">Aviso legal</a> · <a href="/privacy/">Privacidad</a></footer>'+
    '<nav class="ed-mobile-nav" aria-label="Navegación móvil"><a href="/app"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2z"/></svg></span><small>Inicio</small></a>'+
    '<a href="/noticias"'+(pathname.startsWith('/noticias')?' aria-current="page"':'')+'><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h5M7 16h10"/></svg></span><small>Noticias</small></a>'+
    '<a data-ed-route="communities" data-ed-news-return="'+esc(pathname)+'" href="'+esc(communityPublicUrl)+'"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/></svg></span><small>Comunidades</small></a>'+
    '<a href="/descubrir" data-ed-route="explore"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span><small>Explorar</small></a></nav>'+
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
    "SELECT pub.id,pub.title,pub.summary,pub.category,pub.published_at,pub.source_url,pub.source_name,pub.image_url,pub.image_alt,pub.image_credit,ep.name AS profile_name,ep.slug AS profile_slug,ep.bio,ep.community_id,c.name AS community_name FROM editorial_publications pub JOIN editorial_profiles ep ON ep.id=pub.profile_id LEFT JOIN communities c ON c.id=ep.community_id AND c.privacy='public' WHERE pub.unpublished_at IS NULL AND ep.status='ready' "+extra+" ORDER BY pub.published_at DESC,pub.id DESC LIMIT 50",
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
// A dedicated sitemap query avoids the 50-item cap on the public news feed.
// A sitemap XML file can contain at most 50,000 URLs; index + profile URLs
// count toward that maximum, so cap published article entries at 49,000.
publicRouter.get('/sitemap.xml',async(_req,res)=>{
  try{
    const r=await db.query(
      "SELECT pub.id,pub.published_at,ep.slug AS profile_slug "+
      "FROM editorial_publications pub JOIN editorial_profiles ep ON ep.id=pub.profile_id "+
      "WHERE pub.unpublished_at IS NULL AND ep.status='ready' "+
      "ORDER BY pub.published_at DESC,pub.id DESC LIMIT 49000"
    );
    const items=r.rows;
    const profiles=[...new Set(items.map(row=>row.profile_slug))];
    const urls=[
      '<url><loc>'+esc(origin()+'/noticias')+'</loc><changefreq>daily</changefreq></url>',
      ...profiles.map(slug=>'<url><loc>'+esc(origin()+'/noticias/perfil/'+encodeURIComponent(slug))+'</loc><changefreq>weekly</changefreq></url>'),
      ...items.map(row=>'<url><loc>'+esc(origin()+publicationPath(row.id))+'</loc><lastmod>'+new Date(row.published_at).toISOString()+'</lastmod></url>')
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
    const publishedDate=new Date(p.published_at);
    const readableDate=publishedDate.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Madrid'});
    const publishedIso=publishedDate.toISOString();
    const iconLike='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6z"/></svg>';
    const iconComment='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4.5-1.2L3 20l1.2-4.5A9 9 0 0 1 3 11.5a8.5 8.5 0 0 1 17.5 0z"/></svg>';
    const iconShare='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m7 11 9-5M7 13l9 5"/></svg>';
    const body='<div class="ed-timeline"><a href="/noticias" class="ed-timeline-back">← Todas las noticias</a><span>Actualidad para conversar</span></div>'+
      '<article class="ed-article ed-post">'+
      '<div class="ed-post-head"><a class="ed-profile-avatar" href="/noticias/perfil/'+encodeURIComponent(p.profile_slug)+'" aria-label="Perfil editorial '+esc(p.profile_name)+'"><img src="/assets/logo-mark.svg" alt="" width="28" height="28"></a>'+
      '<div class="ed-post-identity"><a href="/noticias/perfil/'+encodeURIComponent(p.profile_slug)+'" class="ed-profile-name">'+esc(p.profile_name)+'</a>'+
      '<div class="ed-profile-meta"><span>Perfil editorial</span><span aria-hidden="true">·</span><time datetime="'+esc(publishedIso)+'" title="Fecha de publicación en RedLibertad">'+esc(readableDate)+'</time></div></div>'+
      '<span class="ed-post-badge">Noticias</span></div>'+
      '<div class="ed-post-content"><div class="ed-tags"><span class="ed-topic">'+esc(p.category)+'</span><span class="ed-reviewed">✓ Revisado por el equipo</span></div>'+
      '<h1>'+esc(p.title)+'</h1><p class="ed-summary">'+esc(p.summary)+'</p>'+
      '<div class="ed-attribution"><span class="ed-source-icon" aria-hidden="true">↗</span><div class="ed-attribution-body">'+
      '<b>Fuente: '+esc(p.source_name)+'</b><p>'+linkOut(p.source_url,'Leer información original ↗')+'</p>'+
      '<small>Resumen propio elaborado a partir de una fuente identificada. Consulta el medio para conocer la fecha y el contexto originales.</small>'+
      '</div></div>'+community+'</div>'+
      '<section class="ed-social" id="editorialSocial" data-article-id="'+esc(id)+'" data-community-id="'+(p.community_name&&p.community_id?esc(p.community_id):'')+'">'+
        '<div class="ed-engagement"><span id="edLikeCount" aria-live="polite">0 Me gusta</span><span id="edCommentCount" aria-live="polite">0 comentarios</span></div>'+
        '<div class="ed-social-actions" role="group" aria-label="Interacciones con la noticia">'+
        '<button type="button" id="edLike" aria-pressed="false">'+iconLike+'<span id="edLikeLabel">Me gusta</span></button>'+
        '<button type="button" id="edJumpComments">'+iconComment+'<span>Comentar</span></button>'+
        '<button type="button" id="edShare">'+iconShare+'<span>Compartir</span></button></div>'+
        (p.community_name&&p.community_id?'<div class="ed-community-action"><button type="button" id="edCommunityShare">Compartir en comunidad</button></div>':'')+
        '<div id="edFeedback" class="ed-feedback" role="status" aria-live="polite"></div>'+
        '<div class="ed-discussion-wrap" id="edDiscussion"><div class="ed-discussion-heading"><div><h2>Conversación</h2><p>Opiniones de personas reales de RedLibertad</p></div></div>'+
        '<form id="edCommentForm"><label for="edCommentText">¿Qué opinas sobre esta noticia?</label>'+
        '<textarea id="edCommentText" maxlength="600" minlength="2" required rows="3" placeholder="Comparte una opinión respetuosa…"></textarea>'+
        '<button type="submit">Publicar comentario</button></form>'+
        '<a id="edLoginCta" class="ed-login-cta" href="/app" hidden>Entra en RedLibertad para participar en la conversación →</a>'+
        '<div id="edComments" class="ed-discussion" aria-live="polite">Cargando comentarios…</div></div></section>'+
      '</article><p class="ed-article-back"><a href="/noticias">← Volver a Noticias</a></p>';
    res.type('html').send(page({title:p.title,description:p.summary,pathname:publicationPath(id),body}) .replace('</body></html>','<script src="/editorial-social-v324.js?v=3.2.11" defer></script></body></html>'));
  }catch(e){console.error('Public editorial article failed:',e);res.status(503).send('No disponible');}
});
module.exports={admin,publicRouter,ensurePublicationSchema,esc,safeId,page,assertApprovedForPublication,confirmation};
