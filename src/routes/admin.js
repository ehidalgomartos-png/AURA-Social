const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(requireAdmin);

router.get('/dashboard', async (_req,res)=>{
  const [users,posts,reports,critical,verified]=await Promise.all([
    db.query(`SELECT count(*)::int n FROM users`),db.query(`SELECT count(*)::int n FROM posts`),db.query(`SELECT count(*)::int n FROM reports WHERE status='open'`),db.query(`SELECT count(*)::int n FROM reports WHERE status='open' AND priority='critical'`),db.query(`SELECT count(*)::int n FROM users WHERE creator_verified=true`)
  ]);
  res.json({users:users.rows[0].n,posts:posts.rows[0].n,openReports:reports.rows[0].n,criticalReports:critical.rows[0].n,verifiedCreators:verified.rows[0].n});
});
router.get('/reports',async(_req,res)=>{const r=await db.query(`SELECT r.*,u.username reporter_username FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY CASE WHEN r.priority='critical' THEN 0 ELSE 1 END,r.created_at ASC LIMIT 200`);res.json({reports:r.rows});});
router.get('/users',async(req,res)=>{const q=String(req.query.q||'').trim();const r=await db.query(`SELECT id,email,username,display_name,age_verified,creator_verified,status,created_at FROM users WHERE $1='' OR lower(username) LIKE lower($2) OR lower(email) LIKE lower($2) OR lower(display_name) LIKE lower($2) ORDER BY created_at DESC LIMIT 100`,[q,`%${q}%`]);res.json({users:r.rows});});

const decisionSchema=z.object({status:z.enum(['resolved','dismissed']),action:z.enum(['none','hide_post','suspend_user','ban_user']),note:z.string().max(2000).optional().default('')});
router.post('/reports/:id/decision',async(req,res)=>{const parsed=decisionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'invalid_decision'});const d=parsed.data;const report=await db.query('SELECT * FROM reports WHERE id=$1',[req.params.id]);if(!report.rowCount)return res.status(404).json({error:'report_not_found'});const item=report.rows[0];if(d.action==='hide_post'&&item.target_type==='post')await db.query(`UPDATE posts SET moderation_status='under_review' WHERE id=$1`,[item.target_id]);if((d.action==='suspend_user'||d.action==='ban_user')&&item.target_type==='user')await db.query(`UPDATE users SET status=$2 WHERE id=$1`,[item.target_id,d.action==='ban_user'?'banned':'suspended']);await db.query(`UPDATE reports SET status=$2,moderator_note=$3,resolved_at=now() WHERE id=$1`,[req.params.id,d.status,d.note]);await db.query(`INSERT INTO moderation_audit (admin_id,report_id,action,note) VALUES ($1,$2,$3,$4)`,[req.user.id,req.params.id,d.action,d.note]);res.json({ok:true});});
router.post('/users/:id/verify-creator',async(req,res)=>{await db.query(`UPDATE users SET creator_verified=true,age_verified=true,updated_at=now() WHERE id=$1`,[req.params.id]);res.json({ok:true});});
router.post('/users/:id/verify-age',async(req,res)=>{await db.query(`UPDATE users SET age_verified=true,updated_at=now() WHERE id=$1`,[req.params.id]);res.json({ok:true});});
module.exports=router;
