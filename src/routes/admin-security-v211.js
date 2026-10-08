'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { ensureAbuseSchema } = require('../services/abuse-guard');

const router = express.Router();
router.use(requireAdmin);
router.use(async (_req,res,next) => {
  try { await ensureAbuseSchema(db); next(); }
  catch (error) { console.error('Security admin bootstrap failed',error); res.status(503).json({error:'security_admin_unavailable'}); }
});

router.get('/security/overview', async (req,res) => {
  try {
    const [counters, events] = await Promise.all([
      db.query("SELECT category, count(*)::int windows, sum(blocked_hits-threshold)::int blocked_requests, count(*) FILTER (WHERE reviewed_at IS NULL)::int pending FROM abuse_events WHERE last_seen_at >= now()-interval '7 days' GROUP BY category ORDER BY blocked_requests DESC"),
      db.query("SELECT e.id,e.category,e.blocked_hits,e.threshold,e.last_seen_at,e.reviewed_at,e.review_note,e.user_id,u.username FROM abuse_events e LEFT JOIN users u ON u.id=e.user_id ORDER BY (e.reviewed_at IS NOT NULL),e.last_seen_at DESC LIMIT 60")
    ]);
    res.json({metrics:counters.rows,events:events.rows,retentionDays:90,networkIdentityRedacted:true});
  } catch(error) { console.error('Security overview error',error);res.status(500).json({error:'security_overview_failed'}); }
});
const reviewSchema = z.object({note:z.string().trim().min(3).max(500)});
router.post('/security/events/:id/review',async(req,res)=>{
  const parsed=reviewSchema.safeParse(req.body);
  if(!parsed.success || !/^\d+$/.test(req.params.id))return res.status(400).json({error:'invalid_review'});
  try {
    const reviewed=await db.query("UPDATE abuse_events SET reviewed_at=now(),reviewed_by=$2,review_note=$3 WHERE id=$1 AND reviewed_at IS NULL RETURNING id,user_id", [req.params.id,req.user.id,parsed.data.note]);
    if(!reviewed.rowCount)return res.status(409).json({error:'already_reviewed_or_missing'});
    await db.query('INSERT INTO abuse_admin_audit(admin_id,target_user_id,action,reason) VALUES($1,$2,$3,$4)',[req.user.id,reviewed.rows[0].user_id,'reviewed_abuse_alert',parsed.data.note]);
    res.json({ok:true,id:reviewed.rows[0].id});
  } catch(error){console.error('Security review failed',error);res.status(500).json({error:'security_review_failed'});}
});
module.exports = router;
