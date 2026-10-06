const express=require('express');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');

const router=express.Router();
router.use(requireAuth);

function eventAccessWhere(viewer='$1',alias='e'){
  return `(
    ${alias}.creator_id=${viewer}
    OR ${alias}.visibility='public'
    OR (
      ${alias}.visibility='connections'
      AND EXISTS(SELECT 1 FROM follows a WHERE a.follower_id=${alias}.creator_id AND a.following_id=${viewer})
      AND EXISTS(SELECT 1 FROM follows b WHERE b.follower_id=${viewer} AND b.following_id=${alias}.creator_id)
    )
    OR (
      ${alias}.visibility='circles'
      AND EXISTS(
        SELECT 1 FROM event_circle_audiences eca
        JOIN connection_circles cc ON cc.id=eca.circle_id AND cc.user_id=${alias}.creator_id
        JOIN connection_circle_members ccm ON ccm.circle_id=cc.id AND ccm.connection_user_id=${viewer}
        WHERE eca.event_id=${alias}.id
      )
    )
    OR (
      ${alias}.visibility='community'
      AND ${alias}.community_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=${alias}.community_id AND cm.user_id=${viewer})
    )
  )`;
}

router.get('/',async(req,res)=>{
  const q=String(req.query.q||'').normalize('NFKC').trim().slice(0,100);
  const type=['all','people','posts','reels','hashtags','communities','events'].includes(String(req.query.type||''))?String(req.query.type):'all';
  if(q.length<2)return res.json({query:q,type,people:[],posts:[],reels:[],hashtags:[],communities:[],events:[]});
  const like=`%${q}%`;
  const exactPrefix=`${q}%`;
  const wants=name=>type==='all'||type===name;

  const peoplePromise=wants('people')?db.query(`
    SELECT u.id,u.username,u.display_name,u.bio,u.avatar_url,u.location_label,u.creator_verified,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follows a JOIN follows b ON a.follower_id=$1 AND a.following_id=u.id AND b.follower_id=u.id AND b.following_id=$1) AS connection
    FROM users u
    WHERE u.status='active' AND u.is_admin=false AND u.discoverable=true
      AND u.id<>$1
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=u.id)
      AND (u.username ILIKE $2 OR u.display_name ILIKE $2 OR u.bio ILIKE $2 OR u.location_label ILIKE $2)
    ORDER BY
      CASE WHEN u.username ILIKE $3 THEN 0 WHEN u.display_name ILIKE $3 THEN 1 ELSE 2 END,
      connection DESC,following DESC,u.creator_verified DESC,u.username ASC
    LIMIT 20
  `,[req.user.id,like,exactPrefix]):Promise.resolve({rows:[]});

  const contentPromise=(wants('posts')||wants('reels')||wants('hashtags'))?db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.playback_url,p.content_level,p.post_kind,p.created_at,
      u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified
    FROM posts p JOIN users u ON u.id=p.user_id
    WHERE p.moderation_status='published' AND p.audience='public'
      AND u.status='active' AND u.discoverable=true
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM discovery_hidden_items h WHERE h.user_id=$1 AND ((h.item_type='post' AND h.item_id=p.id) OR (h.item_type='user' AND h.item_id=p.user_id)))
      AND (p.caption ILIKE $2 OR u.username ILIKE $2 OR u.display_name ILIKE $2)
    ORDER BY
      CASE WHEN p.caption ILIKE $3 THEN 0 ELSE 1 END,
      p.created_at DESC,p.id DESC
    LIMIT 40
  `,[req.user.id,like,exactPrefix]):Promise.resolve({rows:[]});

  const communityPromise=wants('communities')?db.query(`
    SELECT c.id,c.name,c.description,c.avatar_url,c.privacy,c.category,c.updated_at,
      owner.username AS owner_username,
      EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=c.id AND cm.user_id=$1) AS is_member,
      (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS member_count
    FROM communities c JOIN users owner ON owner.id=c.owner_id
    WHERE owner.status='active'
      AND (c.privacy='public' OR EXISTS(SELECT 1 FROM community_members mine WHERE mine.community_id=c.id AND mine.user_id=$1))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.owner_id) OR (b.blocker_id=c.owner_id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=c.owner_id)
      AND (
        c.name ILIKE $2 OR c.description ILIKE $2 OR c.category ILIKE $2
        OR EXISTS(SELECT 1 FROM community_interests ci WHERE ci.community_id=c.id AND ci.interest ILIKE $2)
      )
    ORDER BY CASE WHEN c.name ILIKE $3 THEN 0 ELSE 1 END,is_member DESC,c.updated_at DESC
    LIMIT 20
  `,[req.user.id,like,exactPrefix]):Promise.resolve({rows:[]});

  const eventPromise=wants('events')?db.query(`
    SELECT e.id,e.title,e.description,e.event_type,e.starts_at,e.location_label,e.visibility,
      u.username,u.display_name,u.avatar_url,c.name AS community_name
    FROM social_events e
    JOIN users u ON u.id=e.creator_id
    LEFT JOIN communities c ON c.id=e.community_id
    WHERE e.cancelled_at IS NULL AND e.starts_at>now()-interval '2 hours' AND u.status='active'
      AND ${eventAccessWhere('$1','e')}
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=e.creator_id) OR (b.blocker_id=e.creator_id AND b.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=e.creator_id)
      AND (e.title ILIKE $2 OR e.description ILIKE $2 OR COALESCE(e.location_label,'') ILIKE $2 OR COALESCE(c.name,'') ILIKE $2)
    ORDER BY CASE WHEN e.title ILIKE $3 THEN 0 ELSE 1 END,e.starts_at ASC
    LIMIT 20
  `,[req.user.id,like,exactPrefix]):Promise.resolve({rows:[]});

  const [peopleResult,contentResult,communityResult,eventResult]=await Promise.all([peoplePromise,contentPromise,communityPromise,eventPromise]);
  const allContent=contentResult.rows||[];
  const posts=wants('posts')?allContent.filter(x=>x.post_kind!=='reel').slice(0,20):[];
  const reels=wants('reels')?allContent.filter(x=>x.post_kind==='reel').slice(0,20):[];

  let hashtags=[];
  if(wants('hashtags')){
    const counts=new Map();
    const regex=/#([\p{L}\p{N}_]{2,40})/gu;
    const needle=q.replace(/^#/,'').toLowerCase();
    for(const row of allContent){
      for(const match of String(row.caption||'').matchAll(regex)){
        const tag=match[1].normalize('NFKC').toLowerCase();
        if(!tag.includes(needle))continue;
        counts.set(tag,(counts.get(tag)||0)+1);
      }
    }
    hashtags=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,20).map(([tag,count])=>({tag,count}));
  }

  res.json({
    query:q,type,
    people:peopleResult.rows||[],
    posts,reels,hashtags,
    communities:communityResult.rows||[],
    events:eventResult.rows||[]
  });
});

module.exports=router;
