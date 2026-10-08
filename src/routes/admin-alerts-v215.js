'use strict';

const express=require('express');
const {z}=require('zod');
const {requireAdmin}=require('../middleware/auth');

const changeSchema=z.object({
  action:z.enum(['acknowledge','resolve']),
  note:z.string().trim().max(500).optional().default('')
});

function createOperationalAlertAdminRoutes({db,service}){
  if(!db?.query||!service?.ensureSchema)throw new TypeError('db and alert service required');
  const router=express.Router();
  router.use(requireAdmin);
  router.use(async (_req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    try{await service.ensureSchema();next();}
    catch(_){res.status(503).json({error:'operational_alerts_unavailable'});}
  });

  router.get('/ops/alerts',async(req,res)=>{
    const status=String(req.query?.status||'active');
    if(!['active','open','acknowledged','resolved','all'].includes(status))
      return res.status(400).json({error:'invalid_status'});
    try{
      const where=status==='active'?"status <> 'resolved'":
        status==='all'?'TRUE':'status=$1';
      const params=['open','acknowledged','resolved'].includes(status)?[status]:[];
      const result=await db.query(
        "SELECT id,alert_key,severity,title,detail,status,is_active,occurrences,"+
        "first_seen_at,last_seen_at,last_cleared_at,acknowledged_at,resolved_at "+
        "FROM operational_alerts_v215 WHERE "+where+
        " ORDER BY CASE WHEN status='open' THEN 0 WHEN status='acknowledged' THEN 1 ELSE 2 END,"+
        " CASE severity WHEN 'critical' THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 80",
        params
      );
      res.json({alerts:result.rows,scope:'current_instance_signals',automatedModeration:false});
    }catch(_){res.status(503).json({error:'operational_alerts_unavailable'});}
  });

  router.post('/ops/alerts/:id/action',async(req,res)=>{
    if(!/^[1-9][0-9]{0,17}$/.test(req.params.id))
      return res.status(400).json({error:'invalid_alert_id'});
    const parsed=changeSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'invalid_action'});
    const {action,note}=parsed.data;
    if(action==='resolve' && note.length<3)return res.status(400).json({error:'resolution_note_required'});
    const nextStatus=action==='acknowledge'?'acknowledged':'resolved';
    const allowed=action==='acknowledge'?'open':['open','acknowledged'];
    try{
      // Update and audit happen atomically in one PostgreSQL statement.
      const result=await db.query(
        "WITH changed AS ("+
        "UPDATE operational_alerts_v215 SET status=$2,"+
        "acknowledged_by=CASE WHEN $2='acknowledged' THEN $3 ELSE acknowledged_by END,"+
        "acknowledged_at=CASE WHEN $2='acknowledged' THEN now() ELSE acknowledged_at END,"+
        "resolved_by=CASE WHEN $2='resolved' THEN $3 ELSE resolved_by END,"+
        "resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END "+
        "WHERE id=$1 AND status=ANY($5::text[]) RETURNING id,status),"+
        "audit AS (INSERT INTO operational_alert_audit_v215(alert_id,admin_id,action,note) "+
        "SELECT id,$3,$2,$4 FROM changed RETURNING alert_id) "+
        "SELECT changed.id,changed.status FROM changed JOIN audit ON audit.alert_id=changed.id",
        [req.params.id,nextStatus,req.user.id,note,Array.isArray(allowed)?allowed:[allowed]]
      );
      if(!result.rowCount)return res.status(409).json({error:'alert_state_changed_or_missing'});
      res.json({ok:true,alert:result.rows[0]});
    }catch(_){res.status(503).json({error:'operational_alert_action_failed'});}
  });

  router.get('/ops/alerts/:id/history',async(req,res)=>{
    if(!/^[1-9][0-9]{0,17}$/.test(req.params.id))
      return res.status(400).json({error:'invalid_alert_id'});
    try{
      const result=await db.query(
        "SELECT a.id,a.action,a.note,a.created_at,u.username AS admin_username "+
        "FROM operational_alert_audit_v215 a LEFT JOIN users u ON u.id=a.admin_id "+
        "WHERE a.alert_id=$1 ORDER BY a.created_at DESC LIMIT 50",
        [req.params.id]
      );
      res.json({history:result.rows});
    }catch(_){res.status(503).json({error:'operational_alert_history_failed'});}
  });

  return router;
}
module.exports={createOperationalAlertAdminRoutes};
