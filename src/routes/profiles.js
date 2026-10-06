const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

let privacyV19Ready = null;
async function ensurePrivacyV19() {
  if (!privacyV19Ready) {
    privacyV19Ready = (async () => {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy TEXT NOT NULL DEFAULT 'everyone'");
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE");
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE");
      const privacyConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='users_message_privacy_check' AND conrelid='users'::regclass LIMIT 1"
      );
      if(!privacyConstraint.rowCount){
        await db.query(`
          ALTER TABLE users
            ADD CONSTRAINT users_message_privacy_check
            CHECK(message_privacy IN ('everyone','following','no_one'))
        `);
      }
      await db.query(`
        CREATE TABLE IF NOT EXISTS mutes (
          muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(muter_id,muted_id),
          CHECK(muter_id<>muted_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes(muter_id,created_at DESC)');
    })().catch(error => {
      privacyV19Ready = null;
      throw error;
    });
  }
  return privacyV19Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensurePrivacyV19();
    next();
  }catch(error){
    console.error('RedLibertad V1.9 privacy bootstrap failed:',error);
    res.status(500).json({error:'privacy_bootstrap_failed'});
  }
});


let creatorV13Ready = null;
async function ensureCreatorV13() {
  if (!creatorV13Ready) {
    creatorV13Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_featured_posts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          featured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_featured_posts_user ON creator_featured_posts(user_id,featured_at DESC)');
    })().catch(error => {
      creatorV13Ready = null;
      throw error;
    });
  }
  return creatorV13Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorV13();
    next();
  }catch(error){
    console.error('RedLibertad V1.13 creator bootstrap failed:',error);
    res.status(500).json({error:'creator_bootstrap_failed'});
  }
});


let creatorV14Ready = null;
async function ensureCreatorV14() {
  if (!creatorV14Ready) {
    creatorV14Ready = (async () => {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_headline VARCHAR(120) NOT NULL DEFAULT ''");
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_links (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label VARCHAR(40) NOT NULL,
          url TEXT NOT NULL,
          position SMALLINT NOT NULL DEFAULT 0,
          click_count BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_links_user_position ON creator_links(user_id,position,id)');
    })().catch(error => {
      creatorV14Ready = null;
      throw error;
    });
  }
  return creatorV14Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorV14();
    next();
  }catch(error){
    console.error('RedLibertad V1.14 creator profile bootstrap failed:',error);
    res.status(500).json({error:'creator_profile_bootstrap_failed'});
  }
});


let creatorV15Ready = null;
async function ensureCreatorV15() {
  if (!creatorV15Ready) {
    creatorV15Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_broadcasts (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(280) NOT NULL,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_broadcasts_user_created ON creator_broadcasts(user_id,created_at DESC)');
      const constraint=await db.query(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='notifications_type_check' AND conrelid='notifications'::regclass LIMIT 1"
      );
      const definition=String(constraint.rows[0]?.definition || '');
      if(!definition.includes('creator_broadcast')){
        await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
        await db.query(`
          ALTER TABLE notifications
            ADD CONSTRAINT notifications_type_check
            CHECK(type IN (
              'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
              'like','comment','mention','repost','creator_broadcast','system'
            ))
        `);
      }
    })().catch(error => {
      creatorV15Ready = null;
      throw error;
    });
  }
  return creatorV15Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorV15();
    next();
  }catch(error){
    console.error('RedLibertad V1.15 creator audience bootstrap failed:',error);
    res.status(500).json({error:'creator_audience_bootstrap_failed'});
  }
});

const INTERESTS = [
  'Arte',
  'Fotografía',
  'Naturismo',
  'Moda',
  'Fitness',
  'Viajes',
  'Música',
  'Lifestyle',
  'Belleza',
  'Creatividad',
  'Tecnología',
  'Bienestar'
];

function normalizedInterest(value) {
  const raw = String(value || '').trim();
  return INTERESTS.find(item => item.toLowerCase() === raw.toLowerCase()) || null;
}

router.get('/interests', requireAuth, async (_req, res) => {
  res.json({ interests: INTERESTS });
});

router.get('/me/summary', requireAuth, async (req,res)=>{
  const r=await db.query(`
    SELECT id,email,username,display_name,bio,avatar_url,cover_url,location_label,website_url,creator_headline,
           is_admin,age_verified,creator_verified,show_sensitive,status,message_privacy,discoverable,show_activity,
           (SELECT count(*)::int FROM follows WHERE following_id=users.id) follower_count,
           (SELECT count(*)::int FROM follows WHERE follower_id=users.id) following_count,
           (SELECT count(*)::int FROM posts WHERE user_id=users.id AND moderation_status='published') post_count,
           (SELECT count(*)::int FROM notifications n WHERE n.user_id=users.id AND n.read_at IS NULL AND (n.actor_id IS NULL OR n.actor_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=users.id))) notification_count,
           COALESCE(
             (SELECT array_agg(ui.interest ORDER BY ui.interest)
                FROM user_interests ui
               WHERE ui.user_id=users.id),
             ARRAY[]::text[]
           ) interests
      FROM users WHERE id=$1
  `,[req.user.id]);
  if(!r.rowCount) return res.status(404).json({error:'user_not_found'});
  res.json({profile:r.rows[0]});
});

router.get('/suggestions', requireAuth, async (req, res) => {
  const interest = normalizedInterest(req.query.interest);
  const requestedLimit = Number(req.query.limit || 12);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 12, 1), 30);

  const r = await db.query(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.bio,
      u.avatar_url,
      u.cover_url,
      u.location_label,
      u.creator_verified,
      EXISTS(
        SELECT 1
          FROM follows f
         WHERE f.follower_id=$1
           AND f.following_id=u.id
      ) AS following,
      (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) AS follower_count,
      (
        SELECT count(*)::int
          FROM user_interests target_interest
         WHERE target_interest.user_id=u.id
           AND target_interest.interest IN (
             SELECT mine.interest
               FROM user_interests mine
              WHERE mine.user_id=$1
           )
      ) AS shared_interest_count,
      COALESCE(
        (SELECT array_agg(ui.interest ORDER BY ui.interest)
           FROM user_interests ui
          WHERE ui.user_id=u.id),
        ARRAY[]::text[]
      ) interests
    FROM users u
    WHERE u.status='active'
      AND u.is_admin=false
      AND u.discoverable=true
      AND u.id<>$1
      AND u.id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id=$1
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id=$1
      )
      AND u.id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
      AND (
        $2::text IS NULL
        OR EXISTS (
          SELECT 1
            FROM user_interests filtered_interest
           WHERE filtered_interest.user_id=u.id
             AND filtered_interest.interest=$2
        )
      )
    ORDER BY
      EXISTS(
        SELECT 1
          FROM follows already_following
         WHERE already_following.follower_id=$1
           AND already_following.following_id=u.id
      ) ASC,
      shared_interest_count DESC,
      u.creator_verified DESC,
      follower_count DESC,
      u.updated_at DESC
    LIMIT $3
  `, [req.user.id, interest, limit]);

  res.json({ users: r.rows, interest, interests: INTERESTS });
});

