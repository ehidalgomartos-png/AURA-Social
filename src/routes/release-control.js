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
    console.error('RedLibertad V1.75 release control bootstrap failed:',error);
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
const rolloutUpdateSchema=z.object({
  stage:z.enum(['cohorts','pilot','expanded','graduated']).optional(),
  percentage:z.number().int().min(0).max(100).optional(),
  frozen:z.boolean().optional(),
  note:z.string().trim().max(500).optional()
}).refine(value=>Object.keys(value).length>0,{message:'rollout_update_required'});

const memberSchema=z.object({username:z.string().trim().min(3).max(30)});


async function inTransaction(work){
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await work(client);
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}

function stableSnapshotValue(value){
  if(Array.isArray(value))return value.map(stableSnapshotValue);
  if(value&&typeof value==='object'){
    return Object.keys(value).sort().reduce((out,key)=>{
      out[key]=stableSnapshotValue(value[key]);
      return out;
    },{});
  }
  return value;
}

function sameSnapshot(left,right){
  return JSON.stringify(stableSnapshotValue(left??null))===JSON.stringify(stableSnapshotValue(right??null));
}

async function snapshotFeature(client,key){
  const feature=await client.query(`
    SELECT feature_key,name,description,enabled,default_enabled,
           rollout_stage,rollout_percentage,rollout_frozen,rollout_note
      FROM release_features
     WHERE feature_key=$1
     LIMIT 1
  `,[key]);
  if(!feature.rowCount)return null;
  const assignments=await client.query(`
    SELECT cohort_id,enabled
      FROM release_feature_cohorts
     WHERE feature_key=$1
     ORDER BY cohort_id
  `,[key]);
  return {
    ...feature.rows[0],
    cohorts:assignments.rows.map(row=>({cohort_id:Number(row.cohort_id),enabled:row.enabled===true}))
  };
}

async function snapshotCohort(client,id){
  const cohort=await client.query(`
    SELECT id,cohort_key,name,description,enabled
      FROM beta_cohorts
     WHERE id=$1
     LIMIT 1
  `,[id]);
  if(!cohort.rowCount)return null;
  const members=await client.query(`
    SELECT user_id
      FROM beta_cohort_members
     WHERE cohort_id=$1
     ORDER BY user_id
  `,[id]);
  return {
    id:Number(cohort.rows[0].id),
    cohort_key:cohort.rows[0].cohort_key,
    name:cohort.rows[0].name,
    description:cohort.rows[0].description,
    enabled:cohort.rows[0].enabled===true,
    members:members.rows.map(row=>Number(row.user_id))
  };
}

async function writeAudit(client,{targetType,targetKey,action,beforeState,afterState,actorId,requestId,rollbackOf=null}){
  const result=await client.query(`
    INSERT INTO release_change_audit(
      target_type,target_key,action,before_state,after_state,actor_id,request_id,rollback_of
    )
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)
    RETURNING id
  `,[
    targetType,targetKey,action,
    beforeState==null?null:JSON.stringify(beforeState),
    afterState==null?null:JSON.stringify(afterState),
    actorId,requestId||null,rollbackOf
  ]);
  return result.rows[0];
}

async function restoreFeature(client,snapshot,adminId){
  await client.query(`
    UPDATE release_features
       SET name=$2,
           description=$3,
           enabled=$4,
           default_enabled=$5,
           rollout_stage=$6,
           rollout_percentage=$7,
           rollout_frozen=$8,
           rollout_note=$9,
           updated_by=$10,
           updated_at=now()
     WHERE feature_key=$1
  `,[
    snapshot.feature_key,snapshot.name,snapshot.description,
    snapshot.enabled,snapshot.default_enabled,
    snapshot.rollout_stage||'cohorts',Number(snapshot.rollout_percentage||0),
    snapshot.rollout_frozen===true,snapshot.rollout_note||'',adminId
  ]);
  await client.query('DELETE FROM release_feature_cohorts WHERE feature_key=$1',[snapshot.feature_key]);
  for(const item of snapshot.cohorts||[]){
    await client.query(`
      INSERT INTO release_feature_cohorts(feature_key,cohort_id,enabled)
      SELECT $1,$2,$3
       WHERE EXISTS(SELECT 1 FROM beta_cohorts WHERE id=$2)
      ON CONFLICT(feature_key,cohort_id) DO UPDATE SET enabled=excluded.enabled
    `,[snapshot.feature_key,item.cohort_id,item.enabled!==false]);
  }
}

