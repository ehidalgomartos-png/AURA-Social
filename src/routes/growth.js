const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

let growthReady = null;
async function ensureGrowthTables() {
  if (!growthReady) {
    growthReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id BIGSERIAL PRIMARY KEY,
          inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          invited_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON referrals(inviter_user_id,created_at DESC)');
    })().catch(error => {
      growthReady = null;
      throw error;
    });
  }
  return growthReady;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureGrowthTables();
    next();
  }catch(error){
    console.error('RedLibertad V1.8 growth bootstrap failed:',error);
    res.status(500).json({error:'growth_bootstrap_failed'});
  }
});

router.get('/me', requireAuth, async (req,res)=>{
  const profile=await db.query(`
    SELECT
      u.id,u.username,u.display_name,u.avatar_url,u.bio,
      (SELECT count(*)::int FROM user_interests ui WHERE ui.user_id=u.id) interest_count,
      (SELECT count(*)::int FROM follows f WHERE f.follower_id=u.id) following_count,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published') post_count,
      (
        (SELECT count(*) FROM likes l WHERE l.user_id=u.id)
        + (SELECT count(*) FROM comments c WHERE c.user_id=u.id)
        + (SELECT count(*) FROM reposts r WHERE r.user_id=u.id)
      )::int interaction_count
      FROM users u
     WHERE u.id=$1
     LIMIT 1
  `,[req.user.id]);

  if(!profile.rowCount)return res.status(404).json({error:'user_not_found'});
  const user=profile.rows[0];

  const referrals=await db.query(`
    SELECT
      count(*)::int total,
      count(*) FILTER (
        WHERE
          EXISTS(SELECT 1 FROM posts p WHERE p.user_id=r.invited_user_id AND p.moderation_status='published')
          OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=r.invited_user_id)
          OR EXISTS(SELECT 1 FROM comments c WHERE c.user_id=r.invited_user_id)
          OR EXISTS(SELECT 1 FROM likes l WHERE l.user_id=r.invited_user_id)
      )::int activated
      FROM referrals r
     WHERE r.inviter_user_id=$1
  `,[req.user.id]);

  const steps=[
    {
      id:'avatar',
      label:'Añade una foto de perfil',
      done:Boolean(user.avatar_url),
      action:'profile'
    },
    {
      id:'profile',
      label:'Completa tu bio o tus intereses',
      done:Boolean(String(user.bio||'').trim()) || Number(user.interest_count||0)>0,
      action:'profile'
    },
    {
      id:'follow',
      label:'Sigue al menos a 3 personas',
      done:Number(user.following_count||0)>=3,
      action:'explore'
    },
    {
      id:'post',
      label:'Publica tu primera idea, foto o vídeo',
      done:Number(user.post_count||0)>=1,
      action:'create'
    },
    {
      id:'interact',
      label:'Interactúa: Me gusta, comentario o republicación',
      done:Number(user.interaction_count||0)>=1,
      action:'feed'
    }
  ];

  const completed=steps.filter(step=>step.done).length;
  const progress=Math.round((completed/steps.length)*100);

  res.json({
    inviteCode:user.username,
    steps,
    completed,
    totalSteps:steps.length,
    progress,
    referrals:{
      total:referrals.rows[0]?.total || 0,
      activated:referrals.rows[0]?.activated || 0
    }
  });
});

module.exports = router;