router.get('/search/users', requireAuth, async (req,res)=>{
  const q=String(req.query.q||'').trim();
  if(q.length<2) return res.json({users:[]});

  const r=await db.query(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.bio,
      u.avatar_url,
      u.location_label,
      u.creator_verified,
      EXISTS(
        SELECT 1 FROM follows f
         WHERE f.follower_id=$1 AND f.following_id=u.id
      ) following,
      (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count,
      COALESCE(
        (SELECT array_agg(ui.interest ORDER BY ui.interest)
           FROM user_interests ui
          WHERE ui.user_id=u.id),
        ARRAY[]::text[]
      ) interests
      FROM users u
     WHERE u.status='active' AND u.is_admin=false AND u.discoverable=true AND u.id<>$1
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND u.id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND (
         lower(u.username) LIKE lower($2)
         OR lower(u.display_name) LIKE lower($2)
         OR lower(u.bio) LIKE lower($2)
       )
     ORDER BY u.creator_verified DESC, follower_count DESC, u.username ASC
     LIMIT 30
  `,[req.user.id,`%${q}%`]);

  res.json({users:r.rows});
});

router.get('/active', requireAuth, async (req,res)=>{
  const requestedLimit=Number(req.query.limit || 10);
  const limit=Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10,1),20);

  const result=await db.query(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.bio,
      u.avatar_url,
      u.location_label,
      u.creator_verified,
      activity.last_activity_at,
      EXISTS(
        SELECT 1 FROM follows mine
         WHERE mine.follower_id=$1
           AND mine.following_id=u.id
      ) following,
      (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count,
      (
        SELECT count(*)::int
          FROM user_interests target_interest
         WHERE target_interest.user_id=u.id
           AND target_interest.interest IN (
             SELECT mine.interest
               FROM user_interests mine
              WHERE mine.user_id=$1
           )
      ) shared_interest_count,
      COALESCE(
        (SELECT array_agg(ui.interest ORDER BY ui.interest)
           FROM user_interests ui
          WHERE ui.user_id=u.id),
        ARRAY[]::text[]
      ) interests
      FROM users u
      CROSS JOIN LATERAL (
        SELECT GREATEST(
          COALESCE((SELECT max(p.created_at) FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published'),'epoch'::timestamptz),
          COALESCE((SELECT max(c.created_at) FROM comments c WHERE c.user_id=u.id),'epoch'::timestamptz),
          COALESCE((SELECT max(r.created_at) FROM reposts r WHERE r.user_id=u.id),'epoch'::timestamptz),
          COALESCE((SELECT max(s.created_at) FROM stories s WHERE s.user_id=u.id AND s.moderation_status='published'),'epoch'::timestamptz)
        ) AS last_activity_at
      ) activity
     WHERE u.status='active'
       AND u.is_admin=false
       AND u.discoverable=true
       AND u.show_activity=true
       AND u.id<>$1
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND u.id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND activity.last_activity_at >= now() - interval '7 days'
     ORDER BY
       EXISTS(
         SELECT 1 FROM follows already_following
          WHERE already_following.follower_id=$1
            AND already_following.following_id=u.id
       ) ASC,
       shared_interest_count DESC,
       activity.last_activity_at DESC,
       follower_count DESC
     LIMIT $2
  `,[req.user.id,limit]);

  res.json({users:result.rows});
});

const privacySchema=z.object({
  messagePrivacy:z.enum(['everyone','following','no_one']).optional(),
  discoverable:z.boolean().optional(),
  showActivity:z.boolean().optional()
});

router.get('/me/privacy',requireAuth,async(req,res)=>{
  const [settings,muted,blocked]=await Promise.all([
    db.query(
      `SELECT message_privacy,discoverable,show_activity
         FROM users WHERE id=$1 LIMIT 1`,
      [req.user.id]
    ),
    db.query('SELECT count(*)::int AS n FROM mutes WHERE muter_id=$1',[req.user.id]),
    db.query('SELECT count(*)::int AS n FROM blocks WHERE blocker_id=$1',[req.user.id])
  ]);

  if(!settings.rowCount)return res.status(404).json({error:'user_not_found'});
  res.json({
    settings:{
      messagePrivacy:settings.rows[0].message_privacy,
      discoverable:settings.rows[0].discoverable,
      showActivity:settings.rows[0].show_activity
    },
    mutedCount:muted.rows[0]?.n || 0,
    blockedCount:blocked.rows[0]?.n || 0
  });
});

router.patch('/me/privacy',requireAuth,async(req,res)=>{
  const parsed=privacySchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const current=await db.query(
    'SELECT message_privacy,discoverable,show_activity FROM users WHERE id=$1',
    [req.user.id]
  );
  if(!current.rowCount)return res.status(404).json({error:'user_not_found'});

  const d=parsed.data;
  const row=await db.query(`
    UPDATE users
       SET message_privacy=$2,
           discoverable=$3,
           show_activity=$4,
           updated_at=now()
     WHERE id=$1
     RETURNING message_privacy,discoverable,show_activity
  `,[
    req.user.id,
    d.messagePrivacy ?? current.rows[0].message_privacy,
    d.discoverable ?? current.rows[0].discoverable,
    d.showActivity ?? current.rows[0].show_activity
  ]);

  res.json({
    ok:true,
    settings:{
      messagePrivacy:row.rows[0].message_privacy,
      discoverable:row.rows[0].discoverable,
      showActivity:row.rows[0].show_activity
    }
  });
});

router.get('/me/muted',requireAuth,async(req,res)=>{
  const result=await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,m.created_at
      FROM mutes m
      JOIN users u ON u.id=m.muted_id
     WHERE m.muter_id=$1
     ORDER BY m.created_at DESC
     LIMIT 250
  `,[req.user.id]);
  res.json({users:result.rows});
});

router.get('/me/blocked',requireAuth,async(req,res)=>{
  const result=await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,b.created_at
      FROM blocks b
      JOIN users u ON u.id=b.blocked_id
     WHERE b.blocker_id=$1
     ORDER BY b.created_at DESC
     LIMIT 250
  `,[req.user.id]);
  res.json({users:result.rows});
});

