const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

let trustReady = null;
async function ensureTrustV12() {
  if (!trustReady) {
    trustReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS verification_requests (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(20) NOT NULL CHECK(type IN ('age','creator')),
          status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
          request_note VARCHAR(1000) NOT NULL DEFAULT '',
          review_note VARCHAR(1000) NOT NULL DEFAULT '',
          admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          reviewed_at TIMESTAMPTZ
        )
      `);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
          ON verification_requests(user_id,type)
         WHERE status='pending'
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_verification_requests_queue ON verification_requests(status,type,created_at)');
    })().catch(error => {
      trustReady = null;
      throw error;
    });
  }
  return trustReady;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureTrustV12();
    next();
  }catch(error){
    console.error('RedLibertad V1.12 trust bootstrap failed:',error);
    res.status(500).json({error:'trust_bootstrap_failed'});
  }
});

router.get('/me', async (req,res)=>{
  const [user,requests]=await Promise.all([
    db.query(`
      SELECT id,username,display_name,age_verified,creator_verified
        FROM users
       WHERE id=$1
       LIMIT 1
    `,[req.user.id]),
    db.query(`
      SELECT id,type,status,request_note,review_note,created_at,reviewed_at
        FROM verification_requests
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 20
    `,[req.user.id])
  ]);

  if(!user.rowCount)return res.status(404).json({error:'user_not_found'});

  const latestByType={age:null,creator:null};
  for(const row of requests.rows){
    if(!latestByType[row.type])latestByType[row.type]=row;
  }

  res.json({
    user:user.rows[0],
    latest:latestByType,
    history:requests.rows
  });
});

const requestSchema=z.object({
  type:z.enum(['age','creator']),
  note:z.string().max(1000).optional().default('')
});

router.post('/request', async (req,res)=>{
  const parsed=requestSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const d=parsed.data;
  const user=await db.query(
    'SELECT age_verified,creator_verified FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [req.user.id]
  );
  if(!user.rowCount)return res.status(404).json({error:'user_not_found'});

  if(d.type==='age' && user.rows[0].age_verified){
    return res.status(409).json({error:'already_verified'});
  }
  if(d.type==='creator' && user.rows[0].creator_verified){
    return res.status(409).json({error:'already_verified'});
  }

  const existing=await db.query(
    "SELECT id FROM verification_requests WHERE user_id=$1 AND type=$2 AND status='pending' LIMIT 1",
    [req.user.id,d.type]
  );
  if(existing.rowCount)return res.status(409).json({error:'request_already_pending'});

  const result=await db.query(`
    INSERT INTO verification_requests (user_id,type,request_note)
    VALUES ($1,$2,$3)
    RETURNING id,type,status,request_note,created_at
  `,[req.user.id,d.type,String(d.note||'').trim()]);

  res.status(201).json({ok:true,request:result.rows[0]});
});

router.delete('/request/:id', async (req,res)=>{
  const result=await db.query(`
    UPDATE verification_requests
       SET status='cancelled',reviewed_at=now()
     WHERE id=$1
       AND user_id=$2
       AND status='pending'
     RETURNING id
  `,[req.params.id,req.user.id]);

  if(!result.rowCount)return res.status(404).json({error:'pending_request_not_found'});
  res.json({ok:true});
});

module.exports=router;
