const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { canViewerSee } = require('../services/contentPolicy');

const router = express.Router();
const schema = z.object({
  mediaUrl: z.string().min(1).max(4096), mediaType: z.enum(['image','video']),
  mediaProvider: z.string().max(40).default('local'), externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(), contentLevel: z.enum(['normal','sensitive','nudity'])
});

router.post('/', requireAuth, async (req,res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'invalid_data' });
  if (parsed.data.contentLevel === 'nudity') {
    const u = await db.query('SELECT creator_verified,age_verified FROM users WHERE id=$1',[req.user.id]);
    if (!u.rows[0]?.creator_verified || !u.rows[0]?.age_verified) return res.status(403).json({ error:'verified_creator_required_for_nudity' });
  }
  const d=parsed.data;
  const r=await db.query(`INSERT INTO stories (user_id,media_url,media_type,media_provider,external_id,playback_url,content_level,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours') RETURNING *`,[req.user.id,d.mediaUrl,d.mediaType,d.mediaProvider,d.externalId,d.playbackUrl,d.contentLevel]);
  res.status(201).json({ok:true,story:r.rows[0]});
});

router.get('/', optionalAuth, async (req,res) => {
  let viewer=null; const params=[]; let block='';
  if(req.user){
    const vr=await db.query('SELECT age_verified,show_sensitive FROM users WHERE id=$1',[req.user.id]);
    viewer={ageVerified:vr.rows[0]?.age_verified,showSensitive:vr.rows[0]?.show_sensitive};
    params.push(req.user.id);
    block=`AND s.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`;
  }
  const r=await db.query(`SELECT s.*,u.username,u.display_name,u.avatar_url,u.creator_verified FROM stories s JOIN users u ON u.id=s.user_id WHERE s.expires_at>now() AND s.moderation_status='published' AND u.status='active' ${block} ORDER BY s.created_at DESC LIMIT 100`,params);
  const stories=r.rows.map(s=>{const g=canViewerSee({postLevel:s.content_level,viewer}); return {...s,media_url:g.allowed?s.media_url:null,playback_url:g.allowed?s.playback_url:null,gated:!g.allowed,gate_reason:g.reason||null};});
  res.json({stories});
});

module.exports=router;
