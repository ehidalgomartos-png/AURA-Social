'use strict';

const express=require('express');
const {requireAdmin}=require('../middleware/auth');

function createRecoveryAdminRoutes(inspector){
  if(!inspector || typeof inspector.snapshot!=='function')throw new TypeError('dependency inspector required');
  const router=express.Router();
  router.use(requireAdmin);
  router.get('/ops/dependencies',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      // A manual refresh intentionally bypasses the 15-second cache.
      const force=req.query?.refresh==='1';
      const result=await inspector.snapshot({force});
      res.json(result);
    }catch(error){
      console.error('RedLibertad operational dependency check failed',{
        requestId:req.requestId,
        code:'dependency_check_failed'
      });
      res.status(503).json({error:'dependency_check_failed',requestId:req.requestId});
    }
  });
  return router;
}

module.exports={createRecoveryAdminRoutes};
