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
// V3.2.84: admin-only commercial what-if preview. No mutations or seller IDs.
const simulator=require('../services/marketplace-commercial-preview-v3284');
router.post('/preview',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  const scenario=simulator.normalize(req.body);
  // proposal.list is SELECT-only. No seller lookups, no operational authorization.
  await decisions.ensureSchema();
  const [proposals,policyRows]=await Promise.all([proposal.list(),decisions.policies()]);
  res.json(simulator.compute(scenario,proposals.plans,policyRows));
 }catch(error){
  if(error instanceof simulator.PreviewError)return res.status(error.status).json({error:error.code});
  throw error;
 }
}));
// V3.2.85: private product-cap decision record, never applied to live endpoints.
const decisions=require('../services/marketplace-commercial-decisions-v3285');
router.get('/definition',wrap(async(_req,res)=>res.json(await decisions.overview())));
// V3.2.86: one explicit, atomic action to propose uncapped catalogues.
// This only modifies private commercial drafts and writes an audit trail.
const unlimited=require('../services/marketplace-commercial-unlimited-v3286');
router.post('/definition/propose-unlimited',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  res.json(await unlimited.apply({body:req.body,adminId:req.user.id}));
 }catch(error){
  if(error instanceof unlimited.UnlimitedError)return res.status(error.status).json({error:error.code});
  throw error;
 }
}));
router.post('/definition/product-policy/:planCode',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  await decisions.ensureSchema();
  res.json(await decisions.save({planCode:req.params.planCode,body:req.body,adminId:req.user.id}));
 }catch(error){
  if(error instanceof decisions.DecisionError)return res.status(error.status).json({error:error.code});
  throw error;
 }
}));
router.post('/features/:planCode',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  await proposal.ensureSchema();
  res.json(await proposal.save({planCode:req.params.planCode,body:req.body,adminId:req.user.id}));
 }catch(err){
  if(err instanceof proposal.ProposalError)return res.status(err.status).json({error:err.code});
  throw err;
 }
}));
// V3.2.88: internal-only, versioned legal/commercial text drafts.
// Neither endpoint can publish terms, activate billing or accept seller consent.
const contractDrafts=require('../services/marketplace-contract-drafts-v3288');
// V3.2.89: admin-only launch preparation, strictly read-only.
const launch=require('../services/marketplace-launch-readiness-v3289');
router.get('/launch-readiness',wrap(async(_req,res)=>{
 res.json(await launch.overview());
}));
// V3.2.90: private starter text / price orientations, GET-only, no writes.
const draftingHelp=require('../services/marketplace-commercial-guidance-v3290');
router.get('/guidance',wrap(async(_req,res)=>{
 res.json(draftingHelp.guide());
}));
router.get('/contract-drafts',wrap(async(_req,res)=>{
 res.json(await contractDrafts.list());
}));
router.post('/contract-drafts/:planCode',limiter,checkOrigin,wrap(async(req,res)=>{
 try{
  res.json(await contractDrafts.save({
   planCode:req.params.planCode,body:req.body,adminId:req.user.id
  }));
 }catch(error){
  if(error instanceof contractDrafts.ContractDraftError)
   return res.status(error.status).json({error:error.code});
  throw error;
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
