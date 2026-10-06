const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateContentLevel, canViewerSee } = require('../services/contentPolicy');

const router = express.Router();

let mutePrivacyReady = null;
async function ensureMutePrivacy() {
  if (!mutePrivacyReady) {
    mutePrivacyReady = (async () => {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE");
      await db.query(`
        CREATE TABLE IF NOT EXISTS mutes (
          muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(muter_id,muted_id),
          CHECK(muter_id<>muted_id)
        )
      `);
    })().catch(error => {
      mutePrivacyReady = null;
      throw error;
    });
  }
  return mutePrivacyReady;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureMutePrivacy();
    next();
  }catch(error){
    console.error('RedLibertad mute privacy bootstrap failed:',error);
    res.status(500).json({error:'privacy_bootstrap_failed'});
  }
});


let communityV15Ready = null;
async function ensureCommunityV15() {
  if (!communityV15Ready) {
    communityV15Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS reposts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_reposts_post_created ON reposts(post_id,created_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_reposts_user_created ON reposts(user_id,created_at DESC)');
      await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
      await db.query(`
        ALTER TABLE notifications
          ADD CONSTRAINT notifications_type_check
          CHECK(type IN (
            'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
            'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast','system'
          ))
      `);
    })().catch(error => {
      communityV15Ready = null;
      throw error;
    });
  }
  return communityV15Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCommunityV15();
    next();
  }catch(error){
    console.error('RedLibertad V1.5 social bootstrap failed:',error);
    res.status(500).json({error:'social_bootstrap_failed'});
  }
});

function extractMentions(value='') {
  const found = new Set();
  for (const match of String(value).matchAll(/(^|\s)@([a-zA-Z0-9_.]{3,30})/g)) {
    found.add(match[2].toLowerCase());
  }
  return [...found];
}

async function notifyMentions({ actorId, text, entityType='post', entityId, audience='public' }) {
  const names = extractMentions(text);
  if (!names.length || !entityId) return;

  const result = await db.query(`
    SELECT u.id,u.username
      FROM users u
     WHERE lower(u.username)=ANY($1::text[])
       AND u.status='active'
       AND u.id<>$2
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$2
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$2
       )
       AND (
         $3::text='public'
         OR EXISTS(
           SELECT 1
             FROM creator_vips cv
             JOIN follows f ON f.follower_id=cv.fan_id AND f.following_id=cv.creator_id
            WHERE cv.creator_id=$2
              AND cv.fan_id=u.id
         )
         OR EXISTS(
           SELECT 1 FROM post_participants pp
            WHERE pp.post_id=$4
              AND pp.user_id=u.id
         )
       )
  `,[names,actorId,audience,entityId]);

  for (const user of result.rows) {
    await db.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      VALUES ($1,$2,'mention',$3,$4,'Te ha mencionado.')
    `,[user.id,actorId,entityType,entityId]);
  }
}

async function attachRepostMeta(rows, viewerId=null, includeActor=false) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id);
  const params = [ids];
  let viewerSelect = 'false';
  let actorFilter = '';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = 'bool_or(r.user_id=$2)';
    actorFilter = `AND (
      r.user_id=$2
      OR r.user_id IN (SELECT following_id FROM follows WHERE follower_id=$2)
    )`;
  }

  const counts = await db.query(`
    SELECT r.post_id,
           count(*)::int AS repost_count,
           ${viewerSelect} AS reposted_by_me
      FROM reposts r
     WHERE r.post_id=ANY($1::bigint[])
     GROUP BY r.post_id
  `,params);

  const countMap = new Map(counts.rows.map(row => [String(row.post_id),row]));

  let actorMap = new Map();
  if (viewerId && includeActor) {
    const actors = await db.query(`
      SELECT DISTINCT ON (r.post_id)
             r.post_id,
             u.id AS repost_actor_id,
             u.username AS repost_actor_username,
             u.display_name AS repost_actor_display_name
        FROM reposts r
        JOIN users u ON u.id=r.user_id
       WHERE r.post_id=ANY($1::bigint[])
         ${actorFilter}
         AND u.status='active'
       ORDER BY r.post_id,r.created_at DESC
    `,params);
    actorMap = new Map(actors.rows.map(row => [String(row.post_id),row]));
  }

  return rows.map(row => ({
    ...row,
    repost_count: countMap.get(String(row.id))?.repost_count || 0,
    reposted_by_me: countMap.get(String(row.id))?.reposted_by_me === true,
    ...(actorMap.get(String(row.id)) || {})
  }));
}

let savedPostsReady = null;
async function ensureSavedPostsTable() {
  if (!savedPostsReady) {
    savedPostsReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS saved_posts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON saved_posts(user_id,created_at DESC)');
    })().catch(error => {
      savedPostsReady = null;
      throw error;
    });
  }
  return savedPostsReady;
}


let creatorFeaturedV13Ready = null;
async function ensureCreatorFeaturedV13() {
  if (!creatorFeaturedV13Ready) {
    creatorFeaturedV13Ready = (async () => {
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
      creatorFeaturedV13Ready = null;
      throw error;
    });
  }
  return creatorFeaturedV13Ready;
}


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
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_vips (
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fan_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(creator_id,fan_id),
          CHECK(creator_id<>fan_id)
        )
      `);
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
    console.error('RedLibertad V1.18 exclusive content bootstrap failed:',error);
    res.status(500).json({error:'exclusive_content_bootstrap_failed'});
  }
});

