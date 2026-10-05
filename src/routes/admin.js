const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

let moderationV11Ready = null;
async function ensureModerationV11() {
  if (!moderationV11Ready) {
    moderationV11Ready = (async () => {
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ');
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(500) NOT NULL DEFAULT ''");
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0');
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_moderation_actions (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          action VARCHAR(40) NOT NULL,
          duration_label VARCHAR(40) NOT NULL DEFAULT '',
          reason VARCHAR(1000) NOT NULL DEFAULT '',
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_user_moderation_actions_user_created ON user_moderation_actions(user_id,created_at DESC)');
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
      moderationV11Ready = null;
      throw error;
    });
  }
  return moderationV11Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureModerationV11();
    next();
  }catch(error){
    console.error('RedLibertad V1.11 moderation bootstrap failed:',error);
    res.status(500).json({error:'moderation_bootstrap_failed'});
  }
});

async function autoReleaseExpiredSuspensions(){
  await db.query(`
    UPDATE users
       SET status='active',
           suspended_until=NULL,
           suspension_reason='',
           updated_at=now()
     WHERE status='suspended'
       AND suspended_until IS NOT NULL
       AND suspended_until<=now()
  `);
}

function suspensionExpiry(duration){
  if(duration==='indefinite') return null;
  const map={
    '24h':24*60*60*1000,
    '7d':7*24*60*60*1000,
    '30d':30*24*60*60*1000
  };
  const ms=map[duration];
  return ms ? new Date(Date.now()+ms) : null;
}

async function recordUserAction({userId,adminId,action,duration='',reason='',expiresAt=null}){
  await db.query(`
    INSERT INTO user_moderation_actions
      (user_id,admin_id,action,duration_label,reason,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6)
  `,[userId,adminId,action,duration,reason,expiresAt]);
}

async function notifyUser(userId,text){
  await db.query(`
    INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
    VALUES ($1,NULL,'system','user',$1,$2)
  `,[userId,text]);
}

router.get('/dashboard', async (_req,res)=>{
  await autoReleaseExpiredSuspensions();
  const [users,active,suspended,banned,posts,reports,critical,verified,warnings,pendingVerifications]=await Promise.all([
    db.query('SELECT count(*)::int n FROM users'),
    db.query("SELECT count(*)::int n FROM users WHERE status='active'"),
    db.query("SELECT count(*)::int n FROM users WHERE status='suspended'"),
    db.query("SELECT count(*)::int n FROM users WHERE status='banned'"),
    db.query('SELECT count(*)::int n FROM posts'),
    db.query("SELECT count(*)::int n FROM reports WHERE status='open'"),
    db.query("SELECT count(*)::int n FROM reports WHERE status='open' AND priority='critical'"),
    db.query('SELECT count(*)::int n FROM users WHERE creator_verified=true'),
    db.query("SELECT count(*)::int n FROM user_moderation_actions WHERE action='warn' AND created_at>=now()-interval '30 days'"),
    db.query("SELECT count(*)::int n FROM verification_requests WHERE status='pending'")
  ]);

  res.json({
    users:users.rows[0].n,
    activeUsers:active.rows[0].n,
    suspendedUsers:suspended.rows[0].n,
    bannedUsers:banned.rows[0].n,
    posts:posts.rows[0].n,
    openReports:reports.rows[0].n,
    criticalReports:critical.rows[0].n,
    verifiedCreators:verified.rows[0].n,
    warnings30d:warnings.rows[0].n,
    pendingVerifications:pendingVerifications.rows[0].n
  });
});

