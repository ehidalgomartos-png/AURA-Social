const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

let connectionCirclesV152Ready=null;
async function ensureConnectionCirclesV152(){
  if(!connectionCirclesV152Ready){
    connectionCirclesV152Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS connection_circles (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(40) NOT NULL,
          is_favorites BOOLEAN NOT NULL DEFAULT FALSE,
          position SMALLINT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_circles_favorites ON connection_circles(user_id) WHERE is_favorites=true");
      await db.query("CREATE INDEX IF NOT EXISTS idx_connection_circles_user_position ON connection_circles(user_id,position,id)");
      await db.query(`
        CREATE TABLE IF NOT EXISTS connection_circle_members (
          circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
          connection_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(circle_id,connection_user_id)
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_connection_circle_members_user ON connection_circle_members(connection_user_id,circle_id)");
    })().catch(error=>{connectionCirclesV152Ready=null;throw error;});
  }
  return connectionCirclesV152Ready;
}
router.use(async(_req,res,next)=>{
  try{await ensureConnectionCirclesV152();next();}
  catch(error){
    console.error('RedLibertad V1.52 connection circles bootstrap failed:',error);
    res.status(500).json({error:'connection_circles_bootstrap_failed'});
  }
});


let profilesV138Ready=null;
async function ensureProfilesV138(){
  if(!profilesV138Ready){
    profilesV138Ready=db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_status VARCHAR(80) NOT NULL DEFAULT ''")
      .catch(error=>{profilesV138Ready=null;throw error;});
  }
  return profilesV138Ready;
}
router.use(async(_req,res,next)=>{
  try{await ensureProfilesV138();next();}
  catch(error){console.error('RedLibertad V1.38 profile bootstrap failed:',error);res.status(500).json({error:'profile_v138_bootstrap_failed'});}
});


let discoveryProfilesV137Ready=null;
async function ensureDiscoveryProfilesV137(){
  if(!discoveryProfilesV137Ready){
    discoveryProfilesV137Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS discovery_hidden_items (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_type TEXT NOT NULL,
          item_id BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,item_type,item_id)
        )
      `);
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='discovery_hidden_items_type_check' AND conrelid='discovery_hidden_items'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE discovery_hidden_items ADD CONSTRAINT discovery_hidden_items_type_check CHECK(item_type IN ('post','user'))");
      }
    })().catch(error=>{discoveryProfilesV137Ready=null;throw error;});
  }
  return discoveryProfilesV137Ready;
}
router.use(async(_req,res,next)=>{
  try{await ensureDiscoveryProfilesV137();next();}
  catch(error){console.error('RedLibertad V1.37 profile discovery bootstrap failed:',error);res.status(500).json({error:'discovery_bootstrap_failed'});}
});


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


let creatorV17Ready = null;
async function ensureCreatorV17() {
  if (!creatorV17Ready) {
    creatorV17Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_vips (
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fan_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(creator_id,fan_id),
          CHECK(creator_id<>fan_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_vips_creator_created ON creator_vips(creator_id,created_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_vip_broadcasts (
          id BIGSERIAL PRIMARY KEY,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(280) NOT NULL,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_vip_broadcasts_creator_created ON creator_vip_broadcasts(creator_id,created_at DESC)');
      const constraint=await db.query(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='notifications_type_check' AND conrelid='notifications'::regclass LIMIT 1"
      );
      const definition=String(constraint.rows[0]?.definition || '');
      if(!definition.includes('creator_vip_broadcast')){
        await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
        await db.query(`
          ALTER TABLE notifications
            ADD CONSTRAINT notifications_type_check
            CHECK(type IN (
              'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
              'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast','system'
            ))
        `);
      }
    })().catch(error => {
      creatorV17Ready = null;
      throw error;
    });
  }
  return creatorV17Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorV17();
    next();
  }catch(error){
    console.error('RedLibertad V1.17 creator VIP bootstrap failed:',error);
    res.status(500).json({error:'creator_vip_bootstrap_failed'});
  }
});


