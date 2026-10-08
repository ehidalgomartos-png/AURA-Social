'use strict';
const express=require('express');
const {requireAdmin}=require('../middleware/auth');

function createRuntimeAdminRoutes(monitor){
  if(!monitor || typeof monitor.snapshot!=='function')throw new TypeError('runtime monitor required');
  const router=express.Router();
  router.use(requireAdmin);
  router.get('/ops/runtime',(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(monitor.snapshot());
  });
  return router;
}
module.exports={createRuntimeAdminRoutes};
