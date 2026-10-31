'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAuth,requireAdmin}=require('../middleware/auth');
const db=require('../db');
const drafts=require('../services/independent-drafts-v3639');
const review=require('../services/independent-review-v3640');
const publication=require('../services/independent-publication-v3641');
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
// Registration enforces 18+. age_verified is a separate identity-verification flag
// which starts false for most adult accounts; verify DOB directly instead.
router.use(async(req,res,next)=>{
 // Administrator accounts may be provisioned separately from public sign-up.
 // Their permissions are still checked by requireAdmin on each admin route.
 if(req.user?.isAdmin===true||req.user?.is_admin===true)return next();
 try{
  const result=await db.query("SELECT 1 FROM users WHERE id=$1 AND status='active' AND birth_date <= (CURRENT_DATE - INTERVAL '18 years') LIMIT 1",[req.user.id]);
  if(!result.rowCount)return fail(res,403,'solo_adultos');
  next();
 }catch(error){next(error);}
});
// V3.6.40 — humans receive submissions privately; nothing is published.
router.get('/mis-envios',asyncRoute(async(req,res)=>{
 res.json({ok:true,items:await review.mySubmissions(req.user.id)});
}));
router.post('/borradores/:id/enviar',sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const result=await review.submit(req.user.id,req.params.id,req.body?.revision,req.body?.certified,req.body?.publishConsent);
 if(result.error)return fail(res,result.error==='articulo_incompleto'?400:409,result.error);
 return res.status(201).json({ok:true,item:result.item,published:false});
}));
router.get('/admin/pendientes',requireAdmin,asyncRoute(async(req,res)=>{
 res.json({ok:true,items:await review.pending(req.user.id)});
}));
router.post('/admin/envios/:id/revisar',requireAdmin,sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const result=await review.review(req.user.id,req.params.id,req.body?.revision,req.body?.decision,req.body?.reason,req.body?.confirmed);
 if(result.error)return fail(res,result.error==='revision_invalida'?400:409,result.error);
 return res.json({ok:true,item:result.item,published:false});
}));
// V3.6.41 — explicitly separate public release from approval.
router.get('/admin/aprobados',requireAdmin,asyncRoute(async(req,res)=>{
 res.json({ok:true,items:await publication.readyForPublication(req.user.id)});
}));
router.get('/admin/publicados',requireAdmin,asyncRoute(async(_req,res)=>{
 res.json({ok:true,items:await publication.liveAdmin()});
}));
router.post('/admin/envios/:id/publicar',requireAdmin,sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const result=await publication.publish(req.user.id,req.params.id,req.body?.revision,req.body?.rightsChecked,req.body?.confirmed);
 if(result.error)return fail(res,409,result.error);
 return res.status(201).json({ok:true,published:true,publication:result.item,url:'/noticias/redactores/voces/'+result.item.id});
}));
router.post('/admin/publicaciones/:id/retirar',requireAdmin,sameOrigin,throttle,asyncRoute(async(req,res)=>{
 const result=await publication.withdraw(req.user.id,req.params.id,req.body?.reason,req.body?.confirmed);
 if(result.error)return fail(res,409,result.error);
 return res.json({ok:true,withdrawn:true,publication:result.item});
}));
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
// Publication requires an explicit admin decision, separate from human approval.
// No automatic publish / votes / tips / financial actions exist here.
router.use((err,_req,res,next)=>{
 if(res.headersSent)return next(err);
 if(err.code==='23503')return res.status(409).json({error:'borrador_en_revision'});
 console.error('Independent drafts route error:',err);
 return res.status(503).json({error:'borradores_temporalmente_no_disponibles'});
});
module.exports={router,sameOrigin};
