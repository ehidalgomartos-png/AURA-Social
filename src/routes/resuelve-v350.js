'use strict';
// V3.5.0 — API Resuelve. Escrituras solo de usuarios activos y mismo origen.
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAuth}=require('../middleware/auth');
const service=require('../services/resuelve-v350');
const router=express.Router();
const fail=(res,status,error)=>res.status(status).json({error});
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const limiter=(max)=>rateLimit({windowMs:60*60*1000,limit:max,standardHeaders:'draft-7',legacyHeaders:false,
 keyGenerator:req=>String(req.user.id),
 message:{error:'demasiados_intentos'}});
function checkOrigin(req,res,next){
 const origin=req.headers.origin, bearer=/^Bearer\s+\S+$/i.test(String(req.headers.authorization||''));
 if(!origin){
  if(bearer)return next();
  return fail(res,403,'origen_requerido');
 }
 try{
  const url=new URL(origin);
  const host=String(req.get('host')||'').toLowerCase();
  const local=/^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host);
  if((url.protocol==='https:'||local&&url.protocol==='http:')&&url.host.toLowerCase()===host)
   return next();
 }catch(_){}
 return fail(res,403,'origen_no_permitido');
}
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/questions',wrap(async(req,res)=>{
 const filter=String(req.query?.estado||'open');
 if(!['open','resolved','all'].includes(filter))return fail(res,400,'filtro_invalido');
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const category=req.query?.categoria;
 if(category!==undefined&&(typeof category!=='string'||!service.CATEGORIES.includes(category)))
  return fail(res,400,'categoria_invalida');
 const query=req.query?.q??'';
 if(typeof query!=='string'||query.length>80||(query.trim().length===1))
  return fail(res,400,'busqueda_invalida');
 const items=await service.list({filter,before:before||null,category:category||null,query:query.trim()});
 res.json({ok:true,items,next:items.length===24?items[items.length-1].id:null});
}));
router.get('/questions/mine',requireAuth,wrap(async(req,res)=>{
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const items=await service.listMine(req.user.id,{before:before||null});
 res.json({ok:true,items,next:items.length===24?items[items.length-1].id:null});
}));
router.get('/questions/:id',wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const result=await service.detail(req.params.id);
 if(!result)return fail(res,404,'peticion_no_encontrada');
 res.json({ok:true,...result});
}));
router.post('/questions',requireAuth,checkOrigin,limiter(10),wrap(async(req,res)=>{
 const data=service.validateQuestion(req.body);
 if(!data)return fail(res,400,'peticion_invalida');
 const row=await service.ask(req.user.id,data);
 res.status(201).json({ok:true,id:row.id});
}));
router.post('/questions/:id/answers',requireAuth,checkOrigin,limiter(30),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const body=service.validateAnswer(req.body);
 if(!body)return fail(res,400,'respuesta_invalida');
 const row=await service.answer(req.user.id,req.params.id,body);
 if(!row)return fail(res,409,'peticion_no_disponible');
 res.status(201).json({ok:true,id:row.id});
}));
router.post('/questions/:id/solve',requireAuth,checkOrigin,limiter(30),wrap(async(req,res)=>{
 if(!service.validId(req.params.id)||!service.validId(req.body?.answerId))
  return fail(res,400,'respuesta_invalida');
 const row=await service.solve(req.user.id,req.params.id,req.body.answerId);
 if(!row)return fail(res,409,'no_se_puede_marcar_solucion');
 res.json({ok:true,id:row.id,acceptedAnswerId:row.accepted_answer_id});
}));
router.post('/questions/:id/reopen',requireAuth,checkOrigin,limiter(15),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const row=await service.reopen(req.user.id,req.params.id);
 if(!row)return fail(res,409,'no_se_puede_reabrir');
 res.json({ok:true,id:row.id});
}));
router.post('/admin/:kind/:id/hide',requireAuth,checkOrigin,limiter(50),wrap(async(req,res)=>{
 if(!req.user.isAdmin)return fail(res,403,'administrador_requerido');
 if(!service.validId(req.params.id)||!['question','answer'].includes(req.params.kind))
  return fail(res,400,'id_invalido');
 const row=await service.moderate(req.params.kind,req.params.id);
 if(!row)return fail(res,404,'elemento_no_encontrado');
 res.json({ok:true,id:row.id});
}));
router.use((error,_req,res,next)=>{
 console.error('Resuelve error:',error?.code||error?.message||'desconocido');
 if(res.headersSent)return next(error);
 res.status(503).json({error:'resuelve_no_disponible'});
});
module.exports={router,checkOrigin};
