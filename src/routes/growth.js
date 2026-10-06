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
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_experience_state (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          last_home_seen_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
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

router.get('/pulse', requireAuth, async (req,res)=>{
  const viewerResult=await db.query(
    'SELECT age_verified,show_sensitive,is_admin FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [req.user.id]
  );
  if(!viewerResult.rowCount)return res.status(404).json({error:'user_not_found'});
  const viewer=viewerResult.rows[0];

  const state=await db.query(
    'SELECT last_home_seen_at FROM user_experience_state WHERE user_id=$1 LIMIT 1',
    [req.user.id]
  );
  const stored=state.rows[0]?.last_home_seen_at ? new Date(state.rows[0].last_home_seen_at) : null;
  const fallback=new Date(Date.now()-24*60*60*1000);
  const earliest=new Date(Date.now()-30*24*60*60*1000);
  const since=stored && Number.isFinite(stored.getTime())
    ? new Date(Math.max(stored.getTime(),earliest.getTime()))
    : fallback;

  const contentVisible = viewer.is_admin || (viewer.age_verified && viewer.show_sensitive);

  const [messages,notifications,followingPosts,stories,reels,newFollowers]=await Promise.all([
    db.query(`
      SELECT count(*)::int n
        FROM messages m
        JOIN conversation_members cm
          ON cm.conversation_id=m.conversation_id
         AND cm.user_id=$1
       WHERE cm.is_archived=false
         AND m.sender_id<>$1
         AND m.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
    `,[req.user.id]),
    db.query(`
      SELECT count(*)::int n
        FROM notifications n
       WHERE n.user_id=$1
         AND n.read_at IS NULL
         AND (n.actor_id IS NULL OR n.actor_id NOT IN (
           SELECT muted_id FROM mutes WHERE muter_id=$1
         ))
    `,[req.user.id]),
    db.query(`
      SELECT count(*)::int n
        FROM posts p
        JOIN follows f
          ON f.following_id=p.user_id
         AND f.follower_id=$1
        JOIN users u ON u.id=p.user_id
       WHERE p.moderation_status='published'
         AND p.created_at>$2
         AND u.status='active'
         AND p.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id=$1
           UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1
         )
         AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
         AND (
           p.audience='public'
           OR EXISTS(
             SELECT 1
               FROM creator_vips cv
              WHERE cv.creator_id=p.user_id AND cv.fan_id=$1
           )
         )
    `,[req.user.id,since.toISOString()]),
    db.query(`
      SELECT count(*)::int n
        FROM stories s
        JOIN users u ON u.id=s.user_id
       WHERE s.user_id<>$1
         AND s.expires_at>now()
         AND s.moderation_status='published'
         AND u.status='active'
         AND (s.content_level='normal' OR $2::boolean=true)
         AND s.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id=$1
           UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1
         )
         AND s.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
         AND (
           s.audience='public'
           OR EXISTS(
             SELECT 1 FROM creator_vips cv
              WHERE cv.creator_id=s.user_id AND cv.fan_id=$1
           )
         )
         AND NOT EXISTS(
           SELECT 1 FROM story_views sv
            WHERE sv.story_id=s.id AND sv.viewer_id=$1
         )
    `,[req.user.id,contentVisible]),
    db.query(`
      SELECT count(*)::int n
        FROM posts p
        JOIN users u ON u.id=p.user_id
       WHERE p.user_id<>$1
         AND p.post_kind='reel'
         AND p.moderation_status='published'
         AND u.status='active'
         AND (p.content_level='normal' OR $2::boolean=true)
         AND p.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id=$1
           UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1
         )
         AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
         AND (
           p.audience='public'
           OR EXISTS(
             SELECT 1 FROM creator_vips cv
              WHERE cv.creator_id=p.user_id AND cv.fan_id=$1
           )
         )
         AND NOT EXISTS(
           SELECT 1 FROM discovery_hidden_items hidden
            WHERE hidden.user_id=$1
              AND (
                (hidden.item_type='post' AND hidden.item_id=p.id)
                OR (hidden.item_type='user' AND hidden.item_id=p.user_id)
              )
         )
         AND NOT EXISTS(
           SELECT 1 FROM reel_views rv
            WHERE rv.post_id=p.id AND rv.viewer_id=$1
         )
    `,[req.user.id,contentVisible]),
    db.query(`
      SELECT count(*)::int n
        FROM follows f
        JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$1
         AND f.created_at>$2
         AND u.status='active'
         AND u.id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id=$1
           UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1
         )
    `,[req.user.id,since.toISOString()])
  ]);

  res.json({
    since:since.toISOString(),
    counts:{
      unread_messages:Number(messages.rows[0]?.n || 0),
      unread_notifications:Number(notifications.rows[0]?.n || 0),
      following_posts:Number(followingPosts.rows[0]?.n || 0),
      unseen_stories:Number(stories.rows[0]?.n || 0),
      unseen_reels:Number(reels.rows[0]?.n || 0),
      new_followers:Number(newFollowers.rows[0]?.n || 0)
    }
  });
});

router.post('/pulse/seen', requireAuth, async (req,res)=>{
  const result=await db.query(`
    INSERT INTO user_experience_state(user_id,last_home_seen_at,updated_at)
    VALUES ($1,now(),now())
    ON CONFLICT(user_id) DO UPDATE
      SET last_home_seen_at=excluded.last_home_seen_at,
          updated_at=now()
    RETURNING last_home_seen_at
  `,[req.user.id]);
  res.json({ok:true,lastHomeSeenAt:result.rows[0].last_home_seen_at});
});

module.exports = router;
