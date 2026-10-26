const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const {nextWelcomeStep,welcomeEligibility,welcomeVisible}=require('../services/welcome-v32150');
const {canOfferConversation}=require('../services/participation-v32152');

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
      await db.query('ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_shown_at TIMESTAMPTZ');
      await db.query('ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_snoozed_until TIMESTAMPTZ');
      await db.query('ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_post_id BIGINT');
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_welcome_state_v32150 (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          snoozed_until TIMESTAMPTZ,
          dismissed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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
      u.id,u.username,u.display_name,u.avatar_url,u.bio,u.created_at,u.status,u.is_admin,
      (SELECT count(*)::int FROM user_interests ui WHERE ui.user_id=u.id) interest_count,
      (SELECT count(*)::int FROM follows f WHERE f.follower_id=u.id) following_count,
      (SELECT count(*)::int FROM community_members cm WHERE cm.user_id=u.id) community_count,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published' AND p.post_kind='post') post_count,
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
      label:'Añade una presentación y al menos un interés',
      done:Boolean(String(user.bio||'').trim()) && Number(user.interest_count||0)>0,
      action:'profile'
    },
    {
      id:'follow',
      label:'Sigue al menos a 3 personas',
      detail:String(Math.min(3,Math.max(0,Number(user.following_count)||0)))+' de 3 personas seguidas',
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
  const nextStep=steps.find(step=>!step.done)||null;
  const joinedAt=new Date(user.created_at).getTime();
  const firstWeek=Number.isFinite(joinedAt)&&joinedAt<=Date.now()&&joinedAt>=Date.now()-7*24*60*60*1000;
  const welcomeState=await db.query(
    'SELECT snoozed_until,dismissed_at FROM user_welcome_state_v32150 WHERE user_id=$1',
    [req.user.id]
  );
  const welcomeEligible=welcomeEligibility(user,steps);
  const welcome={eligible:welcomeEligible,
    visible:welcomeVisible(welcomeEligible,welcomeState.rows[0]),
    nextStep:nextWelcomeStep(steps)};
  const inviteLink=await ensurePersonalInvite(req.user.id);
  const starterProfiles=await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.bio,u.creator_verified,u.location_label,
           (u.created_at>=now()-interval '30 days') AS recent_joiner,
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
       AND NOT EXISTS(SELECT 1 FROM discovery_hidden_items h WHERE h.user_id=$1 AND h.item_type='user' AND h.item_id=u.id)
     -- V3.2.160: first connections favor real shared interests and newcomers,
     -- not only profiles that already have many followers.
     ORDER BY shared_interest_count DESC,
       (u.created_at>=now()-interval '30 days') DESC,
       (NULLIF(BTRIM(u.bio),'') IS NOT NULL OR u.avatar_url IS NOT NULL) DESC,
       md5($1::text || ':' || CURRENT_DATE::text || ':first-circle:' || u.id::text) ASC,
       follower_count DESC,u.created_at DESC,u.id DESC
    LIMIT 6
  `,[req.user.id]);

  res.json({
    inviteCode:user.username,
    inviteLink:{token:inviteLink.token,path:'/?invite='+encodeURIComponent(inviteLink.token)+'#registro',opens:Number(inviteLink.open_count||0),joins:Number(inviteLink.join_count||0)},
    starterProfiles:starterProfiles.rows,
    nextStep,
    firstWeek,
    welcome,
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

// A one-time welcome for new accounts and existing members who return.
// Explicit POST: simply reading the dashboard never creates notifications.
router.post('/welcome/activate',requireAuth,async(req,res)=>{
  const result=await db.query(`
    WITH newly_eligible AS (
      INSERT INTO user_welcome_state_v32150(user_id)
      SELECT u.id FROM users u
       WHERE u.id=$1 AND u.status='active' AND u.is_admin=false
         AND (
           NOT EXISTS(SELECT 1 FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published' AND p.post_kind='post')
           OR u.created_at>=now()-interval '30 days'
         )
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    )
    INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)
    SELECT user_id,NULL,'system','welcome',NULL,
           '¡Bienvenido a RedLibertad! Completa tu perfil, comparte tu primera publicación y conoce a tu comunidad.'
    FROM newly_eligible
    RETURNING id
  `,[req.user.id]);
  res.json({ok:true,created:result.rowCount===1});
});

// Snoozed server-side across devices. Permanent dismissal remains available.
router.post('/welcome/preference',requireAuth,async(req,res)=>{
  const choice=String(req.body?.choice||'');
  if(!['later','dismiss'].includes(choice))return res.status(400).json({error:'invalid_choice'});
  await db.query(`
    INSERT INTO user_welcome_state_v32150(user_id,snoozed_until,dismissed_at,updated_at)
    VALUES ($1,
      CASE WHEN $2='later' THEN now()+interval '7 days' ELSE NULL END,
      CASE WHEN $2='dismiss' THEN now() ELSE NULL END,
      now())
    ON CONFLICT(user_id) DO UPDATE
      SET snoozed_until=excluded.snoozed_until,
          dismissed_at=CASE WHEN user_welcome_state_v32150.dismissed_at IS NOT NULL
                             THEN user_welcome_state_v32150.dismissed_at
                             ELSE excluded.dismissed_at END,
          updated_at=now()
  `,[req.user.id,choice]);
  res.json({ok:true});
});

router.get('/pulse', requireAuth, async (req,res)=>{
  const viewerResult=await db.query(
    'SELECT age_verified,show_sensitive,is_admin,EXISTS(SELECT 1 FROM posts p WHERE p.user_id=users.id AND p.moderation_status=\'published\') has_published_posts FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [req.user.id]
  );
  if(!viewerResult.rowCount)return res.status(404).json({error:'user_not_found'});
  const viewer=viewerResult.rows[0];

  const state=await db.query(
    'SELECT last_home_seen_at,participation_prompt_shown_at,participation_prompt_snoozed_until,participation_prompt_post_id FROM user_experience_state WHERE user_id=$1 LIMIT 1',
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
    participation:{
      can_show:canOfferConversation({
        lastHomeSeenAt:state.rows[0]?.last_home_seen_at,
        lastPromptAt:state.rows[0]?.participation_prompt_shown_at,
        snoozedUntil:state.rows[0]?.participation_prompt_snoozed_until,
        hasPublishedPosts:viewer.has_published_posts===true
      }),
      last_post_id:state.rows[0]?.participation_prompt_post_id || null
    },
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

// V3.2.153: claim the recommendation BEFORE showing it. Atomically prevents
// concurrent tabs/devices from displaying a duplicate or an inaccessible post.
// Viewing GET /pulse never writes state or sends notifications.
router.post('/pulse/conversation-shown',requireAuth,async(req,res)=>{
  const postId=String(req.body?.postId||'');
  if(!/^[1-9][0-9]{0,15}$/.test(postId))return res.status(400).json({error:'invalid_post_id'});
  const result=await db.query(`
    UPDATE user_experience_state
       SET participation_prompt_shown_at=now(),
           participation_prompt_post_id=$2::bigint,
           updated_at=now()
     WHERE user_id=$1
       AND last_home_seen_at<=now()-interval '24 hours'
       AND (participation_prompt_shown_at IS NULL
         OR participation_prompt_shown_at<=now()-interval '72 hours')
       AND (participation_prompt_snoozed_until IS NULL
         OR participation_prompt_snoozed_until<=now())
       AND participation_prompt_post_id IS DISTINCT FROM $2::bigint
       AND EXISTS (
         SELECT 1 FROM posts own
         WHERE own.user_id=$1 AND own.moderation_status='published'
       )
       AND EXISTS (
         SELECT 1 FROM posts p JOIN users u ON u.id=p.user_id
         WHERE p.id=$2::bigint
           AND p.user_id<>$1
           AND p.moderation_status='published'
           AND u.status='active'
           AND p.audience='public'
           AND p.content_level='normal'
           AND COALESCE(p.post_kind,'post')='post'
           AND p.created_at>=now()-interval '7 days'
           AND length(btrim(COALESCE(p.caption,'')))>=30
           AND NOT EXISTS (
             SELECT 1 FROM blocks b WHERE
               (b.blocker_id=$1 AND b.blocked_id=p.user_id)
               OR (b.blocker_id=p.user_id AND b.blocked_id=$1)
           )
           AND NOT EXISTS (
             SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=p.user_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM discovery_hidden_items h WHERE h.user_id=$1
               AND ((h.item_type='post' AND h.item_id=p.id)
                 OR (h.item_type='user' AND h.item_id=p.user_id))
           )
           AND NOT EXISTS (
             SELECT 1 FROM likes l WHERE l.user_id=$1 AND l.post_id=p.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM comments c WHERE c.user_id=$1 AND c.post_id=p.id
           )
       )
    RETURNING user_id
  `,[req.user.id,postId]);
  res.json({ok:true,recorded:result.rowCount===1});
});

router.post('/pulse/conversation-snooze',requireAuth,async(req,res)=>{
  await db.query(`
    INSERT INTO user_experience_state(user_id,participation_prompt_snoozed_until,updated_at)
    VALUES($1,now()+interval '7 days',now())
    ON CONFLICT(user_id) DO UPDATE
      SET participation_prompt_snoozed_until=now()+interval '7 days',updated_at=now()
  `,[req.user.id]);
  res.json({ok:true});
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