function postAudienceWhere(viewerParam=null, alias='p') {
  if (!viewerParam) return `${alias}.audience='public'`;
  return `(
    ${alias}.audience='public'
    OR ${alias}.user_id=${viewerParam}
    OR EXISTS(SELECT 1 FROM users audience_admin WHERE audience_admin.id=${viewerParam} AND audience_admin.is_admin=true)
    OR EXISTS(
      SELECT 1
        FROM creator_vips audience_vip
        JOIN follows audience_follow
          ON audience_follow.follower_id=audience_vip.fan_id
         AND audience_follow.following_id=audience_vip.creator_id
       WHERE audience_vip.creator_id=${alias}.user_id
         AND audience_vip.fan_id=${viewerParam}
    )
    OR EXISTS(
      SELECT 1 FROM post_participants audience_participant
       WHERE audience_participant.post_id=${alias}.id
         AND audience_participant.user_id=${viewerParam}
         AND audience_participant.consent_status='approved'
    )
  )`;
}

async function accessiblePublishedPost(postId, viewerId) {
  const result=await db.query(`
    SELECT p.id,p.user_id,p.audience,p.content_level
      FROM posts p
     WHERE p.id=$1
       AND p.moderation_status='published'
       AND ${postAudienceWhere('$2','p')}
     LIMIT 1
  `,[postId,viewerId]);
  return result.rows[0] || null;
}

