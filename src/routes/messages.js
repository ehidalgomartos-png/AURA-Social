const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

let messagePrivacyReady = null;
async function ensureMessagePrivacy() {
  if (!messagePrivacyReady) {
    messagePrivacyReady = (async () => {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy TEXT NOT NULL DEFAULT 'everyone'");
      await db.query("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE");
      await db.query("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE");
      await db.query("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS notifications_muted BOOLEAN NOT NULL DEFAULT FALSE");
      await db.query("CREATE INDEX IF NOT EXISTS idx_conversation_members_inbox ON conversation_members(user_id,is_archived,is_pinned,conversation_id)");
    })().catch(error => {
      messagePrivacyReady = null;
      throw error;
    });
  }
  return messagePrivacyReady;
}

router.use(requireAuth);
router.use(async (_req,res,next)=>{
  try{
    await ensureMessagePrivacy();
    next();
  }catch(error){
    console.error('RedLibertad message privacy bootstrap failed:',error);
    res.status(500).json({error:'message_privacy_bootstrap_failed'});
  }
});

async function userRow(id) {
  const r = await db.query(`SELECT id,username,display_name,avatar_url,age_verified,creator_verified,status FROM users WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function conversationForUser(conversationId, userId) {
  const r = await db.query(`SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2`, [conversationId, userId]);
  return !!r.rowCount;
}

async function otherMember(conversationId, userId) {
  const r = await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.age_verified,u.creator_verified
      FROM conversation_members cm JOIN users u ON u.id=cm.user_id
     WHERE cm.conversation_id=$1 AND cm.user_id<>$2
     LIMIT 1
  `, [conversationId, userId]);
  return r.rows[0] || null;
}

router.get('/conversations', async (req, res) => {
  const filter=String(req.query.filter || 'all');
  const q=String(req.query.q || '').trim().slice(0,100);
  if(!['all','unread','archived'].includes(filter)){
    return res.status(400).json({error:'invalid_conversation_filter'});
  }

  const r = await db.query(`
    SELECT c.id,c.updated_at,
           cm.is_pinned,cm.is_archived,cm.notifications_muted,cm.last_read_at,
           u.id AS other_user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           m.body AS last_body,m.content_level AS last_content_level,m.created_at AS last_message_at,
           (SELECT count(*)::int FROM messages mu
              WHERE mu.conversation_id=c.id
                AND mu.sender_id<>$1
                AND mu.created_at>COALESCE(cm.last_read_at,to_timestamp(0))) AS unread_count
      FROM conversation_members cm
      JOIN conversations c ON c.id=cm.conversation_id
      JOIN conversation_members om ON om.conversation_id=c.id AND om.user_id<>$1
      JOIN users u ON u.id=om.user_id
      LEFT JOIN LATERAL (
        SELECT body,content_level,created_at
          FROM messages
         WHERE conversation_id=c.id
         ORDER BY created_at DESC
         LIMIT 1
      ) m ON true
     WHERE cm.user_id=$1
       AND u.status='active'
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND (
         ($2='all' AND cm.is_archived=false)
         OR ($2='archived' AND cm.is_archived=true)
         OR ($2='unread' AND cm.is_archived=false AND EXISTS(
           SELECT 1 FROM messages um
            WHERE um.conversation_id=c.id
              AND um.sender_id<>$1
              AND um.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
         ))
       )
       AND (
         $3=''
         OR u.username ILIKE '%' || $3 || '%'
         OR u.display_name ILIKE '%' || $3 || '%'
       )
     ORDER BY
       cm.is_pinned DESC,
       CASE WHEN EXISTS(
         SELECT 1 FROM messages um
          WHERE um.conversation_id=c.id
            AND um.sender_id<>$1
            AND um.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
       ) THEN 0 ELSE 1 END,
       COALESCE(m.created_at,c.updated_at) DESC
     LIMIT 100
  `, [req.user.id,filter,q]);

  const summary=await db.query(`
    SELECT
      count(*) FILTER (WHERE is_archived=false)::int active,
      count(*) FILTER (WHERE is_archived=true)::int archived,
      count(*) FILTER (
        WHERE is_archived=false
          AND EXISTS(
            SELECT 1 FROM messages um
             WHERE um.conversation_id=conversation_members.conversation_id
               AND um.sender_id<>$1
               AND um.created_at>COALESCE(conversation_members.last_read_at,to_timestamp(0))
          )
      )::int unread,
      count(*) FILTER (WHERE is_archived=false AND is_pinned=true)::int pinned
    FROM conversation_members
    WHERE user_id=$1
  `,[req.user.id]);

  res.json({filter,q,summary:summary.rows[0] || {active:0,archived:0,unread:0,pinned:0},conversations:r.rows});
});
const createConversationSchema = z.object({ username: z.string().min(1).max(30) });
router.post('/conversations', async (req, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data' });
  const target = await db.query(`SELECT id,username,display_name,avatar_url,status,message_privacy FROM users WHERE lower(username)=lower($1) LIMIT 1`, [parsed.data.username]);
  if (!target.rowCount || target.rows[0].status !== 'active') return res.status(404).json({ error: 'user_not_found' });
  const targetId = target.rows[0].id;
  if (String(targetId) === String(req.user.id)) return res.status(400).json({ error: 'cannot_message_self' });

  const blocked = await db.query(`SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`, [req.user.id, targetId]);
  if (blocked.rowCount) return res.status(403).json({ error: 'messaging_blocked' });

  const existing = await db.query(`
    SELECT cm1.conversation_id AS id
      FROM conversation_members cm1
      JOIN conversation_members cm2 ON cm2.conversation_id=cm1.conversation_id
     WHERE cm1.user_id=$1 AND cm2.user_id=$2
       AND (SELECT count(*) FROM conversation_members z WHERE z.conversation_id=cm1.conversation_id)=2
     LIMIT 1
  `, [req.user.id, targetId]);
  if (existing.rowCount) return res.json({ ok: true, conversationId: existing.rows[0].id, existing: true });

  if (target.rows[0].message_privacy === 'no_one') {
    return res.status(403).json({ error: 'message_privacy_denied' });
  }

  if (target.rows[0].message_privacy === 'following') {
    const targetFollowsSender = await db.query(
      'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 LIMIT 1',
      [targetId,req.user.id]
    );
    if (!targetFollowsSender.rowCount) {
      return res.status(403).json({ error: 'message_privacy_following_only' });
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const c = await client.query(`INSERT INTO conversations DEFAULT VALUES RETURNING id`);
    const id = c.rows[0].id;
    await client.query(`INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3)`, [id, req.user.id, targetId]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, conversationId: id, existing: false });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'conversation_create_failed' });
  } finally {
    client.release();
  }
});

