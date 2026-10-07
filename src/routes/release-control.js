const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth,requireAdmin}=require('../middleware/auth');
const {ensureReleaseSchema,featuresForUser}=require('../services/release-control');

const router=express.Router();

router.use(requireAuth);
router.use(async(_req,res,next)=>{
  try{
    await ensureReleaseSchema();
    next();
  }catch(error){
    console.error('RedLibertad V1.73 release control bootstrap failed:',error);
    res.status(500).json({error:'release_control_bootstrap_failed'});
  }
});

router.get('/me',async(req,res)=>{
  res.json({features:await featuresForUser(req.user.id)});
});

router.use('/admin',requireAdmin);

const keyPattern=/^[a-z0-9][a-z0-9_-]{2,59}$/;
const cohortCreateSchema=z.object({
  key:z.string().trim().min(3).max(60).regex(keyPattern),
  name:z.string().trim().min(3).max(100),
  description:z.string().trim().max(500).optional().default('')
});
const cohortUpdateSchema=z.object({
  name:z.string().trim().min(3).max(100).optional(),
  description:z.string().trim().max(500).optional(),
  enabled:z.boolean().optional()
}).refine(value=>Object.keys(value).length>0);
const featureCreateSchema=z.object({
  key:z.string().trim().min(3).max(60).regex(keyPattern),
  name:z.string().trim().min(3).max(120),
  description:z.string().trim().max(500).optional().default(''),
  enabled:z.boolean().optional().default(true),
  defaultEnabled:z.boolean().optional().default(false)
});
const featureUpdateSchema=z.object({
  name:z.string().trim().min(3).max(120).optional(),
  description:z.string().trim().max(500).optional(),
  enabled:z.boolean().optional(),
  defaultEnabled:z.boolean().optional()
}).refine(value=>Object.keys(value).length>0);
const memberSchema=z.object({username:z.string().trim().min(3).max(30)});

async function adminSnapshot(){
  const [features,cohorts,members,assignments]=await Promise.all([
    db.query(`
      SELECT f.*,
             (SELECT count(*)::int FROM release_feature_cohorts fc WHERE fc.feature_key=f.feature_key AND fc.enabled=TRUE) cohort_count
        FROM release_features f
       ORDER BY f.created_at,f.feature_key
    `),
    db.query(`
      SELECT c.*,
             (SELECT count(*)::int FROM beta_cohort_members cm WHERE cm.cohort_id=c.id) member_count
        FROM beta_cohorts c
       ORDER BY c.created_at,c.id
    `),
    db.query(`
      SELECT cm.cohort_id,u.id user_id,u.username,u.display_name,cm.created_at
        FROM beta_cohort_members cm
        JOIN users u ON u.id=cm.user_id
       ORDER BY cm.created_at DESC
       LIMIT 500
    `),
    db.query(`
      SELECT fc.feature_key,fc.cohort_id,fc.enabled,c.cohort_key,c.name cohort_name
        FROM release_feature_cohorts fc
        JOIN beta_cohorts c ON c.id=fc.cohort_id
       ORDER BY fc.feature_key,c.name
    `)
  ]);
  return {
    features:features.rows,
    cohorts:cohorts.rows.map(cohort=>({
      ...cohort,
      members:members.rows.filter(member=>String(member.cohort_id)===String(cohort.id))
    })),
    assignments:assignments.rows
  };
}

router.get('/admin',async(_req,res)=>res.json(await adminSnapshot()));

router.post('/admin/cohorts',async(req,res)=>{
  const parsed=cohortCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_cohort'});
  const d=parsed.data;
  try{
    const result=await db.query(`
      INSERT INTO beta_cohorts(cohort_key,name,description,created_by)
      VALUES($1,$2,$3,$4)
      RETURNING *
    `,[d.key,d.name,d.description,req.user.id]);
    res.status(201).json({cohort:result.rows[0]});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'cohort_key_exists'});
    throw error;
  }
});