router.get('/me/creator-center',requireAuth,async(req,res)=>{
  const summary=await db.query(`
    SELECT
      u.id,u.username,u.display_name,u.creator_verified,u.age_verified,u.creator_headline,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published') post_count,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published' AND p.post_kind='reel') reel_count,
      (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count,
      (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id AND f.created_at>=now()-interval '30 days') followers_30d,
      (SELECT count(*)::int FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=u.id AND p.moderation_status='published') like_count,
      (SELECT count(*)::int FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=u.id AND p.moderation_status='published' AND l.created_at>=now()-interval '30 days') likes_30d,
      (SELECT count(*)::int FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=u.id AND p.moderation_status='published') comment_count,
      (SELECT count(*)::int FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=u.id AND p.moderation_status='published' AND c.created_at>=now()-interval '30 days') comments_30d,
      (SELECT count(*)::int FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=u.id AND p.moderation_status='published') repost_count,
      (SELECT count(*)::int FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=u.id AND p.moderation_status='published' AND r.created_at>=now()-interval '30 days') reposts_30d,
      (SELECT count(*)::int FROM saved_posts s JOIN posts p ON p.id=s.post_id WHERE p.user_id=u.id AND p.moderation_status='published') save_count,
      (SELECT count(*)::int FROM saved_posts s JOIN posts p ON p.id=s.post_id WHERE p.user_id=u.id AND p.moderation_status='published' AND s.created_at>=now()-interval '30 days') saves_30d,
      (SELECT count(*)::int FROM creator_featured_posts fp WHERE fp.user_id=u.id) featured_count,
      (SELECT COALESCE(sum(cl.click_count),0)::bigint FROM creator_links cl WHERE cl.user_id=u.id) link_click_count,
      (SELECT count(*)::int FROM creator_broadcasts cb WHERE cb.user_id=u.id) broadcast_count
    FROM users u
    WHERE u.id=$1
    LIMIT 1
  `,[req.user.id]);

  if(!summary.rowCount)return res.status(404).json({error:'user_not_found'});
  const account=summary.rows[0];
  if(!account.creator_verified)return res.status(403).json({error:'verified_creator_required'});

  const posts=await db.query(`
    SELECT
      p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.created_at,
      EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=$1 AND fp.post_id=p.id) featured,
      (SELECT fp.featured_at FROM creator_featured_posts fp WHERE fp.user_id=$1 AND fp.post_id=p.id) featured_at,
      (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
      (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
      (SELECT count(*)::int FROM reposts r WHERE r.post_id=p.id) repost_count,
      (SELECT count(*)::int FROM saved_posts s WHERE s.post_id=p.id) save_count
    FROM posts p
    WHERE p.user_id=$1
      AND p.moderation_status='published'
    ORDER BY
      EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=$1 AND fp.post_id=p.id) DESC,
      COALESCE((SELECT fp.featured_at FROM creator_featured_posts fp WHERE fp.user_id=$1 AND fp.post_id=p.id),p.created_at) DESC
    LIMIT 24
  `,[req.user.id]);

  const links=await db.query(`
    SELECT id,label,url,position,click_count,created_at,updated_at
      FROM creator_links
     WHERE user_id=$1
     ORDER BY position ASC,id ASC
     LIMIT 5
  `,[req.user.id]);

  const [audience,broadcasts,lastBroadcast,engagementSummary,topFans,topContent]=await Promise.all([
    db.query(`
      SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,f.created_at AS followed_at
        FROM follows f
        JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$1
         AND u.status='active'
       ORDER BY f.created_at DESC
       LIMIT 20
    `,[req.user.id]),
    db.query(`
      SELECT id,body,recipient_count,created_at
        FROM creator_broadcasts
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 10
    `,[req.user.id]),
    db.query(`
      SELECT created_at
        FROM creator_broadcasts
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 1
    `,[req.user.id]),
    db.query(`
      WITH active_followers AS (
        SELECT DISTINCT actor_id
          FROM (
            SELECT l.user_id AS actor_id
              FROM likes l
              JOIN posts p ON p.id=l.post_id
              JOIN follows f ON f.follower_id=l.user_id AND f.following_id=$1
             WHERE p.user_id=$1
               AND p.moderation_status='published'
               AND l.created_at>=now()-interval '30 days'
            UNION
            SELECT c.user_id AS actor_id
              FROM comments c
              JOIN posts p ON p.id=c.post_id
              JOIN follows f ON f.follower_id=c.user_id AND f.following_id=$1
             WHERE p.user_id=$1
               AND p.moderation_status='published'
               AND c.created_at>=now()-interval '30 days'
            UNION
            SELECT r.user_id AS actor_id
              FROM reposts r
              JOIN posts p ON p.id=r.post_id
              JOIN follows f ON f.follower_id=r.user_id AND f.following_id=$1
             WHERE p.user_id=$1
               AND p.moderation_status='published'
               AND r.created_at>=now()-interval '30 days'
          ) activity
      )
      SELECT
        (SELECT count(*)::int FROM active_followers) AS active_followers_30d,
        (
          (SELECT count(*) FROM likes l JOIN posts p ON p.id=l.post_id
            WHERE p.user_id=$1 AND p.moderation_status='published' AND l.created_at>=now()-interval '30 days')
          +
          (SELECT count(*) FROM comments c JOIN posts p ON p.id=c.post_id
            WHERE p.user_id=$1 AND p.moderation_status='published' AND c.created_at>=now()-interval '30 days')
          +
          (SELECT count(*) FROM reposts r JOIN posts p ON p.id=r.post_id
            WHERE p.user_id=$1 AND p.moderation_status='published' AND r.created_at>=now()-interval '30 days')
        )::int AS interactions_30d
    `,[req.user.id]),
    db.query(`
      WITH interactions AS (
        SELECT l.user_id, count(*)::int AS like_count, 0::int AS comment_count, 0::int AS repost_count
          FROM likes l
          JOIN posts p ON p.id=l.post_id
          JOIN follows f ON f.follower_id=l.user_id AND f.following_id=$1
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND l.created_at>=now()-interval '30 days'
         GROUP BY l.user_id
        UNION ALL
        SELECT c.user_id, 0::int, count(*)::int, 0::int
          FROM comments c
          JOIN posts p ON p.id=c.post_id
          JOIN follows f ON f.follower_id=c.user_id AND f.following_id=$1
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND c.created_at>=now()-interval '30 days'
         GROUP BY c.user_id
        UNION ALL
        SELECT r.user_id, 0::int, 0::int, count(*)::int
          FROM reposts r
          JOIN posts p ON p.id=r.post_id
          JOIN follows f ON f.follower_id=r.user_id AND f.following_id=$1
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND r.created_at>=now()-interval '30 days'
         GROUP BY r.user_id
      ),
      fan_activity AS (
        SELECT
          user_id,
          sum(like_count)::int AS like_count,
          sum(comment_count)::int AS comment_count,
          sum(repost_count)::int AS repost_count
        FROM interactions
        GROUP BY user_id
      )
      SELECT
        u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,
        a.like_count,a.comment_count,a.repost_count,
        (a.like_count+a.comment_count+a.repost_count)::int AS interaction_count
      FROM fan_activity a
      JOIN users u ON u.id=a.user_id
      WHERE u.status='active'
      ORDER BY interaction_count DESC,a.comment_count DESC,a.repost_count DESC,u.display_name ASC
      LIMIT 10
    `,[req.user.id]),
    db.query(`
      WITH like_stats AS (
        SELECT post_id,count(*)::int AS n FROM likes
         WHERE created_at>=now()-interval '30 days'
         GROUP BY post_id
      ),
      comment_stats AS (
        SELECT post_id,count(*)::int AS n FROM comments
         WHERE created_at>=now()-interval '30 days'
         GROUP BY post_id
      ),
      repost_stats AS (
        SELECT post_id,count(*)::int AS n FROM reposts
         WHERE created_at>=now()-interval '30 days'
         GROUP BY post_id
      ),
      save_stats AS (
        SELECT post_id,count(*)::int AS n FROM saved_posts
         WHERE created_at>=now()-interval '30 days'
         GROUP BY post_id
      )
      ,post_stats AS (
        SELECT
          p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.created_at,
          COALESCE(ls.n,0)::int AS like_count_30d,
          COALESCE(cs.n,0)::int AS comment_count_30d,
          COALESCE(rs.n,0)::int AS repost_count_30d,
          COALESCE(ss.n,0)::int AS save_count_30d,
          (COALESCE(ls.n,0)+COALESCE(cs.n,0)+COALESCE(rs.n,0)+COALESCE(ss.n,0))::int AS engagement_count_30d
        FROM posts p
        LEFT JOIN like_stats ls ON ls.post_id=p.id
        LEFT JOIN comment_stats cs ON cs.post_id=p.id
        LEFT JOIN repost_stats rs ON rs.post_id=p.id
        LEFT JOIN save_stats ss ON ss.post_id=p.id
        WHERE p.user_id=$1
          AND p.moderation_status='published'
      )
      SELECT *
        FROM post_stats
       WHERE engagement_count_30d>0
       ORDER BY engagement_count_30d DESC,created_at DESC
       LIMIT 5
    `,[req.user.id])
  ]);

  const lastCreated=lastBroadcast.rows[0]?.created_at || null;
  const nextBroadcastAt=lastCreated
    ? new Date(new Date(lastCreated).getTime()+24*60*60*1000).toISOString()
    : null;

  const followerCount=Number(account.follower_count || 0);
  const activeFollowers30d=Number(engagementSummary.rows[0]?.active_followers_30d || 0);
  const activeFollowerRate30d=followerCount
    ? Math.round((activeFollowers30d/followerCount)*1000)/10
    : 0;

  res.json({
    creator:account,
    posts:posts.rows,
    links:links.rows,
    audience:audience.rows,
    broadcasts:broadcasts.rows,
    engagement:{
      activeFollowers30d,
      activeFollowerRate30d,
      interactions30d:Number(engagementSummary.rows[0]?.interactions_30d || 0),
      topFans:topFans.rows,
      topContent:topContent.rows
    },
    featuredLimit:3,
    linkLimit:5,
    broadcastLimitHours:24,
    nextBroadcastAt
  });
});