router.get('/reports',async(_req,res)=>{
  const r=await db.query(`
    SELECT
      r.*,
      reporter.username reporter_username,
      COALESCE(target_user.id,post_author.id,comment_author.id,message_author.id) target_user_id,
      COALESCE(target_user.username,post_author.username,comment_author.username,message_author.username) target_username,
      COALESCE(target_user.display_name,post_author.display_name,comment_author.display_name,message_author.display_name) target_display_name,
      CASE
        WHEN r.target_type='post' THEN left(COALESCE(target_post.caption,''),320)
        WHEN r.target_type='comment' THEN left(COALESCE(target_comment.body,''),320)
        WHEN r.target_type='message' THEN left(COALESCE(target_message.body,''),320)
        WHEN r.target_type='user' THEN left(COALESCE(target_user.bio,''),320)
        ELSE ''
      END target_preview
      FROM reports r
      JOIN users reporter ON reporter.id=r.reporter_id
      LEFT JOIN users target_user ON r.target_type='user' AND target_user.id=r.target_id
      LEFT JOIN posts target_post ON r.target_type='post' AND target_post.id=r.target_id
      LEFT JOIN users post_author ON post_author.id=target_post.user_id
      LEFT JOIN comments target_comment ON r.target_type='comment' AND target_comment.id=r.target_id
      LEFT JOIN users comment_author ON comment_author.id=target_comment.user_id
      LEFT JOIN messages target_message ON r.target_type='message' AND target_message.id=r.target_id
      LEFT JOIN users message_author ON message_author.id=target_message.sender_id
     ORDER BY
       CASE WHEN r.status='open' THEN 0 ELSE 1 END,
       CASE WHEN r.priority='critical' THEN 0 ELSE 1 END,
       r.created_at ASC
     LIMIT 250
  `);
  res.json({reports:r.rows});
});

router.get('/users',async(req,res)=>{
  await autoReleaseExpiredSuspensions();
  const q=String(req.query.q||'').trim();
  const r=await db.query(`
    SELECT
      u.id,u.email,u.username,u.display_name,u.bio,u.avatar_url,u.location_label,
      u.is_admin,u.age_verified,u.creator_verified,u.status,u.suspended_until,u.suspension_reason,u.created_at,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=u.id) post_count,
      (SELECT count(*)::int FROM reports rp WHERE
        (rp.target_type='user' AND rp.target_id=u.id)
        OR (rp.target_type='post' AND rp.target_id IN (SELECT p2.id FROM posts p2 WHERE p2.user_id=u.id))
        OR (rp.target_type='comment' AND rp.target_id IN (SELECT c2.id FROM comments c2 WHERE c2.user_id=u.id))
        OR (rp.target_type='message' AND rp.target_id IN (SELECT m2.id FROM messages m2 WHERE m2.sender_id=u.id))
      ) report_count,
      (SELECT count(*)::int FROM user_moderation_actions ma WHERE ma.user_id=u.id) moderation_count,
      GREATEST(
        COALESCE((SELECT max(p3.created_at) FROM posts p3 WHERE p3.user_id=u.id),'epoch'::timestamptz),
        COALESCE((SELECT max(c.created_at) FROM comments c WHERE c.user_id=u.id),'epoch'::timestamptz),
        u.created_at
      ) last_activity_at
      FROM users u
     WHERE $1=''
        OR lower(u.username) LIKE lower($2)
        OR lower(u.email) LIKE lower($2)
        OR lower(u.display_name) LIKE lower($2)
     ORDER BY
       CASE u.status WHEN 'suspended' THEN 0 WHEN 'banned' THEN 1 ELSE 2 END,
       u.created_at DESC
     LIMIT 120
  `,[q,`%${q}%`]);
  res.json({users:r.rows});
});

router.get('/users/:id/history',async(req,res)=>{
  const [user,history]=await Promise.all([
    db.query(`
      SELECT id,email,username,display_name,status,suspended_until,suspension_reason,
             age_verified,creator_verified,is_admin,created_at
        FROM users WHERE id=$1 LIMIT 1
    `,[req.params.id]),
    db.query(`
      SELECT a.id,a.action,a.duration_label,a.reason,a.expires_at,a.created_at,
             admin.username admin_username,admin.display_name admin_display_name
        FROM user_moderation_actions a
        JOIN users admin ON admin.id=a.admin_id
       WHERE a.user_id=$1
       ORDER BY a.created_at DESC
       LIMIT 100
    `,[req.params.id])
  ]);
  if(!user.rowCount)return res.status(404).json({error:'user_not_found'});
  res.json({user:user.rows[0],history:history.rows});
});

