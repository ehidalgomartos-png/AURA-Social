'use strict';

const express=require('express');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');
const SNOOZE_DAYS=7;
const MAX_ITEMS=3;

function createRetentionRouter({database=db,auth=requireAuth}={}){
const router=express.Router();
let schemaReady=null;
function ensureRetentionSchema(){
  if(!schemaReady){
    schemaReady=database.query(
      "CREATE TABLE IF NOT EXISTS community_return_snoozes_v220 ("+
      "user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
      "community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,"+
      "hidden_until TIMESTAMPTZ NOT NULL,"+
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
      "PRIMARY KEY(user_id,community_id))"
    ).then(()=>database.query(
      'CREATE INDEX IF NOT EXISTS idx_community_return_snoozes_v220_user_until '+
      'ON community_return_snoozes_v220(user_id,hidden_until)'
    )).catch(error=>{schemaReady=null;throw error;});
  }
  return schemaReady;
}

const SUGGESTIONS_SQL="WITH joined AS (  SELECT c.id,c.name,cm.joined_at FROM community_members cm  JOIN communities c ON c.id=cm.community_id  JOIN users owner ON owner.id=c.owner_id  WHERE cm.user_id=$1 AND owner.status='active'  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE    (b.blocker_id=$1 AND b.blocked_id=c.owner_id) OR (b.blocker_id=c.owner_id AND b.blocked_id=$1))  AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=c.owner_id)  AND NOT EXISTS (SELECT 1 FROM community_return_snoozes_v220 h    WHERE h.user_id=$1 AND h.community_id=c.id AND h.hidden_until>now())  ORDER BY cm.joined_at DESC LIMIT 40 ) SELECT j.id,j.name,recent.recent_count,recent.last_post_at FROM joined j JOIN LATERAL (  SELECT count(*)::int AS recent_count,max(recent_post.created_at) AS last_post_at  FROM (SELECT cp.created_at FROM community_posts cp  JOIN users author ON author.id=cp.user_id  WHERE cp.community_id=j.id AND cp.user_id<>$1  AND cp.moderation_status='published' AND cp.content_level='normal'  AND cp.created_at>=now()-interval '7 days' AND author.status='active'  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE     (b.blocker_id=$1 AND b.blocked_id=cp.user_id) OR (b.blocker_id=cp.user_id AND b.blocked_id=$1))  AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=cp.user_id)  ORDER BY cp.created_at DESC LIMIT 10) recent_post ) recent ON recent.recent_count>0 ORDER BY recent.recent_count DESC,recent.last_post_at DESC,j.id DESC LIMIT 3";

function safeCommunityReturn(row){
  return {
    communityId:String(row.id),
    name:String(row.name||'').slice(0,80),
    recentCount:Math.max(0,Math.min(10,Number(row.recent_count)||0)),
    lastPostAt:row.last_post_at||null
  };
}

router.get('/retention/communities',auth,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    await ensureRetentionSchema();
    const result=await database.query(SUGGESTIONS_SQL,[req.user.id]);
    res.json({
      items:result.rows.map(safeCommunityReturn),
      intervalDays:7,countIsExact:false,scope:'joined_communities_only',
      notificationsSent:false,snoozeDays:SNOOZE_DAYS
    });
  }catch(_){res.status(503).json({error:'community_return_unavailable'});}
});

router.post('/retention/communities/:id/snooze',auth,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const id=String(req.params.id||'');
  if(!/^[1-9][0-9]{0,17}$/.test(id))return res.status(400).json({error:'invalid_community_id'});
  try{
    await ensureRetentionSchema();
    const result=await database.query(
      "INSERT INTO community_return_snoozes_v220(user_id,community_id,hidden_until) "+
      "SELECT $1,c.id,now()+interval '7 days' FROM communities c "+
      "JOIN community_members cm ON cm.community_id=c.id AND cm.user_id=$1 "+
      "WHERE c.id=$2::bigint "+
      "ON CONFLICT(user_id,community_id) DO UPDATE "+
      "SET hidden_until=excluded.hidden_until,updated_at=now() "+
      "RETURNING community_id,hidden_until",
      [req.user.id,id]
    );
    if(!result.rowCount)return res.status(404).json({error:'community_not_joined'});
    res.json({ok:true,hiddenUntil:result.rows[0].hidden_until,snoozeDays:SNOOZE_DAYS});
  }catch(_){res.status(503).json({error:'community_snooze_failed'});}
});

return router;
}
module.exports={router:createRetentionRouter(),createRetentionRouter,SUGGESTIONS_SQL,safeCommunityReturn,MAX_ITEMS,SNOOZE_DAYS};
