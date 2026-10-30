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
// V3.5.7: biblioteca pública exclusivamente de soluciones revisadas por un administrador.
router.get('/solutions',wrap(async(req,res)=>{
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const category=req.query?.categoria;
 if(category!==undefined&&(typeof category!=='string'||!service.CATEGORIES.includes(category)))
  return fail(res,400,'categoria_invalida');
 const query=req.query?.q??'';
 if(typeof query!=='string'||query.length>80||query.trim().length===1)
  return fail(res,400,'busqueda_invalida');
 const items=await service.library({before:before||null,category:category||null,query:query.trim()});
 res.json({ok:true,items,next:items.length===12?items[items.length-1].id:null});
}));
router.post('/questions/:id/library/opt-out',requireAuth,checkOrigin,limiter(12),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const row=await service.optOutLibrary(req.params.id,req.user.id);
 if(!row)return fail(res,404,'peticion_no_encontrada');
 res.json({ok:true,id:row.id});
}));
router.get('/admin/solutions/pending',requireAuth,wrap(async(req,res)=>{
 if(!req.user.isAdmin)return fail(res,403,'administrador_requerido');
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const items=await service.pendingSolutions({before:before||null});
 res.json({ok:true,items,next:items.length===12?items[items.length-1].id:null});
}));
router.post('/admin/solutions/:id/:action',requireAuth,checkOrigin,limiter(40),wrap(async(req,res)=>{
 if(!req.user.isAdmin)return fail(res,403,'administrador_requerido');
 if(!service.validId(req.params.id)||!['approve','revoke'].includes(req.params.action))
  return fail(res,400,'accion_invalida');
 const approve=req.params.action==='approve';
 // La revisión humana no se puede omitir mediante el cliente ni dar por hecha automáticamente.
 if(approve&&(!req.body||req.body.qualityReviewed!==true||
  req.body.privacyReviewed!==true||req.body.nonCommercialReviewed!==true))
  return fail(res,400,'revision_editorial_incompleta');
 const row=await service.approveLibrary(req.params.id,approve,approve?req.user.id:null);
 if(!row)return fail(res,409,'solucion_no_apta');
 res.json({ok:true,id:row.id,approved:!!row.library_approved_answer_id});
}));
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
 const professional=req.query?.profesional;
 if(professional!==undefined&&professional!=='si')return fail(res,400,'filtro_profesional_invalido');
 const items=await service.list({filter,before:before||null,category:category||null,query:query.trim(),professionalOnly:professional==='si'});
 res.json({ok:true,items,next:items.length===24?items[items.length-1].id:null});
}));
// V3.5.16: temas elegidos voluntariamente; solo cada usuario puede consultarlos o cambiarlos.
router.get('/help-topics',requireAuth,wrap(async(req,res)=>{
 const categories=await service.getHelpTopics(req.user.id);
 res.json({ok:true,categories});
}));
router.post('/help-topics',requireAuth,checkOrigin,limiter(20),wrap(async(req,res)=>{
 if(!service.validHelpTopics(req.body?.categories))
  return fail(res,400,'temas_invalidos');
 const saved=await service.setHelpTopics(req.user.id,req.body.categories);
 if(!saved)return fail(res,400,'temas_invalidos');
 res.json({ok:true,categories:saved.categories});
}));
router.get('/questions/for-me',requireAuth,wrap(async(req,res)=>{
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const items=await service.listToHelp(req.user.id,{before:before||null});
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
// Avisos de confianza: solo personas autenticadas, sin sanción ni ocultación automática.
router.post('/answers/:id/report',requireAuth,checkOrigin,limiter(20),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const reason=req.body?.reason;
 if(typeof reason!=='string'||!service.REPORT_REASONS.includes(reason))
  return fail(res,400,'motivo_invalido');
 const saved=await service.reportAnswer(req.params.id,req.user.id,reason);
 if(!saved)return fail(res,409,'aviso_no_disponible_o_ya_enviado');
 res.status(201).json({ok:true,id:saved.id});
}));
router.get('/admin/reports/pending',requireAuth,wrap(async(req,res)=>{
 if(!req.user.isAdmin)return fail(res,403,'administrador_requerido');
 const before=req.query?.antes;
 if(before!==undefined&&!service.validId(before))return fail(res,400,'cursor_invalido');
 const items=await service.pendingAnswerReports({before:before||null});
 res.json({ok:true,items,next:items.length===20?items[items.length-1].id:null});
}));
router.post('/admin/reports/:id/dismiss',requireAuth,checkOrigin,limiter(40),wrap(async(req,res)=>{
 if(!req.user.isAdmin)return fail(res,403,'administrador_requerido');
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const saved=await service.dismissAnswerReport(req.params.id,req.user.id);
 if(!saved)return fail(res,409,'aviso_ya_revisado_o_no_disponible');
 res.json({ok:true,id:saved.id});
}));
router.post('/questions/:id/answers',requireAuth,checkOrigin,limiter(30),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const body=service.validateAnswer(req.body);
 if(!body)return fail(res,400,'respuesta_invalida');
 const professionalRole=service.validateProfessionalRole(req.body?.professionalRole);
 if(professionalRole===undefined)return fail(res,400,'profesion_invalida');
 const disclosure=service.validateProfessionalDisclosure(req.body);
 if(!disclosure)return fail(res,400,'declaracion_profesional_invalida');
 // Una autodeclaración debe ir acompañada de una explicación útil, no solo un anuncio.
 if(disclosure.role && body.split(' Anuncio recomendado:')[0].trim().length<60)
  return fail(res,400,'respuesta_profesional_demasiado_breve');
 const row=await service.answer(req.user.id,req.params.id,body,professionalRole,disclosure);
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
// V3.5.17 — dar las gracias sin puntuaciones y preparar una publicación editable.
router.post('/questions/:id/thank',requireAuth,checkOrigin,limiter(15),wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const row=await service.thankResolved(req.user.id,req.params.id);
 if(!row)return fail(res,409,'agradecimiento_no_disponible');
 res.json({ok:true,id:row.id,thankedAt:row.thanked_at});
}));
router.get('/questions/:id/share-preview',requireAuth,wrap(async(req,res)=>{
 if(!service.validId(req.params.id))return fail(res,400,'id_invalido');
 const row=await service.shareResolvedPreview(req.user.id,req.params.id);
 if(!row)return fail(res,404,'peticion_resuelta_no_disponible');
 res.json({ok:true,id:row.id,title:row.title,url:'/resuelve?id='+row.id});
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