router.post('/me/creator/featured/:postId',requireAuth,async(req,res)=>{
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const account=await client.query(
      'SELECT id,creator_verified FROM users WHERE id=$1 FOR UPDATE',
      [req.user.id]
    );
    if(!account.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'user_not_found'});
    }
    if(!account.rows[0].creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required'});
    }

    const post=await client.query(
      "SELECT id FROM posts WHERE id=$1 AND user_id=$2 AND moderation_status='published' LIMIT 1",
      [req.params.postId,req.user.id]
    );
    if(!post.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'post_not_found'});
    }

    const existing=await client.query(
      'SELECT 1 FROM creator_featured_posts WHERE user_id=$1 AND post_id=$2',
      [req.user.id,req.params.postId]
    );
    if(existing.rowCount){
      await client.query('COMMIT');
      return res.json({ok:true,featured:true});
    }

    const count=await client.query(
      'SELECT count(*)::int n FROM creator_featured_posts WHERE user_id=$1',
      [req.user.id]
    );
    if(Number(count.rows[0]?.n || 0)>=3){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'featured_limit_reached',limit:3});
    }

    await client.query(
      'INSERT INTO creator_featured_posts (user_id,post_id) VALUES ($1,$2)',
      [req.user.id,req.params.postId]
    );
    await client.query('COMMIT');
    res.json({ok:true,featured:true});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad feature creator post failed:',error);
    res.status(500).json({error:'feature_post_failed'});
  }finally{
    client.release();
  }
});