const conversationSettingsSchema=z.object({
  pinned:z.boolean().optional(),
  archived:z.boolean().optional(),
  muted:z.boolean().optional()
}).refine(value=>Object.keys(value).length>0);

router.patch('/conversations/:id/settings',async(req,res)=>{
  const parsed=conversationSettingsSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_conversation_settings'});
  if(!(await conversationForUser(req.params.id,req.user.id))){
    return res.status(404).json({error:'conversation_not_found'});
  }
  const data=parsed.data;
  const updated=await db.query(`
    UPDATE conversation_members
       SET is_pinned=CASE WHEN $3 THEN $4 ELSE is_pinned END,
           is_archived=CASE WHEN $5 THEN $6 ELSE is_archived END,
           notifications_muted=CASE WHEN $7 THEN $8 ELSE notifications_muted END
     WHERE conversation_id=$1 AND user_id=$2
     RETURNING conversation_id,is_pinned,is_archived,notifications_muted,last_read_at
  `,[
    req.params.id,req.user.id,
    Object.prototype.hasOwnProperty.call(data,'pinned'),data.pinned===true,
    Object.prototype.hasOwnProperty.call(data,'archived'),data.archived===true,
    Object.prototype.hasOwnProperty.call(data,'muted'),data.muted===true
  ]);
  res.json({ok:true,settings:updated.rows[0]});
});

router.get('/conversations/:id/messages', async (req, res) => {
  const id = req.params.id;
  if (!(await conversationForUser(id, req.user.id))) return res.status(404).json({ error: 'conversation_not_found' });
  const other = await otherMember(id, req.user.id);
  const viewer = await userRow(req.user.id);
  const permission = other ? await db.query(`SELECT allowed FROM sensitive_message_permissions WHERE receiver_id=$1 AND sender_id=$2`, [req.user.id, other.id]) : { rowCount: 0 };
  const allowedFromOther = !!permission.rows?.[0]?.allowed && !!viewer?.age_verified;

  const r = await db.query(`
    SELECT m.id,m.sender_id,m.body,m.media_url,m.media_type,m.media_provider,m.external_id,m.playback_url,m.content_level,m.created_at,
           u.username,u.display_name,u.avatar_url
      FROM messages m JOIN users u ON u.id=m.sender_id
     WHERE m.conversation_id=$1
     ORDER BY m.created_at ASC
     LIMIT 300
  `, [id]);

  const messages = r.rows.map(m => {
    const isOwn = String(m.sender_id) === String(req.user.id);
    const gated = !isOwn && m.content_level !== 'normal' && !allowedFromOther;
    return {
      ...m,
      media_url: gated ? null : m.media_url,
      playback_url: gated ? null : m.playback_url,
      body: gated && m.media_url ? '' : m.body,
      gated,
      gate_reason: gated ? (viewer?.age_verified ? 'permission_required' : 'age_verification_required') : null
    };
  });

  const memberState=await db.query(
    `UPDATE conversation_members
        SET last_read_at=now()
      WHERE conversation_id=$1 AND user_id=$2
      RETURNING is_pinned,is_archived,notifications_muted,last_read_at`,
    [id, req.user.id]
  );
  res.json({
    messages,
    other,
    sensitiveAllowed: allowedFromOther,
    viewerAgeVerified: !!viewer?.age_verified,
    settings:memberState.rows[0] || {is_pinned:false,is_archived:false,notifications_muted:false}
  });
});

