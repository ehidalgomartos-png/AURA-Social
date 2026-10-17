'use strict';
// This must be mounted BEFORE express.json in server.js. Raw request bytes are required for HMAC.
const express=require('express');
const billing=require('../services/marketplace-stripe-test-v3280');
const router=express.Router();
router.post('/',express.raw({type:'application/json',limit:'256kb'}),async(req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 const c=billing.config();
 if(!c.readyForCheckout)return res.status(503).json({error:'sandbox_not_configured'});
 try{
  const event=billing.webhookEvent(req.body,req.get('stripe-signature'),c.webhookSecret);
  if(!billing.ALLOWED_EVENTS.has(event.type))return res.status(200).json({received:true,ignored:true});
  await billing.ensureSchema();
  const result=await billing.recordTestEvent(event);
  return res.status(200).json({received:true,duplicate:result.duplicate===true});
 }catch(error){
  if(error?.status&&error.status>=400&&error.status<600)return res.status(error.status).json({error:error.message});
  next(error);
 }
});
module.exports={router};