router.delete('/me/creator/featured/:postId',requireAuth,async(req,res)=>{
  const account=await db.query('SELECT creator_verified FROM users WHERE id=$1 LIMIT 1',[req.user.id]);
  if(!account.rowCount)return res.status(404).json({error:'user_not_found'});
  if(!account.rows[0].creator_verified)return res.status(403).json({error:'verified_creator_required'});

  await db.query(
    'DELETE FROM creator_featured_posts WHERE user_id=$1 AND post_id=$2',
    [req.user.id,req.params.postId]
  );
  res.json({ok:true,featured:false});
});


const creatorLinkSchema=z.object({
  id:z.coerce.number().int().positive().optional(),
  label:z.string().trim().min(1).max(40),
  url:z.string().trim().url().max(2048).refine(value=>/^https?:\/\//i.test(value),{message:'http_url_required'})
});
const creatorProfileSchema=z.object({
  headline:z.string().trim().max(120).optional().default(''),
  links:z.array(creatorLinkSchema).max(5).optional().default([])
});

router.put('/me/creator-profile',requireAuth,async(req,res)=>{
  const parsed=creatorProfileSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_profile',details:parsed.error.flatten()});

  const data=parsed.data;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const account=await client.query(
      'SELECT id,creator_verified FROM users WHERE id=$1 FOR UPDATE',
      [req.user.id]
    );
    if(!account.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'user_not_found'});
    }
    if(!account.rows[0].creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required'});
    }

    const existing=await client.query(
      'SELECT id FROM creator_links WHERE user_id=$1',
      [req.user.id]
    );
    const ownedIds=new Set(existing.rows.map(row=>Number(row.id)));
    const keepIds=[];

    await client.query(
      'UPDATE users SET creator_headline=$2,updated_at=now() WHERE id=$1',
      [req.user.id,data.headline]
    );

    for(let position=0;position<data.links.length;position+=1){
      const link=data.links[position];
      if(link.id && !ownedIds.has(Number(link.id))){
        await client.query('ROLLBACK');
        return res.status(400).json({error:'creator_link_not_owned'});
      }

      if(link.id){
        await client.query(`
          UPDATE creator_links
             SET label=$3,url=$4,position=$5,updated_at=now()
           WHERE id=$1 AND user_id=$2
        `,[link.id,req.user.id,link.label,link.url,position]);
        keepIds.push(Number(link.id));
      }else{
        const inserted=await client.query(`
          INSERT INTO creator_links (user_id,label,url,position)
          VALUES ($1,$2,$3,$4)
          RETURNING id
        `,[req.user.id,link.label,link.url,position]);
        keepIds.push(Number(inserted.rows[0].id));
      }
    }

    if(keepIds.length){
      await client.query(
        'DELETE FROM creator_links WHERE user_id=$1 AND NOT (id=ANY($2::bigint[]))',
        [req.user.id,keepIds]
      );
    }else{
      await client.query('DELETE FROM creator_links WHERE user_id=$1',[req.user.id]);
    }

    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad creator profile update failed:',error);
    return res.status(500).json({error:'creator_profile_update_failed'});
  }finally{
    client.release();
  }

  const links=await db.query(
    'SELECT id,label,url,position,click_count FROM creator_links WHERE user_id=$1 ORDER BY position ASC,id ASC LIMIT 5',
    [req.user.id]
  );
  res.json({ok:true,headline:data.headline,links:links.rows});
});

