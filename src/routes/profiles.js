const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

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
           is_admin,age_verified,creator_verified,show_sensitive,status,
           (SELECT count(*)::int FROM follows WHERE following_id=users.id) follower_count,
           (SELECT count(*)::int FROM follows WHERE follower_id=users.id) following_count,
           (SELECT count(*)::int FROM posts WHERE user_id=users.id AND moderation_status='published') post_count,
           (SELECT count(*)::int FROM notifications WHERE user_id=users.id AND read_at IS NULL) notification_count,
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
      AND u.id<>$1
      AND u.id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id=$1
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id=$1
      )
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
     WHERE u.status='active' AND u.id<>$1
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
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

  if(req.user){
    const f=await db.query(
      'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',
      [req.user.id,profile.id]
    );
    following=!!f.rowCount;
  }

  res.json({profile,following});
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

module.exports=router;
