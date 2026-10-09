'use strict';

const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureSocialSchema}=require('./editorial-social-v324');
const {ensureQualitySchema}=require('../services/editorial-quality-v325');
const {safeId}=require('./editorial-publication-v323');
const {ensurePlanningSchema,planSchema,shortlist,CATEGORIES}=require('../services/editorial-planning-v326');

const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{
    await ensureSocialSchema();
    await ensureQualitySchema(db);
    await ensurePlanningSchema(db);
    next();
  }catch(error){console.error('V3.2.6 editorial planning setup failed',error);res.status(503).json({error:'editorial_planning_unavailable'});}
});
function httpError(status,code){const error=new Error(code);error.status=status;error.code=code;return error;}
const wrap=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(error=>{
  if(error.status)return res.status(error.status).json({error:error.code});
  console.error('Editorial planning request failed',error);
  res.status(500).json({error:'editorial_planning_failed'});
});
function validFilters(query={}){
  const category=String(query.category||'');
  const sourceId=String(query.sourceId||'');
  const quality=String(query.quality||'all');
  const search=String(query.search||'').trim();
  if(category&&!CATEGORIES.includes(category))return null;
  if(sourceId&&!safeId(sourceId))return null;
  if(!['all','clear','pending'].includes(quality)||search.length>100)return null;
  return {category,sourceId,quality,search};
}

router.get('/planning/overview',wrap(async(req,res)=>{
  const filters=validFilters(req.query);
  if(!filters)return res.status(400).json({error:'editorial_planning_invalid_filters'});
  const [candidates,calendar,sources]=await Promise.all([
    db.query(
      "SELECT c.id,c.revision,c.source_id,c.category,c.source_title,c.editorial_title,c.editorial_summary,c.canonical_url,c.published_at,c.fetched_at,c.reviewed_at,"+
      "s.name AS source_name,s.status AS source_status,ep.name AS profile_name,ep.status AS profile_status,"+
      "qa.decision AS quality_decision,qa.candidate_revision AS quality_revision,"+
      "plan.planned_for,COALESCE(plan.priority,2) AS priority,COALESCE(plan.note,'') AS planning_note,plan.candidate_revision AS plan_revision,"+
      "(SELECT count(*)::int FROM editorial_publications recent JOIN editorial_candidates rc ON rc.id=recent.candidate_id WHERE rc.source_id=c.source_id AND recent.unpublished_at IS NULL AND recent.published_at>=now()-interval '7 days') AS source_recent_count,"+
      "(SELECT count(*)::int FROM editorial_publications recent WHERE recent.category=c.category AND recent.unpublished_at IS NULL AND recent.published_at>=now()-interval '7 days') AS category_recent_count "+
      "FROM editorial_candidates c "+
      "LEFT JOIN editorial_sources s ON s.id=c.source_id "+
      "LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id "+
      "LEFT JOIN editorial_quality_assessments qa ON qa.candidate_id=c.id "+
      "LEFT JOIN editorial_plans plan ON plan.candidate_id=c.id "+
      "LEFT JOIN editorial_publications pub ON pub.candidate_id=c.id "+
      "WHERE c.status='approved' AND (pub.id IS NULL OR pub.unpublished_at IS NOT NULL) "+
      "ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 200"
    ),
    db.query(
      "SELECT (plan.planned_for AT TIME ZONE 'Europe/Madrid')::date AS day,count(*)::int AS count "+
      "FROM editorial_plans plan JOIN editorial_candidates c ON c.id=plan.candidate_id "+
      "LEFT JOIN editorial_publications pub ON pub.candidate_id=c.id "+
      "WHERE plan.planned_for>=now()-interval '1 day' AND plan.planned_for<now()+interval '91 days' "+
      "AND c.status='approved' AND (pub.id IS NULL OR pub.unpublished_at IS NOT NULL) "+
      "GROUP BY 1 ORDER BY 1 LIMIT 92"
    ),
    db.query("SELECT id,name FROM editorial_sources ORDER BY name ASC,id DESC LIMIT 150")
  ]);
  const ranked=shortlist(candidates.rows,filters);
  res.set('Cache-Control','no-store').json({
    items:ranked,calendar:calendar.rows,sources:sources.rows,limit:200,
    manualOnly:true,autoPublishing:false,
    explanation:'Orden orientativo por actualidad, calidad confirmada, estado de fuente/perfil, prioridad y diversidad de fuentes/categorías. No evalúa la veracidad.',
    timezone:'Europe/Madrid'
  });
}));