const createSchema = z.object({
  caption: z.string().max(2200).default(''),
  mediaUrl: z.string().max(4096).optional().default(''),
  mediaType: z.enum(['image', 'video']).optional().default('image'),
  mediaProvider: z.string().max(40).optional().default('local'),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  contentLevel: z.enum(['normal', 'sensitive', 'nudity']),
  kind: z.enum(['post', 'reel']).default('post'),
  audience: z.enum(['public','vip']).default('public'),
  participantUsernames: z.array(z.string().min(1).max(30)).max(10).optional().default([])
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data', details: parsed.error.flatten() });
  const data = parsed.data;
  const hasText = Boolean(String(data.caption || '').trim());
  const hasMedia = Boolean(String(data.mediaUrl || '').trim());

  if (!hasText && !hasMedia) {
    return res.status(400).json({ error: 'empty_post' });
  }

  if (data.kind === 'reel' && !hasMedia) {
    return res.status(400).json({ error: 'reel_media_required' });
  }

  if (!validateContentLevel(data.contentLevel)) return res.status(400).json({ error: 'invalid_content_level' });

  if (data.contentLevel === 'nudity') {
    const user = await db.query('SELECT creator_verified,age_verified FROM users WHERE id=$1', [req.user.id]);
    if (!user.rows[0]?.creator_verified || !user.rows[0]?.age_verified) return res.status(403).json({ error: 'verified_creator_required_for_nudity' });
  }

  if (data.audience === 'vip') {
    const user = await db.query('SELECT creator_verified FROM users WHERE id=$1', [req.user.id]);
    if (!user.rows[0]?.creator_verified) return res.status(403).json({ error: 'verified_creator_required_for_vip_content' });
  }

  const names=[...new Set(data.participantUsernames.map(x=>x.trim().replace(/^@/,'').toLowerCase()).filter(Boolean))];
  let participants=[];
  if(names.length){
    const found=await db.query(`SELECT id,username FROM users WHERE lower(username)=ANY($1::text[]) AND status='active'`,[names]);
    participants=found.rows.filter(u=>String(u.id)!==String(req.user.id));
    if(participants.length!==names.filter(n=>n!==String(req.user.username||'').toLowerCase()).length){
      const foundNames=new Set(found.rows.map(x=>x.username.toLowerCase()));
      const missing=names.filter(n=>!foundNames.has(n));
      if(missing.length) return res.status(400).json({error:'participant_not_found',missing});
    }
  }

  const needsConsent=participants.length>0;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO posts
        (user_id,caption,media_url,media_type,media_provider,external_id,playback_url,content_level,post_kind,audience,moderation_status,consent_state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [req.user.id,data.caption,data.mediaUrl,data.mediaType,data.mediaProvider,data.externalId,data.playbackUrl,data.contentLevel,data.kind,data.audience,needsConsent?'under_review':'published',needsConsent?'pending':'none']);
    const post=result.rows[0];
    for(const p of participants){
      await client.query(`INSERT INTO post_participants (post_id,user_id,consent_status) VALUES ($1,$2,'pending') ON CONFLICT(post_id,user_id) DO NOTHING`,[post.id,p.id]);
      await client.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_request','post',$3,'Solicita tu consentimiento para publicar contenido en el que apareces.')`,[p.id,req.user.id,post.id]);
    }
    await client.query('COMMIT');
    try {
      await notifyMentions({actorId:req.user.id,text:data.caption,entityType:'post',entityId:post.id,audience:data.audience});
    } catch (mentionError) {
      console.warn('RedLibertad mention notification failed:',mentionError?.message || mentionError);
    }
    res.status(201).json({ ok: true, post, consentRequired:needsConsent, participants });
  }catch(e){
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({error:'post_create_failed'});
  }finally{client.release();}
});

async function viewerFrom(req) {
  if (!req.user) return null;
  const vr = await db.query(
    'SELECT id,age_verified,show_sensitive,is_admin FROM users WHERE id=$1',
    [req.user.id]
  );
  return vr.rowCount ? {
    id: vr.rows[0].id,
    ageVerified: vr.rows[0].age_verified,
    showSensitive: vr.rows[0].show_sensitive,
    isAdmin: vr.rows[0].is_admin
  } : null;
}
function gateRows(rows, viewer) {
  return rows.map(post => {
    const gate = canViewerSee({ postLevel: post.content_level, viewer });
    return { ...post, media_url: gate.allowed ? post.media_url : null, playback_url: gate.allowed ? post.playback_url : null, gated: !gate.allowed, gate_reason: gate.reason || null };
  });
}

async function attachApprovedParticipants(rows) {
  if (!rows.length) return rows;
  const postIds = rows.map(row => row.id);
  const result = await db.query(`
    SELECT pp.post_id, u.id, u.username, u.display_name, u.avatar_url, u.creator_verified
      FROM post_participants pp
      JOIN users u ON u.id=pp.user_id
     WHERE pp.post_id = ANY($1::bigint[])
       AND pp.consent_status='approved'
       AND u.status='active'
     ORDER BY pp.requested_at ASC, u.username ASC
  `, [postIds]);

  const byPost = new Map();
  for (const participant of result.rows) {
    const key = String(participant.post_id);
    if (!byPost.has(key)) byPost.set(key, []);
    byPost.get(key).push({
      id: participant.id,
      username: participant.username,
      display_name: participant.display_name,
      avatar_url: participant.avatar_url,
      creator_verified: participant.creator_verified
    });
  }

  return rows.map(row => ({
    ...row,
    participants: byPost.get(String(row.id)) || []
  }));
}


