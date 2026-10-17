'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAdmin}=require('../middleware/auth');
const {checkOrigin}=require('./marketplace-subscription-lifecycle-v3279');
const commercial=require('../services/marketplace-subscription-commercial-v3281');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use(requireAdmin);
router.use((_req,res,next)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 Promise.resolve().then(()=>commercial.ensureCommercialSchema()).then(()=>next(),next);
});
router.get('/',wrap(async(_req,res)=>res.json(await commercial.overview())));
const proposal=require('../services/marketplace-commercial-plans-v3282');
router.get('/features',wrap(async(_req,res)=>{
 await proposal.ensureSchema();
 res.json(await proposal.list());
}));
const limiter=rateLimit({windowMs:60*60*1000,max:30,standardHeaders:true,legacyHeaders:false,
 handler:(_req,res)=>res.status(429).json({error:'rate_limit_exceeded'})});
function failure(res,err){if(err instanceof commercial.CommercialError)return res.status(err.status).json({error:err.code});throw err;}
router.post('/features/:planCode',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  await proposal.ensureSchema();
  res.json(await proposal.save({planCode:req.params.planCode,body:req.body,adminId:req.user.id}));
 }catch(err){
  if(err instanceof proposal.ProposalError)return res.status(err.status).json({error:err.code});
  throw err;
 }
}));
router.post('/drafts/:planCode',limiter,checkOrigin,wrap(async(req,res)=>{
 try{res.json(await commercial.saveDraft({planCode:req.params.planCode,body:req.body,adminId:req.user.id}));}
 catch(e){return failure(res,e);}
}));
router.post('/reviews/:topic',limiter,checkOrigin,wrap(async(req,res)=>{
 try{res.json(await commercial.saveReview({topic:req.params.topic,body:req.body,adminId:req.user.id}));}
 catch(e){return failure(res,e);}
}));
module.exports={router};
