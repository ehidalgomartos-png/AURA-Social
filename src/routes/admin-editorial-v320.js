'use strict';

const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {CATEGORIES,PROFILE_STATUSES,SOURCE_STATUSES,validateFeedUrl,validateLocalImage,ensureEditorialSchema}=require('../services/editorial-v320');

const router=express.Router();
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensureEditorialSchema(db);next();}
  catch(error){console.error('V3.2 editorial schema failed:',error);res.status(500).json({error:'editorial_unavailable'});}
});

const nullableId=z.union([z.number().int().positive().safe(),z.null()]).default(null);
const profileInput=z.object({
  name:z.string().trim().min(3).max(80),
  slug:z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/),
  bio:z.string().trim().max(500).default(''),
  category:z.enum(CATEGORIES),
  communityId:nullableId,
  avatarUrl:z.string().max(500).default(''),
  coverUrl:z.string().max(500).default(''),
  status:z.enum(PROFILE_STATUSES).default('draft')
}).strict();

const sourceInput=z.object({
  name:z.string().trim().min(3).max(100),
  feedUrl:z.string().trim().max(2048),
  category:z.enum(CATEGORIES),
  profileId:nullableId,
  status:z.enum(SOURCE_STATUSES).default('draft'),
  rightsMode:z.enum(['link_only','licensed']).default('link_only'),
  rightsReference:z.string().trim().max(1000).default(''),
  rightsConfirmed:z.boolean().default(false)
}).strict().superRefine((data,ctx)=>{
  if(!validateFeedUrl(data.feedUrl))ctx.addIssue({code:'custom',path:['feedUrl'],message:'Feed HTTPS no permitido'});
  if(data.rightsMode==='licensed'&&data.rightsReference.length<10)ctx.addIssue({code:'custom',path:['rightsReference'],message:'Indica una referencia documental a la licencia'});
  if(data.status==='approved'&&!data.rightsConfirmed)ctx.addIssue({code:'custom',path:['rightsConfirmed'],message:'Confirmación de condiciones necesaria'});
});

const wrap=handler=>(req,res)=>Promise.resolve().then(()=>handler(req,res)).catch(error=>{
  if(error.status===404)return res.status(404).json({error:'editorial_not_found'});
  if(error.status===403)return res.status(403).json({error:'editorial_community_not_managed'});
  if(error.code==='23505')return res.status(409).json({error:'editorial_already_exists'});
  if(error.code==='23503'||error.code==='23514')return res.status(400).json({error:'editorial_reference_invalid'});
  console.error('V3.2 editorial request failed:',error);
  return res.status(500).json({error:'editorial_request_failed'});
});
function idOf(value){
  const str=String(value);
  return /^[1-9]\d{0,15}$/.test(str)?str:null;
}
function httpError(status){
  const error=new Error('editorial_error');error.status=status;return error;
}
async function checkCommunity(client,id,adminId){
  if(id===null)return;
  const r=await client.query(
    "SELECT 1 FROM communities c LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=$2 WHERE c.id=$1 AND c.privacy='public' AND (c.owner_id=$2 OR m.role IN ('owner','admin')) LIMIT 1",
    [id,adminId]
  );
  if(!r.rowCount)throw httpError(403);
}
async function checkProfile(client,id){
  if(id===null)return;
  const r=await client.query('SELECT 1 FROM editorial_profiles WHERE id=$1',[id]);
  if(!r.rowCount)throw httpError(404);
}
async function writeAndAudit(adminId,action,entityType,work){
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const row=await work(client);
    await client.query(
      'INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
      [adminId,action,entityType,row.id,JSON.stringify({status:row.status,category:row.category,name:row.name})]
    );
    await client.query('COMMIT');
    return row;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release();}
}

