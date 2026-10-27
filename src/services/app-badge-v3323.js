'use strict';
// Message notifications mirror unread chat messages; never count both twice.
const db=require('../db');
const BADGE_UNREAD_SQL_V3323=`
SELECT
 (SELECT count(*)::int FROM notifications n
   WHERE n.user_id=$1 AND n.read_at IS NULL AND n.type<>'message'
     AND (n.actor_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM mutes mute
       WHERE mute.muter_id=$1 AND mute.muted_id=n.actor_id
     ))) AS notification_unread,
 (SELECT count(*)::int FROM conversation_members cm
    JOIN messages m ON m.conversation_id=cm.conversation_id
   WHERE cm.user_id=$1 AND cm.is_archived=false AND m.sender_id<>$1
     AND m.created_at>COALESCE(cm.last_read_at,to_timestamp(0))
 ) AS message_unread
`;
function safeUnreadV3323(n){
 const value=Number(n);
 return Number.isSafeInteger(value)&&value>=0?Math.min(9999,value):0;
}
function combineUnreadV3323(messages,notifications){
 return Math.min(9999,safeUnreadV3323(messages)+safeUnreadV3323(notifications));
}
async function getBadgeCountsV3323(userId,{database=db}={}){
 const {rows}=await database.query(BADGE_UNREAD_SQL_V3323,[userId]);
 const messages=safeUnreadV3323(rows[0]?.message_unread);
 const notifications=safeUnreadV3323(rows[0]?.notification_unread);
 return {unreadMessages:messages,unreadNotifications:notifications,
  badgeUnread:combineUnreadV3323(messages,notifications)};
}
module.exports={BADGE_UNREAD_SQL_V3323,safeUnreadV3323,combineUnreadV3323,getBadgeCountsV3323};