async function attachCommentPreviews(rows, viewer = null) {
  if (!rows.length) return rows;

  const postIds = rows.map(row => row.id);
  const result = await db.query(`
    SELECT post_id,id,body,created_at,user_id,username,display_name,avatar_url,creator_verified
      FROM (
        SELECT
          c.post_id,
          c.id,
          c.body,
          c.created_at,
          u.id AS user_id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.creator_verified,
          row_number() OVER (
            PARTITION BY c.post_id
            ORDER BY c.created_at DESC, c.id DESC
          ) AS rn
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id = ANY($1::bigint[])
          AND u.status='active'
      ) latest
     WHERE rn <= 2
     ORDER BY post_id, created_at ASC, id ASC
  `, [postIds]);

  const byPost = new Map();

  for (const comment of result.rows) {
    const key = String(comment.post_id);
    if (!byPost.has(key)) byPost.set(key, []);
    byPost.get(key).push({
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at,
      user_id: comment.user_id,
      username: comment.username,
      display_name: comment.display_name,
      avatar_url: comment.avatar_url,
      creator_verified: comment.creator_verified
    });
  }

  return rows.map(row => ({
    ...row,
    latest_comments: (byPost.get(String(row.id)) || []).map(comment => ({
      ...comment,
      can_delete: !!viewer && (
        String(comment.user_id) === String(viewer.id) ||
        String(row.user_id) === String(viewer.id) ||
        viewer.isAdmin === true
      )
    }))
  }));
}

router.get('/consents/pending', requireAuth, async (req,res)=>{
  const r=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           pp.consent_status,
           u.id AS owner_id,u.username,u.display_name,u.avatar_url
      FROM post_participants pp
      JOIN posts p ON p.id=pp.post_id
      JOIN users u ON u.id=p.user_id
     WHERE pp.user_id=$1 AND pp.consent_status IN ('pending','approved')
     ORDER BY pp.requested_at DESC
     LIMIT 100
  `,[req.user.id]);
  const viewer=await db.query('SELECT age_verified FROM users WHERE id=$1',[req.user.id]);
  const ageVerified=!!viewer.rows[0]?.age_verified;
  const requests=r.rows.map(x=>{
    const gated=x.content_level!=='normal'&&!ageVerified;
    return {...x,media_url:gated?null:x.media_url,playback_url:gated?null:x.playback_url,gated,gate_reason:gated?'age_verification_required':null};
  });
  res.json({requests,ageVerified});
});

const consentSchema=z.object({decision:z.enum(['approved','rejected','revoked'])});
router.post('/:id/consent', requireAuth, async (req,res)=>{
  const parsed=consentSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'invalid_decision'});
  const post=await db.query(`SELECT p.*,u.id owner_id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1`,[req.params.id]);
  if(!post.rowCount)return res.status(404).json({error:'post_not_found'});
  const part=await db.query(`SELECT * FROM post_participants WHERE post_id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
  if(!part.rowCount)return res.status(403).json({error:'not_a_participant'});
  const decision=parsed.data.decision;
  if(decision==='revoked' && part.rows[0].consent_status!=='approved') return res.status(400).json({error:'consent_not_approved'});
  await db.query(`UPDATE post_participants SET consent_status=$3,responded_at=now() WHERE post_id=$1 AND user_id=$2`,[req.params.id,req.user.id,decision]);
  const ownerId=post.rows[0].owner_id;
  if(decision==='rejected'){
    await db.query(`UPDATE posts SET consent_state='rejected',moderation_status='rejected',updated_at=now() WHERE id=$1`,[req.params.id]);
    await db.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_rejected','post',$3,'Ha rechazado aparecer en tu publicación.')`,[ownerId,req.user.id,req.params.id]);
  }else if(decision==='revoked'){
    await db.query(`UPDATE posts SET consent_state='revoked',moderation_status='under_review',updated_at=now() WHERE id=$1`,[req.params.id]);
    await db.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_revoked','post',$3,'Ha retirado su consentimiento. La publicación se ha ocultado.')`,[ownerId,req.user.id,req.params.id]);
  }else{
    const remaining=await db.query(`SELECT count(*)::int n FROM post_participants WHERE post_id=$1 AND consent_status<>'approved'`,[req.params.id]);
    if(remaining.rows[0].n===0) await db.query(`UPDATE posts SET consent_state='approved',moderation_status='published',updated_at=now() WHERE id=$1`,[req.params.id]);
    await db.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_approved','post',$3,'Ha aprobado aparecer en tu publicación.')`,[ownerId,req.user.id,req.params.id]);
  }
  res.json({ok:true,decision});
});

