const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');

const router=express.Router();
let sharesV162Ready=null;
async function ensureSharesV162(){
  if(!sharesV162Ready){
    sharesV162Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS social_share_history (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('post','reel','story','profile')),
          entity_id BIGINT NOT NULL,
          target_type TEXT NOT NULL CHECK(target_type IN ('conversation','community','external','copy')),
          target_id BIGINT,
          target_label VARCHAR(160) NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_social_share_history_user_created ON social_share_history(user_id,created_at DESC)');
    })().catch(error=>{sharesV162Ready=null;throw error;});
  }
  return sharesV162Ready;
}
router.use(requireAuth);
router.use(async(_req,res,next)=>{
  try{await ensureSharesV162();next();}
  catch(error){console.error('RedLibertad V1.62 share history bootstrap failed:',error);res.status(500).json({error:'share_history_bootstrap_failed'});}
});

async function blockedBetween(a,b){
  const result=await db.query(`
    SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2)
        OR (blocker_id=$2 AND blocked_id=$1)
     LIMIT 1
  `,[a,b]);
  return !!result.rowCount;
}

async function validateExternalEntity(userId,type,id){
  if(type==='profile'){
    const result=await db.query("SELECT id FROM users WHERE id=$1 AND status='active' LIMIT 1",[id]);
    if(!result.rowCount||await blockedBetween(userId,id))return false;
    return true;
  }
  if(type==='story'){
    const result=await db.query(`
      SELECT s.id,s.user_id
        FROM stories s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.moderation_status='published' AND s.expires_at>now()
         AND s.audience='public' AND u.status='active'
       LIMIT 1
    `,[id]);
    if(!result.rowCount)return false;
    return !(await blockedBetween(userId,result.rows[0].user_id));
  }
  if(type==='post'||type==='reel'){
    const result=await db.query(`
      SELECT p.id,p.user_id,p.post_kind
        FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.id=$1 AND p.moderation_status='published' AND p.audience='public' AND u.status='active'
       LIMIT 1
    `,[id]);
    if(!result.rowCount)return false;
    if(type==='reel'&&result.rows[0].post_kind!=='reel')return false;
    return !(await blockedBetween(userId,result.rows[0].user_id));
  }
  return false;
}

const recordSchema=z.object({
  entityType:z.enum(['post','reel','story','profile']),
  entityId:z.coerce.number().int().positive(),
  targetType:z.enum(['external','copy']),
  targetLabel:z.string().trim().max(160).optional().default('')
});
router.post('/record',async(req,res)=>{
  const parsed=recordSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_share'});
  const data=parsed.data;
  if(!await validateExternalEntity(req.user.id,data.entityType,data.entityId)){
    return res.status(403).json({error:'entity_not_shareable'});
  }
  const result=await db.query(`
    INSERT INTO social_share_history(user_id,entity_type,entity_id,target_type,target_label)
    VALUES($1,$2,$3,$4,$5)
    RETURNING *
  `,[req.user.id,data.entityType,data.entityId,data.targetType,data.targetLabel]);
  res.status(201).json({ok:true,item:result.rows[0]});
});

router.get('/history',async(req,res)=>{
  const result=await db.query(`
    SELECT id,entity_type,entity_id,target_type,target_id,target_label,created_at
      FROM social_share_history
     WHERE user_id=$1
     ORDER BY created_at DESC,id DESC
     LIMIT 50
  `,[req.user.id]);
  res.json({items:result.rows});
});

router.delete('/history',async(req,res)=>{
  await db.query('DELETE FROM social_share_history WHERE user_id=$1',[req.user.id]);
  res.json({ok:true});
});

module.exports=router;
