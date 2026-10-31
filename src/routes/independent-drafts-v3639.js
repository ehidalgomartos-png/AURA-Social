'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAuth}=require('../middleware/auth');
const drafts=require('../services/independent-drafts-v3639');
const router=express.Router();
const throttle=rateLimit({windowMs:60*60*1000,limit:40,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'demasiados_intentos'}});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const fail=(res,status,error)=>res.status(status).json({error});
function sameOrigin(req,res,next){
 const origin=req.headers.origin;
 if(typeof origin!=='string')return fail(res,403,'origen_requerido');
 try{
  const input=new URL(origin),host=String(req.get('host')||'').toLowerCase();
  const local=/^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host);
  if(input.host.toLowerCase()===host&&(input.protocol==='https:'||(local&&input.protocol==='http:')))return next();
 }catch(_){}
 return fail(res,403,'origen_no_permitido');
}
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(requireAuth);
router.use((req,res,next)=>req.user.ageVerified===true?next():fail(res,403,'solo_adultos_verificados'));
router.get('/borradores',asyncRoute(async(req,res)=>{
 res.json({ok:true,items:await drafts.list(req.user.id)});
}));
router.get('/borradores/:id',asyncRoute(async(req,res)=>{
 if(!drafts.validId(req.params.id))return fail(res,400,'id_invalido');
 const draft=await drafts.get(req.user.id,req.params.id);
 if(!draft)return fail(res,404,'borrador_no_disponible');
 return res.json({ok:true,draft});
}));
router.post('/borradores',sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const draft=await drafts.create(req.user.id,req.body);
 if(!draft)return fail(res,400,'borrador_invalido');
 return res.status(201).json({ok:true,draft});
}));
router.put('/borradores/:id',sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const revision=req.body?.revision;
 if(!drafts.validId(req.params.id)||!Number.isSafeInteger(revision)||revision<1)return fail(res,400,'revision_o_id_invalido');
 const payload={...req.body};delete payload.revision;
 const draft=await drafts.update(req.user.id,req.params.id,revision,payload);
 if(!draft)return fail(res,409,'borrador_no_disponible_o_modificado');
 return res.json({ok:true,draft});
}));
router.delete('/borradores/:id',sameOrigin,throttle,asyncRoute(async(req,res)=>{
 if(!drafts.validId(req.params.id)||!Number.isSafeInteger(req.body?.revision)||req.body.revision<1)
  return fail(res,400,'revision_o_id_invalido');
 if(!(await drafts.remove(req.user.id,req.params.id,req.body.revision)))
  return fail(res,409,'borrador_no_disponible_o_modificado');
 return res.json({ok:true,deleted:true});
}));
// No submit / publish / votes / tips endpoints in this router.
router.use((err,_req,res,next)=>{
 if(res.headersSent)return next(err);
 console.error('Independent drafts route error:',err);
 return res.status(503).json({error:'borradores_temporalmente_no_disponibles'});
});
module.exports={router,sameOrigin};
