'use strict';

const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureSocialSchema}=require('./editorial-social-v324');
const {safeId}=require('./editorial-publication-v323');
const {qualitySchema,ensureQualitySchema,reviewSignals}=require('../services/editorial-quality-v325');
const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensureSocialSchema();await ensureQualitySchema(db);next();}
  catch(error){console.error('V3.2.5 editorial quality initialization failed:',error);res.status(503).json({error:'editorial_quality_unavailable'});}
});
const wrap=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(error=>{
  if(error.status)return res.status(error.status).json({error:error.code});
  console.error('Editorial quality error:',error);
  res.status(500).json({error:'editorial_quality_failed'});
});
function httpError(status,code){const error=new Error(code);error.status=status;error.code=code;return error;}

router.get('/quality/overview',wrap(async(_req,res)=>{
  const [summary,sources,queue]=await Promise.all([
    db.query(
      "SELECT "+
      "(SELECT count(*)::int FROM editorial_sources) AS sources,"+
      "(SELECT count(*)::int FROM editorial_candidates WHERE fetched_at>=now()-interval '30 days') AS candidates_30d,"+
      "(SELECT count(*)::int FROM editorial_candidates WHERE status='approved' AND reviewed_at>=now()-interval '30 days') AS approved_30d,"+
      "(SELECT count(*)::int FROM editorial_candidates WHERE status='rejected' AND reviewed_at>=now()-interval '30 days') AS rejected_30d,"+
      "(SELECT count(*)::int FROM editorial_publications WHERE published_at>=now()-interval '30 days') AS published_30d,"+
      "(SELECT count(*)::int FROM editorial_publications WHERE unpublished_at IS NULL) AS live_publications,"+
      "(SELECT count(*)::int FROM editorial_likes WHERE created_at>=now()-interval '30 days') AS likes_30d,"+
      "(SELECT count(*)::int FROM editorial_comments WHERE status='published' AND created_at>=now()-interval '30 days') AS comments_30d,"+
      "(SELECT count(*)::int FROM editorial_comment_reports WHERE created_at>=now()-interval '30 days') AS reports_30d,"+
      "(SELECT count(*)::int FROM editorial_quality_assessments WHERE decision='hold') AS quality_holds"
    ),
    db.query(
      "SELECT es.id,es.name,es.category,es.status,es.last_checked_at,"+
      "(SELECT count(*)::int FROM editorial_candidates c WHERE c.source_id=es.id AND c.fetched_at>=now()-interval '30 days') AS candidates_30d,"+
      "(SELECT count(*)::int FROM editorial_candidates c WHERE c.source_id=es.id AND c.status='approved' AND c.reviewed_at>=now()-interval '30 days') AS approved_30d,"+
      "(SELECT count(*)::int FROM editorial_candidates c WHERE c.source_id=es.id AND c.status='rejected' AND c.reviewed_at>=now()-interval '30 days') AS rejected_30d,"+
      "(SELECT count(*)::int FROM editorial_publications p JOIN editorial_candidates c ON c.id=p.candidate_id WHERE c.source_id=es.id AND p.published_at>=now()-interval '30 days') AS publications_30d,"+
      "(SELECT count(*)::int FROM editorial_audit a WHERE a.action='fetch' AND a.entity_type='source' AND a.entity_id=es.id AND a.created_at>=now()-interval '30 days') AS fetches_30d,"+
      "(SELECT COALESCE(sum(CASE WHEN (a.details->>'duplicates') ~ '^[0-9]{1,9}$' THEN (a.details->>'duplicates')::int ELSE 0 END),0)::int FROM editorial_audit a WHERE a.action='fetch' AND a.entity_type='source' AND a.entity_id=es.id AND a.created_at>=now()-interval '30 days') AS duplicates_30d "+
      "FROM editorial_sources es ORDER BY es.name ASC,es.id DESC LIMIT 150"
    ),
    db.query(
      "SELECT c.id,c.revision,c.category,c.source_title,c.editorial_title,c.editorial_summary,c.canonical_url,c.fetched_at,c.published_at,c.status,"+
      "s.name AS source_name,s.status AS source_status,ep.name AS profile_name,ep.status AS profile_status,"+
      "qa.decision AS quality_decision,qa.reason AS quality_reason,qa.note AS quality_note,qa.candidate_revision AS quality_revision,qa.assessed_at, "+
      "p.id AS publication_id,p.unpublished_at "+
      "FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id "+
      "LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id "+
      "LEFT JOIN editorial_quality_assessments qa ON qa.candidate_id=c.id "+
      "LEFT JOIN editorial_publications p ON p.candidate_id=c.id "+
      "WHERE c.status='approved' ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 100"
    )
  ]);
  const rows=queue.rows.map(row=>({
    ...row,signals:reviewSignals(row),
    quality_ready:row.quality_decision==='clear'&&Number(row.quality_revision)===Number(row.revision)
  }));
  res.set('Cache-Control','no-store').json({
    periodDays:30,summary:summary.rows[0],sources:sources.rows,queue:rows,
    caveats:['Los recuentos reflejan acciones registradas, no lectores únicos ni veracidad de noticias.','Los duplicados cuentan intentos descartados durante las consultas RSS.','La publicación sigue siendo manual.']
  });
}));

router.put('/quality/:id',wrap(async(req,res)=>{
  const id=safeId(req.params.id);
  if(!id)throw httpError(400,'editorial_quality_invalid_id');
  const parsed=qualitySchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'editorial_quality_invalid',details:parsed.error.flatten()});
  const data=parsed.data;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(
      "SELECT c.id,c.revision,c.status,s.status AS source_status,ep.status AS profile_status "+
      "FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id "+
      "LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id "+
      "WHERE c.id=$1 FOR UPDATE OF c",[id]
    );
    if(!result.rowCount)throw httpError(404,'editorial_quality_candidate_missing');
    const candidate=result.rows[0];
    if(candidate.revision!==data.revision)throw httpError(409,'editorial_quality_stale');
    if(candidate.status!=='approved')throw httpError(409,'editorial_quality_not_approved');
    const publication=await client.query(
      'SELECT id FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL FOR UPDATE',[id]
    );
    if(publication.rowCount&&data.decision==='hold'){
      throw httpError(409,'editorial_quality_unpublish_first');
    }
    if(data.decision==='clear'&&(candidate.source_status!=='approved'||candidate.profile_status!=='ready')){
      throw httpError(409,'editorial_quality_source_not_ready');
    }
    const saved=await client.query(
      "INSERT INTO editorial_quality_assessments(candidate_id,decision,reason,note,candidate_revision,assessed_by) "+
      "VALUES($1,$2,$3,$4,$5,$6) "+
      "ON CONFLICT(candidate_id) DO UPDATE SET decision=EXCLUDED.decision,reason=EXCLUDED.reason,note=EXCLUDED.note,candidate_revision=EXCLUDED.candidate_revision,assessed_by=EXCLUDED.assessed_by,assessed_at=now() "+
      "RETURNING candidate_id,decision,reason,candidate_revision,assessed_at",
      [id,data.decision,data.reason,data.note,data.revision,req.user.id]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,'candidate',$3,$4::jsonb)",
      [req.user.id,data.decision==='clear'?'quality_clear':'quality_hold',id,JSON.stringify({reason:data.reason,revision:data.revision,note:data.note})]
    );
    await client.query('COMMIT');
    res.json({ok:true,quality:saved.rows[0],published:false});
  }catch(error){
    try{await client.query('ROLLBACK');}catch(rollbackError){console.error('Quality rollback failed:',rollbackError);}
    throw error;
  }finally{client.release();}
}));

module.exports={router};
