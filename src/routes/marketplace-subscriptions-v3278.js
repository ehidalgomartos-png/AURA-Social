'use strict';
// V3.2.78 — private, read-only seller subscription area. No billing endpoints.
const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureProfessionalSchema}=require('./marketplace-professional-v3276');
const {ensureSubscriptionSchema,effectiveAccount,planView}=require('../services/marketplace-subscriptions-v3278');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use((_req,res,next)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 Promise.resolve().then(ensureProfessionalSchema).then(ensureSubscriptionSchema).then(()=>next(),next);
});
router.get('/plans',wrap(async(_req,res)=>{
 const result=await db.query('SELECT code,name,monthly_price_cents,currency,pricing_state,available,store_limit,product_limit FROM marketplace_subscription_plans ORDER BY sort_order,code');
 res.json({ok:true,plans:result.rows.map(planView),billingEnabled:false,enrollmentEnabled:false});
}));
router.get('/mine',wrap(async(req,res)=>{
 // Derive seller solely from authenticated token, never from a caller-supplied ID.
 const id=req.user.id;
 const [seller,stores,subscription,plans]=await Promise.all([
  db.query('SELECT username FROM users WHERE id=$1',[id]),
  db.query('SELECT id,name,platform,store_url,status,purchase_enabled FROM marketplace_professional_stores WHERE seller_id=$1 ORDER BY id DESC',[id]),
  db.query('SELECT plan_code,status,period_starts_at,period_ends_at,grace_until,cancel_at_period_end FROM marketplace_seller_subscriptions WHERE seller_id=$1',[id]),
  db.query('SELECT code,name,monthly_price_cents,currency,pricing_state,available,store_limit,product_limit FROM marketplace_subscription_plans ORDER BY sort_order,code')
 ]);
 res.json({ok:true,username:seller.rows[0]?.username||'',account:effectiveAccount(subscription.rows[0],stores.rows),
  stores:stores.rows,plans:plans.rows.map(planView),billingEnabled:false,enrollmentEnabled:false,
  entitlementsEnforced:false,isAdmin:req.user.isAdmin===true});
}));
router.get('/admin/overview',requireAdmin,wrap(async(_req,res)=>{
 // Read-only overview. No endpoint can grant or revoke entitlements or move money.
 const result=await db.query(`SELECT u.id AS seller_id,u.username,
  s.plan_code,s.status AS subscription_status,s.period_ends_at,
  COALESCE(t.store_count,0)::integer AS store_count,
  COALESCE(t.approved_count,0)::integer AS approved_count
  FROM (
   SELECT seller_id FROM marketplace_professional_stores
   UNION SELECT seller_id FROM marketplace_seller_subscriptions
  ) sellers
  JOIN users u ON u.id=sellers.seller_id
  LEFT JOIN marketplace_seller_subscriptions s ON s.seller_id=u.id
  LEFT JOIN (
   SELECT seller_id,count(*) AS store_count,
    count(*) FILTER (WHERE status='approved') AS approved_count
   FROM marketplace_professional_stores GROUP BY seller_id
  ) t ON t.seller_id=u.id
  ORDER BY u.id DESC LIMIT 100`);
 res.json({ok:true,items:result.rows.map(row=>({
  sellerId:row.seller_id,username:row.username,stores:row.store_count,
  planCode:row.plan_code||(Number(row.approved_count)>0?'professional':'particular'),
  status:row.subscription_status||(Number(row.approved_count)>0?'pilot':'free'),
  periodEndsAt:row.period_ends_at
 })),billingEnabled:false});
}));
router.use('/admin/commercial',require('./marketplace-subscription-commercial-v3281').router);
router.use('/admin/lifecycle',require('./marketplace-subscription-lifecycle-v3279').router);
router.use('/admin/stripe-test',require('./marketplace-stripe-test-v3280').router);
module.exports={router};
