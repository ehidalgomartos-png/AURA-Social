const express=require('express');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');

const router=express.Router();
let relationshipV165Ready=null;
async function ensureRelationshipV165(){
  if(!relationshipV165Ready){
    relationshipV165Ready=db.query(`
      CREATE TABLE IF NOT EXISTS relationship_hidden_suggestions (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,target_user_id),
        CHECK(user_id<>target_user_id)
      )
    `).then(()=>db.query('CREATE INDEX IF NOT EXISTS idx_relationship_hidden_suggestions_user ON relationship_hidden_suggestions(user_id,hidden_at DESC)'))
      .catch(error=>{relationshipV165Ready=null;throw error;});
  }
  return relationshipV165Ready;
}
router.use(requireAuth);
router.use(async(_req,res,next)=>{try{await ensureRelationshipV165();next();}catch(error){console.error('RedLibertad V1.65 relationship bootstrap failed:',error);res.status(500).json({error:'relationship_bootstrap_failed'});}});

router.get('/suggestions',async(req,res)=>{
  const mode=['all','interests','communities','reconnect','active'].includes(String(req.query.mode||''))?String(req.query.mode):'all';
  const result=await db.query(`
    SELECT
      u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,u.location_label,u.show_activity,
      GREATEST(mine.created_at,theirs.created_at) AS connection_since,
      (
        SELECT count(*)::int
          FROM user_interests target_interest
         WHERE target_interest.user_id=u.id
           AND target_interest.interest IN (SELECT own_interest.interest FROM user_interests own_interest WHERE own_interest.user_id=$1)
      ) AS shared_interest_count,
      COALESCE((
        SELECT array_agg(shared_interest.interest ORDER BY shared_interest.interest)
          FROM (
            SELECT target_interest.interest
              FROM user_interests target_interest
             WHERE target_interest.user_id=u.id
               AND target_interest.interest IN (SELECT own_interest.interest FROM user_interests own_interest WHERE own_interest.user_id=$1)
             ORDER BY target_interest.interest
             LIMIT 5
          ) shared_interest
      ),ARRAY[]::text[]) AS shared_interests,
      (
        SELECT count(*)::int
          FROM community_members theirs_cm
          JOIN community_members mine_cm ON mine_cm.community_id=theirs_cm.community_id AND mine_cm.user_id=$1
         WHERE theirs_cm.user_id=u.id
      ) AS shared_community_count,
      COALESCE((
        SELECT array_agg(shared_community.name ORDER BY shared_community.name)
          FROM (
            SELECT c.name
              FROM community_members theirs_cm
              JOIN community_members mine_cm ON mine_cm.community_id=theirs_cm.community_id AND mine_cm.user_id=$1
              JOIN communities c ON c.id=theirs_cm.community_id
             WHERE theirs_cm.user_id=u.id
             ORDER BY c.name
             LIMIT 4
          ) shared_community
      ),ARRAY[]::text[]) AS shared_communities,
      direct_chat.conversation_id AS direct_conversation_id,
      direct_chat.last_message_at,
      COALESCE(direct_chat.message_count,0)::int AS message_count,
      (
        SELECT count(*)::int FROM likes l
        JOIN posts p ON p.id=l.post_id
        WHERE p.moderation_status='published'
          AND l.created_at>=now()-interval '90 days'
          AND ((p.user_id=$1 AND l.user_id=u.id) OR (p.user_id=u.id AND l.user_id=$1))
      ) +
      (
        SELECT count(*)::int FROM comments cmt
        JOIN posts p ON p.id=cmt.post_id
        WHERE p.moderation_status='published'
          AND cmt.created_at>=now()-interval '90 days'
          AND ((p.user_id=$1 AND cmt.user_id=u.id) OR (p.user_id=u.id AND cmt.user_id=$1))
      ) AS interaction_count_90d,
      CASE WHEN u.show_activity THEN activity.last_activity_at ELSE NULL END AS last_activity_at
    FROM follows mine
    JOIN follows theirs ON theirs.follower_id=mine.following_id AND theirs.following_id=mine.follower_id
    JOIN users u ON u.id=mine.following_id
    LEFT JOIN LATERAL (
      SELECT c.id AS conversation_id,
             max(m.created_at) AS last_message_at,
             count(m.id)::int AS message_count
        FROM conversations c
        JOIN conversation_members self_member ON self_member.conversation_id=c.id AND self_member.user_id=$1
        JOIN conversation_members other_member ON other_member.conversation_id=c.id AND other_member.user_id=u.id
        LEFT JOIN messages m ON m.conversation_id=c.id
       WHERE c.conversation_type='direct'
         AND (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)=2
       GROUP BY c.id
       ORDER BY max(m.created_at) DESC NULLS LAST,c.id DESC
       LIMIT 1
    ) direct_chat ON true
    LEFT JOIN LATERAL (
      SELECT GREATEST(
        COALESCE((SELECT max(p.created_at) FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published'),'epoch'::timestamptz),
        COALESCE((SELECT max(s.created_at) FROM stories s WHERE s.user_id=u.id AND s.moderation_status='published'),'epoch'::timestamptz)
      ) AS last_activity_at
    ) activity ON true
    WHERE mine.follower_id=$1
      AND u.status='active' AND u.is_admin=false
      AND NOT EXISTS(SELECT 1 FROM relationship_hidden_suggestions hidden WHERE hidden.user_id=$1 AND hidden.target_user_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=u.id)
    ORDER BY u.id
    LIMIT 150
  `,[req.user.id]);

  const now=Date.now();
  const suggestions=result.rows.map(row=>{
    const sharedInterests=Number(row.shared_interest_count||0);
    const sharedCommunities=Number(row.shared_community_count||0);
    const interactions=Number(row.interaction_count_90d||0);
    const messageCount=Number(row.message_count||0);
    const lastMessage=row.last_message_at?new Date(row.last_message_at).getTime():0;
    const daysSinceMessage=lastMessage?Math.floor((now-lastMessage)/(24*60*60*1000)):null;
    const reconnect=messageCount>=4 && daysSinceMessage!==null && daysSinceMessage>=7 && daysSinceMessage<=120;
    const active=row.last_activity_at && new Date(row.last_activity_at).getTime()>=now-14*24*60*60*1000;

    let kind='active',reason='Conexión de tu red';
    const reasons=[];
    if(sharedInterests>=2)reasons.push(`${sharedInterests} intereses compartidos`);
    else if(sharedInterests===1)reasons.push('1 interés compartido');
    if(sharedCommunities>=1)reasons.push(`${sharedCommunities} ${sharedCommunities===1?'comunidad en común':'comunidades en común'}`);
    if(reconnect)reasons.push(`Conversación para retomar · hace ${daysSinceMessage} días`);
    if(interactions>=4)reasons.push('Interacción habitual reciente');

    if(reconnect){kind='reconnect';reason=`Quizá quieras retomar el contacto · última conversación hace ${daysSinceMessage} días`;}
    else if(sharedInterests>=2){kind='interests';reason=`${sharedInterests} intereses que compartís`;}
    else if(sharedCommunities>=1){kind='communities';reason=`${sharedCommunities} ${sharedCommunities===1?'comunidad compartida':'comunidades compartidas'}`;}
    else if(interactions>=4){kind='active';reason='Tenéis interacción habitual reciente';}
    else if(active){kind='active';reason='Conexión con actividad reciente';}

    const strength=sharedInterests*4+sharedCommunities*3+Math.min(interactions,12)+(reconnect?6:0)+(active?1:0);
    return {...row,kind,reason,reasons,days_since_message:daysSinceMessage,strength};
  }).filter(item=>{
    if(mode==='interests')return Number(item.shared_interest_count||0)>=1;
    if(mode==='communities')return Number(item.shared_community_count||0)>=1;
    if(mode==='reconnect')return item.kind==='reconnect';
    if(mode==='active')return item.kind==='active';
    return item.strength>0;
  }).sort((a,b)=>b.strength-a.strength || String(a.username).localeCompare(String(b.username))).slice(0,30);

  res.json({suggestions,mode});
});

router.post('/suggestions/:userId/hide',async(req,res)=>{
  const targetId=Number(req.params.userId);
  if(!Number.isInteger(targetId)||targetId<=0||String(targetId)===String(req.user.id))return res.status(400).json({error:'invalid_user'});
  const connection=await db.query(`
    SELECT 1 FROM follows a JOIN follows b ON b.follower_id=a.following_id AND b.following_id=a.follower_id
     WHERE a.follower_id=$1 AND a.following_id=$2 LIMIT 1
  `,[req.user.id,targetId]);
  if(!connection.rowCount)return res.status(404).json({error:'connection_not_found'});
  await db.query(`
    INSERT INTO relationship_hidden_suggestions(user_id,target_user_id,hidden_at)
    VALUES($1,$2,now())
    ON CONFLICT(user_id,target_user_id) DO UPDATE SET hidden_at=now()
  `,[req.user.id,targetId]);
  res.json({ok:true});
});

router.delete('/suggestions/:userId/hide',async(req,res)=>{
  await db.query('DELETE FROM relationship_hidden_suggestions WHERE user_id=$1 AND target_user_id=$2',[req.user.id,req.params.userId]);
  res.json({ok:true});
});

module.exports=router;
