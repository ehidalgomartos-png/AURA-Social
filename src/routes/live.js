const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function snapshotFor(userId) {
  const [notifications,messages] = await Promise.all([
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
    `,[userId])
  ]);

  return {
    notificationUnread:Number(notifications.rows[0]?.unread || 0),
    latestNotificationId:String(notifications.rows[0]?.latest_id || '0'),
    messageUnread:Number(messages.rows[0]?.unread || 0),
    latestIncomingMessageId:String(messages.rows[0]?.latest_incoming_id || '0'),
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
        latestIncomingMessageId:payload.latestIncomingMessageId
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
  const interval=setInterval(()=>emitSnapshot(false),10000);

  req.on('close',()=>{
    closed=true;
    clearInterval(interval);
  });
});

module.exports=router;