router.get('/feed', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const mode = ['latest','following','foryou'].includes(req.query.mode) ? req.query.mode : 'latest';
  const params = [];
  const where = [`p.moderation_status='published'`, `u.status='active'`];
  if (req.user) {
    params.push(req.user.id);
    where.push(postAudienceWhere('$1','p'));
    where.push(`p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`);
    where.push(`p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)`);
    if (mode === 'following') where.push(`(
      p.user_id=$1
      OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
      OR p.id IN (
        SELECT rp.post_id
          FROM reposts rp
         WHERE rp.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
      )
    )`);
  } else {
    where.push(postAudienceWhere(null,'p'));
    if (mode === 'following') return res.json({ posts: [] });
  }
  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,
           ${req.user ? `EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1)` : 'false'} AS liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${mode === 'foryou'
       ? '(SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,'
       : mode === 'following' && req.user
         ? 'GREATEST(p.created_at,COALESCE((SELECT max(rp.created_at) FROM reposts rp WHERE rp.post_id=p.id AND rp.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)),p.created_at)) DESC,'
         : ''} p.created_at DESC
     LIMIT 50
  `, params);
  const participantPosts = await attachApprovedParticipants(result.rows);
  const posts = await attachCommentPreviews(participantPosts, viewer);
  const repostPosts = await attachRepostMeta(posts, req.user?.id || null, mode === 'following');
  res.json({ posts: gateRows(repostPosts, viewer), mode });
});

router.get('/momentum', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);

  const now=Date.now();
  const maxLookback=7*24*60*60*1000;
  const fallback=24*60*60*1000;
  const requested=Date.parse(String(req.query.since || ''));
  const sinceMs=Number.isFinite(requested)
    ? Math.max(now-maxLookback,Math.min(requested,now))
    : now-fallback;
  const since=new Date(sinceMs).toISOString();

  const commonSelect=`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$1 AND mine.following_id=u.id) from_following,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           (SELECT count(*)::int FROM reposts r WHERE r.post_id=p.id) repost_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND p.user_id<>$1
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND ${postAudienceWhere('$1','p')}`;

  const catchupResult=await db.query(`
    ${commonSelect}
       AND p.created_at >= $2
     ORDER BY (
       CASE WHEN EXISTS(
         SELECT 1 FROM follows priority_follow
          WHERE priority_follow.follower_id=$1
            AND priority_follow.following_id=p.user_id
       ) THEN 12 ELSE 0 END
       + (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2
       + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3
       + (SELECT count(*) FROM reposts r2 WHERE r2.post_id=p.id) * 3
     ) DESC,
     p.created_at DESC
     LIMIT 8
  `,[req.user.id,since]);

  const catchupParticipant=await attachApprovedParticipants(catchupResult.rows);
  const catchupComments=await attachCommentPreviews(catchupParticipant,viewer);
  const catchupReposts=await attachRepostMeta(catchupComments,req.user.id);
  const catchup=gateRows(catchupReposts,viewer);

  const highlightResult=await db.query(`
    ${commonSelect}
       AND p.created_at >= now() - interval '24 hours'
     ORDER BY (
       (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2
       + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3
       + (SELECT count(*) FROM reposts r2 WHERE r2.post_id=p.id) * 4
     ) DESC,
     p.created_at DESC
     LIMIT 14
  `,[req.user.id]);

  const highlightParticipant=await attachApprovedParticipants(highlightResult.rows);
  const highlightComments=await attachCommentPreviews(highlightParticipant,viewer);
  const highlightReposts=await attachRepostMeta(highlightComments,req.user.id);
  const catchupIds=new Set(catchup.map(post=>String(post.id)));
  const highlights=gateRows(highlightReposts,viewer)
    .filter(post=>!catchupIds.has(String(post.id)))
    .slice(0,6);

  res.json({
    since,
    catchup,
    highlights,
    catchupCount:catchup.length,
    highlightCount:highlights.length
  });
});

router.get('/discover', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const params=[];
  let block='';
  let likedByMe='false';
  let audienceFilter=postAudienceWhere(null,'p');
  if(req.user){
    params.push(req.user.id);
    block=`AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1) AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)`;
    likedByMe='EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1)';
    audienceFilter=postAudienceWhere('$1','p');
  }
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           ${likedByMe} AS liked_by_me
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${audienceFilter}
       ${block}
     ORDER BY (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,p.created_at DESC
     LIMIT 60
  `,params);
  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachRepostMeta(participantPosts,req.user?.id || null);
  res.json({posts:gateRows(posts,viewer)});
});

