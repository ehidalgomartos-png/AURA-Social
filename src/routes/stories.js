const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { canViewerSee } = require('../services/contentPolicy');

const router = express.Router();

let mutePrivacyReady = null;
async function ensureMutePrivacy() {
  if (!mutePrivacyReady) {
    mutePrivacyReady = db.query(`
      CREATE TABLE IF NOT EXISTS mutes (
        muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY(muter_id,muted_id),
        CHECK(muter_id<>muted_id)
      )
    `).catch(error => {
      mutePrivacyReady = null;
      throw error;
    });
  }
  return mutePrivacyReady;
}

let vipStoriesV19Ready = null;
async function ensureVipStoriesV19() {
  if (!vipStoriesV19Ready) {
    vipStoriesV19Ready = (async () => {
      await db.query("ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public'");
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='stories_audience_check' AND conrelid='stories'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE stories ADD CONSTRAINT stories_audience_check CHECK(audience IN ('public','vip'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_stories_audience_active ON stories(audience,expires_at DESC,created_at DESC)');
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
      vipStoriesV19Ready = null;
      throw error;
    });
  }
  return vipStoriesV19Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await Promise.all([ensureMutePrivacy(),ensureVipStoriesV19()]);
    next();
  }catch(error){
    console.error('RedLibertad V1.19 stories bootstrap failed:',error);
    res.status(500).json({error:'story_bootstrap_failed'});
  }
});

function storyAudienceWhere(viewerParam=null, alias='s') {
  if(!viewerParam) return `${alias}.audience='public'`;
  return `(
    ${alias}.audience='public'
    OR ${alias}.user_id=${viewerParam}
    OR EXISTS(SELECT 1 FROM users story_admin WHERE story_admin.id=${viewerParam} AND story_admin.is_admin=true)
    OR EXISTS(
      SELECT 1
        FROM creator_vips story_vip
        JOIN follows story_follow
          ON story_follow.follower_id=story_vip.fan_id
         AND story_follow.following_id=story_vip.creator_id
       WHERE story_vip.creator_id=${alias}.user_id
         AND story_vip.fan_id=${viewerParam}
    )
  )`;
}

const schema = z.object({
  mediaUrl: z.string().min(1).max(4096),
  mediaType: z.enum(['image','video']),
  mediaProvider: z.string().max(40).default('local'),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  contentLevel: z.enum(['normal','sensitive','nudity']),
  audience: z.enum(['public','vip']).default('public')
});

router.post('/', requireAuth, async (req,res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'invalid_data' });

  const d=parsed.data;
  const user = await db.query(
    'SELECT creator_verified,age_verified FROM users WHERE id=$1 LIMIT 1',
    [req.user.id]
  );

  if (d.contentLevel === 'nudity') {
    if (!user.rows[0]?.creator_verified || !user.rows[0]?.age_verified) {
      return res.status(403).json({ error:'verified_creator_required_for_nudity' });
    }
  }

  if (d.audience === 'vip' && !user.rows[0]?.creator_verified) {
    return res.status(403).json({ error:'verified_creator_required_for_vip_content' });
  }

  const r=await db.query(`
    INSERT INTO stories
      (user_id,media_url,media_type,media_provider,external_id,playback_url,content_level,audience,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '24 hours')
    RETURNING *
  `,[req.user.id,d.mediaUrl,d.mediaType,d.mediaProvider,d.externalId,d.playbackUrl,d.contentLevel,d.audience]);

  res.status(201).json({ok:true,story:r.rows[0]});
});

router.get('/', optionalAuth, async (req,res) => {
  let viewer=null;
  const params=[];
  const where=[
    's.expires_at>now()',
    "s.moderation_status='published'",
    "u.status='active'"
  ];

  if(req.user){
    const vr=await db.query(
      'SELECT id,age_verified,show_sensitive,is_admin FROM users WHERE id=$1',
      [req.user.id]
    );
    viewer={
      id:vr.rows[0]?.id,
      ageVerified:vr.rows[0]?.age_verified,
      showSensitive:vr.rows[0]?.show_sensitive,
      isAdmin:vr.rows[0]?.is_admin
    };
    params.push(req.user.id);
    where.push(storyAudienceWhere('$1','s'));
    where.push(`(
      s.user_id=$1
      OR EXISTS(SELECT 1 FROM users story_admin WHERE story_admin.id=$1 AND story_admin.is_admin=true)
      OR s.user_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id=$1
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id=$1
      )
    )`);
    where.push(`(s.user_id=$1 OR s.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1))`);
  }else{
    where.push(storyAudienceWhere(null,'s'));
  }

  const r=await db.query(`
    SELECT s.*,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM stories s
      JOIN users u ON u.id=s.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at DESC
     LIMIT 150
  `,params);

  const stories=r.rows.map(story=>{
    const gate=canViewerSee({postLevel:story.content_level,viewer});
    return {
      ...story,
      media_url:gate.allowed ? story.media_url : null,
      playback_url:gate.allowed ? story.playback_url : null,
      gated:!gate.allowed,
      gate_reason:gate.reason || null
    };
  });

  res.json({stories});
});

module.exports=router;