let creatorExclusiveV18Ready = null;
async function ensureCreatorExclusiveV18() {
  if (!creatorExclusiveV18Ready) {
    creatorExclusiveV18Ready = (async () => {
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public'");
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='posts_audience_check' AND conrelid='posts'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE posts ADD CONSTRAINT posts_audience_check CHECK(audience IN ('public','vip'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_posts_audience_created ON posts(audience,created_at DESC)');
      await db.query("ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public'");
      const storyConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='stories_audience_check' AND conrelid='stories'::regclass LIMIT 1"
      );
      if(!storyConstraint.rowCount){
        await db.query("ALTER TABLE stories ADD CONSTRAINT stories_audience_check CHECK(audience IN ('public','vip'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_stories_audience_active ON stories(audience,expires_at DESC,created_at DESC)');
    })().catch(error => {
      creatorExclusiveV18Ready = null;
      throw error;
    });
  }
  return creatorExclusiveV18Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorExclusiveV18();
    next();
  }catch(error){
    console.error('RedLibertad V1.18 creator exclusive bootstrap failed:',error);
    res.status(500).json({error:'creator_exclusive_bootstrap_failed'});
  }
});


let creatorCalendarV21Ready = null;
async function ensureCreatorCalendarV21() {
  if (!creatorCalendarV21Ready) {
    creatorCalendarV21Ready = (async () => {
      await db.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_date DATE');
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_label VARCHAR(40) NOT NULL DEFAULT ''");
      await db.query('CREATE INDEX IF NOT EXISTS idx_posts_creator_editorial_date ON posts(user_id,editorial_date)');
    })().catch(error => {
      creatorCalendarV21Ready = null;
      throw error;
    });
  }
  return creatorCalendarV21Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCalendarV21();
    next();
  }catch(error){
    console.error('RedLibertad V1.21 creator calendar bootstrap failed:',error);
    res.status(500).json({error:'creator_calendar_bootstrap_failed'});
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
    SELECT id,email,username,display_name,bio,profile_status,avatar_url,cover_url,location_label,website_url,creator_headline,
           is_admin,age_verified,creator_verified,show_sensitive,status,message_privacy,discoverable,show_activity,
           (SELECT count(*)::int FROM follows WHERE following_id=users.id) follower_count,
           (SELECT count(*)::int FROM follows WHERE follower_id=users.id) following_count,
           (
             SELECT count(*)::int
               FROM follows mine
               JOIN follows back
                 ON back.follower_id=mine.following_id
                AND back.following_id=mine.follower_id
              WHERE mine.follower_id=users.id
           ) connection_count,
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
      AND NOT EXISTS(
        SELECT 1 FROM discovery_hidden_items hidden
         WHERE hidden.user_id=$1 AND hidden.item_type='user' AND hidden.item_id=u.id
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

async function ensureFavoritesCircle(userId){
  const existing=await db.query(
    'SELECT id,name,is_favorites,position FROM connection_circles WHERE user_id=$1 AND is_favorites=true LIMIT 1',
    [userId]
  );
  if(existing.rowCount)return existing.rows[0];
  const created=await db.query(`
    INSERT INTO connection_circles(user_id,name,is_favorites,position)
    VALUES ($1,'Favoritas',true,-100)
    ON CONFLICT DO NOTHING
    RETURNING id,name,is_favorites,position
  `,[userId]);
  if(created.rowCount)return created.rows[0];
  const retry=await db.query(
    'SELECT id,name,is_favorites,position FROM connection_circles WHERE user_id=$1 AND is_favorites=true LIMIT 1',
    [userId]
  );
  return retry.rows[0] || null;
}

async function isMutualConnection(userId,targetId){
  const result=await db.query(`
    SELECT 1
      FROM follows mine
      JOIN follows theirs
        ON theirs.follower_id=mine.following_id
       AND theirs.following_id=mine.follower_id
     WHERE mine.follower_id=$1
       AND mine.following_id=$2
     LIMIT 1
  `,[userId,targetId]);
  return !!result.rowCount;
}

router.get('/connections/circles',requireAuth,async(req,res)=>{
  await ensureFavoritesCircle(req.user.id);
  const result=await db.query(`
    SELECT
      circle.id,
      circle.name,
      circle.is_favorites,
      circle.position,
      circle.created_at,
      count(member.connection_user_id)::int AS member_count
    FROM connection_circles circle
    LEFT JOIN connection_circle_members member ON member.circle_id=circle.id
    WHERE circle.user_id=$1
    GROUP BY circle.id
    ORDER BY circle.is_favorites DESC,circle.position ASC,circle.id ASC
  `,[req.user.id]);
  res.json({circles:result.rows});
});

const circleSchema=z.object({
  name:z.string().trim().min(1).max(40)
});

router.post('/connections/circles',requireAuth,async(req,res)=>{
  const parsed=circleSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_circle'});
  const count=await db.query(
    'SELECT count(*)::int AS n FROM connection_circles WHERE user_id=$1 AND is_favorites=false',
    [req.user.id]
  );
  if(Number(count.rows[0]?.n || 0)>=12){
    return res.status(400).json({error:'circle_limit_reached'});
  }
  const duplicate=await db.query(
    'SELECT 1 FROM connection_circles WHERE user_id=$1 AND lower(name)=lower($2) LIMIT 1',
    [req.user.id,parsed.data.name]
  );
  if(duplicate.rowCount)return res.status(409).json({error:'circle_name_exists'});

  const created=await db.query(`
    INSERT INTO connection_circles(user_id,name,is_favorites,position)
    VALUES(
      $1,$2,false,
      COALESCE((SELECT max(position)+1 FROM connection_circles WHERE user_id=$1 AND is_favorites=false),0)
    )
    RETURNING id,name,is_favorites,position,created_at
  `,[req.user.id,parsed.data.name]);

  res.status(201).json({ok:true,circle:created.rows[0]});
});

router.patch('/connections/circles/:circleId',requireAuth,async(req,res)=>{
  const parsed=circleSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_circle'});

  const circle=await db.query(
    'SELECT id,is_favorites FROM connection_circles WHERE id=$1 AND user_id=$2 LIMIT 1',
    [req.params.circleId,req.user.id]
  );
  if(!circle.rowCount)return res.status(404).json({error:'circle_not_found'});
  if(circle.rows[0].is_favorites)return res.status(400).json({error:'favorites_circle_locked'});

  const duplicate=await db.query(
    'SELECT 1 FROM connection_circles WHERE user_id=$1 AND id<>$2 AND lower(name)=lower($3) LIMIT 1',
    [req.user.id,req.params.circleId,parsed.data.name]
  );
  if(duplicate.rowCount)return res.status(409).json({error:'circle_name_exists'});

  const updated=await db.query(`
    UPDATE connection_circles
       SET name=$3,updated_at=now()
     WHERE id=$1 AND user_id=$2
     RETURNING id,name,is_favorites,position,updated_at
  `,[req.params.circleId,req.user.id,parsed.data.name]);
  res.json({ok:true,circle:updated.rows[0]});
});

router.delete('/connections/circles/:circleId',requireAuth,async(req,res)=>{
  const deleted=await db.query(`
    DELETE FROM connection_circles
     WHERE id=$1
       AND user_id=$2
       AND is_favorites=false
     RETURNING id
  `,[req.params.circleId,req.user.id]);
  if(!deleted.rowCount)return res.status(404).json({error:'circle_not_found_or_locked'});
  res.json({ok:true});
});

router.get('/connections/:connectionUserId/circles',requireAuth,async(req,res)=>{
  const targetId=Number(req.params.connectionUserId);
  if(!Number.isInteger(targetId) || targetId<=0)return res.status(400).json({error:'invalid_connection'});
  if(!(await isMutualConnection(req.user.id,targetId))){
    return res.status(404).json({error:'connection_not_found'});
  }
  await ensureFavoritesCircle(req.user.id);

  const result=await db.query(`
    SELECT
      circle.id,
      circle.name,
      circle.is_favorites,
      circle.position,
      EXISTS(
        SELECT 1 FROM connection_circle_members member
         WHERE member.circle_id=circle.id
           AND member.connection_user_id=$2
      ) AS selected
    FROM connection_circles circle
    WHERE circle.user_id=$1
    ORDER BY circle.is_favorites DESC,circle.position ASC,circle.id ASC
  `,[req.user.id,targetId]);

  res.json({circles:result.rows});
});

router.put('/connections/circles/:circleId/members/:connectionUserId',requireAuth,async(req,res)=>{
  const targetId=Number(req.params.connectionUserId);
  if(!Number.isInteger(targetId) || targetId<=0)return res.status(400).json({error:'invalid_connection'});
  const circle=await db.query(
    'SELECT id FROM connection_circles WHERE id=$1 AND user_id=$2 LIMIT 1',
    [req.params.circleId,req.user.id]
  );
  if(!circle.rowCount)return res.status(404).json({error:'circle_not_found'});
  if(!(await isMutualConnection(req.user.id,targetId))){
    return res.status(404).json({error:'connection_not_found'});
  }

  await db.query(`
    INSERT INTO connection_circle_members(circle_id,connection_user_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
  `,[req.params.circleId,targetId]);
  res.json({ok:true,selected:true});
});

router.delete('/connections/circles/:circleId/members/:connectionUserId',requireAuth,async(req,res)=>{
  await db.query(`
    DELETE FROM connection_circle_members member
     USING connection_circles circle
     WHERE member.circle_id=circle.id
       AND circle.id=$1
       AND circle.user_id=$2
       AND member.connection_user_id=$3
  `,[req.params.circleId,req.user.id,req.params.connectionUserId]);
  res.json({ok:true,selected:false});
});

router.get('/connections', requireAuth, async (req,res)=>{
  await ensureFavoritesCircle(req.user.id);
  const requestedLimit=Number(req.query.limit || 50);
  const limit=Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50,1),100);
  const circleId=req.query.circleId ? Number(req.query.circleId) : null;
  if(circleId && (!Number.isInteger(circleId) || circleId<=0)){
    return res.status(400).json({error:'invalid_circle'});
  }
  if(circleId){
    const owned=await db.query(
      'SELECT 1 FROM connection_circles WHERE id=$1 AND user_id=$2 LIMIT 1',
      [circleId,req.user.id]
    );
    if(!owned.rowCount)return res.status(404).json({error:'circle_not_found'});
  }

  const result=await db.query(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.bio,
      u.profile_status,
      u.avatar_url,
      u.location_label,
      u.creator_verified,
      GREATEST(mine.created_at,theirs.created_at) AS connection_since,
      CASE WHEN u.show_activity THEN activity.last_activity_at ELSE NULL END AS last_activity_at,
      (
        SELECT count(*)::int
          FROM user_interests target_interest
         WHERE target_interest.user_id=u.id
           AND target_interest.interest IN (
             SELECT own_interest.interest
               FROM user_interests own_interest
              WHERE own_interest.user_id=$1
           )
      ) AS shared_interest_count,
      EXISTS(
        SELECT 1
          FROM connection_circle_members favorite_member
          JOIN connection_circles favorite_circle ON favorite_circle.id=favorite_member.circle_id
         WHERE favorite_circle.user_id=$1
           AND favorite_circle.is_favorites=true
           AND favorite_member.connection_user_id=u.id
      ) AS favorite,
      COALESCE(
        (
          SELECT array_agg(circle.name ORDER BY circle.is_favorites DESC,circle.position,circle.id)
            FROM connection_circle_members circle_member
            JOIN connection_circles circle ON circle.id=circle_member.circle_id
           WHERE circle.user_id=$1
             AND circle_member.connection_user_id=u.id
        ),
        ARRAY[]::text[]
      ) AS circle_names,
      COALESCE(
        (SELECT array_agg(ui.interest ORDER BY ui.interest)
           FROM user_interests ui
          WHERE ui.user_id=u.id),
        ARRAY[]::text[]
      ) interests
    FROM follows mine
    JOIN follows theirs
      ON theirs.follower_id=mine.following_id
     AND theirs.following_id=mine.follower_id
    JOIN users u ON u.id=mine.following_id
    CROSS JOIN LATERAL (
      SELECT GREATEST(
        COALESCE((SELECT max(p.created_at) FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published'),'epoch'::timestamptz),
        COALESCE((SELECT max(c.created_at) FROM comments c WHERE c.user_id=u.id),'epoch'::timestamptz),
        COALESCE((SELECT max(r.created_at) FROM reposts r WHERE r.user_id=u.id),'epoch'::timestamptz),
        COALESCE((SELECT max(st.created_at) FROM stories st WHERE st.user_id=u.id AND st.moderation_status='published'),'epoch'::timestamptz)
      ) AS last_activity_at
    ) activity
    WHERE mine.follower_id=$1
      AND u.status='active'
      AND u.is_admin=false
      AND u.id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id=$1
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id=$1
      )
      AND u.id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
      AND (
        $3::bigint IS NULL
        OR EXISTS(
          SELECT 1 FROM connection_circle_members selected_member
           WHERE selected_member.circle_id=$3
             AND selected_member.connection_user_id=u.id
        )
      )
    ORDER BY
      favorite DESC,
      CASE WHEN u.show_activity THEN activity.last_activity_at ELSE NULL END DESC NULLS LAST,
      shared_interest_count DESC,
      connection_since DESC
    LIMIT $2
  `,[req.user.id,limit,circleId]);

  const connections=result.rows.map(row=>{
    const lastActivity=row.last_activity_at ? new Date(row.last_activity_at) : null;
    return {
      ...row,
      favorite:row.favorite===true,
      last_activity_at:lastActivity && Number.isFinite(lastActivity.getTime()) && lastActivity.getTime()>0
        ? row.last_activity_at
        : null
    };
  });
  res.json({connections,count:connections.length,circleId});
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
       AND NOT EXISTS(
         SELECT 1 FROM discovery_hidden_items hidden
          WHERE hidden.user_id=$1 AND hidden.item_type='user' AND hidden.item_id=u.id
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
       AND NOT EXISTS(
         SELECT 1 FROM discovery_hidden_items hidden
          WHERE hidden.user_id=$1 AND hidden.item_type='user' AND hidden.item_id=u.id
       )
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

router.post('/:id/discovery-hide',requireAuth,async(req,res)=>{
  const target=await db.query(
    "SELECT id FROM users WHERE id=$1 AND status='active' AND is_admin=false LIMIT 1",
    [req.params.id]
  );
  if(!target.rowCount)return res.status(404).json({error:'user_not_found'});
  if(String(target.rows[0].id)===String(req.user.id))return res.status(400).json({error:'cannot_hide_self'});
  await db.query(`
    INSERT INTO discovery_hidden_items(user_id,item_type,item_id)
    VALUES ($1,'user',$2)
    ON CONFLICT DO NOTHING
  `,[req.user.id,req.params.id]);
  res.json({ok:true,hidden:true});
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
      (SELECT count(*)::int FROM creator_broadcasts cb WHERE cb.user_id=u.id) broadcast_count,
      (SELECT count(*)::int FROM creator_vips cv WHERE cv.creator_id=u.id) vip_count,
      (SELECT count(*)::int FROM creator_vip_broadcasts cvb WHERE cvb.creator_id=u.id) vip_broadcast_count,
      (SELECT count(*)::int FROM posts vp WHERE vp.user_id=u.id AND vp.moderation_status='published' AND vp.audience='vip') vip_post_count,
      (SELECT count(*)::int FROM stories vs WHERE vs.user_id=u.id AND vs.moderation_status='published' AND vs.audience='vip' AND vs.expires_at>now()) vip_story_count
    FROM users u
    WHERE u.id=$1
    LIMIT 1
  `,[req.user.id]);

  if(!summary.rowCount)return res.status(404).json({error:'user_not_found'});
  const account=summary.rows[0];
  if(!account.creator_verified)return res.status(403).json({error:'verified_creator_required'});

  const posts=await db.query(`
    SELECT
      p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.audience,
      p.editorial_date,p.editorial_label,p.created_at,
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
      SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,f.created_at AS followed_at,
             EXISTS(SELECT 1 FROM creator_vips cv WHERE cv.creator_id=$1 AND cv.fan_id=u.id) AS is_vip
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
        EXISTS(SELECT 1 FROM creator_vips cv WHERE cv.creator_id=$1 AND cv.fan_id=u.id) AS is_vip,
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
          p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.audience,p.created_at,
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

  const [vips,vipBroadcasts,lastVipBroadcast]=await Promise.all([
    db.query(`
      SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,cv.created_at AS vip_since,
             EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=u.id AND f.following_id=$1) AS still_follows
        FROM creator_vips cv
        JOIN users u ON u.id=cv.fan_id
       WHERE cv.creator_id=$1
         AND u.status='active'
       ORDER BY cv.created_at DESC
       LIMIT 50
    `,[req.user.id]),
    db.query(`
      SELECT id,body,recipient_count,created_at
        FROM creator_vip_broadcasts
       WHERE creator_id=$1
       ORDER BY created_at DESC
       LIMIT 10
    `,[req.user.id]),
    db.query(`
      SELECT created_at
        FROM creator_vip_broadcasts
       WHERE creator_id=$1
       ORDER BY created_at DESC
       LIMIT 1
    `,[req.user.id])
  ]);

  const lastVipCreated=lastVipBroadcast.rows[0]?.created_at || null;
  const nextVipBroadcastAt=lastVipCreated
    ? new Date(new Date(lastVipCreated).getTime()+24*60*60*1000).toISOString()
    : null;

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
    vip:{
      members:vips.rows,
      broadcasts:vipBroadcasts.rows,
      limit:50,
      broadcastLimitHours:24,
      nextBroadcastAt:nextVipBroadcastAt
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

const creatorVipBroadcastSchema=z.object({
  body:z.string().trim().min(1).max(280)
});

router.post('/me/creator-vips/:fanId',requireAuth,async(req,res)=>{
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const account=await client.query('SELECT creator_verified FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    if(!account.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'user_not_found'});
    }
    if(!account.rows[0].creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required'});
    }

    const follower=await client.query(`
      SELECT u.id
        FROM follows f
        JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$1
         AND f.follower_id=$2
         AND u.status='active'
       LIMIT 1
    `,[req.user.id,req.params.fanId]);
    if(!follower.rowCount){
      await client.query('ROLLBACK');
      return res.status(400).json({error:'vip_requires_current_follower'});
    }

    const existing=await client.query(
      'SELECT 1 FROM creator_vips WHERE creator_id=$1 AND fan_id=$2',
      [req.user.id,req.params.fanId]
    );
    if(existing.rowCount){
      await client.query('COMMIT');
      return res.json({ok:true,vip:true});
    }

    const count=await client.query('SELECT count(*)::int n FROM creator_vips WHERE creator_id=$1',[req.user.id]);
    if(Number(count.rows[0]?.n || 0)>=50){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'vip_limit_reached',limit:50});
    }

    await client.query(
      'INSERT INTO creator_vips (creator_id,fan_id) VALUES ($1,$2)',
      [req.user.id,req.params.fanId]
    );
    await client.query('COMMIT');
    res.status(201).json({ok:true,vip:true});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad add creator VIP failed:',error);
    res.status(500).json({error:'creator_vip_update_failed'});
  }finally{
    client.release();
  }
});

router.delete('/me/creator-vips/:fanId',requireAuth,async(req,res)=>{
  const account=await db.query('SELECT creator_verified FROM users WHERE id=$1 LIMIT 1',[req.user.id]);
  if(!account.rowCount)return res.status(404).json({error:'user_not_found'});
  if(!account.rows[0].creator_verified)return res.status(403).json({error:'verified_creator_required'});

  await db.query(
    'DELETE FROM creator_vips WHERE creator_id=$1 AND fan_id=$2',
    [req.user.id,req.params.fanId]
  );
  res.json({ok:true,vip:false});
});

router.post('/me/creator-vip-broadcasts',requireAuth,async(req,res)=>{
  const parsed=creatorVipBroadcastSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_vip_broadcast'});

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const account=await client.query('SELECT creator_verified FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    if(!account.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'user_not_found'});
    }
    if(!account.rows[0].creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required'});
    }

    const last=await client.query(`
      SELECT created_at FROM creator_vip_broadcasts
       WHERE creator_id=$1
       ORDER BY created_at DESC LIMIT 1
    `,[req.user.id]);
    if(last.rowCount){
      const nextAt=new Date(new Date(last.rows[0].created_at).getTime()+24*60*60*1000);
      if(nextAt.getTime()>Date.now()){
        await client.query('ROLLBACK');
        return res.status(429).json({error:'vip_broadcast_cooldown',nextBroadcastAt:nextAt.toISOString()});
      }
    }

    const inserted=await client.query(`
      INSERT INTO creator_vip_broadcasts (creator_id,body)
      VALUES ($1,$2)
      RETURNING id,body,created_at
    `,[req.user.id,parsed.data.body]);
    const broadcast=inserted.rows[0];

    const recipients=await client.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      SELECT cv.fan_id,$1,'creator_vip_broadcast','creator_vip_broadcast',$2,$3
        FROM creator_vips cv
        JOIN follows f ON f.follower_id=cv.fan_id AND f.following_id=cv.creator_id
        JOIN users fan ON fan.id=cv.fan_id
       WHERE cv.creator_id=$1
         AND fan.status='active'
         AND NOT EXISTS (
           SELECT 1 FROM mutes m WHERE m.muter_id=cv.fan_id AND m.muted_id=$1
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
            WHERE (b.blocker_id=cv.fan_id AND b.blocked_id=$1)
               OR (b.blocker_id=$1 AND b.blocked_id=cv.fan_id)
         )
      RETURNING id
    `,[req.user.id,broadcast.id,parsed.data.body]);

    await client.query(
      'UPDATE creator_vip_broadcasts SET recipient_count=$2 WHERE id=$1',
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
    console.error('RedLibertad creator VIP broadcast failed:',error);
    res.status(500).json({error:'creator_vip_broadcast_failed'});
  }finally{
    client.release();
  }
});

router.get('/:username', optionalAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT id,username,display_name,bio,profile_status,avatar_url,cover_url,location_label,website_url,creator_headline,age_verified,creator_verified,show_activity,created_at,
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

  const visiblePostCount=req.user
    ? await db.query(`
        SELECT count(*)::int AS n
          FROM posts p
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND (
             p.audience='public'
             OR p.user_id=$2
             OR EXISTS(SELECT 1 FROM users viewer_admin WHERE viewer_admin.id=$2 AND viewer_admin.is_admin=true)
             OR EXISTS(
               SELECT 1
                 FROM creator_vips cv
                 JOIN follows f ON f.follower_id=cv.fan_id AND f.following_id=cv.creator_id
                WHERE cv.creator_id=p.user_id
                  AND cv.fan_id=$2
             )
             OR EXISTS(
               SELECT 1 FROM post_participants pp
                WHERE pp.post_id=p.id
                  AND pp.user_id=$2
                  AND pp.consent_status='approved'
             )
           )
      `,[profile.id,req.user.id])
    : await db.query(`
        SELECT count(*)::int AS n
          FROM posts p
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND p.audience='public'
      `,[profile.id]);
  profile.post_count=visiblePostCount.rows[0]?.n || 0;

  if(profile.show_activity){
    const activity=await db.query(`
      SELECT GREATEST(
        COALESCE((SELECT max(p.created_at) FROM posts p WHERE p.user_id=$1 AND p.moderation_status='published'),'epoch'::timestamptz),
        COALESCE((SELECT max(c.created_at) FROM comments c WHERE c.user_id=$1),'epoch'::timestamptz),
        COALESCE((SELECT max(r.created_at) FROM reposts r WHERE r.user_id=$1),'epoch'::timestamptz),
        COALESCE((SELECT max(s.created_at) FROM stories s WHERE s.user_id=$1 AND s.moderation_status='published'),'epoch'::timestamptz)
      ) last_activity_at
    `,[profile.id]);
    const value=activity.rows[0]?.last_activity_at;
    profile.last_activity_at=value && new Date(value).getTime()>0 ? value : null;
  }else{
    profile.last_activity_at=null;
  }
  delete profile.show_activity;

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

  res.json({profile,following,followsYou,connected:following&&followsYou,mutuals,mutualCount,mutedByMe,blockedByMe,creatorLinks});
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
  profileStatus:z.string().trim().max(80).optional(),
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
             profile_status=$4,
             avatar_url=$5,
             cover_url=$6,
             location_label=$7,
             website_url=$8,
             show_sensitive=$9,
             updated_at=now()
       WHERE id=$1
       RETURNING id,username,display_name,bio,profile_status,avatar_url,cover_url,location_label,website_url,
                 show_sensitive,creator_verified,age_verified
    `,[
      req.user.id,
      d.displayName??u.display_name,
      d.bio??u.bio,
      d.profileStatus??u.profile_status,
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
  await db.query(`
    DELETE FROM connection_circle_members member
    USING connection_circles circle
    WHERE member.circle_id=circle.id
      AND circle.user_id=$1
      AND member.connection_user_id=$2
  `,[req.user.id,req.params.id]);
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
  await db.query(`
    DELETE FROM connection_circle_members member
    USING connection_circles circle
    WHERE member.circle_id=circle.id
      AND circle.user_id=$1
      AND member.connection_user_id=$2
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