router.get('/overview',wrap(async(req,res)=>{
  const [profiles,sources,communities,settings,audit]=await Promise.all([
    db.query('SELECT id,slug,name,bio,category,community_id,avatar_url,cover_url,status,created_at,updated_at FROM editorial_profiles ORDER BY id DESC LIMIT 200'),
    db.query('SELECT id,name,feed_url,category,profile_id,status,rights_mode,rights_reference,last_checked_at,created_at,updated_at FROM editorial_sources ORDER BY id DESC LIMIT 200'),
    db.query("SELECT DISTINCT c.id,c.name FROM communities c LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=$1 WHERE c.privacy='public' AND (c.owner_id=$1 OR m.role IN ('owner','admin')) ORDER BY c.name LIMIT 100",[req.user.id]),
    db.query('SELECT review_required,ingestion_enabled,auto_publish_enabled FROM editorial_settings WHERE singleton=TRUE'),
    db.query('SELECT id,action,entity_type,entity_id,created_at FROM editorial_audit ORDER BY created_at DESC,id DESC LIMIT 30')
  ]);
  res.json({
    version:'3.2.3',
    profiles:profiles.rows,sources:sources.rows,communities:communities.rows,
    settings:settings.rows[0]||{review_required:true,ingestion_enabled:false,auto_publish_enabled:false},
    audit:audit.rows,
    categories:CATEGORIES,
    capabilities:{feedFetch:true,drafts:true,publishing:true,autoPublishing:false,realAccounts:false,mode:'manual-only'}
  });
}));

router.post('/profiles',wrap(async(req,res)=>{
  const parsed=profileInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_editorial_profile',details:parsed.error.flatten()});
  const d=parsed.data;
  const avatar=validateLocalImage(d.avatarUrl),cover=validateLocalImage(d.coverUrl);
  if(avatar===null||cover===null)return res.status(400).json({error:'editorial_image_must_be_local'});
  const row=await writeAndAudit(req.user.id,'create','profile',async client=>{
    await checkCommunity(client,d.communityId,req.user.id);
    const r=await client.query(
      'INSERT INTO editorial_profiles(name,slug,bio,category,community_id,avatar_url,cover_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [d.name,d.slug,d.bio,d.category,d.communityId,avatar||null,cover||null,d.status]
    );
    return r.rows[0];
  });
  res.status(201).json({ok:true,profile:row});
}));

router.put('/profiles/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id);
  if(!id)return res.status(400).json({error:'invalid_editorial_id'});
  const parsed=profileInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_editorial_profile',details:parsed.error.flatten()});
  const d=parsed.data;
  const avatar=validateLocalImage(d.avatarUrl),cover=validateLocalImage(d.coverUrl);
  if(avatar===null||cover===null)return res.status(400).json({error:'editorial_image_must_be_local'});
  const row=await writeAndAudit(req.user.id,'update','profile',async client=>{
    await checkCommunity(client,d.communityId,req.user.id);
    const r=await client.query(
      'UPDATE editorial_profiles SET name=$2,slug=$3,bio=$4,category=$5,community_id=$6,avatar_url=$7,cover_url=$8,status=$9,updated_at=now() WHERE id=$1 RETURNING *',
      [id,d.name,d.slug,d.bio,d.category,d.communityId,avatar||null,cover||null,d.status]
    );
    if(!r.rowCount)throw httpError(404);
    return r.rows[0];
  });
  res.json({ok:true,profile:row});
}));

router.post('/sources',wrap(async(req,res)=>{
  const parsed=sourceInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_editorial_source',details:parsed.error.flatten()});
  const d=parsed.data;
  const url=validateFeedUrl(d.feedUrl);
  const row=await writeAndAudit(req.user.id,'create','source',async client=>{
    await checkProfile(client,d.profileId);
    const r=await client.query(
      'INSERT INTO editorial_sources(name,feed_url,category,profile_id,status,rights_mode,rights_reference) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [d.name,url,d.category,d.profileId,d.status,d.rightsMode,d.rightsReference]
    );
    return r.rows[0];
  });
  res.status(201).json({ok:true,source:row});
}));

router.put('/sources/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id);
  if(!id)return res.status(400).json({error:'invalid_editorial_id'});
  const parsed=sourceInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_editorial_source',details:parsed.error.flatten()});
  const d=parsed.data;
  const url=validateFeedUrl(d.feedUrl);
  const row=await writeAndAudit(req.user.id,'update','source',async client=>{
    await checkProfile(client,d.profileId);
    const r=await client.query(
      'UPDATE editorial_sources SET name=$2,feed_url=$3,category=$4,profile_id=$5,status=$6,rights_mode=$7,rights_reference=$8,updated_at=now() WHERE id=$1 RETURNING *',
      [id,d.name,url,d.category,d.profileId,d.status,d.rightsMode,d.rightsReference]
    );
    if(!r.rowCount)throw httpError(404);
    return r.rows[0];
  });
  res.json({ok:true,source:row});
}));

module.exports=router;
