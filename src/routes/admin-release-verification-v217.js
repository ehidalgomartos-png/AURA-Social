'use strict';

const express=require('express');
const {requireAdmin}=require('../middleware/auth');

function createReleaseVerificationRoutes(verifier){
  if(!verifier?.snapshot)throw new TypeError('Release verifier required');
  const router=express.Router();
  router.use(requireAdmin);
  router.get('/ops/release-verification',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const refresh=req.query?.refresh==='1';
    try{
      const state=await verifier.snapshot({refresh});
      res.json(state);
    }catch(_){
      res.status(503).json({error:'release_verification_unavailable',requestId:req.requestId});
    }
  });
  return router;
}

module.exports={createReleaseVerificationRoutes};
