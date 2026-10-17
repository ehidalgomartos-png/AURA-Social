'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAdmin}=require('../middleware/auth');
const db=require('../db');
const billing=require('../services/marketplace-stripe-test-v3280');
const {checkOrigin}=require('./marketplace-subscription-lifecycle-v3279');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use(requireAdmin);
router.use((_req,res,next)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 next();
});
router.get('/status',wrap(async(req,res)=>{
 const c=billing.config();
 let sandboxSubscription=null,events=[],checkouts=[];
 if(c.readyForCheckout){
  await billing.ensureSchema();
  const [sub,ev,cs]=await Promise.all([
   db.query('SELECT plan_code,stripe_status,period_ends_at,cancel_at_period_end,cancel_at,updated_at FROM marketplace_stripe_test_subscriptions WHERE seller_id=$1',[req.user.id]),
   db.query('SELECT event_type,applied,created_at FROM marketplace_stripe_test_events WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 20',[req.user.id]),
   db.query('SELECT plan_code,status,created_at FROM marketplace_stripe_test_checkouts WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 10',[req.user.id])
  ]);
  sandboxSubscription=sub.rows[0]||null;events=ev.rows;checkouts=cs.rows;
 }
 res.json({...billing.publicStatus(c),subscription:sandboxSubscription,events,checkouts,
  note:'El laboratorio solo acepta claves sk_test y eventos livemode=false. No modifica planes profesionales reales.'});
}));
const limiter=rateLimit({windowMs:60*60*1000,max:6,standardHeaders:true,legacyHeaders:false,
 handler:(_req,res)=>res.status(429).json({error:'too_many_test_requests'})});
function reject(res,error){
 if(error?.status&&error.status>=400&&error.status<600)return res.status(error.status).json({error:error.message});
 throw error;
}
router.post('/checkout',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
   Object.keys(req.body).sort().join(',')!=='planCode')return res.status(400).json({error:'invalid_request'});
  const c=billing.config();billing.validatePlan(req.body.planCode,c);
  await billing.ensureSchema();
  return res.json(await billing.createTestCheckout({sellerId:req.user.id,planCode:req.body.planCode}));
 }catch(e){return reject(res,e);}
}));
router.post('/sync',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)
   return res.status(400).json({error:'invalid_request'});
  if(!billing.config().readyForCheckout)return res.status(503).json({error:'sandbox_not_configured'});
  await billing.ensureSchema();
  res.json(await billing.reconcileTestSubscription({sellerId:req.user.id}));
 }catch(e){return reject(res,e);}
}));
router.post('/portal',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  if(req.body&&Object.keys(req.body).length!==0)return res.status(400).json({error:'invalid_request'});
  const c=billing.config();if(!c.readyForCheckout)return res.status(503).json({error:'sandbox_not_configured'});
  await billing.ensureSchema();
  res.json(await billing.createTestPortal({sellerId:req.user.id}));
 }catch(e){return reject(res,e);}
}));
module.exports={router};