const messageSchema = z.object({
  body: z.string().max(4000).optional().default(''),
  mediaUrl: z.string().max(4096).optional().nullable(),
  mediaType: z.enum(['image','video']).optional().nullable(),
  mediaProvider: z.string().max(40).optional().nullable(),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  contentLevel: z.enum(['normal','sensitive','nudity']).default('normal')
}).refine(v => v.body.trim() || v.mediaUrl, { message: 'message_empty' });

router.post('/conversations/:id/messages', async (req, res) => {
  const id = req.params.id;

  try {
    if (!(await conversationForUser(id, req.user.id))) {
      return res.status(404).json({ error: 'conversation_not_found' });
    }

    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_message' });
    }

    const d = parsed.data;
    const sender = await userRow(req.user.id);
    const recipient = await otherMember(id, req.user.id);

    if (!recipient) {
      return res.status(404).json({ error: 'recipient_not_found' });
    }

    const blocked = await db.query(
      `SELECT 1
         FROM blocks
        WHERE (blocker_id=$1 AND blocked_id=$2)
           OR (blocker_id=$2 AND blocked_id=$1)
        LIMIT 1`,
      [req.user.id, recipient.id]
    );

    if (blocked.rowCount) {
      return res.status(403).json({ error: 'messaging_blocked' });
    }

    if (
      d.contentLevel === 'nudity' &&
      (!sender?.creator_verified || !sender?.age_verified)
    ) {
      return res.status(403).json({
        error: 'verified_creator_required_for_nudity'
      });
    }

    // Persist the actual message atomically. A secondary notification
    // must never turn a successfully stored message into a false "send failed".
    const client = await db.pool.connect();
    let savedMessage;

    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO messages (
          conversation_id,
          sender_id,
          body,
          media_url,
          media_type,
          media_provider,
          external_id,
          playback_url,
          content_level
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        id,
        req.user.id,
        d.body.trim(),
        d.mediaUrl,
        d.mediaType,
        d.mediaProvider,
        d.externalId,
        d.playbackUrl,
        d.contentLevel
      ]);

      await client.query(
        `UPDATE conversations SET updated_at=now() WHERE id=$1`,
        [id]
      );
      await client.query(
        `UPDATE conversation_members
            SET is_archived=false
          WHERE conversation_id=$1 AND user_id=$2`,
        [id,req.user.id]
      );

      await client.query('COMMIT');
      savedMessage = result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Notifications are useful, but non-critical. If they fail, the message
    // remains correctly sent and the client still receives HTTP 201.
    try {
      await db.query(`
        INSERT INTO notifications (
          user_id, actor_id, type, entity_type, entity_id, text
        )
        VALUES ($1,$2,'message','conversation',$3,$4)
      `, [
        recipient.id,
        req.user.id,
        id,
        d.contentLevel === 'normal'
          ? 'Te ha enviado un mensaje.'
          : 'Te ha enviado contenido sensible.'
      ]);
    } catch (notificationError) {
      console.warn(
        'RedLibertad message notification failed after message was stored:',
        notificationError?.message || notificationError
      );
    }

    return res.status(201).json({
      ok: true,
      message: savedMessage
    });
  } catch (error) {
    console.error('RedLibertad message send failed:', error);
    return res.status(500).json({ error: 'message_send_failed' });
  }
});

router.get('/users/:id/sensitive-permission', async (req, res) => {
  const viewer = await userRow(req.user.id);
  const r = await db.query(`SELECT allowed,updated_at FROM sensitive_message_permissions WHERE receiver_id=$1 AND sender_id=$2`, [req.user.id, req.params.id]);
  res.json({ allowed: !!r.rows[0]?.allowed && !!viewer?.age_verified, ageVerified: !!viewer?.age_verified });
});

const permissionSchema = z.object({ allow: z.boolean() });
router.post('/users/:id/sensitive-permission', async (req, res) => {
  const parsed = permissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data' });
  const viewer = await userRow(req.user.id);
  if (parsed.data.allow && !viewer?.age_verified) return res.status(403).json({ error: 'age_verification_required' });
  await db.query(`
    INSERT INTO sensitive_message_permissions (receiver_id,sender_id,allowed,updated_at)
    VALUES ($1,$2,$3,now())
    ON CONFLICT(receiver_id,sender_id) DO UPDATE SET allowed=EXCLUDED.allowed,updated_at=now()
  `, [req.user.id, req.params.id, parsed.data.allow]);
  res.json({ ok: true, allowed: parsed.data.allow });
});

module.exports = router;