router.post('/creator-links/:id/click',async(req,res)=>{
  const result=await db.query(`
    UPDATE creator_links cl
       SET click_count=cl.click_count+1,
           updated_at=now()
      FROM users u
     WHERE cl.id=$1
       AND u.id=cl.user_id
       AND u.status='active'
       AND u.creator_verified=true
    RETURNING cl.id,cl.url
  `,[req.params.id]);

  if(!result.rowCount)return res.status(404).json({error:'creator_link_not_found'});
  res.json({ok:true,url:result.rows[0].url});
});


const creatorBroadcastSchema=z.object({
  body:z.string().trim().min(1).max(280)
});

router.post('/me/creator-broadcasts',requireAuth,async(req,res)=>{
  const parsed=creatorBroadcastSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_broadcast'});

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const account=await client.query(
      'SELECT id,creator_verified FROM users WHERE id=$1 FOR UPDATE',
      [req.user.id]
    );
    if(!account.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'user_not_found'});
    }
    if(!account.rows[0].creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required'});
    }

    const last=await client.query(`
      SELECT created_at
        FROM creator_broadcasts
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 1
    `,[req.user.id]);

    if(last.rowCount){
      const nextAt=new Date(new Date(last.rows[0].created_at).getTime()+24*60*60*1000);
      if(nextAt.getTime()>Date.now()){
        await client.query('ROLLBACK');
        return res.status(429).json({error:'broadcast_cooldown',nextBroadcastAt:nextAt.toISOString()});
      }
    }

    const inserted=await client.query(`
      INSERT INTO creator_broadcasts (user_id,body)
      VALUES ($1,$2)
      RETURNING id,body,created_at
    `,[req.user.id,parsed.data.body]);
    const broadcast=inserted.rows[0];

    const recipients=await client.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      SELECT
        f.follower_id,
        $1,
        'creator_broadcast',
        'creator_broadcast',
        $2,
        $3
      FROM follows f
      JOIN users follower ON follower.id=f.follower_id
      WHERE f.following_id=$1
        AND follower.status='active'
        AND NOT EXISTS (
          SELECT 1 FROM mutes m
           WHERE m.muter_id=f.follower_id
             AND m.muted_id=$1
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=f.follower_id AND b.blocked_id=$1)
              OR (b.blocker_id=$1 AND b.blocked_id=f.follower_id)
        )
      RETURNING id
    `,[req.user.id,broadcast.id,parsed.data.body]);

    await client.query(
      'UPDATE creator_broadcasts SET recipient_count=$2 WHERE id=$1',
      [broadcast.id,recipients.rowCount]
    );
    await client.query('COMMIT');

    res.status(201).json({
      ok:true,
      broadcast:{...broadcast,recipient_count:recipients.rowCount},
      nextBroadcastAt:new Date(new Date(broadcast.created_at).getTime()+24*60*60*1000).toISOString()
    });
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad creator broadcast failed:',error);
    res.status(500).json({error:'creator_broadcast_failed'});
  }finally{
    client.release();
  }
});

router.get('/:username', optionalAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT id,username,display_name,bio,avatar_url,cover_url,location_label,website_url,creator_headline,age_verified,creator_verified,created_at,
           (SELECT count(*)::int FROM follows WHERE following_id=users.id) follower_count,
           (SELECT count(*)::int FROM follows WHERE follower_id=users.id) following_count,
           (SELECT count(*)::int FROM posts WHERE user_id=users.id AND moderation_status='published') post_count,
           COALESCE(
             (SELECT array_agg(ui.interest ORDER BY ui.interest)
                FROM user_interests ui
               WHERE ui.user_id=users.id),
             ARRAY[]::text[]
           ) interests
      FROM users
     WHERE lower(username)=lower($1) AND status='active'
     LIMIT 1
  `,[req.params.username]);

  if(!result.rowCount)return res.status(404).json({error:'profile_not_found'});

  const profile=result.rows[0];
  let following=false;
  let followsYou=false;
  let mutuals=[];
  let mutualCount=0;
  let mutedByMe=false;
  let blockedByMe=false;

  if(req.user){
    const [followingResult,followsYouResult,mutualResult,mutualCountResult,mutedResult,blockedResult]=await Promise.all([
      db.query(
        'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',
        [req.user.id,profile.id]
      ),
      db.query(
        'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',
        [profile.id,req.user.id]
      ),
      db.query(`
        SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
          FROM follows target_followers
          JOIN follows viewer_follows
            ON viewer_follows.following_id=target_followers.follower_id
           AND viewer_follows.follower_id=$1
          JOIN users u ON u.id=target_followers.follower_id
         WHERE target_followers.following_id=$2
           AND u.status='active'
           AND u.id<>$1
         ORDER BY u.creator_verified DESC,u.display_name ASC
         LIMIT 3
      `,[req.user.id,profile.id]),
      db.query(`
        SELECT count(*)::int AS n
          FROM follows target_followers
          JOIN follows viewer_follows
            ON viewer_follows.following_id=target_followers.follower_id
           AND viewer_follows.follower_id=$1
          JOIN users u ON u.id=target_followers.follower_id
         WHERE target_followers.following_id=$2
           AND u.status='active'
           AND u.id<>$1
      `,[req.user.id,profile.id]),
      db.query('SELECT 1 FROM mutes WHERE muter_id=$1 AND muted_id=$2',[req.user.id,profile.id]),
      db.query('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[req.user.id,profile.id])
    ]);
    following=!!followingResult.rowCount;
    followsYou=!!followsYouResult.rowCount;
    mutuals=mutualResult.rows;
    mutualCount=mutualCountResult.rows[0]?.n || 0;
    mutedByMe=!!mutedResult.rowCount;
    blockedByMe=!!blockedResult.rowCount;
  }

  let creatorLinks=[];
  if(profile.creator_verified){
    const links=await db.query(`
      SELECT id,label,url,position
        FROM creator_links
       WHERE user_id=$1
       ORDER BY position ASC,id ASC
       LIMIT 5
    `,[profile.id]);
    creatorLinks=links.rows;
  }

  res.json({profile,following,followsYou,mutuals,mutualCount,mutedByMe,blockedByMe,creatorLinks});
});