const moderationSchema=z.object({
  action:z.enum(['warn','suspend','reactivate','ban']),
  duration:z.enum(['24h','7d','30d','indefinite']).optional().default('7d'),
  reason:z.string().max(1000).optional().default('')
});

router.post('/users/:id/moderate',async(req,res)=>{
  const parsed=moderationSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_moderation_action'});

  const targetResult=await db.query(`
    SELECT id,username,display_name,is_admin,status
      FROM users WHERE id=$1 LIMIT 1
  `,[req.params.id]);
  if(!targetResult.rowCount)return res.status(404).json({error:'user_not_found'});

  const target=targetResult.rows[0];
  const d=parsed.data;

  if(String(target.id)===String(req.user.id) && ['suspend','ban'].includes(d.action)){
    return res.status(400).json({error:'cannot_moderate_self'});
  }
  if(target.is_admin && ['suspend','ban'].includes(d.action)){
    return res.status(403).json({error:'admin_account_protected'});
  }

  if(d.action==='warn'){
    await recordUserAction({userId:target.id,adminId:req.user.id,action:'warn',reason:d.reason});
    const suffix=d.reason ? ` Motivo: ${d.reason}` : '';
    await notifyUser(target.id,`Has recibido un aviso de moderación.${suffix}`);
    return res.json({ok:true,status:target.status});
  }

  if(d.action==='suspend'){
    const expiresAt=suspensionExpiry(d.duration);
    await db.query(`
      UPDATE users
         SET status='suspended',
             suspended_until=$2,
             suspension_reason=$3,
             auth_token_version=auth_token_version+1,
             updated_at=now()
       WHERE id=$1
    `,[target.id,expiresAt,d.reason]);
    await recordUserAction({
      userId:target.id,
      adminId:req.user.id,
      action:'suspend',
      duration:d.duration,
      reason:d.reason,
      expiresAt
    });
    const untilText=expiresAt ? ` hasta ${expiresAt.toISOString()}` : ' de forma indefinida';
    const suffix=d.reason ? ` Motivo: ${d.reason}` : '';
    await notifyUser(target.id,`Tu cuenta ha sido suspendida${untilText}.${suffix}`);
    return res.json({ok:true,status:'suspended',suspendedUntil:expiresAt});
  }

  if(d.action==='ban'){
    await db.query(`
      UPDATE users
         SET status='banned',
             suspended_until=NULL,
             suspension_reason=$2,
             auth_token_version=auth_token_version+1,
             updated_at=now()
       WHERE id=$1
    `,[target.id,d.reason]);
    await recordUserAction({userId:target.id,adminId:req.user.id,action:'ban',reason:d.reason});
    const suffix=d.reason ? ` Motivo: ${d.reason}` : '';
    await notifyUser(target.id,`Tu cuenta ha sido bloqueada por moderación.${suffix}`);
    return res.json({ok:true,status:'banned'});
  }

  await db.query(`
    UPDATE users
       SET status='active',
           suspended_until=NULL,
           suspension_reason='',
           auth_token_version=auth_token_version+1,
           updated_at=now()
     WHERE id=$1
  `,[target.id]);
  await recordUserAction({userId:target.id,adminId:req.user.id,action:'reactivate',reason:d.reason});
  await notifyUser(target.id,'Tu cuenta vuelve a estar activa.');
  res.json({ok:true,status:'active'});
});

const decisionSchema=z.object({
  status:z.enum(['resolved','dismissed']),
  action:z.enum(['none','hide_post','suspend_user','ban_user']),
  note:z.string().max(2000).optional().default('')
});