router.patch('/admin/cohorts/:id',async(req,res)=>{
  const parsed=cohortUpdateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_cohort_update'});
  const current=await db.query('SELECT * FROM beta_cohorts WHERE id=$1 LIMIT 1',[req.params.id]);
  if(!current.rowCount)return res.status(404).json({error:'cohort_not_found'});
  const d=parsed.data,row=current.rows[0];
  const result=await db.query(`
    UPDATE beta_cohorts
       SET name=$2,description=$3,enabled=$4,updated_at=now()
     WHERE id=$1
     RETURNING *
  `,[req.params.id,d.name??row.name,d.description??row.description,d.enabled??row.enabled]);
  res.json({cohort:result.rows[0]});
});

router.post('/admin/cohorts/:id/members',async(req,res)=>{
  const parsed=memberSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_member'});
  const cohort=await db.query('SELECT id FROM beta_cohorts WHERE id=$1 LIMIT 1',[req.params.id]);
  if(!cohort.rowCount)return res.status(404).json({error:'cohort_not_found'});
  const user=await db.query(`
    SELECT id,username,display_name FROM users
     WHERE lower(username)=lower($1) AND status='active'
     LIMIT 1
  `,[parsed.data.username.replace(/^@/,'')]);
  if(!user.rowCount)return res.status(404).json({error:'user_not_found'});
  await db.query(`
    INSERT INTO beta_cohort_members(cohort_id,user_id,added_by)
    VALUES($1,$2,$3)
    ON CONFLICT(cohort_id,user_id) DO NOTHING
  `,[req.params.id,user.rows[0].id,req.user.id]);
  res.json({ok:true,user:user.rows[0]});
});

router.delete('/admin/cohorts/:id/members/:userId',async(req,res)=>{
  await db.query('DELETE FROM beta_cohort_members WHERE cohort_id=$1 AND user_id=$2',[req.params.id,req.params.userId]);
  res.json({ok:true});
});

router.post('/admin/features',async(req,res)=>{
  const parsed=featureCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feature'});
  const d=parsed.data;
  try{
    const result=await db.query(`
      INSERT INTO release_features(feature_key,name,description,enabled,default_enabled,updated_by)
      VALUES($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,[d.key,d.name,d.description,d.enabled,d.defaultEnabled,req.user.id]);
    res.status(201).json({feature:result.rows[0]});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'feature_key_exists'});
    throw error;
  }
});

router.patch('/admin/features/:key',async(req,res)=>{
  const parsed=featureUpdateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feature_update'});
  const current=await db.query('SELECT * FROM release_features WHERE feature_key=$1 LIMIT 1',[req.params.key]);
  if(!current.rowCount)return res.status(404).json({error:'feature_not_found'});
  const d=parsed.data,row=current.rows[0];
  const result=await db.query(`
    UPDATE release_features
       SET name=$2,description=$3,enabled=$4,default_enabled=$5,updated_by=$6,updated_at=now()
     WHERE feature_key=$1
     RETURNING *
  `,[
    req.params.key,d.name??row.name,d.description??row.description,
    d.enabled??row.enabled,d.defaultEnabled??row.default_enabled,req.user.id
  ]);
  res.json({feature:result.rows[0]});
});

router.post('/admin/features/:key/cohorts/:cohortId',async(req,res)=>{
  const [feature,cohort]=await Promise.all([
    db.query('SELECT feature_key FROM release_features WHERE feature_key=$1 LIMIT 1',[req.params.key]),
    db.query('SELECT id FROM beta_cohorts WHERE id=$1 LIMIT 1',[req.params.cohortId])
  ]);
  if(!feature.rowCount)return res.status(404).json({error:'feature_not_found'});
  if(!cohort.rowCount)return res.status(404).json({error:'cohort_not_found'});
  await db.query(`
    INSERT INTO release_feature_cohorts(feature_key,cohort_id,enabled)
    VALUES($1,$2,TRUE)
    ON CONFLICT(feature_key,cohort_id) DO UPDATE SET enabled=TRUE
  `,[req.params.key,req.params.cohortId]);
  res.json({ok:true});
});

router.delete('/admin/features/:key/cohorts/:cohortId',async(req,res)=>{
  await db.query('DELETE FROM release_feature_cohorts WHERE feature_key=$1 AND cohort_id=$2',[req.params.key,req.params.cohortId]);
  res.json({ok:true});
});

module.exports=router;
