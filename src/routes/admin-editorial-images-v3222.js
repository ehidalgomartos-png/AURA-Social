'use strict';
// Administrative, never-public image acquisition. No automatic remote fetching.
const express=require('express');
const rateLimit=require('express-rate-limit');
const {z}=require('zod');
const fs=require('node:fs/promises');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensurePublicationSchema}=require('./editorial-publication-v323');
const {fetchImageV3222,saveEditorialImageV3222,validatedImageUrl}=
  require('../services/editorial-image-v3222');
const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensurePublicationSchema();next();}
  catch(err){console.error('Editorial photo schema unavailable',err);
    res.status(503).json({error:'editorial_image_unavailable'});}
});
const safeId=id=>/^[1-9]\d{0,14}$/.test(String(id||''))?String(id):null;
const limiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',
  legacyHeaders:false,message:{error:'editorial_image_rate_limited'}});
const imageInput=z.object({
  revision:z.number().int().min(0).safe(),
  confirmedPhotoRights:z.literal(true),
  alt:z.string().trim().min(12).max(220),
  credit:z.string().trim().min(3).max(200),
  photoRightsReference:z.string().trim().min(12).max(1000)
}).strict();
function err(status,code){const e=new Error(code);e.status=status;e.code=code;return e;}
function respondError(res,e){
  if(e.status||/^editorial_image_/.test(e.code||'')){
    return res.status(e.status||422).json({error:e.code||'editorial_image_invalid'});
  }
  console.error('Editorial photo operation failed:',e);
  res.status(500).json({error:'editorial_image_unavailable'});
}
function checkImageSource(row,{licensed=false}={}){
  if(!row)throw err(404,'editorial_candidate_not_found');
  if(!row.source_id||!row.source_image_url||!validatedImageUrl(row.source_image_url))
    throw err(409,'editorial_image_missing');
  if(row.source_status!=='approved')throw err(409,'editorial_image_source_inactive');
  if(licensed&&(row.rights_mode!=='licensed'||String(row.rights_reference||'').trim().length<10))
    throw err(409,'editorial_image_source_license_required');
}
const candidateSql="SELECT c.id,c.revision,c.status,c.source_id,c.source_image_url,"+
  "s.status AS source_status,s.rights_mode,s.rights_reference "+
  "FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id "+
  "WHERE c.id=$1";
router.get('/images/:id/preview',limiter,async(req,res)=>{
  try{
    const id=safeId(req.params.id);
    if(!id)throw err(400,'editorial_image_invalid_id');
    const c=await db.query(candidateSql,[id]);
    const row=c.rows[0];checkImageSource(row);
    const image=await fetchImageV3222(row.source_image_url);
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Content-Security-Policy',"default-src 'none'; sandbox");
    res.type(image.mime).send(image.buffer);
  }catch(e){respondError(res,e);}
});
router.post('/images/:id/use',limiter,async(req,res)=>{
  let stored=null,client=null;
  try{
    const id=safeId(req.params.id);
    if(!id)throw err(400,'editorial_image_invalid_id');
    const input=imageInput.safeParse(req.body);
    if(!input.success)throw err(400,'editorial_image_confirmation_required');
    const data=input.data;
    const preliminary=await db.query(candidateSql,[id]);
    const original=preliminary.rows[0];
    checkImageSource(original,{licensed:true});
    if(original.revision!==data.revision)throw err(409,'editorial_review_stale');
    // No download if source licensing/preflight/revision fails.
    const downloaded=await fetchImageV3222(original.source_image_url);
    stored=await saveEditorialImageV3222(downloaded);
    client=await db.pool.connect();
    await client.query('BEGIN');
    const r=await client.query(candidateSql+' FOR UPDATE OF c',[id]);
    const candidate=r.rows[0];
    checkImageSource(candidate,{licensed:true});
    if(candidate.revision!==data.revision ||
      candidate.source_image_url!==original.source_image_url ||
      String(candidate.source_id)!==String(original.source_id))
      throw err(409,'editorial_review_stale');
    const source=await client.query(
      'SELECT id,status,rights_mode,rights_reference FROM editorial_sources WHERE id=$1 FOR SHARE',
      [candidate.source_id]
    );
    if(!source.rowCount||source.rows[0].status!=='approved'||
      source.rows[0].rights_mode!=='licensed'||String(source.rows[0].rights_reference||'').trim().length<10)
      throw err(409,'editorial_image_source_license_required');
    const live=await client.query(
      'SELECT id FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL FOR UPDATE',[id]
    );
    if(live.rowCount)throw err(409,'editorial_unpublish_before_reopen');
    // All previous approval/quality gates must be re-run after choosing an image.
    const saved=await client.query(
      "UPDATE editorial_candidates SET editorial_image_url=$2,editorial_image_alt=$3,"+
      "editorial_image_credit=$4,editorial_image_rights_reference=$5,"+
      "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,edited_at=now() "+
      "WHERE id=$1 RETURNING id,revision,status,editorial_image_url",
      [id,stored.url,data.alt,data.credit,data.photoRightsReference]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
      "VALUES($1,'license_image','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({sourceId:candidate.source_id,
        priorRevision:candidate.revision,newRevision:saved.rows[0].revision,
        imageUrl:stored.url,credit:data.credit,photoRightsReference:data.photoRightsReference,
        sourceLicenseReference:source.rows[0].rights_reference,
        photoRightsConfirmed:true})]
    );
    await client.query('COMMIT');
    stored=null;
    res.set('Cache-Control','no-store');
    res.json({ok:true,candidate:saved.rows[0],published:false,requiresNewReview:true,requiresNewQuality:true});
  }catch(error){
    if(client)try{await client.query('ROLLBACK');}catch(e){console.error('Photo rollback failed',e);}
    if(stored)try{await fs.unlink(stored.absolutePath);}catch(e){console.error('Photo rollback cleanup failed',e);}
    respondError(res,error);
  }finally{client?.release();}
});
module.exports=router;