router.get('/search', requireAuth, async (req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,80);
  if(q.length<2) return res.json({posts:[],query:q});

  const viewer=await viewerFrom(req);
  const likePattern=`%${q}%`;
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND (
         p.caption ILIKE $2
         OR u.username ILIKE $2
         OR u.display_name ILIKE $2
       )
     ORDER BY p.created_at DESC
     LIMIT 50
  `,[req.user.id,likePattern]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer),query:q});
});

router.get('/trending', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);
  const sort=['score','likes','comments'].includes(String(req.query.sort||'')) ? String(req.query.sort) : 'score';
  const orderBy=sort==='likes'
    ? 'like_count DESC, comment_count DESC'
    : sort==='comments'
      ? 'comment_count DESC, like_count DESC'
      : '((SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2 + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3) DESC';

  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.created_at >= now() - interval '30 days'
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY ${orderBy}, p.created_at DESC
     LIMIT 40
  `,[req.user.id]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer),sort});
});

router.get('/trends', requireAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT p.caption
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.created_at >= now() - interval '30 days'
       AND p.caption <> ''
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY p.created_at DESC
     LIMIT 500
  `,[req.user.id]);

  const counts=new Map();
  const hashtag=/#([\p{L}\p{N}_]{2,40})/gu;
  for(const row of result.rows){
    const text=String(row.caption||'');
    const seen=new Set();
    for(const match of text.matchAll(hashtag)){
      const tag=match[1].normalize('NFKC').toLowerCase();
      if(seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag,(counts.get(tag)||0)+1);
    }
  }

  const trends=[...counts.entries()]
    .sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))
    .slice(0,12)
    .map(([tag,count])=>({tag,count}));

  res.json({trends});
});

router.get('/saved/ids', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const result=await db.query(`
    SELECT sp.post_id
      FROM saved_posts sp
      JOIN posts p ON p.id=sp.post_id
     WHERE sp.user_id=$1
       AND p.moderation_status='published'
       AND ${postAudienceWhere('$1','p')}
     ORDER BY sp.created_at DESC
     LIMIT 500
  `,[req.user.id]);
  res.json({ids:result.rows.map(row=>String(row.post_id))});
});

router.get('/saved', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const viewer=await viewerFrom(req);
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           sp.created_at saved_at
      FROM saved_posts sp
      JOIN posts p ON p.id=sp.post_id
      JOIN users u ON u.id=p.user_id
     WHERE sp.user_id=$1
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY sp.created_at DESC
     LIMIT 100
  `,[req.user.id]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer)});
});

router.post('/:id/save', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post)return res.status(404).json({error:'post_not_found'});
  await db.query(`
    INSERT INTO saved_posts (user_id,post_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
  `,[req.user.id,req.params.id]);
  res.json({ok:true,saved:true});
});

router.delete('/:id/save', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});
  await db.query(
    'DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2',
    [req.user.id,req.params.id]
  );
  res.json({ok:true,saved:false});
});

