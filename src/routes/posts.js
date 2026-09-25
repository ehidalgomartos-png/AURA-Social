const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateContentLevel, canViewerSee } = require('../services/contentPolicy');

const router = express.Router();

const createSchema = z.object({
  caption: z.string().max(2200).default(''),
  mediaUrl: z.string().min(1).max(4096),
  mediaType: z.enum(['image', 'video']),
  mediaProvider: z.string().max(40).default('local'),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  contentLevel: z.enum(['normal', 'sensitive', 'nudity']),
  kind: z.enum(['post', 'reel']).default('post')
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data', details: parsed.error.flatten() });
  const data = parsed.data;
  if (!validateContentLevel(data.contentLevel)) return res.status(400).json({ error: 'invalid_content_level' });

  if (data.contentLevel === 'nudity') {
    const user = await db.query('SELECT creator_verified,age_verified FROM users WHERE id=$1', [req.user.id]);
    if (!user.rows[0]?.creator_verified || !user.rows[0]?.age_verified) {
      return res.status(403).json({ error: 'verified_creator_required_for_nudity' });
    }
  }

  const result = await db.query(`
    INSERT INTO posts
      (user_id,caption,media_url,media_type,media_provider,external_id,playback_url,content_level,post_kind,moderation_status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'published')
    RETURNING *
  `, [req.user.id,data.caption,data.mediaUrl,data.mediaType,data.mediaProvider,data.externalId,data.playbackUrl,data.contentLevel,data.kind]);
  res.status(201).json({ ok: true, post: result.rows[0] });
});

async function viewerFrom(req) {
  if (!req.user) return null;
  const vr = await db.query('SELECT age_verified,show_sensitive FROM users WHERE id=$1', [req.user.id]);
  return vr.rowCount ? { ageVerified: vr.rows[0].age_verified, showSensitive: vr.rows[0].show_sensitive } : null;
}

function gateRows(rows, viewer) {
  return rows.map(post => {
    const gate = canViewerSee({ postLevel: post.content_level, viewer });
    return { ...post, media_url: gate.allowed ? post.media_url : null, playback_url: gate.allowed ? post.playback_url : null, gated: !gate.allowed, gate_reason: gate.reason || null };
  });
}

router.get('/feed', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const mode = ['latest','following','foryou'].includes(req.query.mode) ? req.query.mode : 'latest';
  const params = [];
  const where = [`p.moderation_status='published'`, `u.status='active'`];

  if (req.user) {
    params.push(req.user.id);
    where.push(`p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`);
    if (mode === 'following') where.push(`(p.user_id=$1 OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1))`);
  } else if (mode === 'following') {
    return res.json({ posts: [] });
  }

  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${mode === 'foryou' ? '(SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,' : ''} p.created_at DESC
     LIMIT 50
  `, params);
  res.json({ posts: gateRows(result.rows, viewer), mode });
});

router.get('/discover', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const params = [];
  let block = '';
  if (req.user) {
    params.push(req.user.id);
    block = `AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`;
  }
  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published' AND u.status='active' ${block}
     ORDER BY (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC, p.created_at DESC
     LIMIT 60
  `, params);
  res.json({ posts: gateRows(result.rows, viewer) });
});

router.get('/user/:username', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE lower(u.username)=lower($1) AND p.moderation_status='published'
     ORDER BY p.created_at DESC LIMIT 60
  `, [req.params.username]);
  res.json({ posts: gateRows(result.rows, viewer) });
});

router.post('/:id/like', requireAuth, async (req, res) => {
  await db.query(`INSERT INTO likes (user_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, req.params.id]);
  res.json({ ok: true });
});
router.delete('/:id/like', requireAuth, async (req, res) => {
  await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]);
  res.json({ ok: true });
});

const commentSchema = z.object({ body: z.string().min(1).max(1000) });
router.post('/:id/comments', requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_comment' });
  const result = await db.query(`INSERT INTO comments (user_id,post_id,body) VALUES ($1,$2,$3) RETURNING id,user_id,post_id,body,created_at`, [req.user.id,req.params.id,parsed.data.body]);
  res.status(201).json({ ok: true, comment: result.rows[0] });
});

module.exports = router;