async function restoreCohort(client,snapshot,adminId){
  await client.query(`
    UPDATE beta_cohorts
       SET name=$2,description=$3,enabled=$4,updated_at=now()
     WHERE id=$1
  `,[snapshot.id,snapshot.name,snapshot.description,snapshot.enabled]);
  await client.query('DELETE FROM beta_cohort_members WHERE cohort_id=$1',[snapshot.id]);
  for(const userId of snapshot.members||[]){
    await client.query(`
      INSERT INTO beta_cohort_members(cohort_id,user_id,added_by)
      SELECT $1,$2,$3
       WHERE EXISTS(SELECT 1 FROM users WHERE id=$2)
      ON CONFLICT(cohort_id,user_id) DO NOTHING
    `,[snapshot.id,userId,adminId]);
  }
}

async function adminSnapshot(){
  const [features,cohorts,members,assignments,audit]=await Promise.all([
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
    `),
    db.query(`
      SELECT a.id,a.target_type,a.target_key,a.action,a.before_state,a.after_state,
             a.request_id,a.rollback_of,a.rolled_back_at,a.created_at,
             actor.username actor_username,
             rollback_user.username rolled_back_by_username
        FROM release_change_audit a
        LEFT JOIN users actor ON actor.id=a.actor_id
        LEFT JOIN users rollback_user ON rollback_user.id=a.rolled_back_by
       ORDER BY a.created_at DESC
       LIMIT 100
    `)
  ]);
  return {
    features:features.rows,
    cohorts:cohorts.rows.map(cohort=>({
      ...cohort,
      members:members.rows.filter(member=>String(member.cohort_id)===String(cohort.id))
    })),
    assignments:assignments.rows,
    audit:audit.rows.map(entry=>({
      ...entry,
      canRollback:Boolean(entry.before_state&&entry.after_state&&!entry.rolled_back_at)
    }))
  };
}

router.get('/admin',async(_req,res)=>res.json(await adminSnapshot()));

router.post('/admin/cohorts',async(req,res)=>{
  const parsed=cohortCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_cohort'});
  const d=parsed.data;
  try{
    const result=await inTransaction(async client=>{
      const created=await client.query(`
        INSERT INTO beta_cohorts(cohort_key,name,description,created_by)
        VALUES($1,$2,$3,$4)
        RETURNING *
      `,[d.key,d.name,d.description,req.user.id]);
      const after=await snapshotCohort(client,created.rows[0].id);
      await writeAudit(client,{
        targetType:'cohort',targetKey:d.key,action:'cohort_create',
        beforeState:null,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
      return created.rows[0];
    });
    res.status(201).json({cohort:result});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'cohort_key_exists'});
    throw error;
  }
});

router.patch('/admin/cohorts/:id',async(req,res)=>{
  const parsed=cohortUpdateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_cohort_update'});
  const result=await inTransaction(async client=>{
    const before=await snapshotCohort(client,req.params.id);
    if(!before)return null;
    const d=parsed.data;
    await client.query(`
      UPDATE beta_cohorts
         SET name=$2,description=$3,enabled=$4,updated_at=now()
       WHERE id=$1
    `,[
      req.params.id,
      d.name??before.name,
      d.description??before.description,
      d.enabled??before.enabled
    ]);
    const after=await snapshotCohort(client,req.params.id);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'cohort',targetKey:before.cohort_key,action:'cohort_update',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return after;
  });
  if(!result)return res.status(404).json({error:'cohort_not_found'});
  res.json({cohort:result});
});

router.post('/admin/cohorts/:id/members',async(req,res)=>{
  const parsed=memberSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_member'});
  const result=await inTransaction(async client=>{
    const before=await snapshotCohort(client,req.params.id);
    if(!before)return {error:'cohort_not_found'};
    const user=await client.query(`
      SELECT id,username,display_name FROM users
       WHERE lower(username)=lower($1) AND status='active'
       LIMIT 1
    `,[parsed.data.username.replace(/^@/,'')]);
    if(!user.rowCount)return {error:'user_not_found'};
    await client.query(`
      INSERT INTO beta_cohort_members(cohort_id,user_id,added_by)
      VALUES($1,$2,$3)
      ON CONFLICT(cohort_id,user_id) DO NOTHING
    `,[req.params.id,user.rows[0].id,req.user.id]);
    const after=await snapshotCohort(client,req.params.id);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'cohort',targetKey:before.cohort_key,action:'member_add',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return {user:user.rows[0]};
  });
  if(result.error==='cohort_not_found')return res.status(404).json({error:'cohort_not_found'});
  if(result.error==='user_not_found')return res.status(404).json({error:'user_not_found'});
  res.json({ok:true,user:result.user});
});

router.delete('/admin/cohorts/:id/members/:userId',async(req,res)=>{
  const result=await inTransaction(async client=>{
    const before=await snapshotCohort(client,req.params.id);
    if(!before)return null;
    await client.query('DELETE FROM beta_cohort_members WHERE cohort_id=$1 AND user_id=$2',[req.params.id,req.params.userId]);
    const after=await snapshotCohort(client,req.params.id);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'cohort',targetKey:before.cohort_key,action:'member_remove',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return after;
  });
  if(!result)return res.status(404).json({error:'cohort_not_found'});
  res.json({ok:true});
});

router.post('/admin/features',async(req,res)=>{
  const parsed=featureCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feature'});
  const d=parsed.data;
  try{
    const result=await inTransaction(async client=>{
      const created=await client.query(`
        INSERT INTO release_features(
          feature_key,name,description,enabled,default_enabled,
          rollout_stage,rollout_percentage,rollout_frozen,rollout_note,updated_by
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,FALSE,'',$8)
        RETURNING *
      `,[
        d.key,d.name,d.description,d.enabled,d.defaultEnabled,
        d.defaultEnabled?'graduated':'cohorts',d.defaultEnabled?100:0,req.user.id
      ]);
      const after=await snapshotFeature(client,d.key);
      await writeAudit(client,{
        targetType:'feature',targetKey:d.key,action:'feature_create',
        beforeState:null,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
      return created.rows[0];
    });
    res.status(201).json({feature:result});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'feature_key_exists'});
    throw error;
  }
});

router.patch('/admin/features/:key',async(req,res)=>{
  const parsed=featureUpdateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feature_update'});
  const result=await inTransaction(async client=>{
    const before=await snapshotFeature(client,req.params.key);
    if(!before)return null;
    const d=parsed.data;
    if(before.rollout_frozen===true && d.defaultEnabled!==undefined && d.defaultEnabled!==before.default_enabled){
      return {error:'rollout_frozen'};
    }
    await client.query(`
      UPDATE release_features
         SET name=$2,description=$3,enabled=$4,default_enabled=$5,updated_by=$6,updated_at=now()
       WHERE feature_key=$1
    `,[
      req.params.key,
      d.name??before.name,
      d.description??before.description,
      d.enabled??before.enabled,
      d.defaultEnabled??before.default_enabled,
      req.user.id
    ]);
    const after=await snapshotFeature(client,req.params.key);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'feature',targetKey:req.params.key,action:'feature_update',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return after;
  });
  if(!result)return res.status(404).json({error:'feature_not_found'});
  if(result.error==='rollout_frozen')return res.status(409).json({error:'rollout_frozen'});
  res.json({feature:result});
});

router.patch('/admin/features/:key/rollout',async(req,res)=>{
  const parsed=rolloutUpdateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_rollout_update'});

  const outcome=await inTransaction(async client=>{
    const before=await snapshotFeature(client,req.params.key);
    if(!before)return {error:'feature_not_found'};
    const d=parsed.data;

    const changingWave=d.stage!==undefined || d.percentage!==undefined;
    if(before.rollout_frozen===true && changingWave && d.frozen!==false){
      return {error:'rollout_frozen'};
    }

    let stage=d.stage??before.rollout_stage??'cohorts';
    let percentage=d.percentage??Number(before.rollout_percentage||0);
    const frozen=d.frozen??before.rollout_frozen===true;
    const note=d.note??before.rollout_note??'';

    if(stage==='cohorts')percentage=0;
    if(stage==='graduated')percentage=100;

    const valid=
      (stage==='cohorts' && percentage===0) ||
      (stage==='pilot' && percentage>=1 && percentage<=10) ||
      (stage==='expanded' && percentage>=11 && percentage<=99) ||
      (stage==='graduated' && percentage===100);
    if(!valid)return {error:'invalid_rollout_wave'};

    const defaultEnabled=stage==='graduated';

    await client.query(`
      UPDATE release_features
         SET rollout_stage=$2,
             rollout_percentage=$3,
             rollout_frozen=$4,
             rollout_note=$5,
             default_enabled=$6,
             updated_by=$7,
             updated_at=now()
       WHERE feature_key=$1
    `,[req.params.key,stage,percentage,frozen,note,defaultEnabled,req.user.id]);

    const after=await snapshotFeature(client,req.params.key);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'feature',
        targetKey:req.params.key,
        action:d.frozen!==undefined && !changingWave ? 'rollout_freeze' : 'rollout_wave',
        beforeState:before,
        afterState:after,
        actorId:req.user.id,
        requestId:req.requestId
      });
    }
    return {feature:after};
  });

  if(outcome.error==='feature_not_found')return res.status(404).json({error:'feature_not_found'});
  if(outcome.error==='rollout_frozen')return res.status(409).json({error:'rollout_frozen'});
  if(outcome.error==='invalid_rollout_wave')return res.status(400).json({error:'invalid_rollout_wave'});
  res.json(outcome);
});

router.post('/admin/features/:key/cohorts/:cohortId',async(req,res)=>{
  const result=await inTransaction(async client=>{
    const before=await snapshotFeature(client,req.params.key);
    if(!before)return {error:'feature_not_found'};
    const cohort=await client.query('SELECT id FROM beta_cohorts WHERE id=$1 LIMIT 1',[req.params.cohortId]);
    if(!cohort.rowCount)return {error:'cohort_not_found'};
    await client.query(`
      INSERT INTO release_feature_cohorts(feature_key,cohort_id,enabled)
      VALUES($1,$2,TRUE)
      ON CONFLICT(feature_key,cohort_id) DO UPDATE SET enabled=TRUE
    `,[req.params.key,req.params.cohortId]);
    const after=await snapshotFeature(client,req.params.key);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'feature',targetKey:req.params.key,action:'cohort_assign',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return {after};
  });
  if(result.error==='feature_not_found')return res.status(404).json({error:'feature_not_found'});
  if(result.error==='cohort_not_found')return res.status(404).json({error:'cohort_not_found'});
  res.json({ok:true});
});

router.delete('/admin/features/:key/cohorts/:cohortId',async(req,res)=>{
  const result=await inTransaction(async client=>{
    const before=await snapshotFeature(client,req.params.key);
    if(!before)return null;
    await client.query('DELETE FROM release_feature_cohorts WHERE feature_key=$1 AND cohort_id=$2',[req.params.key,req.params.cohortId]);
    const after=await snapshotFeature(client,req.params.key);
    if(!sameSnapshot(before,after)){
      await writeAudit(client,{
        targetType:'feature',targetKey:req.params.key,action:'cohort_remove',
        beforeState:before,afterState:after,actorId:req.user.id,requestId:req.requestId
      });
    }
    return after;
  });
  if(!result)return res.status(404).json({error:'feature_not_found'});
  res.json({ok:true});
});

router.post('/admin/audit/:id/rollback',async(req,res)=>{
  const outcome=await inTransaction(async client=>{
    const auditResult=await client.query(`
      SELECT *
        FROM release_change_audit
       WHERE id=$1
       FOR UPDATE
    `,[req.params.id]);
    if(!auditResult.rowCount)return {error:'audit_not_found'};
    const entry=auditResult.rows[0];
    if(!entry.before_state||!entry.after_state)return {error:'rollback_not_supported'};
    if(entry.rolled_back_at)return {error:'already_rolled_back'};

    const current=entry.target_type==='feature'
      ? await snapshotFeature(client,entry.target_key)
      : await snapshotCohort(client,entry.before_state.id);

    if(!sameSnapshot(current,entry.after_state)){
      return {error:'rollback_conflict',current};
    }

    if(entry.target_type==='feature'){
      await restoreFeature(client,entry.before_state,req.user.id);
    }else{
      await restoreCohort(client,entry.before_state,req.user.id);
    }

    const restored=entry.target_type==='feature'
      ? await snapshotFeature(client,entry.target_key)
      : await snapshotCohort(client,entry.before_state.id);

    const rollbackAudit=await writeAudit(client,{
      targetType:entry.target_type,
      targetKey:entry.target_key,
      action:'rollback',
      beforeState:current,
      afterState:restored,
      actorId:req.user.id,
      requestId:req.requestId,
      rollbackOf:entry.id
    });

    await client.query(`
      UPDATE release_change_audit
         SET rolled_back_at=now(),rolled_back_by=$2
       WHERE id=$1
    `,[entry.id,req.user.id]);

    return {ok:true,restored,auditId:rollbackAudit.id};
  });

  if(outcome.error==='audit_not_found')return res.status(404).json({error:'audit_not_found'});
  if(outcome.error==='rollback_not_supported')return res.status(400).json({error:'rollback_not_supported'});
  if(outcome.error==='already_rolled_back')return res.status(409).json({error:'already_rolled_back'});
  if(outcome.error==='rollback_conflict')return res.status(409).json({error:'rollback_conflict'});
  res.json(outcome);
});

module.exports=router;

