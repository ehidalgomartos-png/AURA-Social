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
      await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_message_privacy_check');
      await db.query(`
        ALTER TABLE users
          ADD CONSTRAINT users_message_privacy_check
          CHECK(message_privacy IN ('everyone','following','no_one'))
      `);
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
    SELECT id,email,username,display_name,bio,avatar_url,cover_url,location_label,website_url,
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

router.get('/:username', optionalAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT id,username,display_name,bio,avatar_url,cover_url,location_label,website_url,creator_verified,created_at,
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

  res.json({profile,following,followsYou,mutuals,mutualCount,mutedByMe,blockedByMe});
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