router.get('/user/:username', optionalAuth, async (req, res) => {
  await ensureCreatorFeaturedV13();
  const viewer=await viewerFrom(req);
  const mode=['posts','reposts','media'].includes(String(req.query.mode||'')) ? String(req.query.mode) : 'posts';
  const params=[req.params.username];
  let likedByMe='false';
  let audienceFilter=postAudienceWhere(null,'p');
  if(req.user){
    params.push(req.user.id);
    likedByMe='EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$2)';
    audienceFilter=postAudienceWhere('$2','p');
  }

  const source = mode === 'reposts'
    ? `FROM reposts profile_reposts
       JOIN users profile_owner ON profile_owner.id=profile_reposts.user_id
       JOIN posts p ON p.id=profile_reposts.post_id
       JOIN users u ON u.id=p.user_id`
    : `FROM posts p
       JOIN users u ON u.id=p.user_id`;

  const ownerFilter = mode === 'reposts'
    ? `lower(profile_owner.username)=lower($1)`
    : `lower(u.username)=lower($1)`;

  const mediaFilter = mode === 'media'
    ? `AND (COALESCE(p.media_url,'')<>'' OR COALESCE(p.playback_url,'')<>'')`
    : '';

  const featuredSelect = mode === 'reposts'
    ? 'false'
    : 'EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id)';
  const orderBy = mode === 'reposts'
    ? 'profile_reposts.created_at DESC'
    : 'EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id) DESC, COALESCE((SELECT fp.featured_at FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id),p.created_at) DESC';

  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           ${likedByMe} AS liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           ${featuredSelect} AS featured
      ${source}
     WHERE ${ownerFilter}
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${audienceFilter}
       ${mediaFilter}
     ORDER BY ${orderBy}
     LIMIT 60
  `,params);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts, viewer);
  const repostPosts=await attachRepostMeta(posts,req.user?.id || null);
  res.json({posts:gateRows(repostPosts,viewer),mode});
});

router.get('/detail/:id', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.id=$2
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
     LIMIT 1
  `,[req.user.id,req.params.id]);

  if(!result.rowCount)return res.status(404).json({error:'post_not_found'});

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({post:gateRows(repostPosts,viewer)[0]});
});

router.post('/:id/repost',requireAuth,async(req,res)=>{
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post)return res.status(404).json({error:'post_not_found'});
  if(post.audience==='vip')return res.status(403).json({error:'vip_post_cannot_be_reposted'});
  if(String(post.user_id)===String(req.user.id)){
    return res.status(400).json({error:'cannot_repost_own_post'});
  }

  const inserted=await db.query(`
    INSERT INTO reposts (user_id,post_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
    RETURNING post_id
  `,[req.user.id,req.params.id]);

  if(inserted.rowCount){
    try{
      await db.query(`
        INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
        VALUES ($1,$2,'repost','post',$3,'Ha republicado tu publicación.')
      `,[post.user_id,req.user.id,req.params.id]);
    }catch(notificationError){
      console.warn('RedLibertad repost notification failed:',notificationError?.message || notificationError);
    }
  }

  const count=await db.query('SELECT count(*)::int AS n FROM reposts WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,reposted:true,repostCount:count.rows[0]?.n || 0});
});