async function reportTargetUserId(item){
  if(item.target_type==='user')return Number(item.target_id);
  if(item.target_type==='post'){
    const r=await db.query('SELECT user_id FROM posts WHERE id=$1',[item.target_id]);
    return r.rows[0]?.user_id || null;
  }
  if(item.target_type==='comment'){
    const r=await db.query('SELECT user_id FROM comments WHERE id=$1',[item.target_id]);
    return r.rows[0]?.user_id || null;
  }
  if(item.target_type==='message'){
    const r=await db.query('SELECT sender_id user_id FROM messages WHERE id=$1',[item.target_id]);
    return r.rows[0]?.user_id || null;
  }
  return null;
}

router.post('/reports/:id/decision',async(req,res)=>{
  const parsed=decisionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_decision'});
  const d=parsed.data;
  const report=await db.query('SELECT * FROM reports WHERE id=$1',[req.params.id]);
  if(!report.rowCount)return res.status(404).json({error:'report_not_found'});
  const item=report.rows[0];

  if(d.action==='hide_post'&&item.target_type==='post'){
    await db.query("UPDATE posts SET moderation_status='under_review' WHERE id=$1",[item.target_id]);
  }

  if(d.action==='suspend_user'||d.action==='ban_user'){
    const targetUserId=await reportTargetUserId(item);
    if(targetUserId){
      const target=await db.query('SELECT is_admin FROM users WHERE id=$1',[targetUserId]);
      if(target.rows[0]?.is_admin)return res.status(403).json({error:'admin_account_protected'});

      if(d.action==='suspend_user'){
        const expiresAt=suspensionExpiry('7d');
        await db.query(`
          UPDATE users
             SET status='suspended',suspended_until=$2,suspension_reason=$3,
                 auth_token_version=auth_token_version+1,updated_at=now()
           WHERE id=$1
        `,[targetUserId,expiresAt,d.note]);
        await recordUserAction({
          userId:targetUserId,adminId:req.user.id,action:'suspend',
          duration:'7d',reason:d.note,expiresAt
        });
      }else{
        await db.query(`
          UPDATE users
             SET status='banned',suspended_until=NULL,suspension_reason=$2,
                 auth_token_version=auth_token_version+1,updated_at=now()
           WHERE id=$1
        `,[targetUserId,d.note]);
        await recordUserAction({
          userId:targetUserId,adminId:req.user.id,action:'ban',reason:d.note
        });
      }
    }
  }

  await db.query(`
    UPDATE reports
       SET status=$2,moderator_note=$3,resolved_at=now()
     WHERE id=$1
  `,[req.params.id,d.status,d.note]);
  await db.query(`
    INSERT INTO moderation_audit (admin_id,report_id,action,note)
    VALUES ($1,$2,$3,$4)
  `,[req.user.id,req.params.id,d.action,d.note]);
  res.json({ok:true});
});

router.get('/verifications',async(req,res)=>{
  const status=String(req.query.status||'pending');
  const allowed=new Set(['pending','approved','rejected','cancelled','all']);
  const filter=allowed.has(status) ? status : 'pending';
  const params=[];
  let where='';
  if(filter!=='all'){
    params.push(filter);
    where='WHERE vr.status=$1';
  }

  const result=await db.query(`
    SELECT
      vr.id,vr.type,vr.status,vr.request_note,vr.review_note,vr.created_at,vr.reviewed_at,
      u.id user_id,u.username,u.display_name,u.email,u.avatar_url,u.age_verified,u.creator_verified,
      admin.username admin_username,admin.display_name admin_display_name
      FROM verification_requests vr
      JOIN users u ON u.id=vr.user_id
      LEFT JOIN users admin ON admin.id=vr.admin_id
      ${where}
     ORDER BY
       CASE WHEN vr.status='pending' THEN 0 ELSE 1 END,
       vr.created_at ASC
     LIMIT 250
  `,params);

  res.json({requests:result.rows,filter});
});

const verificationDecisionSchema=z.object({
  decision:z.enum(['approve','reject']),
  note:z.string().max(1000).optional().default('')
});

