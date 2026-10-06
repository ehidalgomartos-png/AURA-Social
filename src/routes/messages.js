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
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_chat_presence (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          active_conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
          typing_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_user_chat_presence_active ON user_chat_presence(active_conversation_id,typing_until)");
      await db.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL");
      await db.query("CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id)");
      await db.query(`
        CREATE TABLE IF NOT EXISTS message_reactions (
          message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reaction TEXT NOT NULL CHECK(reaction IN ('heart','like','laugh','fire','wow','sad')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(message_id,user_id)
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id,updated_at DESC)");
      await db.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL");
      await db.query("CREATE INDEX IF NOT EXISTS idx_messages_shared_post ON messages(shared_post_id)");
      await db.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct'");
      await db.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120)");
      await db.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL");
      await db.query("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS member_role TEXT NOT NULL DEFAULT 'member'");
      await db.query("CREATE INDEX IF NOT EXISTS idx_conversations_type_updated ON conversations(conversation_type,updated_at DESC)");
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
  const r = await db.query(`SELECT id,username,display_name,avatar_url,age_verified,creator_verified,show_sensitive,status FROM users WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function conversationForUser(conversationId, userId) {
  const r = await db.query(`SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2`, [conversationId, userId]);
  return !!r.rowCount;
}

async function conversationDetails(conversationId,userId){
  const conversation=await db.query(`
    SELECT
      c.id,c.conversation_type,c.title,c.created_by,c.created_at,c.updated_at,
      cm.member_role,cm.joined_at AS viewer_joined_at,
      cm.is_pinned,cm.is_archived,cm.notifications_muted,cm.last_read_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id=c.id
    WHERE c.id=$1 AND cm.user_id=$2
    LIMIT 1
  `,[conversationId,userId]);
  if(!conversation.rowCount)return null;

  const participants=await db.query(`
    SELECT
      u.id,u.username,u.display_name,u.avatar_url,u.age_verified,u.creator_verified,u.status,
      cm.member_role,cm.joined_at,cm.last_read_at,
      COALESCE(permission.allowed,false) AS sensitive_allowed,
      p.last_seen_at,
      (p.last_seen_at>now()-interval '45 seconds') AS online,
      (p.active_conversation_id=$1 AND p.typing_until>now()) AS typing,
      EXISTS(
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
           OR (b.blocker_id=u.id AND b.blocked_id=$2)
      ) AS blocked_with_viewer
    FROM conversation_members cm
    JOIN users u ON u.id=cm.user_id
    LEFT JOIN sensitive_message_permissions permission
      ON permission.receiver_id=$2
     AND permission.sender_id=u.id
    LEFT JOIN user_chat_presence p ON p.user_id=u.id
    WHERE cm.conversation_id=$1
    ORDER BY
      CASE cm.member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      lower(u.display_name),
      u.id
  `,[conversationId,userId]);

  const row=conversation.rows[0];
  const members=participants.rows;
  const isGroup=row.conversation_type==='group';
  const other=isGroup ? null : members.find(member=>String(member.id)!==String(userId)) || null;
  return {
    ...row,
    is_group:isGroup,
    participants:members,
    member_count:members.length,
    other
  };
}

async function otherMember(conversationId,userId){
  const details=await conversationDetails(conversationId,userId);
  return details?.other || null;
}

async function inviteEligibility(actorId,targetId){
  if(String(actorId)===String(targetId))return {ok:false,error:'cannot_message_self'};
  const target=await db.query(`
    SELECT id,username,display_name,avatar_url,status,message_privacy
      FROM users
     WHERE id=$1
     LIMIT 1
  `,[targetId]);
  if(!target.rowCount || target.rows[0].status!=='active'){
    return {ok:false,error:'user_not_found'};
  }

  const blocked=await db.query(`
    SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2)
        OR (blocker_id=$2 AND blocked_id=$1)
     LIMIT 1
  `,[actorId,targetId]);
  if(blocked.rowCount)return {ok:false,error:'messaging_blocked'};

  const user=target.rows[0];
  if(user.message_privacy==='no_one'){
    return {ok:false,error:'message_privacy_denied'};
  }
  if(user.message_privacy==='following'){
    const follows=await db.query(
      'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 LIMIT 1',
      [targetId,actorId]
    );
    if(!follows.rowCount)return {ok:false,error:'message_privacy_following_only'};
  }

  return {ok:true,user};
}

router.get('/conversations', async (req, res) => {
  const filter=String(req.query.filter || 'all');
  const q=String(req.query.q || '').trim().slice(0,100);
  if(!['all','unread','archived'].includes(filter)){
    return res.status(400).json({error:'invalid_conversation_filter'});
  }

  const result=await db.query(`
    SELECT
      c.id,c.conversation_type,c.title,c.created_by,c.updated_at,
      cm.member_role,cm.is_pinned,cm.is_archived,cm.notifications_muted,cm.last_read_at,
      last_message.body AS last_body,
      last_message.content_level AS last_content_level,
      last_message.created_at AS last_message_at,
      last_message.sender_id AS last_sender_id,
      last_sender.display_name AS last_sender_display_name,
      (
        SELECT count(*)::int
          FROM messages unread
         WHERE unread.conversation_id=c.id
           AND unread.sender_id<>$1
           AND unread.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
      ) AS unread_count
    FROM conversation_members cm
    JOIN conversations c ON c.id=cm.conversation_id
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN shared_post_id IS NOT NULL AND btrim(body)='' THEN 'Publicación compartida'
          ELSE body
        END AS body,
        content_level,created_at,sender_id
        FROM messages
       WHERE conversation_id=c.id
       ORDER BY created_at DESC,id DESC
       LIMIT 1
    ) last_message ON true
    LEFT JOIN users last_sender ON last_sender.id=last_message.sender_id
    WHERE cm.user_id=$1
      AND (
        ($2='all' AND cm.is_archived=false)
        OR ($2='archived' AND cm.is_archived=true)
        OR ($2='unread' AND cm.is_archived=false AND EXISTS(
          SELECT 1 FROM messages unread
           WHERE unread.conversation_id=c.id
             AND unread.sender_id<>$1
             AND unread.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
        ))
      )
      AND (
        c.conversation_type='group'
        OR EXISTS(
          SELECT 1
            FROM conversation_members direct_member
            JOIN users direct_user ON direct_user.id=direct_member.user_id
           WHERE direct_member.conversation_id=c.id
             AND direct_member.user_id<>$1
             AND direct_user.status='active'
             AND NOT EXISTS(
               SELECT 1 FROM blocks b
                WHERE (b.blocker_id=$1 AND b.blocked_id=direct_user.id)
                   OR (b.blocker_id=direct_user.id AND b.blocked_id=$1)
             )
        )
      )
      AND (
        $3=''
        OR (c.conversation_type='group' AND COALESCE(c.title,'') ILIKE '%' || $3 || '%')
        OR EXISTS(
          SELECT 1
            FROM conversation_members search_member
            JOIN users search_user ON search_user.id=search_member.user_id
           WHERE search_member.conversation_id=c.id
             AND search_member.user_id<>$1
             AND (
               search_user.username ILIKE '%' || $3 || '%'
               OR search_user.display_name ILIKE '%' || $3 || '%'
             )
        )
      )
    ORDER BY
      cm.is_pinned DESC,
      CASE WHEN EXISTS(
        SELECT 1 FROM messages unread
         WHERE unread.conversation_id=c.id
           AND unread.sender_id<>$1
           AND unread.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
      ) THEN 0 ELSE 1 END,
      COALESCE(last_message.created_at,c.updated_at) DESC
    LIMIT 100
  `,[req.user.id,filter,q]);

  const conversationIds=result.rows.map(row=>String(row.id));
  const participantResult=conversationIds.length
    ? await db.query(`
        SELECT
          cm.conversation_id,
          cm.member_role,
          u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,u.status,
          p.last_seen_at,
          (p.last_seen_at>now()-interval '45 seconds') AS online
        FROM conversation_members cm
        JOIN users u ON u.id=cm.user_id
        LEFT JOIN user_chat_presence p ON p.user_id=u.id
        WHERE cm.conversation_id=ANY($1::bigint[])
          AND u.status='active'
        ORDER BY cm.conversation_id,
          CASE cm.member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          lower(u.display_name)
      `,[conversationIds])
    : {rows:[]};

  const byConversation=new Map();
  for(const participant of participantResult.rows){
    const key=String(participant.conversation_id);
    if(!byConversation.has(key))byConversation.set(key,[]);
    byConversation.get(key).push(participant);
  }

  const conversations=result.rows.map(row=>{
    const participants=byConversation.get(String(row.id)) || [];
    const isGroup=row.conversation_type==='group';
    const other=isGroup ? null : participants.find(p=>String(p.id)!==String(req.user.id)) || null;
    return {
      ...row,
      is_group:isGroup,
      member_count:participants.length,
      participants:isGroup ? participants : undefined,
      other_user_id:other?.id || null,
      username:other?.username || null,
      display_name:other?.display_name || null,
      avatar_url:other?.avatar_url || null,
      creator_verified:other?.creator_verified || false,
      other_last_seen_at:other?.last_seen_at || null,
      other_online:other?.online===true
    };
  });

  const summary=await db.query(`
    SELECT
      count(*) FILTER (WHERE is_archived=false)::int active,
      count(*) FILTER (WHERE is_archived=true)::int archived,
      count(*) FILTER (
        WHERE is_archived=false
          AND EXISTS(
            SELECT 1 FROM messages unread
             WHERE unread.conversation_id=conversation_members.conversation_id
               AND unread.sender_id<>$1
               AND unread.created_at>COALESCE(conversation_members.last_read_at,to_timestamp(0))
          )
      )::int unread,
      count(*) FILTER (WHERE is_archived=false AND is_pinned=true)::int pinned
    FROM conversation_members
    WHERE user_id=$1
  `,[req.user.id]);

  res.json({
    filter,
    q,
    summary:summary.rows[0] || {active:0,archived:0,unread:0,pinned:0},
    conversations
  });
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
     JOIN conversations direct_conversation ON direct_conversation.id=cm1.conversation_id
     WHERE cm1.user_id=$1 AND cm2.user_id=$2
       AND direct_conversation.conversation_type='direct'
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
    const c = await client.query(`
      INSERT INTO conversations(conversation_type,created_by)
      VALUES ('direct',$1)
      RETURNING id
    `,[req.user.id]);
    const id = c.rows[0].id;
    await client.query(`
      INSERT INTO conversation_members (conversation_id,user_id,member_role)
      VALUES ($1,$2,'owner'),($1,$3,'member')
    `, [id, req.user.id, targetId]);
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


const createGroupSchema=z.object({
  title:z.string().trim().min(1).max(120),
  usernames:z.array(z.string().trim().min(1).max(30)).min(2).max(19)
});

router.post('/groups',async(req,res)=>{
  const parsed=createGroupSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_group'});

  const normalized=[...new Set(
    parsed.data.usernames
      .map(value=>String(value).replace(/^@/,'').trim().toLowerCase())
      .filter(Boolean)
  )];
  if(normalized.length<2)return res.status(400).json({error:'group_requires_two_invitees'});

  const targets=await db.query(`
    SELECT id,username,display_name,avatar_url,status,message_privacy
      FROM users
     WHERE lower(username)=ANY($1::text[])
  `,[normalized]);

  if(targets.rowCount!==normalized.length){
    return res.status(404).json({error:'group_user_not_found'});
  }

  const eligible=[];
  for(const target of targets.rows){
    const check=await inviteEligibility(req.user.id,target.id);
    if(!check.ok){
      return res.status(
        check.error==='user_not_found' ? 404 :
        check.error==='cannot_message_self' || check.error==='invalid_data' ? 400 : 403
      ).json({error:check.error,username:target.username});
    }
    eligible.push(check.user);
  }

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const created=await client.query(`
      INSERT INTO conversations(conversation_type,title,created_by)
      VALUES ('group',$1,$2)
      RETURNING id,title,created_by
    `,[parsed.data.title,req.user.id]);
    const conversationId=created.rows[0].id;

    await client.query(`
      INSERT INTO conversation_members(conversation_id,user_id,member_role)
      VALUES ($1,$2,'owner')
    `,[conversationId,req.user.id]);

    for(const target of eligible){
      await client.query(`
        INSERT INTO conversation_members(conversation_id,user_id,member_role)
        VALUES ($1,$2,'member')
      `,[conversationId,target.id]);
    }

    await client.query(`
      INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)
      SELECT member.user_id,$2,'message','conversation',$1,$3
        FROM conversation_members member
       WHERE member.conversation_id=$1
         AND member.user_id<>$2
    `,[
      conversationId,
      req.user.id,
      `Te han añadido al grupo “${parsed.data.title}”.`
    ]);

    await client.query('COMMIT');
    res.status(201).json({
      ok:true,
      conversationId,
      group:{
        id:conversationId,
        title:parsed.data.title,
        memberCount:eligible.length+1
      }
    });
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad group create failed:',error);
    res.status(500).json({error:'group_create_failed'});
  }finally{
    client.release();
  }
});

const groupTitleSchema=z.object({
  title:z.string().trim().min(1).max(120)
});

router.patch('/conversations/:id/group',async(req,res)=>{
  const parsed=groupTitleSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_group_title'});
  const details=await conversationDetails(req.params.id,req.user.id);
  if(!details || !details.is_group)return res.status(404).json({error:'group_not_found'});
  if(!['owner','admin'].includes(details.member_role)){
    return res.status(403).json({error:'group_admin_required'});
  }

  const updated=await db.query(`
    UPDATE conversations
       SET title=$2,updated_at=now()
     WHERE id=$1 AND conversation_type='group'
     RETURNING id,title,updated_at
  `,[req.params.id,parsed.data.title]);
  res.json({ok:true,group:updated.rows[0]});
});

const addGroupMemberSchema=z.object({
  username:z.string().trim().min(1).max(30)
});

router.post('/conversations/:id/group/members',async(req,res)=>{
  const parsed=addGroupMemberSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_group_member'});
  const details=await conversationDetails(req.params.id,req.user.id);
  if(!details || !details.is_group)return res.status(404).json({error:'group_not_found'});
  if(!['owner','admin'].includes(details.member_role)){
    return res.status(403).json({error:'group_admin_required'});
  }
  if(details.member_count>=20)return res.status(409).json({error:'group_member_limit'});

  const username=parsed.data.username.replace(/^@/,'');
  const target=await db.query(
    'SELECT id,username FROM users WHERE lower(username)=lower($1) LIMIT 1',
    [username]
  );
  if(!target.rowCount)return res.status(404).json({error:'user_not_found'});

  const targetId=target.rows[0].id;
  if(details.participants.some(member=>String(member.id)===String(targetId))){
    return res.status(409).json({error:'already_group_member'});
  }

  const check=await inviteEligibility(req.user.id,targetId);
  if(!check.ok){
    return res.status(check.error==='user_not_found' ? 404 : 403).json({error:check.error});
  }

  await db.query(`
    INSERT INTO conversation_members(conversation_id,user_id,member_role)
    VALUES ($1,$2,'member')
  `,[req.params.id,targetId]);

  await db.query(`
    UPDATE conversations SET updated_at=now() WHERE id=$1
  `,[req.params.id]);

  await db.query(`
    INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)
    VALUES ($1,$2,'message','conversation',$3,$4)
  `,[
    targetId,
    req.user.id,
    req.params.id,
    `Te han añadido al grupo “${details.title || 'Grupo'}”.`
  ]);

  res.status(201).json({ok:true,member:check.user});
});

router.delete('/conversations/:id/group/members/:userId',async(req,res)=>{
  const details=await conversationDetails(req.params.id,req.user.id);
  if(!details || !details.is_group)return res.status(404).json({error:'group_not_found'});
  if(!['owner','admin'].includes(details.member_role)){
    return res.status(403).json({error:'group_admin_required'});
  }

  const target=details.participants.find(member=>String(member.id)===String(req.params.userId));
  if(!target)return res.status(404).json({error:'group_member_not_found'});
  if(target.member_role==='owner')return res.status(409).json({error:'cannot_remove_group_owner'});
  if(details.member_role==='admin' && target.member_role==='admin'){
    return res.status(403).json({error:'owner_required'});
  }

  await db.query(
    'DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',
    [req.params.id,req.params.userId]
  );
  await db.query('UPDATE conversations SET updated_at=now() WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

router.post('/conversations/:id/group/leave',async(req,res)=>{
  const details=await conversationDetails(req.params.id,req.user.id);
  if(!details || !details.is_group)return res.status(404).json({error:'group_not_found'});
  if(details.member_role==='owner'){
    return res.status(409).json({error:'group_owner_cannot_leave'});
  }

  await db.query(
    'DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',
    [req.params.id,req.user.id]
  );
  await db.query('UPDATE conversations SET updated_at=now() WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

router.delete('/conversations/:id/group',async(req,res)=>{
  const details=await conversationDetails(req.params.id,req.user.id);
  if(!details || !details.is_group)return res.status(404).json({error:'group_not_found'});
  if(details.member_role!=='owner'){
    return res.status(403).json({error:'group_owner_required'});
  }
  await db.query('DELETE FROM conversations WHERE id=$1',[req.params.id]);
  res.json({ok:true});
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

const presenceSchema=z.object({
  conversationId:z.coerce.number().int().positive().nullable().optional(),
  typing:z.boolean().optional().default(false)
});

router.post('/presence',async(req,res)=>{
  const parsed=presenceSchema.safeParse(req.body || {});
  if(!parsed.success)return res.status(400).json({error:'invalid_presence'});

  const conversationId=parsed.data.conversationId || null;
  if(conversationId && !(await conversationForUser(conversationId,req.user.id))){
    return res.status(404).json({error:'conversation_not_found'});
  }

  const result=await db.query(`
    INSERT INTO user_chat_presence(
      user_id,last_seen_at,active_conversation_id,typing_until,updated_at
    )
    VALUES(
      $1,now(),$2,
      CASE WHEN $3::boolean THEN now()+interval '7 seconds' ELSE NULL END,
      now()
    )
    ON CONFLICT(user_id) DO UPDATE
      SET last_seen_at=now(),
          active_conversation_id=excluded.active_conversation_id,
          typing_until=excluded.typing_until,
          updated_at=now()
    RETURNING last_seen_at,active_conversation_id,typing_until
  `,[req.user.id,conversationId,parsed.data.typing===true]);

  res.json({ok:true,presence:result.rows[0]});
});

router.get('/conversations/:id/messages', async (req, res) => {
  const id=req.params.id;
  const details=await conversationDetails(id,req.user.id);
  if(!details)return res.status(404).json({error:'conversation_not_found'});
  if(!details.is_group && details.other?.blocked_with_viewer){
    return res.status(403).json({error:'messaging_blocked'});
  }

  const viewer=await userRow(req.user.id);
  const participantIds=details.participants
    .filter(member=>String(member.id)!==String(req.user.id))
    .map(member=>String(member.id));

  const permissionResult=(viewer?.age_verified && participantIds.length)
    ? await db.query(`
        SELECT sender_id
          FROM sensitive_message_permissions
         WHERE receiver_id=$1
           AND sender_id=ANY($2::bigint[])
           AND allowed=true
      `,[req.user.id,participantIds])
    : {rows:[]};
  const allowedSenders=new Set(permissionResult.rows.map(row=>String(row.sender_id)));

  const blockedResult=participantIds.length
    ? await db.query(`
        SELECT CASE WHEN blocker_id=$1 THEN blocked_id ELSE blocker_id END AS user_id
          FROM blocks
         WHERE (blocker_id=$1 AND blocked_id=ANY($2::bigint[]))
            OR (blocked_id=$1 AND blocker_id=ANY($2::bigint[]))
      `,[req.user.id,participantIds])
    : {rows:[]};
  const blockedSenders=new Set(blockedResult.rows.map(row=>String(row.user_id)));

  const r=await db.query(`
    SELECT
      m.id,m.sender_id,m.body,m.media_url,m.media_type,m.media_provider,m.external_id,m.playback_url,
      m.content_level,m.created_at,m.reply_to_message_id,
      u.username,u.display_name,u.avatar_url,
      reply.id AS reply_id,
      reply.sender_id AS reply_sender_id,
      reply.body AS reply_body,
      reply.media_type AS reply_media_type,
      reply.content_level AS reply_content_level,
      reply.created_at AS reply_created_at,
      reply_user.username AS reply_username,
      reply_user.display_name AS reply_display_name
    FROM messages m
    JOIN users u ON u.id=m.sender_id
    LEFT JOIN messages reply ON reply.id=m.reply_to_message_id AND reply.conversation_id=m.conversation_id
    LEFT JOIN users reply_user ON reply_user.id=reply.sender_id
    WHERE m.conversation_id=$1
      AND m.created_at >= $3
      AND (
        m.sender_id=$2
        OR NOT EXISTS(
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=m.sender_id)
              OR (b.blocker_id=m.sender_id AND b.blocked_id=$2)
        )
      )
    ORDER BY m.created_at ASC,m.id ASC
    LIMIT 300
  `,[
    id,
    req.user.id,
    details.is_group ? details.viewer_joined_at : new Date(0)
  ]);

  const messageIds=r.rows.map(row=>String(row.id));
  const reactionResult=messageIds.length
    ? await db.query(`
        SELECT
          message_id,
          reaction,
          count(*)::int AS count,
          bool_or(user_id=$2) AS reacted_by_me
        FROM message_reactions
        WHERE message_id=ANY($1::bigint[])
        GROUP BY message_id,reaction
        ORDER BY message_id,reaction
      `,[messageIds,req.user.id])
    : {rows:[]};

  const reactionsByMessage=new Map();
  for(const row of reactionResult.rows){
    const key=String(row.message_id);
    if(!reactionsByMessage.has(key))reactionsByMessage.set(key,[]);
    reactionsByMessage.get(key).push({
      reaction:row.reaction,
      count:Number(row.count || 0),
      reacted_by_me:row.reacted_by_me===true
    });
  }

  const readStateResult=await db.query(`
    SELECT user_id,last_read_at,joined_at
      FROM conversation_members
     WHERE conversation_id=$1
       AND user_id<>$2
  `,[id,req.user.id]);
  const readStates=readStateResult.rows.map(row=>({
    userId:String(row.user_id),
    at:row.last_read_at ? new Date(row.last_read_at).getTime() : 0,
    joinedAt:row.joined_at ? new Date(row.joined_at).getTime() : 0
  }));

  const messages=r.rows.map(m=>{
    const isOwn=String(m.sender_id)===String(req.user.id);
    const senderAllowed=isOwn || allowedSenders.has(String(m.sender_id));
    const gated=!isOwn && m.content_level!=='normal' && !senderAllowed;
    const createdAt=new Date(m.created_at).getTime();
    const eligibleReaders=isOwn
      ? readStates.filter(state=>!state.joinedAt || state.joinedAt<=createdAt)
      : [];
    const seenCount=isOwn
      ? eligibleReaders.filter(state=>state.at && state.at>=createdAt).length
      : 0;

    const replyPreview=m.reply_id ? (() => {
      const replyBeforeJoin=!!(
        details.is_group &&
        m.reply_created_at &&
        new Date(m.reply_created_at).getTime()<new Date(details.viewer_joined_at).getTime()
      );
      if(replyBeforeJoin){
        return {
          id:m.reply_id,
          sender_id:m.reply_sender_id,
          username:null,
          display_name:null,
          text:'Mensaje anterior a tu incorporación',
          gated:true
        };
      }

      const replyBlocked=blockedSenders.has(String(m.reply_sender_id));
      if(replyBlocked){
        return {
          id:m.reply_id,
          sender_id:m.reply_sender_id,
          username:null,
          display_name:null,
          text:'Mensaje no disponible',
          gated:true
        };
      }

      const replyIsOwn=String(m.reply_sender_id)===String(req.user.id);
      const replyAllowed=replyIsOwn || allowedSenders.has(String(m.reply_sender_id));
      const replyGated=!replyIsOwn && m.reply_content_level!=='normal' && !replyAllowed;
      let text='';
      if(replyGated){
        text='Contenido sensible';
      }else if(String(m.reply_body || '').trim()){
        const raw=String(m.reply_body).trim();
        text=raw.length>160 ? raw.slice(0,157)+'…' : raw;
      }else if(m.reply_media_type==='image'){
        text='Foto';
      }else if(m.reply_media_type==='video'){
        text='Vídeo';
      }else{
        text='Mensaje';
      }
      return {
        id:m.reply_id,
        sender_id:m.reply_sender_id,
        username:m.reply_username,
        display_name:m.reply_display_name,
        text,
        gated:replyGated
      };
    })() : null;

    return {
      ...m,
      seen_count:seenCount,
      seen_by_other:!details.is_group && seenCount>0,
      seen_by_all:details.is_group && eligibleReaders.length>0 && seenCount>=eligibleReaders.length,
      reactions:reactionsByMessage.get(String(m.id)) || [],
      reply_preview:replyPreview,
      media_url:gated ? null : m.media_url,
      playback_url:gated ? null : m.playback_url,
      body:gated ? '' : m.body,
      gated,
      gate_reason:gated
        ? (viewer?.age_verified ? 'permission_required' : 'age_verification_required')
        : null
    };
  });

  const memberState=await db.query(`
    UPDATE conversation_members
       SET last_read_at=now()
     WHERE conversation_id=$1 AND user_id=$2
     RETURNING member_role,is_pinned,is_archived,notifications_muted,last_read_at
  `,[id,req.user.id]);

  await db.query(`
    INSERT INTO user_chat_presence(user_id,last_seen_at,active_conversation_id,typing_until,updated_at)
    VALUES ($1,now(),$2,NULL,now())
    ON CONFLICT(user_id) DO UPDATE
      SET last_seen_at=now(),
          active_conversation_id=excluded.active_conversation_id,
          typing_until=NULL,
          updated_at=now()
  `,[req.user.id,id]);

  const directSensitiveAllowed=!!(
    !details.is_group &&
    details.other &&
    allowedSenders.has(String(details.other.id))
  );

  res.json({
    messages,
    other:details.other,
    conversation:{
      id:details.id,
      conversation_type:details.conversation_type,
      is_group:details.is_group,
      title:details.title,
      created_by:details.created_by,
      member_role:details.member_role,
      member_count:details.member_count,
      participants:details.participants.map(member=>({
        id:member.id,
        username:member.username,
        display_name:member.display_name,
        avatar_url:member.avatar_url,
        creator_verified:member.creator_verified,
        member_role:member.member_role,
        sensitive_allowed:member.sensitive_allowed===true,
        online:member.online===true,
        typing:member.typing===true,
        blocked_with_viewer:member.blocked_with_viewer===true
      })),
      can_manage_group:details.is_group && ['owner','admin'].includes(details.member_role),
      can_delete_group:details.is_group && details.member_role==='owner'
    },
    sensitiveAllowed:directSensitiveAllowed,
    viewerAgeVerified:!!viewer?.age_verified,
    settings:memberState.rows[0] || {
      member_role:details.member_role,
      is_pinned:false,
      is_archived:false,
      notifications_muted:false
    }
  });
});
const messageSchema = z.object({
  body: z.string().max(4000).optional().default(''),
  mediaUrl: z.string().max(4096).optional().nullable(),
  mediaType: z.enum(['image','video']).optional().nullable(),
  mediaProvider: z.string().max(40).optional().nullable(),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  replyToMessageId:z.coerce.number().int().positive().optional().nullable(),
  sharedPostId:z.coerce.number().int().positive().optional().nullable(),
  contentLevel: z.enum(['normal','sensitive','nudity']).default('normal')
}).refine(v => v.body.trim() || v.mediaUrl || v.sharedPostId, { message: 'message_empty' });

router.post('/conversations/:id/messages', async (req, res) => {
  const id=req.params.id;

  try{
    const details=await conversationDetails(id,req.user.id);
    if(!details){
      return res.status(404).json({error:'conversation_not_found'});
    }
    if(!details.is_group && details.other?.blocked_with_viewer){
      return res.status(403).json({error:'messaging_blocked'});
    }

    const parsed=messageSchema.safeParse(req.body);
    if(!parsed.success){
      return res.status(400).json({error:'invalid_message'});
    }

    const d=parsed.data;
    let replyToMessageId=null;
    if(d.replyToMessageId){
      const replyTarget=await db.query(
        'SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 LIMIT 1',
        [d.replyToMessageId,id]
      );
      if(!replyTarget.rowCount){
        return res.status(400).json({error:'invalid_reply_message'});
      }
      replyToMessageId=replyTarget.rows[0].id;
    }

    let sharedPostId=null;
    if(d.sharedPostId){
      const shareable=await db.query(`
        SELECT p.id
          FROM posts p
          JOIN users author ON author.id=p.user_id
         WHERE p.id=$1
           AND p.moderation_status='published'
           AND p.audience='public'
           AND author.status='active'
           AND (
             p.user_id=$2
             OR NOT EXISTS(
               SELECT 1 FROM blocks b
                WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id)
                   OR (b.blocker_id=p.user_id AND b.blocked_id=$2)
             )
           )
         LIMIT 1
      `,[d.sharedPostId,req.user.id]);
      if(!shareable.rowCount){
        return res.status(400).json({error:'post_not_shareable'});
      }
      sharedPostId=shareable.rows[0].id;
    }

    const sender=await userRow(req.user.id);
    if(
      d.contentLevel==='nudity' &&
      (!sender?.creator_verified || !sender?.age_verified)
    ){
      return res.status(403).json({
        error:'verified_creator_required_for_nudity'
      });
    }

    const client=await db.pool.connect();
    let savedMessage;

    try{
      await client.query('BEGIN');

      const result=await client.query(`
        INSERT INTO messages(
          conversation_id,
          sender_id,
          body,
          media_url,
          media_type,
          media_provider,
          external_id,
          playback_url,
          content_level,
          reply_to_message_id,
          shared_post_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `,[
        id,
        req.user.id,
        d.body.trim(),
        d.mediaUrl,
        d.mediaType,
        d.mediaProvider,
        d.externalId,
        d.playbackUrl,
        d.contentLevel,
        replyToMessageId,
        sharedPostId
      ]);

      await client.query(
        'UPDATE conversations SET updated_at=now() WHERE id=$1',
        [id]
      );

      // Un nuevo mensaje devuelve la conversación a la bandeja activa
      // de todos sus miembros, igual para chat directo y grupo.
      await client.query(`
        UPDATE conversation_members
           SET is_archived=false
         WHERE conversation_id=$1
      `,[id]);

      await client.query('COMMIT');
      savedMessage=result.rows[0];
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{
      client.release();
    }

    try{
      const text=sharedPostId
        ? (
            details.is_group
              ? `${sender?.display_name || sender?.username || 'Alguien'} ha compartido una publicación en “${details.title || 'Grupo'}”.`
              : 'Te ha compartido una publicación.'
          )
        : details.is_group
          ? (
              d.contentLevel==='normal'
                ? `${sender?.display_name || sender?.username || 'Alguien'} ha escrito en “${details.title || 'Grupo'}”.`
                : `${sender?.display_name || sender?.username || 'Alguien'} ha enviado contenido sensible en “${details.title || 'Grupo'}”.`
            )
          : (
              d.contentLevel==='normal'
                ? 'Te ha enviado un mensaje.'
                : 'Te ha enviado contenido sensible.'
            );

      await db.query(`
        INSERT INTO notifications(
          user_id,actor_id,type,entity_type,entity_id,text
        )
        SELECT member.user_id,$2,'message','conversation',$1,$3
          FROM conversation_members member
         WHERE member.conversation_id=$1
           AND member.user_id<>$2
           AND member.notifications_muted=false
           AND NOT EXISTS(
             SELECT 1 FROM blocks b
              WHERE (b.blocker_id=member.user_id AND b.blocked_id=$2)
                 OR (b.blocker_id=$2 AND b.blocked_id=member.user_id)
           )
      `,[id,req.user.id,text]);
    }catch(notificationError){
      console.warn(
        'RedLibertad message notification failed after message was stored:',
        notificationError?.message || notificationError
      );
    }

    return res.status(201).json({
      ok:true,
      message:savedMessage
    });
  }catch(error){
    console.error('RedLibertad message send failed:',error);
    return res.status(500).json({error:'message_send_failed'});
  }
});
const reactionSchema=z.object({
  reaction:z.enum(['heart','like','laugh','fire','wow','sad'])
});

router.put('/conversations/:id/messages/:messageId/reaction',async(req,res)=>{
  if(!(await conversationForUser(req.params.id,req.user.id))){
    return res.status(404).json({error:'conversation_not_found'});
  }
  const parsed=reactionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_reaction'});

  const message=await db.query(
    'SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 LIMIT 1',
    [req.params.messageId,req.params.id]
  );
  if(!message.rowCount)return res.status(404).json({error:'message_not_found'});

  await db.query(`
    INSERT INTO message_reactions(message_id,user_id,reaction,created_at,updated_at)
    VALUES ($1,$2,$3,now(),now())
    ON CONFLICT(message_id,user_id) DO UPDATE
      SET reaction=excluded.reaction,
          updated_at=now()
  `,[req.params.messageId,req.user.id,parsed.data.reaction]);

  res.json({ok:true,reaction:parsed.data.reaction});
});

router.delete('/conversations/:id/messages/:messageId/reaction',async(req,res)=>{
  if(!(await conversationForUser(req.params.id,req.user.id))){
    return res.status(404).json({error:'conversation_not_found'});
  }
  await db.query(`
    DELETE FROM message_reactions
     WHERE message_id=$1
       AND user_id=$2
       AND EXISTS(
         SELECT 1 FROM messages m
          WHERE m.id=message_reactions.message_id
            AND m.conversation_id=$3
       )
  `,[req.params.messageId,req.user.id,req.params.id]);
  res.json({ok:true});
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