router.get('/:username/followers',optionalAuth,async(req,res)=>{
  const owner=await db.query(
    `SELECT id,username FROM users WHERE lower(username)=lower($1) AND status='active' LIMIT 1`,
    [req.params.username]
  );
  if(!owner.rowCount)return res.status(404).json({error:'profile_not_found'});

  const viewerId=req.user?.id || null;
  const params=[owner.rows[0].id];
  let followingSelect='false';
  let blockFilter='';
  if(viewerId){
    params.push(viewerId);
    followingSelect='EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$2 AND mine.following_id=u.id)';
    blockFilter=`AND u.id NOT IN (
      SELECT blocked_id FROM blocks WHERE blocker_id=$2
      UNION
      SELECT blocker_id FROM blocks WHERE blocked_id=$2
    )`;
  }

  const result=await db.query(`
    SELECT u.id,u.username,u.display_name,u.bio,u.avatar_url,u.location_label,u.creator_verified,
           ${followingSelect} AS following,
           (SELECT count(*)::int FROM follows f2 WHERE f2.following_id=u.id) follower_count
      FROM follows f
      JOIN users u ON u.id=f.follower_id
     WHERE f.following_id=$1
       AND u.status='active'
       ${blockFilter}
     ORDER BY f.created_at DESC
     LIMIT 250
  `,params);

  res.json({users:result.rows,kind:'followers',profile:owner.rows[0]});
});

router.get('/:username/following',optionalAuth,async(req,res)=>{
  const owner=await db.query(
    `SELECT id,username FROM users WHERE lower(username)=lower($1) AND status='active' LIMIT 1`,
    [req.params.username]
  );
  if(!owner.rowCount)return res.status(404).json({error:'profile_not_found'});

  const viewerId=req.user?.id || null;
  const params=[owner.rows[0].id];
  let followingSelect='false';
  let blockFilter='';
  if(viewerId){
    params.push(viewerId);
    followingSelect='EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$2 AND mine.following_id=u.id)';
    blockFilter=`AND u.id NOT IN (
      SELECT blocked_id FROM blocks WHERE blocker_id=$2
      UNION
      SELECT blocker_id FROM blocks WHERE blocked_id=$2
    )`;
  }

  const result=await db.query(`
    SELECT u.id,u.username,u.display_name,u.bio,u.avatar_url,u.location_label,u.creator_verified,
           ${followingSelect} AS following,
           (SELECT count(*)::int FROM follows f2 WHERE f2.following_id=u.id) follower_count
      FROM follows f
      JOIN users u ON u.id=f.following_id
     WHERE f.follower_id=$1
       AND u.status='active'
       ${blockFilter}
     ORDER BY f.created_at DESC
     LIMIT 250
  `,params);

  res.json({users:result.rows,kind:'following',profile:owner.rows[0]});
});

