'use strict';
// V3.2.23 — manual web article import. Never auto-publishes, no account creation.
const express=require('express');
const rateLimit=require('express-rate-limit');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensurePublicationSchema}=require('./editorial-publication-v323');
const {CATEGORIES}=require('../services/editorial-v320');
const {normalizedTitle}=require('../services/editorial-rss-v321');
const {articleUrlV3223,fetchWebPageV3223,draftFromMetadataV3223,
  fingerprintV3223,plainV3223}=require('../services/editorial-web-import-v3223');
const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
 try{await ensurePublicationSchema();next();}
 catch(e){console.error('Web article import schema unavailable',e);
   res.status(503).json({error:'editorial_web_unavailable'});}
});
const previewLimiter=rateLimit({windowMs:15*60*1000,limit:30,
  standardHeaders:'draft-7',legacyHeaders:false,
  message:{error:'editorial_web_rate_limited'}});
const saveLimiter=rateLimit({windowMs:15*60*1000,limit:15,
  standardHeaders:'draft-7',legacyHeaders:false,
  message:{error:'editorial_web_rate_limited'}});
const previewSchema=z.object({url:z.string().min(10).max(2048)}).strict();
const saveSchema=z.object({
  url:z.string().min(10).max(2048),
  category:z.enum(CATEGORIES),
  profileId:z.number().int().positive().safe(),
  title:z.string().trim().min(12).max(220),
  summary:z.string().trim().min(70).max(1100),
  note:z.string().trim().min(12).max(500),
  manualFallback:z.boolean().default(false),
  manualSourceTitle:z.string().trim().max(240).default(''),
  manualSourceExcerpt:z.string().trim().max(400).default(''),
  confirmedSource:z.literal(true),
  confirmedOriginality:z.literal(true),
  confirmedPhotoIsNotLicensed:z.literal(true)
}).strict();
function err(code,status=422){
 const e=new Error(code);e.code=code;e.status=status;return e;
}
function fail(res,e){
 if(e.code==='23505')return res.status(409).json({error:'editorial_web_duplicate'});
 // The shared DNS/TLS guard can emit feed_* errors; keep network internals
 // private and give administrators a recognizable safe fallback.
 if(/^feed_/.test(String(e.code||''))){
   return res.status(422).json({error:'editorial_web_source_unreachable'});
 }
 if(e.status||/^editorial_web_/.test(e.code||''))
   return res.status(e.status||422).json({error:e.code||'editorial_web_invalid'});
 console.error('Manual web article import failed:',e);
 res.status(500).json({error:'editorial_web_failed'});
}
async function duplicateArticle(url){
 const q=await db.query(
   'SELECT id,status FROM editorial_candidates WHERE canonical_url=$1 LIMIT 1',[url]);
 return q.rows[0]||null;
}
router.post('/web-import/preview',previewLimiter,async(req,res)=>{
 try{
   const input=previewSchema.safeParse(req.body);
   if(!input.success)throw err('editorial_web_input_invalid',400);
   const url=articleUrlV3223(input.data.url);
   if(!url)throw err('editorial_web_url_invalid',400);
   const existing=await duplicateArticle(url);
   if(existing)throw err('editorial_web_duplicate',409);
   const extracted=await fetchWebPageV3223(url);
   const profiles=await db.query(
     "SELECT id,name,category FROM editorial_profiles WHERE status='ready' ORDER BY category,name LIMIT 150"
   );
   res.set('Cache-Control','private, no-store');
   res.json({
     ok:true,extracted,draft:draftFromMetadataV3223(extracted),
     profiles:profiles.rows,sourceKind:'web',publication:'never_automatic',
     warning:'Metadata are informational, not verified article facts or a license to reuse the photo.'
   });
 }catch(e){fail(res,e);}
});
router.post('/web-import/save',saveLimiter,async(req,res)=>{
 let client;
 try{
   const parsed=saveSchema.safeParse(req.body);
   if(!parsed.success)throw err('editorial_web_draft_invalid',400);
   const input=parsed.data;
   const url=articleUrlV3223(input.url);
   if(!url)throw err('editorial_web_url_invalid',400);
   const previous=await duplicateArticle(url);
   if(previous)throw err('editorial_web_duplicate',409);
   // Fetch again at save time. Browser-submitted source metadata is never trusted.
   // The optional manual fallback is explicitly confirmed for sites with paywalls/JS.
   const original=input.manualFallback?{
     canonical_url:url,source_title:input.manualSourceTitle,
     source_excerpt:input.manualSourceExcerpt,source_image_url:null,source_name:new URL(url).hostname,
     published_at:null
   }:await fetchWebPageV3223(url);
   if(String(original.source_title||'').trim().length<8)
     throw err('editorial_web_title_unavailable',422);
   if(normalizedTitle(input.title)===normalizedTitle(original.source_title))
     throw err('editorial_web_rewrite_title_required',422);
   if(normalizedTitle(input.summary)===normalizedTitle(original.source_excerpt||''))
     throw err('editorial_web_rewrite_summary_required',422);
   client=await db.pool.connect();
   await client.query('BEGIN');
   const profile=await client.query(
     "SELECT id,name,category,status FROM editorial_profiles WHERE id=$1 FOR SHARE",
     [input.profileId]
   );
   if(!profile.rowCount||profile.rows[0].status!=='ready'||
     profile.rows[0].category!==input.category)
     throw err('editorial_web_profile_invalid',409);
   const exists=await client.query(
     'SELECT id FROM editorial_candidates WHERE canonical_url=$1 LIMIT 1',[url]
   );
   if(exists.rowCount)throw err('editorial_web_duplicate',409);
   // A WEB source records the exact article URL. It is approved only by
   // explicit admin confirmation, link-only, never as an RSS fetching endpoint.
   const source=await client.query(
     "INSERT INTO editorial_sources(name,feed_url,source_kind,category,profile_id,status,rights_mode,rights_reference) "+
     "VALUES($1,$2,'web',$3,$4,'approved','link_only','') RETURNING id",
     [plainV3223(original.source_name||new URL(url).hostname,100),
       url,input.category,input.profileId]
   );
   const candidate=await client.query(
     "INSERT INTO editorial_candidates(source_id,profile_id,category,source_title,source_excerpt,"+
     "canonical_url,title_fingerprint,published_at,source_image_url,status,"+
     "editorial_title,editorial_summary,editor_note,revision,edited_at) "+
     "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,1,now()) "+
     "RETURNING id,status,revision",
     [source.rows[0].id,input.profileId,input.category,
       plainV3223(original.source_title,240),plainV3223(original.source_excerpt,400),
       url,fingerprintV3223(input.category,original.source_title),
       original.published_at,original.source_image_url,input.title,input.summary,input.note]
   );
   await client.query(
     "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
     "VALUES($1,'import_web','candidate',$2,$3::jsonb)",
     [req.user.id,candidate.rows[0].id,JSON.stringify({
       sourceId:source.rows[0].id,sourceKind:'web',origin:new URL(url).origin,
       url,manualFallback:input.manualFallback,hasImageSuggestion:!!original.source_image_url,
       photoNotLicensed:true,manualReviewRequired:true,autoPublished:false
     })]
   );
   await client.query('COMMIT');
   res.set('Cache-Control','no-store');
   res.status(201).json({
     ok:true,candidate:candidate.rows[0],sourceId:source.rows[0].id,
     published:false,pendingReview:true,photoLicensed:false,
     editAnchor:'#editorialInbox'
   });
 }catch(e){
   if(client)try{await client.query('ROLLBACK');}catch(x){console.error('Import rollback failed',x);}
   fail(res,e);
 }finally{client?.release();}
});
module.exports=router;
