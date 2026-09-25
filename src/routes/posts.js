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
  kind: z.enum(['post', 'reel']).default('post'),
  participantUsernames: z.array(z.string().min(1).max(30)).max(10).optional().default([])
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data', details: parsed.error.flatten() });
  const data = parsed.data;
  if (!validateContentLevel(data.contentLevel)) return res.status(400).json({ error: 'invalid_content_level' });

  if (data.contentLevel === 'nudity') {
    const user = await db.query('SELECT creator_verified,age_verified FROM users WHERE id=$1', [req.user.id]);
    if (!user.rows[0]?.creator_verified || !user.rows[0]?.age_verified) return res.status(403).json({ error: 'verified_creator_required_for_nudity' });
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
        (user_id,caption,media_url,media_type,media_provider,external_id,playback_url,content_level,post_kind,moderation_status,consent_state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [req.user.id,data.caption,data.mediaUrl,data.mediaType,data.mediaProvider,data.externalId,data.playbackUrl,data.contentLevel,data.kind,needsConsent?'under_review':'published',needsConsent?'pending':'none']);
    const post=result.rows[0];
    for(const p of participants){
      await client.query(`INSERT INTO post_participants (post_id,user_id,consent_status) VALUES ($1,$2,'pending') ON CONFLICT(post_id,user_id) DO NOTHING`,[post.id,p.id]);
      await client.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_request','post',$3,'Solicita tu consentimiento para publicar contenido en el que apareces.')`,[p.id,req.user.id,post.id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, post, consentRequired:needsConsent, participants });
  }catch(e){
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({error:'post_create_failed'});
  }finally{client.release();}
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

router.get('/consents/pending', requireAuth, async (req,res)=>{
  const r=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.consent_state,p.created_at,
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
    where.push(`p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`);
    if (mode === 'following') where.push(`(p.user_id=$1 OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1))`);
  } else if (mode === 'following') return res.json({ posts: [] });
  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,p.content_level,p.post_kind,p.consent_state,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${mode === 'foryou' ? '(SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,' : ''} p.created_at DESC
     LIMIT 50
  `, params);
  const posts = await attachApprovedParticipants(result.rows);
  res.json({ posts: gateRows(posts, viewer), mode });
});

router.get('/discover', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req); const params=[]; let block='';
  if(req.user){params.push(req.user.id);block=`AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`;}
  const result=await db.query(`SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,p.content_level,p.post_kind,p.consent_state,p.created_at,u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,(SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.moderation_status='published' AND u.status='active' ${block} ORDER BY (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,p.created_at DESC LIMIT 60`,params);
  const posts=await attachApprovedParticipants(result.rows);
  res.json({posts:gateRows(posts,viewer)});
});

router.get('/user/:username', optionalAuth, async (req, res) => {
  const viewer=await viewerFrom(req);
  const result=await db.query(`SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,p.content_level,p.post_kind,p.consent_state,p.created_at,u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,(SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,(SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count FROM posts p JOIN users u ON u.id=p.user_id WHERE lower(u.username)=lower($1) AND p.moderation_status='published' ORDER BY p.created_at DESC LIMIT 60`,[req.params.username]);
  const posts=await attachApprovedParticipants(result.rows);
  res.json({posts:gateRows(posts,viewer)});
});

router.post('/:id/like', requireAuth, async (req,res)=>{await db.query(`INSERT INTO likes (user_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[req.user.id,req.params.id]);res.json({ok:true});});
router.delete('/:id/like', requireAuth, async (req,res)=>{await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2',[req.user.id,req.params.id]);res.json({ok:true});});
const commentSchema=z.object({body:z.string().min(1).max(1000)});
router.post('/:id/comments',requireAuth,async(req,res)=>{const parsed=commentSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'invalid_comment'});const result=await db.query(`INSERT INTO comments (user_id,post_id,body) VALUES ($1,$2,$3) RETURNING id,user_id,post_id,body,created_at`,[req.user.id,req.params.id,parsed.data.body]);res.status(201).json({ok:true,comment:result.rows[0]});});

module.exports = router;