router.post('/verifications/:id/decision',async(req,res)=>{
  const parsed=verificationDecisionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_verification_decision'});

  const request=await db.query(`
    SELECT vr.*,u.is_admin,u.age_verified,u.creator_verified
      FROM verification_requests vr
      JOIN users u ON u.id=vr.user_id
     WHERE vr.id=$1
     LIMIT 1
  `,[req.params.id]);

  if(!request.rowCount)return res.status(404).json({error:'verification_request_not_found'});
  const item=request.rows[0];
  if(item.status!=='pending')return res.status(409).json({error:'verification_request_not_pending'});

  const d=parsed.data;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');

    await client.query(`
      UPDATE verification_requests
         SET status=$2,
             review_note=$3,
             admin_id=$4,
             reviewed_at=now()
       WHERE id=$1
    `,[
      item.id,
      d.decision==='approve' ? 'approved' : 'rejected',
      String(d.note||'').trim(),
      req.user.id
    ]);

    if(d.decision==='approve'){
      if(item.type==='age'){
        await client.query(
          'UPDATE users SET age_verified=true,updated_at=now() WHERE id=$1',
          [item.user_id]
        );
        await client.query(`
          INSERT INTO age_verifications (user_id,provider,result,created_at,verified_at)
          VALUES ($1,'manual','verified',now(),now())
        `,[item.user_id]);
      }else{
        await client.query(
          'UPDATE users SET creator_verified=true,age_verified=true,updated_at=now() WHERE id=$1',
          [item.user_id]
        );
        await client.query(`
          INSERT INTO creator_verifications (user_id,provider,result,created_at,verified_at)
          VALUES ($1,'manual','verified',now(),now())
        `,[item.user_id]);
      }
    }

    await client.query(`
      INSERT INTO user_moderation_actions
        (user_id,admin_id,action,duration_label,reason)
      VALUES ($1,$2,$3,'',$4)
    `,[
      item.user_id,
      req.user.id,
      d.decision==='approve' ? `verify_${item.type}_request` : `reject_${item.type}_request`,
      String(d.note||'').trim()
    ]);

    await client.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      VALUES ($1,NULL,'system','verification',$2,$3)
    `,[
      item.user_id,
      item.id,
      d.decision==='approve'
        ? (item.type==='age' ? 'Tu verificación +18 ha sido aprobada.' : 'Tu verificación de creador ha sido aprobada.')
        : (item.type==='age' ? 'Tu solicitud de verificación +18 ha sido revisada y no se ha aprobado.' : 'Tu solicitud de verificación de creador ha sido revisada y no se ha aprobado.')
    ]);

    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad verification decision failed:',error);
    return res.status(500).json({error:'verification_decision_failed'});
  }finally{
    client.release();
  }

  res.json({ok:true,status:d.decision==='approve'?'approved':'rejected'});
});

router.post('/users/:id/verify-creator',async(req,res)=>{
  await db.query('UPDATE users SET creator_verified=true,age_verified=true,updated_at=now() WHERE id=$1',[req.params.id]);
  await db.query(`
    UPDATE verification_requests
       SET status='approved',review_note='Aprobada desde la ficha de usuario.',admin_id=$2,reviewed_at=now()
     WHERE user_id=$1 AND type='creator' AND status='pending'
  `,[req.params.id,req.user.id]);
  await recordUserAction({userId:req.params.id,adminId:req.user.id,action:'verify_creator'});
  res.json({ok:true});
});

router.post('/users/:id/verify-age',async(req,res)=>{
  await db.query('UPDATE users SET age_verified=true,updated_at=now() WHERE id=$1',[req.params.id]);
  await db.query(`
    UPDATE verification_requests
       SET status='approved',review_note='Aprobada desde la ficha de usuario.',admin_id=$2,reviewed_at=now()
     WHERE user_id=$1 AND type='age' AND status='pending'
  `,[req.params.id,req.user.id]);
  await recordUserAction({userId:req.params.id,adminId:req.user.id,action:'verify_age'});
  res.json({ok:true});
});

module.exports=router;
