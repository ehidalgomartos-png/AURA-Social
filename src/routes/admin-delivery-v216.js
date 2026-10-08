'use strict';

const express=require('express');
const {z}=require('zod');
const {requireAdmin}=require('../middleware/auth');

const retrySchema=z.object({note:z.string().trim().min(3).max(500)});

function createAlertDeliveryAdminRoutes({db,delivery}){
  if(!db?.query||!delivery?.status||!delivery?.ensureSchema)
    throw new TypeError('database and delivery service required');
  const router=express.Router();
  router.use(requireAdmin);
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});

  router.get('/ops/alert-deliveries',async(req,res)=>{
    const state=delivery.status();
    if(!state.enabled)return res.json({config:state,deliveries:[],counts:{pending:0,sent:0,failed:0}});
    try{
      await delivery.ensureSchema();
      const [items,summary]=await Promise.all([
        db.query(
          "SELECT d.id,d.alert_id,d.status,d.attempts,d.created_at,d.last_attempt_at,"+
          "d.sent_at,d.last_error_code,a.severity,a.title "+
          "FROM operational_alert_deliveries_v216 d JOIN operational_alerts_v215 a ON a.id=d.alert_id "+
          "ORDER BY CASE d.status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, "+
          "d.created_at DESC LIMIT 50"
        ),
        db.query("SELECT status,count(*)::int AS total FROM operational_alert_deliveries_v216 GROUP BY status")
      ]);
      const counts={pending:0,sent:0,failed:0};
      for(const row of summary.rows){
        if(Object.hasOwn(counts,row.status))counts[row.status]=Number(row.total)||0;
      }
      res.json({config:state,deliveries:items.rows,counts});
    }catch(_){res.status(503).json({error:'alert_delivery_inbox_unavailable'});}
  });

  router.post('/ops/alert-deliveries/:id/retry',async(req,res)=>{
    if(!delivery.status().enabled)return res.status(409).json({error:'alert_delivery_disabled'});
    if(!/^[1-9][0-9]{0,17}$/.test(req.params.id))return res.status(400).json({error:'invalid_delivery_id'});
    const parsed=retrySchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'retry_note_required'});
    try{
      await delivery.ensureSchema();
      // Transactionality: both the state change and the admin audit occur in one statement.
      const update=await db.query(
        "WITH changed AS ("+
        "UPDATE operational_alert_deliveries_v216 SET status='pending',attempts=0,"+
        "next_attempt_at=now(),locked_until=NULL,last_error_code='' "+
        "WHERE id=$1 AND status='failed' RETURNING id),"+
        "audit AS (INSERT INTO operational_delivery_audit_v216(delivery_id,admin_id,action,note) "+
        "SELECT id,$2,'retry_requested',$3 FROM changed RETURNING delivery_id) "+
        "SELECT changed.id FROM changed JOIN audit ON audit.delivery_id=changed.id",
        [req.params.id,req.user.id,parsed.data.note]
      );
      if(!update.rowCount)return res.status(409).json({error:'delivery_state_changed_or_missing'});
      res.json({ok:true,id:update.rows[0].id});
    }catch(_){res.status(503).json({error:'delivery_retry_failed'});}
  });
  return router;
}

module.exports={createAlertDeliveryAdminRoutes};