router.delete('/:id/repost',requireAuth,async(req,res)=>{
  await db.query('DELETE FROM reposts WHERE user_id=$1 AND post_id=$2',[req.user.id,req.params.id]);
  const count=await db.query('SELECT count(*)::int AS n FROM reposts WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,reposted:false,repostCount:count.rows[0]?.n || 0});
});

router.post('/:id/like', requireAuth, async (req,res)=>{
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});
  const inserted=await db.query(
    `INSERT INTO likes (user_id,post_id)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [req.user.id,req.params.id]
  );

  if(inserted.rowCount){
    const owner=await db.query(
      `SELECT user_id FROM posts WHERE id=$1 AND moderation_status='published'`,
      [req.params.id]
    );

    if(owner.rowCount && String(owner.rows[0].user_id)!==String(req.user.id)){
      await db.query(`
        INSERT INTO notifications (
          user_id,actor_id,type,entity_type,entity_id,text
        )
        VALUES ($1,$2,'like','post',$3,'Le gusta tu publicación.')
      `,[ownerId,req.user.id,req.params.id]);
    }
  }

  const count=await db.query('SELECT count(*)::int AS n FROM likes WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,liked:true,likeCount:count.rows[0]?.n || 0});
});
router.delete('/:id/like', requireAuth, async (req,res)=>{
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});
  await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2',[req.user.id,req.params.id]);
  const count=await db.query('SELECT count(*)::int AS n FROM likes WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,liked:false,likeCount:count.rows[0]?.n || 0});
});

const editPostSchema=z.object({
  caption:z.string().max(2200)
});

router.patch('/:id',requireAuth,async(req,res)=>{
  const parsed=editPostSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const found=await db.query(
    'SELECT id,user_id,media_url,moderation_status FROM posts WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!found.rowCount)return res.status(404).json({error:'post_not_found'});

  const post=found.rows[0];
  const allowed=String(post.user_id)===String(req.user.id) || req.user.isAdmin===true;
  if(!allowed)return res.status(403).json({error:'post_edit_not_allowed'});

  const caption=String(parsed.data.caption || '').trim();
  if(!caption && !String(post.media_url || '').trim()){
    return res.status(400).json({error:'empty_post'});
  }

  const updated=await db.query(
    `UPDATE posts
        SET caption=$2,updated_at=now()
      WHERE id=$1
      RETURNING id,caption,updated_at`,
    [req.params.id,caption]
  );

  res.json({ok:true,post:updated.rows[0]});
});

router.delete('/:id',requireAuth,async(req,res)=>{
  const found=await db.query(
    'SELECT id,user_id FROM posts WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!found.rowCount)return res.status(404).json({error:'post_not_found'});

  const post=found.rows[0];
  const allowed=String(post.user_id)===String(req.user.id) || req.user.isAdmin===true;
  if(!allowed)return res.status(403).json({error:'post_delete_not_allowed'});

  await db.query('DELETE FROM posts WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

router.get('/:id/comments', requireAuth, async (req,res)=>{
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post){
    return res.status(404).json({error:'post_not_found'});
  }

  const result = await db.query(`
    SELECT
      c.id,
      c.body,
      c.created_at,
      u.id AS user_id,
      u.username,
      u.display_name,
      u.avatar_url,
      u.creator_verified
    FROM comments c
    JOIN users u ON u.id=c.user_id
    WHERE c.post_id=$1
      AND u.status='active'
    ORDER BY c.created_at ASC
    LIMIT 250
  `,[req.params.id]);

  const postOwnerId = post.user_id;

  const comments = result.rows.map(comment => ({
    ...comment,
    can_delete:
      String(comment.user_id) === String(req.user.id) ||
      String(postOwnerId) === String(req.user.id) ||
      req.user.isAdmin === true
  }));

  res.json({comments});
});


router.delete('/:postId/comments/:commentId', requireAuth, async (req,res)=>{
  const found = await db.query(`
    SELECT
      c.id,
      c.user_id AS comment_owner_id,
      c.post_id,
      p.user_id AS post_owner_id
    FROM comments c
    JOIN posts p ON p.id=c.post_id
    WHERE c.id=$1
      AND c.post_id=$2
    LIMIT 1
  `,[req.params.commentId,req.params.postId]);

  if(!found.rowCount){
    return res.status(404).json({error:'comment_not_found'});
  }

  const comment = found.rows[0];
  const allowed =
    String(comment.comment_owner_id) === String(req.user.id) ||
    String(comment.post_owner_id) === String(req.user.id) ||
    req.user.isAdmin === true;

  if(!allowed){
    return res.status(403).json({error:'comment_delete_not_allowed'});
  }

  await db.query(
    'DELETE FROM comments WHERE id=$1 AND post_id=$2',
    [req.params.commentId,req.params.postId]
  );

  res.json({ok:true});
});

const commentSchema=z.object({body:z.string().min(1).max(1000)});
router.post('/:id/comments',requireAuth,async(req,res)=>{
  const parsed=commentSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_comment'});
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});

  const result=await db.query(`
    INSERT INTO comments (user_id,post_id,body)
    VALUES ($1,$2,$3)
    RETURNING id,user_id,post_id,body,created_at
  `,[req.user.id,req.params.id,parsed.data.body]);

  const ownerId=visiblePost.user_id;

  if(String(ownerId)!==String(req.user.id)){
    await db.query(`
      INSERT INTO notifications (
        user_id,actor_id,type,entity_type,entity_id,text
      )
      VALUES ($1,$2,'comment','post',$3,'Ha comentado tu publicación.')
    `,[owner.rows[0].user_id,req.user.id,req.params.id]);
  }

  try {
    await notifyMentions({actorId:req.user.id,text:parsed.data.body,entityType:'post',entityId:req.params.id,audience:visiblePost.audience});
  } catch (mentionError) {
    console.warn('RedLibertad comment mention notification failed:',mentionError?.message || mentionError);
  }

  res.status(201).json({ok:true,comment:result.rows[0]});
});

module.exports = router;
