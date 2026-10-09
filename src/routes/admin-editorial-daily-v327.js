'use strict';
const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensurePlanningSchema}=require('../services/editorial-planning-v326');
const {ensureSocialSchema}=require('./editorial-social-v324');
const {ensureQualitySchema}=require('../services/editorial-quality-v325');
const {madridDay,validDay,triage,sourceAlerts}=require('../services/editorial-daily-v327');
const {enrich}=require('../services/editorial-intelligence-v3215');

const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{
    await ensureSocialSchema();
    await ensureQualitySchema(db);
    await ensurePlanningSchema(db);
    next();
  }catch(error){console.error('Editorial daily overview unavailable',error);res.status(503).json({error:'editorial_daily_unavailable'});}
});

router.get('/daily/overview',async(req,res)=>{
  const day=req.query.day===undefined?madridDay():req.query.day;
  if(!validDay(day))return res.status(400).json({error:'editorial_daily_invalid_date'});
  const today=new Date(madridDay()+'T12:00:00Z').getTime();
  const selected=new Date(day+'T12:00:00Z').getTime();
  if(Math.abs(today-selected)>31*86400000)return res.status(400).json({error:'editorial_daily_date_out_of_range'});
  try{
    const [candidates,pending,published,sources,counts]=await Promise.all([
      db.query(
        "SELECT c.id,c.revision,c.status,c.source_id,c.category,c.source_title,c.editorial_title,c.editorial_summary,c.canonical_url,c.fetched_at,c.published_at,c.reviewed_at, "+
        "s.name AS source_name,s.status AS source_status,ep.name AS profile_name,ep.status AS profile_status, "+
        "qa.decision AS quality_decision,qa.candidate_revision AS quality_revision, "+
        "plan.planned_for,(plan.planned_for AT TIME ZONE 'Europe/Madrid')::date::text AS planned_day,plan.candidate_revision AS plan_revision,COALESCE(plan.priority,2) AS priority, "+
        "pub.id AS publication_id,CASE WHEN pub.unpublished_at IS NULL THEN pub.id ELSE NULL END AS live_publication_id "+
        "FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id "+
        "LEFT JOIN editorial_profiles ep ON ep.id=c.profile_id "+
        "LEFT JOIN editorial_quality_assessments qa ON qa.candidate_id=c.id "+
        "LEFT JOIN editorial_plans plan ON plan.candidate_id=c.id "+
        "LEFT JOIN editorial_publications pub ON pub.candidate_id=c.id "+
        "WHERE c.status='approved' AND (pub.id IS NULL OR pub.unpublished_at IS NOT NULL) "+
        "ORDER BY CASE WHEN plan.planned_for IS NOT NULL AND (plan.planned_for AT TIME ZONE 'Europe/Madrid')::date <= $1::date THEN 0 ELSE 1 END, "+
        "COALESCE(plan.planned_for,c.reviewed_at) DESC,c.id DESC LIMIT 300",
        [day]
      ),
      db.query(
        "SELECT c.id,c.revision,c.source_id,c.source_title,c.source_excerpt,c.category,c.fetched_at,c.published_at,s.name AS source_name,c.editorial_title,c.editorial_summary FROM editorial_candidates c "+
        "LEFT JOIN editorial_sources s ON s.id=c.source_id WHERE c.status='pending' ORDER BY c.fetched_at DESC,c.id DESC LIMIT 120"
      ),
      db.query(
        "SELECT p.id,p.candidate_id,p.title,p.category,p.published_at,p.source_name,ep.name AS profile_name "+
        "FROM editorial_publications p JOIN editorial_profiles ep ON ep.id=p.profile_id "+
        "WHERE p.unpublished_at IS NULL AND (p.published_at AT TIME ZONE 'Europe/Madrid')::date=$1::date "+
        "ORDER BY p.published_at DESC,p.id DESC LIMIT 35",
        [day]
      ),
      db.query("SELECT id,name,status,last_checked_at,category FROM editorial_sources ORDER BY name ASC,id DESC LIMIT 150"),
      db.query(
        "SELECT "+
        "(SELECT count(*)::int FROM editorial_candidates WHERE status='pending') AS pending_total, "+
        "(SELECT count(*)::int FROM editorial_plans pl JOIN editorial_candidates c ON c.id=pl.candidate_id "+
        " LEFT JOIN editorial_publications p ON p.candidate_id=c.id "+
        " WHERE c.status='approved' AND (p.id IS NULL OR p.unpublished_at IS NOT NULL) "+
        " AND (pl.planned_for AT TIME ZONE 'Europe/Madrid')::date <= $1::date) AS due_total, "+
        "(SELECT count(*)::int FROM editorial_publications p WHERE p.unpublished_at IS NULL "+
        " AND (p.published_at AT TIME ZONE 'Europe/Madrid')::date=$1::date) AS published_total",
        [day]
      )
    ]);
    const groups=triage(candidates.rows,{day});
    const pendingAdvised=enrich(pending.rows,[...pending.rows,...candidates.rows]);
    const alerts=sourceAlerts(sources.rows);
    res.set('Cache-Control','no-store').json({
      day,timezone:'Europe/Madrid',manualOnly:true,autoPublishing:false,
      totals:{
        pending:counts.rows[0].pending_total,
        due:counts.rows[0].due_total,
        published:counts.rows[0].published_total,
        readyShown:groups.ready.length,
        blockedShown:groups.needsQuality.length,
        sourceAlerts:alerts.length
      },
      sampled:{approvedLimit:300,pendingLimit:120,publishedLimit:35},
      groups:{
        planned:groups.planned.slice(0,35),ready:groups.ready.slice(0,35),
        needsQuality:groups.needsQuality.slice(0,35),
        pending:pendingAdvised.slice(0,35),published:published.rows,
        sourceAlerts:alerts.slice(0,35)
      },
      notice:'La priorización es orientativa. Revisión, calidad y publicación siguen requiriendo acciones humanas independientes.'
    });
  }catch(error){
    console.error('Editorial daily overview failed',error);
    res.status(500).json({error:'editorial_daily_failed'});
  }
});
module.exports=router;