const updateSchema=z.object({
  displayName:z.string().min(1).max(80).optional(),
  bio:z.string().max(500).optional(),
  avatarUrl:z.string().max(4096).optional(),
  coverUrl:z.string().max(4096).optional(),
  locationLabel:z.string().max(120).optional(),
  websiteUrl:z.string().max(4096).optional(),
  showSensitive:z.boolean().optional(),
  interests:z.array(z.string().max(40)).max(8).optional()
});

router.patch('/me/profile',requireAuth,async(req,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if(!parsed.success){
    return res.status(400).json({
      error:'invalid_data',
      details:parsed.error.flatten()
    });
  }

  const current=await db.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
  const u=current.rows[0];
  const d=parsed.data;

  let interests = null;
  if (Array.isArray(d.interests)) {
    interests = [...new Set(
      d.interests
        .map(normalizedInterest)
        .filter(Boolean)
    )].slice(0, 8);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result=await client.query(`
      UPDATE users
         SET display_name=$2,
             bio=$3,
             avatar_url=$4,
             cover_url=$5,
             location_label=$6,
             website_url=$7,
             show_sensitive=$8,
             updated_at=now()
       WHERE id=$1
       RETURNING id,username,display_name,bio,avatar_url,cover_url,location_label,website_url,
                 show_sensitive,creator_verified,age_verified
    `,[
      req.user.id,
      d.displayName??u.display_name,
      d.bio??u.bio,
      d.avatarUrl??u.avatar_url,
      d.coverUrl??u.cover_url,
      d.locationLabel??u.location_label,
      d.websiteUrl??u.website_url,
      d.showSensitive??u.show_sensitive
    ]);

    if (interests !== null) {
      await client.query('DELETE FROM user_interests WHERE user_id=$1', [req.user.id]);
      for (const interest of interests) {
        await client.query(
          `INSERT INTO user_interests (user_id,interest)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [req.user.id, interest]
        );
      }
    }

    await client.query('COMMIT');

    const interestResult = await db.query(
      `SELECT interest FROM user_interests WHERE user_id=$1 ORDER BY interest`,
      [req.user.id]
    );

    res.json({
      ok:true,
      profile:{
        ...result.rows[0],
        interests: interestResult.rows.map(x => x.interest)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({error:'profile_update_failed'});
  } finally {
    client.release();
  }
});

router.post('/:id/follow',requireAuth,async(req,res)=>{
  if(req.params.id===String(req.user.id)){
    return res.status(400).json({error:'cannot_follow_self'});
  }

  const inserted=await db.query(`
    INSERT INTO follows (follower_id,following_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
    RETURNING following_id
  `,[req.user.id,req.params.id]);

  if(inserted.rowCount){
    await db.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      VALUES ($1,$2,'follow','user',$2,'Ha empezado a seguirte.')
    `,[req.params.id,req.user.id]);
  }

  res.json({ok:true});
});

router.delete('/:id/follow',requireAuth,async(req,res)=>{
  await db.query(
    'DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',
    [req.user.id,req.params.id]
  );
  res.json({ok:true});
});

router.post('/:id/block',requireAuth,async(req,res)=>{
  if(req.params.id===String(req.user.id)){
    return res.status(400).json({error:'cannot_block_self'});
  }

  await db.query(`
    INSERT INTO blocks (blocker_id,blocked_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
  `,[req.user.id,req.params.id]);

  await db.query(`
    DELETE FROM follows
     WHERE (follower_id=$1 AND following_id=$2)
        OR (follower_id=$2 AND following_id=$1)
  `,[req.user.id,req.params.id]);

  await db.query(
    'DELETE FROM mutes WHERE muter_id=$1 AND muted_id=$2',
    [req.user.id,req.params.id]
  );

  res.json({ok:true});
});

router.post('/:id/mute',requireAuth,async(req,res)=>{
  if(req.params.id===String(req.user.id)){
    return res.status(400).json({error:'cannot_mute_self'});
  }

  const target=await db.query(
    "SELECT id FROM users WHERE id=$1 AND status='active' LIMIT 1",
    [req.params.id]
  );
  if(!target.rowCount)return res.status(404).json({error:'user_not_found'});

  await db.query(`
    INSERT INTO mutes (muter_id,muted_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
  `,[req.user.id,req.params.id]);

  await db.query(
    'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND actor_id=$2',
    [req.user.id,req.params.id]
  );

  res.json({ok:true,muted:true});
});

router.delete('/:id/mute',requireAuth,async(req,res)=>{
  await db.query(
    'DELETE FROM mutes WHERE muter_id=$1 AND muted_id=$2',
    [req.user.id,req.params.id]
  );
  res.json({ok:true,muted:false});
});

router.delete('/:id/block',requireAuth,async(req,res)=>{
  await db.query(
    'DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',
    [req.user.id,req.params.id]
  );
  res.json({ok:true,blocked:false});
});

module.exports=router;