router.put('/planning/:id',wrap(async(req,res)=>{
  const id=safeId(req.params.id);
  if(!id)return res.status(400).json({error:'editorial_planning_invalid_id'});
  const parsed=planSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'editorial_planning_invalid',details:parsed.error.flatten()});
  const data=parsed.data;
  const when=data.plannedFor?new Date(data.plannedFor):null;
  const now=Date.now();
  if(when && (!Number.isFinite(when.getTime())||when.getTime()<now-60000||when.getTime()>now+90*86400000)){
    return res.status(422).json({error:'editorial_planning_date_out_of_range'});
  }
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const rows=await client.query("SELECT id,revision,status FROM editorial_candidates WHERE id=$1 FOR UPDATE",[id]);
    if(!rows.rowCount)throw httpError(404,'editorial_planning_candidate_missing');
    const row=rows.rows[0];
    if(row.status!=='approved')throw httpError(409,'editorial_planning_review_required');
    if(row.revision!==data.revision)throw httpError(409,'editorial_planning_stale');
    const live=await client.query(
      "SELECT id FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL FOR UPDATE",[id]
    );
    if(live.rowCount)throw httpError(409,'editorial_planning_already_published');
    // Atomic global daily cap is advisory only; never triggers a publish.
    if(when){
      await client.query('SELECT pg_advisory_xact_lock(326,1)');
      const count=await client.query(
        "SELECT count(*)::int AS n FROM editorial_plans p JOIN editorial_candidates c ON c.id=p.candidate_id "+
        "LEFT JOIN editorial_publications pub ON pub.candidate_id=c.id "+
        "WHERE p.candidate_id<>$1 AND (p.planned_for AT TIME ZONE 'Europe/Madrid')::date=($2::timestamptz AT TIME ZONE 'Europe/Madrid')::date "+
        "AND c.status='approved' AND (pub.id IS NULL OR pub.unpublished_at IS NOT NULL)",
        [id,when.toISOString()]
      );
      if(Number(count.rows[0]?.n||0)>=6)throw httpError(409,'editorial_planning_day_full');
    }
    const stored=await client.query(
      "INSERT INTO editorial_plans(candidate_id,planned_for,priority,note,candidate_revision,updated_by) "+
      "VALUES($1,$2,$3,$4,$5,$6) "+
      "ON CONFLICT(candidate_id) DO UPDATE SET planned_for=EXCLUDED.planned_for,priority=EXCLUDED.priority,note=EXCLUDED.note,candidate_revision=EXCLUDED.candidate_revision,updated_by=EXCLUDED.updated_by,updated_at=now() "+
      "RETURNING candidate_id,planned_for,priority,note,candidate_revision,updated_at",
      [id,when?when.toISOString():null,data.priority,data.note,data.revision,req.user.id]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'plan','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({plannedFor:when?when.toISOString():null,priority:data.priority,revision:data.revision,note:data.note})]
    );
    await client.query('COMMIT');
    res.json({ok:true,plan:stored.rows[0],published:false,willAutoPublish:false});
  }catch(error){try{await client.query('ROLLBACK');}catch(err){console.error('Planning rollback failed',err);}throw error;}
  finally{client.release();}
}));

router.delete('/planning/:id',wrap(async(req,res)=>{
  const id=safeId(req.params.id);
  if(!id)return res.status(400).json({error:'editorial_planning_invalid_id'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const candidate=await client.query('SELECT id FROM editorial_candidates WHERE id=$1 FOR UPDATE',[id]);
    if(!candidate.rowCount)throw httpError(404,'editorial_planning_candidate_missing');
    const removed=await client.query('DELETE FROM editorial_plans WHERE candidate_id=$1 RETURNING candidate_id',[id]);
    if(!removed.rowCount)throw httpError(404,'editorial_planning_not_found');
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'unplan','candidate',$2,'{}'::jsonb)",
      [req.user.id,id]
    );
    await client.query('COMMIT');
    res.json({ok:true,published:false});
  }catch(error){try{await client.query('ROLLBACK');}catch(err){console.error('Unplanning rollback failed',err);}throw error;}
  finally{client.release();}
}));
module.exports={router,validFilters};
