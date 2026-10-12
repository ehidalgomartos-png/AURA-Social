'use strict';
// V3.2.42 — optional ORIGINAL, self-owned photographs; RSS authorisation is separate.
const express=require('express');
const multer=require('multer');
const rateLimit=require('express-rate-limit');
const fs=require('node:fs/promises');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensurePublicationSchema}=require('./editorial-publication-v323');
const {MAX_IMAGE_BYTES,mimeOfImage,saveEditorialImageV3222}=require('../services/editorial-image-v3222');
const router=express.Router();
const checkedId=v=>/^[1-9]\d{0,14}$/.test(String(v||''))?String(v):null;
const error=(status,code)=>Object.assign(new Error(code),{status,code});
const limited=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',
  legacyHeaders:false,message:{error:'editorial_image_rate_limited'}});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_IMAGE_BYTES,files:1,fields:5},
  fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
const rightsSchema=z.object({
  revision:z.coerce.number().int().min(0).safe(),
  alt:z.string().trim().min(12).max(220),
  credit:z.string().trim().min(3).max(200),
  rightsReference:z.string().trim().min(12).max(1000),
  confirmedOwnedRights:z.union([z.literal('true'),z.literal(true)])
}).strict();
const withoutSchema=z.object({revision:z.number().int().min(0).safe(),confirm:z.literal(true)}).strict();
function fail(res,e){
  if(e instanceof multer.MulterError){
    return res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'editorial_image_too_large':'editorial_image_invalid'});
  }
  if(e.status)return res.status(e.status).json({error:e.code});
  console.error('Editorial media operation failed',e);
  return res.status(500).json({error:'editorial_image_unavailable'});
}
const managed=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>fail(res,e));
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensurePublicationSchema();next();}
  catch(e){console.error('Editorial media schema failed',e);res.status(503).json({error:'editorial_image_unavailable'});}
});
const lockSql="SELECT id,status,revision,editorial_image_url,source_id FROM editorial_candidates WHERE id=$1 FOR UPDATE";
async function assertWritable(client,id,revision){
  const candidate=await client.query(lockSql,[id]);
  if(!candidate.rowCount)throw error(404,'editorial_candidate_not_found');
  const row=candidate.rows[0];
  if(Number(row.revision)!==revision)throw error(409,'editorial_review_stale');
  const active=await client.query(
    'SELECT 1 FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL LIMIT 1',[id]);
  if(active.rowCount)throw error(409,'editorial_unpublish_before_reopen');
  return row;
}
router.post('/images/:id/own',limited,(req,res,next)=>{
  upload.single('photo')(req,res,e=>e?fail(res,e):next());
},managed(async(req,res)=>{
  const id=checkedId(req.params.id);if(!id)throw error(400,'editorial_image_invalid_id');
  const parsed=rightsSchema.safeParse(req.body);
  if(!parsed.success)throw error(400,'editorial_image_confirmation_required');
  const data=parsed.data,signature=mimeOfImage(req.file?.buffer);
  if(!signature||!req.file||req.file.mimetype!==signature.mime)
    throw error(422,'editorial_image_type_invalid');
  let saved=null,client=null;
  try{
    client=await db.pool.connect();
    await client.query('BEGIN');
    const candidate=await assertWritable(client,id,data.revision);
    saved=await saveEditorialImageV3222({
      buffer:req.file.buffer,mime:signature.mime,ext:signature.ext});
    const update=await client.query(
      "UPDATE editorial_candidates SET editorial_image_url=$2,editorial_image_origin='own',"+
      "editorial_image_alt=$3,editorial_image_credit=$4,editorial_image_rights_reference=$5,"+
      "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,edited_at=now() "+
      "WHERE id=$1 RETURNING id,revision,status,editorial_image_url",
      [id,saved.url,data.alt,data.credit,data.rightsReference]);
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
      "VALUES($1,'own_photo','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({revision:update.rows[0].revision,origin:'own',
        photoRightsConfirmed:true,credit:data.credit,rightsReference:data.rightsReference,
        previousImage:!!candidate.editorial_image_url})]);
    await client.query('COMMIT');
    saved=null;
    res.set('Cache-Control','no-store');
    res.json({ok:true,candidate:update.rows[0],requiresNewReview:true,requiresNewQuality:true,published:false});
  }catch(e){
    if(client)try{await client.query('ROLLBACK');}catch(_){}
    if(saved)try{await fs.unlink(saved.absolutePath);}catch(_){}
    throw e;
  }finally{client?.release();}
}));
router.post('/images/:id/without',limited,managed(async(req,res)=>{
  const id=checkedId(req.params.id);if(!id)throw error(400,'editorial_image_invalid_id');
  const parsed=withoutSchema.safeParse(req.body);
  if(!parsed.success)throw error(400,'editorial_image_confirmation_required');
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const row=await assertWritable(client,id,parsed.data.revision);
    if(!row.editorial_image_url){
      await client.query('COMMIT');
      return res.json({ok:true,unchanged:true,published:false});
    }
    const result=await client.query(
      "UPDATE editorial_candidates SET editorial_image_url=NULL,editorial_image_origin=NULL,"+
      "editorial_image_alt=NULL,editorial_image_credit=NULL,editorial_image_rights_reference=NULL,"+
      "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,edited_at=now() "+
      "WHERE id=$1 RETURNING id,revision,status",[id]);
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
      "VALUES($1,'remove_photo','candidate',$2,$3::jsonb)",
      [req.user.id,id,JSON.stringify({revision:result.rows[0].revision,previousPhoto:true})]);
    await client.query('COMMIT');
    res.set('Cache-Control','no-store');
    res.json({ok:true,candidate:result.rows[0],published:false,requiresNewReview:true,requiresNewQuality:true});
  }catch(e){
    try{await client.query('ROLLBACK');}catch(_){}
    throw e;
  }finally{client.release();}
}));
module.exports=router;
