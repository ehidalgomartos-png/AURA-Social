'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {accountView,safeId,recordAction,LifecycleError}=require('../services/marketplace-subscription-lifecycle-v3279');
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use(requireAdmin);
router.use((_req,res,next)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 next();
});
router.get('/',wrap(async(_req,res)=>{
 const result=await db.query(`SELECT u.id AS seller_id,u.username,
  s.plan_code,s.status,s.period_starts_at,s.period_ends_at,s.grace_until,s.cancel_at_period_end,
  COALESCE(t.store_count,0)::integer AS store_count,
  COALESCE(t.approved_count,0)::integer AS approved_count
 FROM (
  SELECT seller_id FROM marketplace_professional_stores
  UNION SELECT seller_id FROM marketplace_seller_subscriptions
 ) sellers JOIN users u ON u.id=sellers.seller_id
 LEFT JOIN marketplace_seller_subscriptions s ON s.seller_id=u.id
 LEFT JOIN (
  SELECT seller_id,count(*) AS store_count,
  count(*) FILTER (WHERE status='approved') AS approved_count
  FROM marketplace_professional_stores GROUP BY seller_id
 ) t ON t.seller_id=u.id
 ORDER BY u.id DESC LIMIT 200`);
 res.json({ok:true,items:result.rows.map(row=>({
  sellerId:row.seller_id,username:row.username,storeCount:Number(row.store_count),
  approvedCount:Number(row.approved_count),account:accountView(row.status?row:null,Number(row.approved_count))
 })),billingEnabled:false,entitlementsEnforced:false});
}));
router.get('/:sellerId/history',wrap(async(req,res)=>{
 if(!safeId(req.params.sellerId))return res.status(400).json({error:'invalid_seller_id'});
 const r=await db.query(
  `SELECT a.id,a.event_type,a.details,a.created_at,u.username AS actor_username
   FROM marketplace_subscription_audit a LEFT JOIN users u ON u.id=a.actor_id
   WHERE a.seller_id=$1 ORDER BY a.id DESC LIMIT 50`,[req.params.sellerId]);
 res.json({ok:true,events:r.rows});
}));
const limiter=rateLimit({windowMs:60*60*1000,max:30,standardHeaders:true,legacyHeaders:false});
function checkOrigin(req,res,next){
 if(!req.is('application/json'))return res.status(415).json({error:'json_required'});
 const origin=req.get('origin');
 try{
  if(!origin||new URL(origin).host!==req.get('host'))return res.status(403).json({error:'origin_not_allowed'});
 }catch(_){return res.status(403).json({error:'origin_not_allowed'});}
 next();
}
router.post('/:sellerId/action',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  const result=await recordAction({sellerId:req.params.sellerId,actorId:req.user.id,body:req.body});
  res.json(result);
 }catch(error){
  if(error instanceof LifecycleError)return res.status(error.status).json({error:error.code});
  throw error;
 }
}));
module.exports={router,checkOrigin};
