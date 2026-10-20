'use strict';
// V3.2.123 — private, explicit, quota-bounded Google URL Inspection.
const express=require('express');
const rateLimit=require('express-rate-limit');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const gsc=require('../services/marketplace-gsc-readonly-v32123');
const followup=require('../services/marketplace-gsc-followup-v32125');
const uninspected=require('../services/marketplace-gsc-uninspected-v32126');
const ORIGIN=gsc.ORIGIN;
function sameOriginJson(req,res,next){
 // JSON with exact expected Origin, not a cookie-based cross-site form.
 // The fixed canonical production origin is intentional: do not trust Host
 // headers or client-supplied URLs to authorize an outbound Google call.
 if(req.headers?.origin!==ORIGIN||
    !/^application\/json(?:;|$)/i.test(String(req.headers?.['content-type']||'')))
  return res.status(403).json({error:'gsc_same_origin_json_required'});
 next();
}
const limiter=rateLimit({
 windowMs:60*60*1000,max:6,standardHeaders:true,legacyHeaders:false,
 keyGenerator:req=>'gsc-admin-'+String(req.user?.id||'anonymous'),
 message:{error:'gsc_hourly_limit'}
});
function createGscRouter({listingPath,ensureMarketplaceSchema}={}){
 if(typeof listingPath!=='function'||typeof ensureMarketplaceSchema!=='function')
  throw Error('gsc_route_dependencies_required');
 const router=express.Router();
 // V3.2.126 — private, paginated public sale products without a saved
 // successful manual inspection in the retained 90-day window. No Google call.
 router.get('/pendientes',requireAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','private,no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  const page=uninspected.parsePage(req.query?.pagina);
  const search=uninspected.parseSearch(req.query?.q);
  const order=uninspected.parseOrder(req.query?.orden);
  if(page===null||search===null||order===null)
   return res.status(400).json({error:'gsc_pending_invalid_filter'});
  try{
   await ensureMarketplaceSchema();
   await followup.ensureSchema(db);
   return res.json(await uninspected.pending(db,{listingPath,page,search,order}));
  }catch(_){
   return res.status(503).json({error:'gsc_pending_unavailable'});
  }
 });
 // V3.2.125 — inspect the already-saved status history without contacting Google.
 router.get('/seguimiento',requireAdmin,async(_req,res,next)=>{
  res.setHeader('Cache-Control','private,no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  try{
   await ensureMarketplaceSchema();
   return res.json(await followup.history(db,{listingPath}));
  }catch(_){
   return res.status(503).json({error:'gsc_followup_unavailable'});
  }
 });
 router.post('/inspeccionar',requireAdmin,sameOriginJson,limiter,async(req,res,next)=>{
  res.setHeader('Cache-Control','private,no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  try{
   const config=gsc.serviceConfig();
   if(!config.configured)return res.status(503).json({error:'gsc_not_configured'});
   const id=req.body?.id;
   if(!gsc.safeListingId(id))return res.status(400).json({error:'gsc_invalid_listing_id'});
   await ensureMarketplaceSchema();
   const rows=await db.query(gsc.PUBLIC_LISTING_SQL,[id]);
   if(!rows.rowCount)return res.status(404).json({error:'gsc_listing_not_public'});
   const inspection=await gsc.inspect({id,row:rows.rows[0],config,listingPath});
   const info=followup.interpretation(inspection);
   // Only successful explicit inspections of active PUBLIC sale products
   // are persisted. Never store GSC credentials or raw Google responses.
   let followupSaved=false;
   if(rows.rows[0].kind==='product'&&rows.rows[0].deal==='sale'){
    try{
     await followup.save(db,{listingId:id,inspection});
     followupSaved=true;
    }catch(_){
     // Preserve the genuine manual Google result even when local
     // inspection history storage is temporarily unavailable.
    }
   }
   return res.json({ok:true,inspection,followup:info,followupSaved});
  }catch(error){
   if(error instanceof gsc.GscError)
    return res.status(error.status).json({error:error.code});
   next(error);
  }
 });
 return router;
}
module.exports={createGscRouter,sameOriginJson,limiter};
