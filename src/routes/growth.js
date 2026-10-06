const express = require('express');
const crypto = require('crypto');
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
        CREATE TABLE IF NOT EXISTS growth_invite_links (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(64) NOT NULL UNIQUE,
          open_count INTEGER NOT NULL DEFAULT 0,
          join_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_used_at TIMESTAMPTZ,
          disabled_at TIMESTAMPTZ
        )
      `);
      await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_invite_links_active_user ON growth_invite_links(user_id) WHERE disabled_at IS NULL');
      await db.query('CREATE INDEX IF NOT EXISTS idx_growth_invite_links_token_active ON growth_invite_links(token) WHERE disabled_at IS NULL');
      await db.query('ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invite_link_id BIGINT REFERENCES growth_invite_links(id) ON DELETE SET NULL');
      await db.query("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS attribution TEXT NOT NULL DEFAULT 'legacy_username'");
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

function createInviteToken(){ return crypto.randomBytes(18).toString('base64url'); }
async function ensurePersonalInvite(userId){
  const existing=await db.query(`
    SELECT id,token,open_count,join_count,created_at,last_used_at
    FROM growth_invite_links
    WHERE user_id=$1 AND disabled_at IS NULL
    ORDER BY id DESC LIMIT 1
  `,[userId]);
  if(existing.rowCount)return existing.rows[0];
  for(let attempt=0;attempt<4;attempt+=1){
    try{
      const created=await db.query(`
        INSERT INTO growth_invite_links(user_id,token) VALUES($1,$2)
        RETURNING id,token,open_count,join_count,created_at,last_used_at
      `,[userId,createInviteToken()]);
      return created.rows[0];
    }catch(error){
      if(error?.code!=='23505')throw error;
      const raced=await db.query(`
        SELECT id,token,open_count,join_count,created_at,last_used_at
        FROM growth_invite_links
        WHERE user_id=$1 AND disabled_at IS NULL
        ORDER BY id DESC LIMIT 1
      `,[userId]);
      if(raced.rowCount)return raced.rows[0];
    }
  }
  throw new Error('invite_link_creation_failed');
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

router.get('/invites/:token', async (req,res)=>{
  const token=String(req.params.token||'').trim();
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(token))return res.status(404).json({error:'invite_not_found'});
  const result=await db.query(`
    SELECT l.token,u.id AS inviter_id,u.username,u.display_name,u.avatar_url
    FROM growth_invite_links l JOIN users u ON u.id=l.user_id
    WHERE l.token=$1 AND l.disabled_at IS NULL AND u.status='active' AND u.is_admin=false
    LIMIT 1
  `,[token]);
  if(!result.rowCount)return res.status(404).json({error:'invite_not_found'});
  const row=result.rows[0];
  res.json({invite:{token:row.token,inviter:{id:row.inviter_id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url}}});
});
router.post('/invites/:token/open', async (req,res)=>{
  const token=String(req.params.token||'').trim();
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(token))return res.status(404).json({error:'invite_not_found'});
  const result=await db.query(`
    UPDATE growth_invite_links l SET open_count=open_count+1,last_used_at=now()
    FROM users u
    WHERE l.token=$1 AND l.disabled_at IS NULL AND u.id=l.user_id AND u.status='active' AND u.is_admin=false
    RETURNING l.id
  `,[token]);
  if(!result.rowCount)return res.status(404).json({error:'invite_not_found'});
  res.json({ok:true});
});

router.get('/me', requireAuth, async (req,res)=>{
  const profile=await db.query(`
    SELECT
      u.id,u.username,u.display_name,u.avatar_url,u.bio,
      (SELECT count(*)::int FROM user_interests ui WHERE ui.user_id=u.id) interest_count,
      (SELECT count(*)::int FROM follows f WHERE f.follower_id=u.id) following_count,
      (SELECT count(*)::int FROM community_members cm WHERE cm.user_id=u.id) community_count,
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
      id:'community',
      label:'Únete al menos a una comunidad',
      done:Number(user.community_count||0)>=1,
      action:'communities'
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
  const inviteLink=await ensurePersonalInvite(req.user.id);
  const starterProfiles=await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.bio,u.creator_verified,u.location_label,
           false AS following,
           (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) AS follower_count,
           (SELECT count(*)::int FROM user_interests ti
             WHERE ti.user_id=u.id AND ti.interest IN
             (SELECT oi.interest FROM user_interests oi WHERE oi.user_id=$1)) AS shared_interest_count,
           COALESCE((SELECT array_agg(x.interest ORDER BY x.interest) FROM (
             SELECT ti.interest FROM user_interests ti
             WHERE ti.user_id=u.id AND ti.interest IN
             (SELECT oi.interest FROM user_interests oi WHERE oi.user_id=$1)
             ORDER BY ti.interest LIMIT 4
           ) x),ARRAY[]::text[]) AS interests
    FROM users u
    WHERE u.id<>$1 AND u.status='active' AND u.is_admin=false AND u.discoverable=true
      AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=u.id)
    ORDER BY shared_interest_count DESC,follower_count DESC,u.created_at DESC
    LIMIT 6
  `,[req.user.id]);

  res.json({
    inviteCode:user.username,
    inviteLink:{token:inviteLink.token,path:'/?invite='+encodeURIComponent(inviteLink.token)+'#registro',opens:Number(inviteLink.open_count||0),joins:Number(inviteLink.join_count||0)},
    starterProfiles:starterProfiles.rows,
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
