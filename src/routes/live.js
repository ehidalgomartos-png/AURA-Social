const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function snapshotFor(userId) {
  const [notifications,messages,presence,reactionActivity] = await Promise.all([
    db.query(`
      SELECT
        count(*) FILTER (WHERE n.read_at IS NULL)::int AS unread,
        COALESCE(max(n.id),0)::bigint AS latest_id
      FROM notifications n
      WHERE n.user_id=$1
        AND (
          n.actor_id IS NULL
          OR n.actor_id NOT IN (
            SELECT muted_id FROM mutes WHERE muter_id=$1
          )
        )
    `,[userId]),
    db.query(`
      SELECT
        count(*) FILTER (
          WHERE m.sender_id<>$1
            AND m.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
        )::int AS unread,
        COALESCE(max(m.id) FILTER (WHERE m.sender_id<>$1),0)::bigint AS latest_incoming_id
      FROM conversation_members cm
      JOIN messages m ON m.conversation_id=cm.conversation_id
      WHERE cm.user_id=$1
        AND cm.is_archived=false
    `,[userId]),
    db.query(`
      SELECT
        mine.conversation_id,
        u.id AS user_id,
        p.last_seen_at,
        other_member.last_read_at AS other_last_read_at,
        (p.last_seen_at>now()-interval '45 seconds') AS online,
        (
          p.active_conversation_id=mine.conversation_id
          AND p.typing_until>now()
        ) AS typing
      FROM conversation_members mine
      JOIN conversation_members other_member
        ON other_member.conversation_id=mine.conversation_id
       AND other_member.user_id<>$1
      JOIN users u ON u.id=other_member.user_id
      LEFT JOIN user_chat_presence p ON p.user_id=u.id
      WHERE mine.user_id=$1
        AND u.status='active'
        AND u.id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id=$1
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id=$1
        )
      ORDER BY mine.conversation_id
      LIMIT 120
    `,[userId]),
    db.query(`
      SELECT max(mr.updated_at) AS latest_reaction_at
        FROM conversation_members cm
        JOIN messages m ON m.conversation_id=cm.conversation_id
        JOIN message_reactions mr ON mr.message_id=m.id
       WHERE cm.user_id=$1
         AND cm.is_archived=false
    `,[userId])
  ]);

  return {
    notificationUnread:Number(notifications.rows[0]?.unread || 0),
    latestNotificationId:String(notifications.rows[0]?.latest_id || '0'),
    messageUnread:Number(messages.rows[0]?.unread || 0),
    latestIncomingMessageId:String(messages.rows[0]?.latest_incoming_id || '0'),
    latestReactionAt:reactionActivity.rows[0]?.latest_reaction_at || null,
    conversationPresence:presence.rows.map(row=>({
      conversationId:String(row.conversation_id),
      userId:String(row.user_id),
      online:row.online===true,
      typing:row.typing===true,
      lastSeenAt:row.last_seen_at || null,
      otherLastReadAt:row.other_last_read_at || null
    })),
    serverTime:new Date().toISOString()
  };
}

router.get('/stream',requireAuth,async(req,res)=>{
  res.status(200);
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders?.();

  let closed=false;
  let lastSignature='';

  const send=(event,payload)=>{
    if(closed)return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const emitSnapshot=async(first=false)=>{
    try{
      const payload=await snapshotFor(req.user.id);
      const signature=JSON.stringify({
        notificationUnread:payload.notificationUnread,
        latestNotificationId:payload.latestNotificationId,
        messageUnread:payload.messageUnread,
        latestIncomingMessageId:payload.latestIncomingMessageId,
        latestReactionAt:payload.latestReactionAt,
        conversationPresence:payload.conversationPresence.map(item=>[
          item.conversationId,
          item.online,
          item.typing,
          item.otherLastReadAt
        ])
      });
      if(first || signature!==lastSignature){
        lastSignature=signature;
        send(first ? 'snapshot' : 'activity',payload);
      }else{
        res.write(': heartbeat\n\n');
      }
    }catch(error){
      console.warn('RedLibertad live stream snapshot failed:',error?.message || error);
      send('stream-error',{retry:true,serverTime:new Date().toISOString()});
    }
  };

  await emitSnapshot(true);
  const interval=setInterval(()=>emitSnapshot(false),4000);

  req.on('close',()=>{
    closed=true;
    clearInterval(interval);
  });
});

module.exports=router;
