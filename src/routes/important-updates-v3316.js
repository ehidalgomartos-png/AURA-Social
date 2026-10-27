'use strict';
const express=require('express');
const {z}=require('zod');
const {requireAuth,requireAdmin}=require('../middleware/auth');
function createImportantUpdatesRouter({service}){
 const router=express.Router();
 router.get('/preferences',requireAuth,async(req,res)=>{
   try{const enabled=await service.preference(req.user.id);
     res.json({ok:true,enabled,configured:service.config.enabled});}
   catch(_){res.status(503).json({error:'updates_unavailable'});}
 });
 router.put('/preferences',requireAuth,async(req,res)=>{
   if(typeof req.body?.enabled!=='boolean'||Object.keys(req.body).length!==1)
     return res.status(400).json({error:'invalid_preference'});
   try{await service.savePreference(req.user.id,req.body.enabled);
     res.json({ok:true,enabled:req.body.enabled});}
   catch(_){res.status(503).json({error:'updates_unavailable'});}
 });
 // Email security scanners may GET unsubscribe URLs. A GET only shows confirmation.
 router.get('/unsubscribe',(_req,res)=>{
   const token=String(_req.query.token||'');
   const valid=/^[0-9a-f]{48}$/.test(token);
   res.set('Cache-Control','no-store');
   res.type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8">'+
     '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Preferencias de email · RedLibertad</title></head>'+
     '<body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:16px">'+
     '<h1>Novedades de RedLibertad</h1><p>Puedes dejar de recibir estos correos cuando quieras.</p>'+
     (valid?'<form method="post" action="/api/important-updates/unsubscribe?token='+token+'">'+
       '<button type="submit" style="padding:12px 18px">Confirmar baja</button></form>':
       '<p>Este enlace no es válido.</p>')+
     '</body></html>');
 });
 router.post('/unsubscribe',async(req,res)=>{
   const token=String(req.query.token||req.body?.token||'');
   try{
     await service.unsubscribe(token);
     res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Preferencia guardada</title>'+
       '<body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:16px">'+
       '<h1>Preferencia actualizada</h1><p>Ya no recibirás los boletines de novedades importantes.</p>'+
       '<a href="https://redlibertad.com/">Volver a RedLibertad</a></body></html>');
   }catch(_){res.status(503).type('html').send('<p>No se pudo guardar tu preferencia. Inténtalo de nuevo.</p>');}
 });
 router.get('/admin/status',requireAdmin,async(_req,res)=>{
   try{res.json({ok:true,...await service.status()});}
   catch(_){res.status(503).json({error:'updates_unavailable'});}
 });
 const campaignSchema=z.object({
   title:z.string().trim().min(5).max(120),
   summary:z.string().trim().min(25).max(800)
 }).strict();
 router.post('/admin/send',requireAdmin,async(req,res)=>{
   const parsed=campaignSchema.safeParse(req.body);
   if(!parsed.success)return res.status(400).json({error:'invalid_campaign'});
   if(!service.config.enabled)return res.status(503).json({error:'updates_email_not_configured'});
   try{
     const result=await service.queue({adminId:req.user.id,...parsed.data});
     if(result.queued)void service.poll(); // Already confirmed by the admin.
     res.status(result.duplicate?200:202).json({ok:true,...result});
   }catch(_){res.status(503).json({error:'updates_queue_unavailable'});}
 });
 return router;
}
module.exports={createImportantUpdatesRouter};
