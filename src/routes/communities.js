const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { canViewerSee } = require('../services/contentPolicy');

const router = express.Router();

const COMMUNITY_CATEGORIES=['general','amistad','ocio','musica','cine','deporte','tecnologia','arte','viajes','local','creadores','debate'];
function normalizeCommunityInterest(value=''){
  return String(value||'').normalize('NFKC').trim().toLowerCase().slice(0,80);
}

let communitiesV158Ready=null;
async function ensureCommunitiesV158(){
  if(!communitiesV158Ready){
    communitiesV158Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS communities (
          id BIGSERIAL PRIMARY KEY,
          owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(80) NOT NULL,
          description VARCHAR(1000) NOT NULL DEFAULT '',
          avatar_url TEXT,
          privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','private')),
          conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_communities_owner_updated ON communities(owner_id,updated_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_communities_privacy_updated ON communities(privacy,updated_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_members (
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
          joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(community_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id,joined_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_join_requests (
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
          requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          reviewed_at TIMESTAMPTZ,
          reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          PRIMARY KEY(community_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_join_requests_pending ON community_join_requests(community_id,status,requested_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_rules (
          id BIGSERIAL PRIMARY KEY,
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          position SMALLINT NOT NULL DEFAULT 0,
          body VARCHAR(300) NOT NULL
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_rules_community ON community_rules(community_id,position,id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_posts (
          id BIGSERIAL PRIMARY KEY,
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(2200) NOT NULL DEFAULT '',
          media_url TEXT,
          media_type TEXT CHECK(media_type IS NULL OR media_type IN ('image','video')),
          content_level TEXT NOT NULL DEFAULT 'normal' CHECK(content_level IN ('normal','sensitive','nudity')),
          moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','removed')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK(btrim(body)<>'' OR media_url IS NOT NULL)
        )
      `);
      await db.query("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS media_provider TEXT");
      await db.query("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS external_id TEXT");
      await db.query("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS playback_url TEXT");
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_posts_community_created ON community_posts(community_id,created_at DESC)');
      await db.query('ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL');
      await db.query('ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS shared_post_ref_id BIGINT');
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_posts_shared_post ON community_posts(shared_post_id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS social_share_history (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('post','reel','story','profile')),
          entity_id BIGINT NOT NULL,
          target_type TEXT NOT NULL CHECK(target_type IN ('conversation','community','external','copy')),
          target_id BIGINT,
          target_label VARCHAR(160) NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_social_share_history_user_created ON social_share_history(user_id,created_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_comments (
          id BIGSERIAL PRIMARY KEY,
          community_post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(1000) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_comments_post_created ON community_comments(community_post_id,created_at,id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_moderation_log (
          id BIGSERIAL PRIMARY KEY,
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id BIGINT,
          note VARCHAR(300),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_moderation_log_community ON community_moderation_log(community_id,created_at DESC)');
      await db.query("ALTER TABLE communities ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'general'");
      await db.query('CREATE INDEX IF NOT EXISTS idx_communities_category_updated ON communities(category,updated_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_interests (
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          interest VARCHAR(80) NOT NULL,
          PRIMARY KEY(community_id,interest)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_interests_interest ON community_interests(interest,community_id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS community_hidden_suggestions (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,community_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_community_hidden_suggestions_user ON community_hidden_suggestions(user_id,hidden_at DESC)');
    })().catch(error=>{communitiesV158Ready=null;throw error;});
  }
  return communitiesV158Ready;
}

router.use(requireAuth);
router.use(async(_req,res,next)=>{
  try{await ensureCommunitiesV158();next();}
  catch(error){
    console.error('RedLibertad V1.58 communities bootstrap failed:',error);
    res.status(500).json({error:'communities_bootstrap_failed'});
  }
});

async function viewerRow(userId){
  const result=await db.query(
    'SELECT id,username,display_name,avatar_url,age_verified,creator_verified,show_sensitive,is_admin,status FROM users WHERE id=$1 LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

async function communityState(communityId,userId){
  const result=await db.query(`
    SELECT
      c.*,
      owner.username AS owner_username,
      owner.display_name AS owner_display_name,
      owner.avatar_url AS owner_avatar_url,
      owner.creator_verified AS owner_creator_verified,
      member.role AS viewer_role,
      request.status AS request_status,
      (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS member_count,
      (SELECT count(*)::int FROM community_join_requests jr WHERE jr.community_id=c.id AND jr.status='pending') AS pending_request_count,
      (SELECT count(*)::int FROM community_posts cp WHERE cp.community_id=c.id AND cp.moderation_status='published') AS post_count,
      EXISTS(
        SELECT 1 FROM blocks owner_block
         WHERE (owner_block.blocker_id=$2 AND owner_block.blocked_id=c.owner_id)
            OR (owner_block.blocker_id=c.owner_id AND owner_block.blocked_id=$2)
      ) AS blocked_with_owner
    FROM communities c
    JOIN users owner ON owner.id=c.owner_id
    LEFT JOIN community_members member
      ON member.community_id=c.id AND member.user_id=$2
    LEFT JOIN community_join_requests request
      ON request.community_id=c.id AND request.user_id=$2
    WHERE c.id=$1
      AND owner.status='active'
    LIMIT 1
  `,[communityId,userId]);
  if(!result.rowCount)return null;
  const row=result.rows[0];
  row.is_member=!!row.viewer_role;
  row.can_manage=!row.blocked_with_owner && ['owner','admin'].includes(row.viewer_role);
  row.can_manage_roles=!row.blocked_with_owner && row.viewer_role==='owner';
  row.can_view_content=!row.blocked_with_owner && (row.privacy==='public' || row.is_member);
  return row;
}

async function blockedBetween(a,b){
  const result=await db.query(`
    SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2)
        OR (blocker_id=$2 AND blocked_id=$1)
     LIMIT 1
  `,[a,b]);
  return !!result.rowCount;
}

async function addChatMember(client,community,userId,role='member'){
  if(!community.conversation_id)return;
  await client.query(`
    INSERT INTO conversation_members(conversation_id,user_id,member_role)
    VALUES ($1,$2,$3)
    ON CONFLICT(conversation_id,user_id) DO UPDATE
      SET member_role=EXCLUDED.member_role,
          is_archived=false
  `,[community.conversation_id,userId,role]);
}

async function removeChatMember(client,community,userId){
  if(!community.conversation_id)return;
  await client.query(
    'DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',
    [community.conversation_id,userId]
  );
}

async function logModeration(client,communityId,actorId,action,targetType,targetId=null,note=''){
  await client.query(`
    INSERT INTO community_moderation_log(community_id,actor_id,action,target_type,target_id,note)
    VALUES ($1,$2,$3,$4,$5,$6)
  `,[communityId,actorId,action,targetType,targetId,String(note||'').slice(0,300)||null]);
}

const createSchema=z.object({
  name:z.string().trim().min(2).max(80),
  description:z.string().trim().max(1000).optional().default(''),
  avatarUrl:z.string().trim().max(4096).optional().default(''),
  privacy:z.enum(['public','private']).default('public'),
  category:z.enum(COMMUNITY_CATEGORIES).default('general'),
  interests:z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
  rules:z.array(z.string().trim().min(1).max(300)).max(10).optional().default([]),
  createChat:z.boolean().optional().default(true)
});

router.get('/',async(req,res)=>{
  const scope=['all','mine','joined'].includes(String(req.query.scope||'')) ? String(req.query.scope) : 'all';
  const q=String(req.query.q||'').trim().slice(0,80);
  const result=await db.query(`
    SELECT
      c.id,c.owner_id,c.name,c.description,c.avatar_url,c.privacy,c.category,c.conversation_id,c.created_at,c.updated_at,
      owner.username AS owner_username,owner.display_name AS owner_display_name,owner.avatar_url AS owner_avatar_url,
      member.role AS viewer_role,
      request.status AS request_status,
      (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS member_count,
      (SELECT count(*)::int FROM community_posts cp WHERE cp.community_id=c.id AND cp.moderation_status='published') AS post_count
    FROM communities c
    JOIN users owner ON owner.id=c.owner_id
    LEFT JOIN community_members member ON member.community_id=c.id AND member.user_id=$1
    LEFT JOIN community_join_requests request ON request.community_id=c.id AND request.user_id=$1
    WHERE owner.status='active'
      AND (
        $2='all'
        OR ($2='mine' AND c.owner_id=$1)
        OR ($2='joined' AND member.user_id IS NOT NULL)
      )
      AND (
        $3=''
        OR c.name ILIKE '%' || $3 || '%'
        OR c.description ILIKE '%' || $3 || '%'
      )
      AND NOT EXISTS(
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=c.owner_id)
            OR (b.blocker_id=c.owner_id AND b.blocked_id=$1)
      )
    ORDER BY
      CASE WHEN member.user_id IS NOT NULL THEN 0 ELSE 1 END,
      c.updated_at DESC,c.id DESC
    LIMIT 100
  `,[req.user.id,scope,q]);
  res.json({communities:result.rows.map(row=>({
    ...row,
    is_member:!!row.viewer_role,
    can_manage:['owner','admin'].includes(row.viewer_role),
    conversation_id:row.viewer_role ? row.conversation_id : null
  })),scope,q});
});


router.get('/discover',async(req,res)=>{
  const mode=['recommended','connections','new','active'].includes(String(req.query.mode||'')) ? String(req.query.mode) : 'recommended';
  const q=String(req.query.q||'').trim().slice(0,80);
  const category=COMMUNITY_CATEGORIES.includes(String(req.query.category||'')) ? String(req.query.category) : '';
  const result=await db.query(`
    SELECT
      c.id,c.owner_id,c.name,c.description,c.avatar_url,c.privacy,c.category,c.created_at,c.updated_at,
      owner.username AS owner_username,owner.display_name AS owner_display_name,
      request.status AS request_status,
      (SELECT count(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS member_count,
      (SELECT count(*)::int FROM community_posts cp WHERE cp.community_id=c.id AND cp.moderation_status='published') AS post_count,
      (SELECT count(*)::int FROM community_posts cp WHERE cp.community_id=c.id AND cp.moderation_status='published' AND cp.created_at>=now()-interval '14 days') AS recent_post_count,
      (
        SELECT count(*)::int
          FROM community_interests ci
         WHERE ci.community_id=c.id
           AND ci.interest IN (SELECT ui.interest FROM user_interests ui WHERE ui.user_id=$1)
      ) AS shared_interest_count,
      COALESCE(
        (SELECT array_agg(ci.interest ORDER BY ci.interest) FROM community_interests ci WHERE ci.community_id=c.id),
        ARRAY[]::text[]
      ) AS interests,
      (
        SELECT count(DISTINCT cm.user_id)::int
          FROM community_members cm
         WHERE cm.community_id=c.id
           AND cm.user_id<>$1
           AND EXISTS(
             SELECT 1 FROM follows mine
              WHERE mine.follower_id=$1 AND mine.following_id=cm.user_id
           )
           AND EXISTS(
             SELECT 1 FROM follows theirs
              WHERE theirs.follower_id=cm.user_id AND theirs.following_id=$1
           )
      ) AS connection_member_count
    FROM communities c
    JOIN users owner ON owner.id=c.owner_id
    LEFT JOIN community_join_requests request ON request.community_id=c.id AND request.user_id=$1
    WHERE owner.status='active'
      AND NOT EXISTS(
        SELECT 1 FROM community_members mine
         WHERE mine.community_id=c.id AND mine.user_id=$1
      )
      AND NOT EXISTS(
        SELECT 1 FROM community_hidden_suggestions hidden
         WHERE hidden.user_id=$1 AND hidden.community_id=c.id
      )
      AND NOT EXISTS(
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=c.owner_id)
            OR (b.blocker_id=c.owner_id AND b.blocked_id=$1)
      )
      AND NOT EXISTS(
        SELECT 1 FROM mutes m
         WHERE m.muter_id=$1 AND m.muted_id=c.owner_id
      )
      AND ($2='' OR c.category=$2)
      AND (
        $3=''
        OR c.name ILIKE '%' || $3 || '%'
        OR c.description ILIKE '%' || $3 || '%'
        OR EXISTS(
          SELECT 1 FROM community_interests search_interest
           WHERE search_interest.community_id=c.id
             AND search_interest.interest ILIKE '%' || $3 || '%'
        )
      )
    ORDER BY
      CASE
        WHEN $4='connections' THEN
          CASE WHEN (
            SELECT count(*) FROM community_members cmx
             WHERE cmx.community_id=c.id
               AND cmx.user_id<>$1
               AND EXISTS(SELECT 1 FROM follows fa WHERE fa.follower_id=$1 AND fa.following_id=cmx.user_id)
               AND EXISTS(SELECT 1 FROM follows fb WHERE fb.follower_id=cmx.user_id AND fb.following_id=$1)
          )>0 THEN 0 ELSE 1 END
        WHEN $4='new' THEN 0
        WHEN $4='active' THEN 0
        ELSE
          CASE WHEN EXISTS(
            SELECT 1 FROM community_interests ci2
             WHERE ci2.community_id=c.id
               AND ci2.interest IN (SELECT ui2.interest FROM user_interests ui2 WHERE ui2.user_id=$1)
          ) THEN 0 ELSE 1 END
      END,
      CASE WHEN $4='new' THEN c.created_at END DESC NULLS LAST,
      CASE WHEN $4='active' THEN (
        SELECT max(cp2.created_at) FROM community_posts cp2
         WHERE cp2.community_id=c.id AND cp2.moderation_status='published'
      ) END DESC NULLS LAST,
      shared_interest_count DESC,
      connection_member_count DESC,
      c.updated_at DESC,
      c.id DESC
    LIMIT 40
  `,[req.user.id,category,q,mode]);

  const communities=result.rows
    .filter(row=>mode!=='connections' || Number(row.connection_member_count||0)>0)
    .map(row=>{
      const shared=Number(row.shared_interest_count||0);
      const connections=Number(row.connection_member_count||0);
      const recent=Number(row.recent_post_count||0);
      let reason='Comunidad que podrías explorar';
      if(shared>0)reason=`${shared} ${shared===1?'interés compartido':'intereses compartidos'}`;
      else if(connections>0)reason=`${connections} ${connections===1?'conexión participa':'conexiones participan'}`;
      else if(recent>0)reason=`Actividad reciente · ${recent} ${recent===1?'publicación':'publicaciones'}`;
      else if(mode==='new')reason='Comunidad creada recientemente';
      return {...row,reason};
    });

  res.json({communities,mode,q,category,categories:COMMUNITY_CATEGORIES});
});

router.post('/discover/:communityId/hide',async(req,res)=>{
  const communityId=Number(req.params.communityId);
  if(!Number.isInteger(communityId)||communityId<=0)return res.status(400).json({error:'invalid_community'});
  const exists=await db.query('SELECT 1 FROM communities WHERE id=$1 LIMIT 1',[communityId]);
  if(!exists.rowCount)return res.status(404).json({error:'community_not_found'});
  await db.query(`
    INSERT INTO community_hidden_suggestions(user_id,community_id,hidden_at)
    VALUES ($1,$2,now())
    ON CONFLICT(user_id,community_id) DO UPDATE SET hidden_at=now()
  `,[req.user.id,communityId]);
  res.json({ok:true});
});

router.delete('/discover/:communityId/hide',async(req,res)=>{
  await db.query(
    'DELETE FROM community_hidden_suggestions WHERE user_id=$1 AND community_id=$2',
    [req.user.id,req.params.communityId]
  );
  res.json({ok:true});
});

router.post('/',async(req,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_community',details:parsed.error.flatten()});
  const data=parsed.data;
  const rules=[...new Set(data.rules.map(v=>String(v||'').trim()).filter(Boolean))].slice(0,10);
  const interests=[...new Set(data.interests.map(normalizeCommunityInterest).filter(Boolean))].slice(0,8);
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    let conversationId=null;
    if(data.createChat){
      const conversation=await client.query(`
        INSERT INTO conversations(conversation_type,title,created_by)
        VALUES ('group',$1,$2)
        RETURNING id
      `,[data.name,req.user.id]);
      conversationId=conversation.rows[0].id;
      await client.query(`
        INSERT INTO conversation_members(conversation_id,user_id,member_role)
        VALUES ($1,$2,'owner')
      `,[conversationId,req.user.id]);
    }
    const created=await client.query(`
      INSERT INTO communities(owner_id,name,description,avatar_url,privacy,category,conversation_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,[req.user.id,data.name,data.description,data.avatarUrl||null,data.privacy,data.category,conversationId]);
    const community=created.rows[0];
    await client.query(`
      INSERT INTO community_members(community_id,user_id,role)
      VALUES ($1,$2,'owner')
    `,[community.id,req.user.id]);
    for(let i=0;i<rules.length;i++){
      await client.query(
        'INSERT INTO community_rules(community_id,position,body) VALUES ($1,$2,$3)',
        [community.id,i,rules[i]]
      );
    }
    for(const interest of interests){
      await client.query(
        'INSERT INTO community_interests(community_id,interest) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [community.id,interest]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ok:true,community:{...community,viewer_role:'owner',is_member:true,can_manage:true},rules,interests});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad community create failed:',error);
    res.status(500).json({error:'community_create_failed'});
  }finally{
    client.release();
  }
});

router.get('/:id',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(404).json({error:'community_not_found'});

  const [rules,members,interests]=await Promise.all([
    db.query('SELECT id,position,body FROM community_rules WHERE community_id=$1 ORDER BY position,id',[state.id]),
    db.query(`
      SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,cm.role,cm.joined_at
        FROM community_members cm
        JOIN users u ON u.id=cm.user_id
       WHERE cm.community_id=$1
         AND u.status='active'
         AND (
           u.id=$2
           OR NOT EXISTS(
             SELECT 1 FROM blocks b
              WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
                 OR (b.blocker_id=u.id AND b.blocked_id=$2)
           )
         )
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,cm.joined_at,u.id
       LIMIT 100
    `,[state.id,req.user.id]),
    db.query('SELECT interest FROM community_interests WHERE community_id=$1 ORDER BY interest',[state.id])
  ]);

  res.json({
    community:{
      id:state.id,owner_id:state.owner_id,name:state.name,description:state.description,
      avatar_url:state.avatar_url,privacy:state.privacy,category:state.category,created_at:state.created_at,updated_at:state.updated_at,
      owner_username:state.owner_username,owner_display_name:state.owner_display_name,
      owner_avatar_url:state.owner_avatar_url,owner_creator_verified:state.owner_creator_verified,
      member_count:Number(state.member_count||0),post_count:Number(state.post_count||0),
      viewer_role:state.viewer_role,request_status:state.request_status,
      is_member:state.is_member,can_manage:state.can_manage,can_manage_roles:state.can_manage_roles,
      pending_request_count:state.can_manage ? Number(state.pending_request_count||0) : 0,
      conversation_id:state.is_member ? state.conversation_id : null
    },
    rules:rules.rows,
    interests:interests.rows.map(row=>row.interest),
    members:state.can_view_content ? members.rows : [],
    can_view_content:state.can_view_content
  });
});

const updateSchema=z.object({
  name:z.string().trim().min(2).max(80).optional(),
  description:z.string().trim().max(1000).optional(),
  avatarUrl:z.string().trim().max(4096).optional().nullable(),
  privacy:z.enum(['public','private']).optional(),
  category:z.enum(COMMUNITY_CATEGORIES).optional(),
  interests:z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  rules:z.array(z.string().trim().min(1).max(300)).max(10).optional()
});

router.patch('/:id',async(req,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_community'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const data=parsed.data;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const updated=await client.query(`
      UPDATE communities
         SET name=COALESCE($2,name),
             description=COALESCE($3,description),
             avatar_url=CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
             privacy=COALESCE($6,privacy),
             category=COALESCE($7,category),
             updated_at=now()
       WHERE id=$1
       RETURNING *
    `,[
      state.id,
      data.name||null,
      data.description===undefined?null:data.description,
      Object.prototype.hasOwnProperty.call(data,'avatarUrl'),
      data.avatarUrl||null,
      data.privacy||null,
      data.category||null
    ]);
    if(data.rules){
      const rules=[...new Set(data.rules.map(v=>String(v||'').trim()).filter(Boolean))].slice(0,10);
      await client.query('DELETE FROM community_rules WHERE community_id=$1',[state.id]);
      for(let i=0;i<rules.length;i++){
        await client.query(
          'INSERT INTO community_rules(community_id,position,body) VALUES ($1,$2,$3)',
          [state.id,i,rules[i]]
        );
      }
    }
    if(data.interests){
      const interests=[...new Set(data.interests.map(normalizeCommunityInterest).filter(Boolean))].slice(0,8);
      await client.query('DELETE FROM community_interests WHERE community_id=$1',[state.id]);
      for(const interest of interests){
        await client.query(
          'INSERT INTO community_interests(community_id,interest) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [state.id,interest]
        );
      }
    }
    if(data.name && state.conversation_id){
      await client.query(
        "UPDATE conversations SET title=$2,updated_at=now() WHERE id=$1 AND conversation_type='group'",
        [state.conversation_id,data.name]
      );
    }
    await logModeration(client,state.id,req.user.id,'community_updated','community',state.id);
    await client.query('COMMIT');
    res.json({ok:true,community:updated.rows[0]});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad community update failed:',error);
    res.status(500).json({error:'community_update_failed'});
  }finally{client.release();}
});

router.post('/:id/join',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(403).json({error:'community_unavailable'});
  if(state.is_member)return res.json({ok:true,status:'member'});
  if(state.privacy==='private'){
    await db.query(`
      INSERT INTO community_join_requests(community_id,user_id,status,requested_at,reviewed_at,reviewed_by)
      VALUES ($1,$2,'pending',now(),NULL,NULL)
      ON CONFLICT(community_id,user_id) DO UPDATE
        SET status='pending',requested_at=now(),reviewed_at=NULL,reviewed_by=NULL
    `,[state.id,req.user.id]);
    return res.json({ok:true,status:'pending'});
  }
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO community_members(community_id,user_id,role)
      VALUES ($1,$2,'member')
      ON CONFLICT(community_id,user_id) DO NOTHING
    `,[state.id,req.user.id]);
    await client.query(`
      INSERT INTO community_join_requests(community_id,user_id,status,requested_at,reviewed_at,reviewed_by)
      VALUES ($1,$2,'approved',now(),now(),$2)
      ON CONFLICT(community_id,user_id) DO UPDATE
        SET status='approved',reviewed_at=now(),reviewed_by=$2
    `,[state.id,req.user.id]);
    await addChatMember(client,state,req.user.id,'member');
    await client.query("UPDATE communities SET updated_at=now() WHERE id=$1",[state.id]);
    await client.query('COMMIT');
    res.json({ok:true,status:'member'});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad community join failed:',error);
    res.status(500).json({error:'community_join_failed'});
  }finally{client.release();}
});

router.delete('/:id/join',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(state.viewer_role==='owner')return res.status(400).json({error:'owner_cannot_leave'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM community_members WHERE community_id=$1 AND user_id=$2',[state.id,req.user.id]);
    await client.query(`
      UPDATE community_join_requests
         SET status='cancelled',reviewed_at=now(),reviewed_by=$2
       WHERE community_id=$1 AND user_id=$2
    `,[state.id,req.user.id]);
    await removeChatMember(client,state,req.user.id);
    await client.query("UPDATE communities SET updated_at=now() WHERE id=$1",[state.id]);
    await client.query('COMMIT');
    res.json({ok:true,status:'none'});
  }catch(error){
    await client.query('ROLLBACK');
    res.status(500).json({error:'community_leave_failed'});
  }finally{client.release();}
});

router.get('/:id/requests',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const result=await db.query(`
    SELECT jr.user_id,jr.status,jr.requested_at,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM community_join_requests jr
      JOIN users u ON u.id=jr.user_id
     WHERE jr.community_id=$1 AND jr.status='pending' AND u.status='active'
     ORDER BY jr.requested_at ASC
  `,[state.id]);
  res.json({requests:result.rows});
});

const reviewSchema=z.object({decision:z.enum(['approved','rejected'])});
router.post('/:id/requests/:userId',async(req,res)=>{
  const parsed=reviewSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_decision'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const targetId=Number(req.params.userId);
  if(!Number.isInteger(targetId)||targetId<=0)return res.status(400).json({error:'invalid_user'});
  const pending=await db.query(
    "SELECT 1 FROM community_join_requests WHERE community_id=$1 AND user_id=$2 AND status='pending' LIMIT 1",
    [state.id,targetId]
  );
  if(!pending.rowCount)return res.status(404).json({error:'request_not_found'});
  if(await blockedBetween(targetId,state.owner_id))return res.status(403).json({error:'community_unavailable'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`
      UPDATE community_join_requests
         SET status=$3,reviewed_at=now(),reviewed_by=$4
       WHERE community_id=$1 AND user_id=$2
    `,[state.id,targetId,parsed.data.decision,req.user.id]);
    if(parsed.data.decision==='approved'){
      await client.query(`
        INSERT INTO community_members(community_id,user_id,role)
        VALUES ($1,$2,'member')
        ON CONFLICT(community_id,user_id) DO NOTHING
      `,[state.id,targetId]);
      await addChatMember(client,state,targetId,'member');
    }
    await logModeration(client,state.id,req.user.id,'join_request_'+parsed.data.decision,'user',targetId);
    await client.query("UPDATE communities SET updated_at=now() WHERE id=$1",[state.id]);
    await client.query('COMMIT');
    res.json({ok:true,decision:parsed.data.decision});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad community request review failed:',error);
    res.status(500).json({error:'request_review_failed'});
  }finally{client.release();}
});

const roleSchema=z.object({role:z.enum(['admin','member'])});
router.patch('/:id/members/:userId',async(req,res)=>{
  const parsed=roleSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_role'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage_roles)return res.status(403).json({error:'community_owner_required'});
  const targetId=Number(req.params.userId);
  if(!Number.isInteger(targetId)||targetId<=0)return res.status(400).json({error:'invalid_user'});
  if(String(targetId)===String(state.owner_id))return res.status(400).json({error:'owner_role_locked'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const updated=await client.query(`
      UPDATE community_members SET role=$3
       WHERE community_id=$1 AND user_id=$2 AND role<>'owner'
       RETURNING user_id,role
    `,[state.id,targetId,parsed.data.role]);
    if(!updated.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'member_not_found'});
    }
    if(state.conversation_id){
      await client.query(
        'UPDATE conversation_members SET member_role=$3 WHERE conversation_id=$1 AND user_id=$2',
        [state.conversation_id,targetId,parsed.data.role]
      );
    }
    await logModeration(client,state.id,req.user.id,'member_role_'+parsed.data.role,'user',targetId);
    await client.query('COMMIT');
    res.json({ok:true,member:updated.rows[0]});
  }catch(error){
    await client.query('ROLLBACK');
    res.status(500).json({error:'member_role_update_failed'});
  }finally{client.release();}
});

router.delete('/:id/members/:userId',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const targetId=Number(req.params.userId);
  if(!Number.isInteger(targetId)||targetId<=0)return res.status(400).json({error:'invalid_user'});
  const target=await db.query(
    'SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2 LIMIT 1',
    [state.id,targetId]
  );
  if(!target.rowCount)return res.status(404).json({error:'member_not_found'});
  const targetRole=target.rows[0].role;
  if(targetRole==='owner')return res.status(400).json({error:'owner_cannot_be_removed'});
  if(state.viewer_role==='admin' && targetRole==='admin')return res.status(403).json({error:'owner_required_for_admin'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM community_members WHERE community_id=$1 AND user_id=$2',[state.id,targetId]);
    await removeChatMember(client,state,targetId);
    await logModeration(client,state.id,req.user.id,'member_removed','user',targetId);
    await client.query("UPDATE communities SET updated_at=now() WHERE id=$1",[state.id]);
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(error){
    await client.query('ROLLBACK');
    res.status(500).json({error:'member_remove_failed'});
  }finally{client.release();}
});

router.get('/:id/posts',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state || !state.can_view_content)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(404).json({error:'community_not_found'});
  const viewer=await viewerRow(req.user.id);
  const result=await db.query(`
    SELECT
      cp.id,cp.community_id,cp.user_id,cp.body,cp.media_url,cp.media_type,cp.media_provider,cp.external_id,cp.playback_url,cp.content_level,cp.created_at,cp.updated_at,
      cp.shared_post_id,cp.shared_post_ref_id,
      u.username,u.display_name,u.avatar_url,u.creator_verified,
      shared.id AS shared_post_actual_id,shared.caption AS shared_post_caption,shared.media_url AS shared_post_media_url,
      shared.media_type AS shared_post_media_type,shared.media_provider AS shared_post_media_provider,shared.playback_url AS shared_post_playback_url,
      shared.content_level AS shared_post_content_level,shared.post_kind AS shared_post_kind,shared.audience AS shared_post_audience,
      shared.moderation_status AS shared_post_moderation_status,
      shared_author.username AS shared_post_author_username,shared_author.display_name AS shared_post_author_display_name,
      shared_author.avatar_url AS shared_post_author_avatar_url,shared_author.status AS shared_post_author_status,
      (SELECT count(*)::int FROM community_comments cc WHERE cc.community_post_id=cp.id) AS comment_count
    FROM community_posts cp
    JOIN users u ON u.id=cp.user_id
    LEFT JOIN posts shared ON shared.id=cp.shared_post_id
    LEFT JOIN users shared_author ON shared_author.id=shared.user_id
    WHERE cp.community_id=$1
      AND cp.moderation_status='published'
      AND u.status='active'
      AND (
        cp.user_id=$2
        OR (
          NOT EXISTS(
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id=$2 AND b.blocked_id=cp.user_id)
                OR (b.blocker_id=cp.user_id AND b.blocked_id=$2)
          )
          AND NOT EXISTS(
            SELECT 1 FROM mutes muted_post
             WHERE muted_post.muter_id=$2 AND muted_post.muted_id=cp.user_id
          )
        )
      )
    ORDER BY cp.created_at DESC,cp.id DESC
    LIMIT 100
  `,[state.id,req.user.id]);

  const postIds=result.rows.map(row=>String(row.id));
  const comments=postIds.length ? await db.query(`
    SELECT cc.id,cc.community_post_id,cc.user_id,cc.body,cc.created_at,
           u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM community_comments cc
      JOIN users u ON u.id=cc.user_id
     WHERE cc.community_post_id=ANY($1::bigint[])
       AND u.status='active'
       AND (
         cc.user_id=$2
         OR (
           NOT EXISTS(
             SELECT 1 FROM blocks b
              WHERE (b.blocker_id=$2 AND b.blocked_id=cc.user_id)
                 OR (b.blocker_id=cc.user_id AND b.blocked_id=$2)
           )
           AND NOT EXISTS(
             SELECT 1 FROM mutes muted_comment
              WHERE muted_comment.muter_id=$2 AND muted_comment.muted_id=cc.user_id
           )
         )
       )
     ORDER BY cc.created_at ASC,cc.id ASC
  `,[postIds,req.user.id]) : {rows:[]};
  const commentsByPost=new Map();
  for(const comment of comments.rows){
    const key=String(comment.community_post_id);
    if(!commentsByPost.has(key))commentsByPost.set(key,[]);
    commentsByPost.get(key).push(comment);
  }
  const posts=result.rows.map(post=>{
    const gate=canViewerSee({
      postLevel:post.content_level,
      viewer:{
        id:viewer?.id,
        ageVerified:viewer?.age_verified,
        showSensitive:viewer?.show_sensitive,
        isAdmin:viewer?.is_admin
      }
    });
    const sharedReference=post.shared_post_ref_id||post.shared_post_id;
    let shared_post=null;
    if(sharedReference){
      const unavailable=!post.shared_post_actual_id||post.shared_post_moderation_status!=='published'||post.shared_post_audience!=='public'||post.shared_post_author_status!=='active';
      if(unavailable){
        shared_post={id:sharedReference,unavailable:true,gated:false};
      }else{
        const sharedGate=canViewerSee({
          postLevel:post.shared_post_content_level,
          viewer:{id:viewer?.id,ageVerified:viewer?.age_verified,showSensitive:viewer?.show_sensitive,isAdmin:viewer?.is_admin}
        });
        shared_post={
          id:post.shared_post_actual_id,unavailable:false,gated:!sharedGate.allowed,gate_reason:sharedGate.reason||null,
          post_kind:post.shared_post_kind,content_level:post.shared_post_content_level,
          caption:sharedGate.allowed?(post.shared_post_caption||''):'',
          media_url:sharedGate.allowed?post.shared_post_media_url:null,
          media_type:sharedGate.allowed?post.shared_post_media_type:null,
          media_provider:sharedGate.allowed?post.shared_post_media_provider:null,
          playback_url:sharedGate.allowed?post.shared_post_playback_url:null,
          username:post.shared_post_author_username,display_name:post.shared_post_author_display_name,avatar_url:post.shared_post_author_avatar_url
        };
      }
    }
    return {
      ...post,
      shared_post,
      media_url:gate.allowed ? post.media_url : null,
      playback_url:gate.allowed ? post.playback_url : null,
      gated:!gate.allowed,
      gate_reason:gate.reason||null,
      can_delete:String(post.user_id)===String(req.user.id) || state.can_manage,
      comments:(commentsByPost.get(String(post.id))||[]).map(comment=>({
        ...comment,
        can_delete:String(comment.user_id)===String(req.user.id) || state.can_manage
      }))
    };
  });
  res.json({posts,can_post:state.is_member,can_manage:state.can_manage});
});

const communityPostSchema=z.object({
  body:z.string().max(2200).optional().default(''),
  mediaUrl:z.string().trim().max(4096).optional().default(''),
  mediaType:z.enum(['image','video']).optional().default('image'),
  mediaProvider:z.string().trim().max(40).optional().default('local'),
  externalId:z.string().trim().max(255).optional().nullable(),
  playbackUrl:z.string().trim().max(4096).optional().nullable(),
  contentLevel:z.enum(['normal','sensitive','nudity']).default('normal')
});

router.post('/:id/posts',async(req,res)=>{
  const parsed=communityPostSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_post'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(403).json({error:'community_unavailable'});
  if(!state.is_member)return res.status(403).json({error:'community_membership_required'});
  const data=parsed.data;
  if(!String(data.body||'').trim() && !data.mediaUrl)return res.status(400).json({error:'empty_post'});
  const viewer=await viewerRow(req.user.id);
  if(data.contentLevel==='nudity' && (!viewer?.age_verified || !viewer?.creator_verified)){
    return res.status(403).json({error:'verified_creator_required_for_nudity'});
  }
  const result=await db.query(`
    INSERT INTO community_posts(
      community_id,user_id,body,media_url,media_type,media_provider,external_id,playback_url,content_level
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `,[
    state.id,req.user.id,String(data.body||'').trim(),data.mediaUrl||null,
    data.mediaUrl ? data.mediaType : null,data.mediaUrl ? data.mediaProvider : null,
    data.mediaUrl ? data.externalId : null,data.mediaUrl ? data.playbackUrl : null,data.contentLevel
  ]);
  await db.query('UPDATE communities SET updated_at=now() WHERE id=$1',[state.id]);
  res.status(201).json({ok:true,post:result.rows[0]});
});

router.post('/:id/share-post',async(req,res)=>{
  const sharedPostId=Number(req.body?.postId);
  if(!Number.isInteger(sharedPostId)||sharedPostId<=0)return res.status(400).json({error:'invalid_post'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(403).json({error:'community_unavailable'});
  if(!state.is_member)return res.status(403).json({error:'community_membership_required'});
  const source=await db.query(`
    SELECT p.id,p.user_id,p.post_kind
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE p.id=$1 AND p.moderation_status='published' AND p.audience='public' AND u.status='active'
       AND (
         p.user_id=$2 OR NOT EXISTS(
           SELECT 1 FROM blocks b
            WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id)
               OR (b.blocker_id=p.user_id AND b.blocked_id=$2)
         )
       )
     LIMIT 1
  `,[sharedPostId,req.user.id]);
  if(!source.rowCount)return res.status(403).json({error:'post_not_shareable_to_community'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const created=await client.query(`
      INSERT INTO community_posts(community_id,user_id,body,content_level,shared_post_id,shared_post_ref_id)
      VALUES($1,$2,'Publicación compartida','normal',$3,$3)
      RETURNING *
    `,[state.id,req.user.id,sharedPostId]);
    await client.query(`
      INSERT INTO social_share_history(user_id,entity_type,entity_id,target_type,target_id,target_label)
      VALUES($1,$2,$3,'community',$4,$5)
    `,[req.user.id,source.rows[0].post_kind==='reel'?'reel':'post',sharedPostId,state.id,state.name]);
    await client.query('UPDATE communities SET updated_at=now() WHERE id=$1',[state.id]);
    await client.query('COMMIT');
    res.status(201).json({ok:true,post:created.rows[0]});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad V1.62 community share failed:',error);
    res.status(500).json({error:'community_share_failed'});
  }finally{client.release();}
});

router.delete('/:id/posts/:postId',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  const post=await db.query(
    'SELECT id,user_id FROM community_posts WHERE id=$1 AND community_id=$2 AND moderation_status=\'published\' LIMIT 1',
    [req.params.postId,state.id]
  );
  if(!post.rowCount)return res.status(404).json({error:'post_not_found'});
  const own=String(post.rows[0].user_id)===String(req.user.id);
  if(!own && !state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(
      "UPDATE community_posts SET moderation_status='removed',updated_at=now() WHERE id=$1",
      [req.params.postId]
    );
    if(!own)await logModeration(client,state.id,req.user.id,'post_removed','post',Number(req.params.postId));
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(error){
    await client.query('ROLLBACK');
    res.status(500).json({error:'post_remove_failed'});
  }finally{client.release();}
});

const commentSchema=z.object({body:z.string().trim().min(1).max(1000)});
router.post('/:id/posts/:postId/comments',async(req,res)=>{
  const parsed=commentSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_comment'});
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(await blockedBetween(req.user.id,state.owner_id))return res.status(403).json({error:'community_unavailable'});
  if(!state.is_member)return res.status(403).json({error:'community_membership_required'});
  const post=await db.query(
    "SELECT id FROM community_posts WHERE id=$1 AND community_id=$2 AND moderation_status='published' LIMIT 1",
    [req.params.postId,state.id]
  );
  if(!post.rowCount)return res.status(404).json({error:'post_not_found'});
  const result=await db.query(`
    INSERT INTO community_comments(community_post_id,user_id,body)
    VALUES ($1,$2,$3)
    RETURNING *
  `,[req.params.postId,req.user.id,parsed.data.body]);
  res.status(201).json({ok:true,comment:result.rows[0]});
});

router.delete('/:id/posts/:postId/comments/:commentId',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  const comment=await db.query(`
    SELECT cc.id,cc.user_id
      FROM community_comments cc
      JOIN community_posts cp ON cp.id=cc.community_post_id
     WHERE cc.id=$1 AND cc.community_post_id=$2 AND cp.community_id=$3
     LIMIT 1
  `,[req.params.commentId,req.params.postId,state.id]);
  if(!comment.rowCount)return res.status(404).json({error:'comment_not_found'});
  const own=String(comment.rows[0].user_id)===String(req.user.id);
  if(!own && !state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM community_comments WHERE id=$1',[req.params.commentId]);
    if(!own)await logModeration(client,state.id,req.user.id,'comment_removed','comment',Number(req.params.commentId));
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(error){
    await client.query('ROLLBACK');
    res.status(500).json({error:'comment_remove_failed'});
  }finally{client.release();}
});

router.delete('/:id',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(state.viewer_role!=='owner')return res.status(403).json({error:'community_owner_required'});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const conversationId=state.conversation_id;
    await client.query('DELETE FROM communities WHERE id=$1',[state.id]);
    if(conversationId){
      await client.query(
        "DELETE FROM conversations WHERE id=$1 AND conversation_type='group' AND created_by=$2",
        [conversationId,req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad community delete failed:',error);
    res.status(500).json({error:'community_delete_failed'});
  }finally{client.release();}
});

router.get('/:id/moderation-log',async(req,res)=>{
  const state=await communityState(req.params.id,req.user.id);
  if(!state)return res.status(404).json({error:'community_not_found'});
  if(!state.can_manage)return res.status(403).json({error:'community_admin_required'});
  const result=await db.query(`
    SELECT log.id,log.action,log.target_type,log.target_id,log.note,log.created_at,
           actor.username AS actor_username,actor.display_name AS actor_display_name
      FROM community_moderation_log log
      JOIN users actor ON actor.id=log.actor_id
     WHERE log.community_id=$1
     ORDER BY log.created_at DESC,log.id DESC
     LIMIT 100
  `,[state.id]);
  res.json({items:result.rows});
});

module.exports = router;
