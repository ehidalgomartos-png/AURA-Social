const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateContentLevel, canViewerSee } = require('../services/contentPolicy');

const router = express.Router();

let mutePrivacyReady = null;
async function ensureMutePrivacy() {
  if (!mutePrivacyReady) {
    mutePrivacyReady = (async () => {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE");
      await db.query(`
        CREATE TABLE IF NOT EXISTS mutes (
          muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(muter_id,muted_id),
          CHECK(muter_id<>muted_id)
        )
      `);
    })().catch(error => {
      mutePrivacyReady = null;
      throw error;
    });
  }
  return mutePrivacyReady;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureMutePrivacy();
    next();
  }catch(error){
    console.error('RedLibertad mute privacy bootstrap failed:',error);
    res.status(500).json({error:'privacy_bootstrap_failed'});
  }
});


let communityV15Ready = null;
async function ensureCommunityV15() {
  if (!communityV15Ready) {
    communityV15Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS reposts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_reposts_post_created ON reposts(post_id,created_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_reposts_user_created ON reposts(user_id,created_at DESC)');
      await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
      await db.query(`
        ALTER TABLE notifications
          ADD CONSTRAINT notifications_type_check
          CHECK(type IN (
            'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
            'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast','system'
          ))
      `);
    })().catch(error => {
      communityV15Ready = null;
      throw error;
    });
  }
  return communityV15Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCommunityV15();
    next();
  }catch(error){
    console.error('RedLibertad V1.5 social bootstrap failed:',error);
    res.status(500).json({error:'social_bootstrap_failed'});
  }
});

function extractMentions(value='') {
  const found = new Set();
  for (const match of String(value).matchAll(/(^|\s)@([a-zA-Z0-9_.]{3,30})/g)) {
    found.add(match[2].toLowerCase());
  }
  return [...found];
}

async function notifyMentions({ actorId, text, entityType='post', entityId, audience='public' }) {
  const names = extractMentions(text);
  if (!names.length || !entityId) return;

  const result = await db.query(`
    SELECT u.id,u.username
      FROM users u
     WHERE lower(u.username)=ANY($1::text[])
       AND u.status='active'
       AND u.id<>$2
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$2
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$2
       )
       AND (
         $3::text='public'
         OR EXISTS(
           SELECT 1
             FROM posts mention_post
             JOIN creator_vips cv
               ON cv.creator_id=mention_post.user_id
              AND cv.fan_id=u.id
             JOIN follows f
               ON f.follower_id=cv.fan_id
              AND f.following_id=cv.creator_id
            WHERE mention_post.id=$4
              AND mention_post.audience='vip'
         )
         OR EXISTS(
           SELECT 1 FROM post_participants pp
            WHERE pp.post_id=$4
              AND pp.user_id=u.id
         )
       )
  `,[names,actorId,audience,entityId]);

  for (const user of result.rows) {
    await db.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      VALUES ($1,$2,'mention',$3,$4,'Te ha mencionado.')
    `,[user.id,actorId,entityType,entityId]);
  }
}

async function attachRepostMeta(rows, viewerId=null, includeActor=false) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id);
  const params = [ids];
  let viewerSelect = 'false';
  let actorFilter = '';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = 'bool_or(r.user_id=$2)';
    actorFilter = `AND (
      r.user_id=$2
      OR r.user_id IN (SELECT following_id FROM follows WHERE follower_id=$2)
    )`;
  }

  const counts = await db.query(`
    SELECT r.post_id,
           count(*)::int AS repost_count,
           ${viewerSelect} AS reposted_by_me
      FROM reposts r
     WHERE r.post_id=ANY($1::bigint[])
     GROUP BY r.post_id
  `,params);

  const countMap = new Map(counts.rows.map(row => [String(row.post_id),row]));

  let actorMap = new Map();
  if (viewerId && includeActor) {
    const actors = await db.query(`
      SELECT DISTINCT ON (r.post_id)
             r.post_id,
             u.id AS repost_actor_id,
             u.username AS repost_actor_username,
             u.display_name AS repost_actor_display_name
        FROM reposts r
        JOIN users u ON u.id=r.user_id
       WHERE r.post_id=ANY($1::bigint[])
         ${actorFilter}
         AND u.status='active'
       ORDER BY r.post_id,r.created_at DESC
    `,params);
    actorMap = new Map(actors.rows.map(row => [String(row.post_id),row]));
  }

  const withReposts=rows.map(row => ({
    ...row,
    repost_count: countMap.get(String(row.id))?.repost_count || 0,
    reposted_by_me: countMap.get(String(row.id))?.reposted_by_me === true,
    ...(actorMap.get(String(row.id)) || {})
  }));
  return attachCommunityMeta(withReposts,viewerId);
}

async function attachCommunityMeta(rows,viewerId=null){
  if(!rows.length)return rows;
  const ids=rows.map(row=>row.id);

  const [pollRows,questionRows]=await Promise.all([
    db.query(`
      SELECT
        cp.id AS poll_id,cp.post_id,cp.question,cp.allow_change,cp.is_open,cp.status,
        o.id AS option_id,o.position,o.label,
        count(v.user_id)::int AS vote_count,
        ${viewerId ? 'EXISTS(SELECT 1 FROM creator_poll_votes myv WHERE myv.poll_id=cp.id AND myv.user_id=$2 AND myv.option_id=o.id)' : 'false'} AS voted_by_me
      FROM creator_polls cp
      JOIN creator_poll_options o ON o.poll_id=cp.id
      LEFT JOIN creator_poll_votes v ON v.option_id=o.id
      WHERE cp.post_id=ANY($1::bigint[])
        AND cp.status='active'
      GROUP BY cp.id,cp.post_id,cp.question,cp.allow_change,cp.is_open,cp.status,o.id,o.position,o.label
      ORDER BY cp.post_id,o.position
    `,viewerId ? [ids,viewerId] : [ids]),
    db.query(`
      SELECT
        cq.id AS question_id,cq.post_id,cq.prompt,cq.is_open,cq.status,
        count(r.id)::int AS response_count,
        ${viewerId ? '(SELECT qr.body FROM creator_question_responses qr WHERE qr.question_id=cq.id AND qr.user_id=$2 LIMIT 1)' : 'NULL::text'} AS my_response
      FROM creator_questions cq
      LEFT JOIN creator_question_responses r ON r.question_id=cq.id
      WHERE cq.post_id=ANY($1::bigint[])
        AND cq.status='active'
      GROUP BY cq.id,cq.post_id,cq.prompt,cq.is_open,cq.status
    `,viewerId ? [ids,viewerId] : [ids])
  ]);

  const pollMap=new Map();
  for(const row of pollRows.rows){
    const key=String(row.post_id);
    if(!pollMap.has(key)){
      pollMap.set(key,{
        id:row.poll_id,
        question:row.question,
        allow_change:row.allow_change,
        is_open:row.is_open===true,
        status:row.status,
        total_votes:0,
        options:[]
      });
    }
    const poll=pollMap.get(key);
    const count=Number(row.vote_count || 0);
    poll.total_votes+=count;
    poll.options.push({
      id:row.option_id,
      position:row.position,
      label:row.label,
      vote_count:count,
      voted_by_me:row.voted_by_me===true
    });
  }

  const questionMap=new Map(questionRows.rows.map(row=>[
    String(row.post_id),
    {
      id:row.question_id,
      prompt:row.prompt,
      is_open:row.is_open===true,
      status:row.status,
      response_count:Number(row.response_count || 0),
      my_response:row.my_response || ''
    }
  ]));

  return rows.map(row=>({
    ...row,
    community_poll:pollMap.get(String(row.id)) || null,
    community_question:questionMap.get(String(row.id)) || null
  }));
}

let savedPostsReady = null;
async function ensureSavedPostsTable() {
  if (!savedPostsReady) {
    savedPostsReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS saved_posts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON saved_posts(user_id,created_at DESC)');
    })().catch(error => {
      savedPostsReady = null;
      throw error;
    });
  }
  return savedPostsReady;
}


let creatorFeaturedV13Ready = null;
async function ensureCreatorFeaturedV13() {
  if (!creatorFeaturedV13Ready) {
    creatorFeaturedV13Ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_featured_posts (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          featured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,post_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_featured_posts_user ON creator_featured_posts(user_id,featured_at DESC)');
    })().catch(error => {
      creatorFeaturedV13Ready = null;
      throw error;
    });
  }
  return creatorFeaturedV13Ready;
}


let creatorExclusiveV18Ready = null;
async function ensureCreatorExclusiveV18() {
  if (!creatorExclusiveV18Ready) {
    creatorExclusiveV18Ready = (async () => {
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public'");
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='posts_audience_check' AND conrelid='posts'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE posts ADD CONSTRAINT posts_audience_check CHECK(audience IN ('public','vip'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_posts_audience_created ON posts(audience,created_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_vips (
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fan_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(creator_id,fan_id),
          CHECK(creator_id<>fan_id)
        )
      `);
    })().catch(error => {
      creatorExclusiveV18Ready = null;
      throw error;
    });
  }
  return creatorExclusiveV18Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorExclusiveV18();
    next();
  }catch(error){
    console.error('RedLibertad V1.18 exclusive content bootstrap failed:',error);
    res.status(500).json({error:'exclusive_content_bootstrap_failed'});
  }
});


let creatorPublishingV20Ready=null;
async function ensureCreatorPublishingV20(){
  if(!creatorPublishingV20Ready){
    creatorPublishingV20Ready=(async()=>{
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS creator_state TEXT NOT NULL DEFAULT 'live'");
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ");
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='posts_creator_state_check' AND conrelid='posts'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE posts ADD CONSTRAINT posts_creator_state_check CHECK(creator_state IN ('live','draft','scheduled'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_posts_creator_state_schedule ON posts(creator_state,scheduled_for,user_id)');
    })().catch(error=>{
      creatorPublishingV20Ready=null;
      throw error;
    });
  }
  return creatorPublishingV20Ready;
}

let schedulerRunning=false;
async function publishDueScheduledPosts(){
  if(schedulerRunning)return 0;
  schedulerRunning=true;
  try{
    await ensureCreatorPublishingV20();
    const result=await db.query(`
      UPDATE posts p
         SET creator_state='live',
             moderation_status='published',
             created_at=now(),
             updated_at=now()
        FROM users u
       WHERE p.creator_state='scheduled'
         AND p.scheduled_for IS NOT NULL
         AND p.scheduled_for<=now()
         AND p.moderation_status<>'rejected'
         AND p.consent_state IN ('none','approved')
         AND u.id=p.user_id
         AND u.status='active'
         AND (p.audience<>'vip' OR u.creator_verified=true)
         AND (p.content_level<>'nudity' OR (u.creator_verified=true AND u.age_verified=true))
      RETURNING p.id,p.user_id,p.caption,p.audience
    `);

    for(const post of result.rows){
      try{
        await notifyMentions({
          actorId:post.user_id,
          text:post.caption,
          entityType:'post',
          entityId:post.id,
          audience:post.audience
        });
      }catch(error){
        console.warn('RedLibertad scheduled mention notification failed:',error?.message || error);
      }
    }
    return result.rowCount;
  }finally{
    schedulerRunning=false;
  }
}

let lastPublishingSweepAt=0;
async function maybePublishDueScheduledPosts(){
  const now=Date.now();
  if(now-lastPublishingSweepAt<30*1000)return 0;
  lastPublishingSweepAt=now;
  return publishDueScheduledPosts();
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorPublishingV20();
    await maybePublishDueScheduledPosts();
    next();
  }catch(error){
    console.error('RedLibertad V1.20 publishing bootstrap failed:',error);
    res.status(500).json({error:'publishing_tools_bootstrap_failed'});
  }
});

setTimeout(()=>publishDueScheduledPosts().catch(error=>console.error('RedLibertad V1.20 initial scheduler failed:',error)),5000).unref?.();
setInterval(()=>publishDueScheduledPosts().catch(error=>console.error('RedLibertad V1.20 scheduler failed:',error)),60*1000).unref?.();


let creatorCalendarV21Ready=null;
async function ensureCreatorCalendarV21(){
  if(!creatorCalendarV21Ready){
    creatorCalendarV21Ready=(async()=>{
      await db.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_date DATE');
      await db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_label VARCHAR(40) NOT NULL DEFAULT ''");
      await db.query('CREATE INDEX IF NOT EXISTS idx_posts_creator_editorial_date ON posts(user_id,editorial_date)');
    })().catch(error=>{
      creatorCalendarV21Ready=null;
      throw error;
    });
  }
  return creatorCalendarV21Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCalendarV21();
    next();
  }catch(error){
    console.error('RedLibertad V1.21 calendar bootstrap failed:',error);
    res.status(500).json({error:'creator_calendar_bootstrap_failed'});
  }
});


let creatorCommunityV22Ready=null;
async function ensureCreatorCommunityV22(){
  if(!creatorCommunityV22Ready){
    creatorCommunityV22Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_polls (
          id BIGSERIAL PRIMARY KEY,
          post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
          question VARCHAR(300) NOT NULL,
          allow_change BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_poll_options (
          id BIGSERIAL PRIMARY KEY,
          poll_id BIGINT NOT NULL REFERENCES creator_polls(id) ON DELETE CASCADE,
          position SMALLINT NOT NULL,
          label VARCHAR(120) NOT NULL,
          UNIQUE(poll_id,position)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_poll_options_poll ON creator_poll_options(poll_id,position)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_poll_votes (
          poll_id BIGINT NOT NULL REFERENCES creator_polls(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          option_id BIGINT NOT NULL REFERENCES creator_poll_options(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(poll_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_poll_votes_option ON creator_poll_votes(option_id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_questions (
          id BIGSERIAL PRIMARY KEY,
          post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
          prompt VARCHAR(300) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_question_responses (
          id BIGSERIAL PRIMARY KEY,
          question_id BIGINT NOT NULL REFERENCES creator_questions(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(1000) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(question_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_question_responses_question_created ON creator_question_responses(question_id,created_at DESC)');
    })().catch(error=>{
      creatorCommunityV22Ready=null;
      throw error;
    });
  }
  return creatorCommunityV22Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCommunityV22();
    next();
  }catch(error){
    console.error('RedLibertad V1.22 creator community bootstrap failed:',error);
    res.status(500).json({error:'creator_community_bootstrap_failed'});
  }
});


let creatorCommunityV23Ready=null;
async function ensureCreatorCommunityV23(){
  if(!creatorCommunityV23Ready){
    creatorCommunityV23Ready=(async()=>{
      await db.query("ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
      await db.query("ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE");
      await db.query("ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ");
      const pollConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_polls_status_check' AND conrelid='creator_polls'::regclass LIMIT 1"
      );
      if(!pollConstraint.rowCount){
        await db.query("ALTER TABLE creator_polls ADD CONSTRAINT creator_polls_status_check CHECK(status IN ('active','archived'))");
      }

      await db.query("ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
      await db.query("ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE");
      await db.query("ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ");
      const questionConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_questions_status_check' AND conrelid='creator_questions'::regclass LIMIT 1"
      );
      if(!questionConstraint.rowCount){
        await db.query("ALTER TABLE creator_questions ADD CONSTRAINT creator_questions_status_check CHECK(status IN ('active','archived'))");
      }

      await db.query("ALTER TABLE creator_question_responses ADD COLUMN IF NOT EXISTS creator_starred BOOLEAN NOT NULL DEFAULT FALSE");
      await db.query("ALTER TABLE creator_question_responses ADD COLUMN IF NOT EXISTS starred_at TIMESTAMPTZ");
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_polls_status ON creator_polls(post_id,status,is_open)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_questions_status ON creator_questions(post_id,status,is_open)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_question_responses_starred ON creator_question_responses(question_id,creator_starred,updated_at DESC)');
    })().catch(error=>{
      creatorCommunityV23Ready=null;
      throw error;
    });
  }
  return creatorCommunityV23Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCommunityV23();
    next();
  }catch(error){
    console.error('RedLibertad V1.23 community management bootstrap failed:',error);
    res.status(500).json({error:'community_management_bootstrap_failed'});
  }
});


let creatorCommunityV24Ready=null;
async function ensureCreatorCommunityV24(){
  if(!creatorCommunityV24Ready){
    creatorCommunityV24Ready=(async()=>{
      await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
      await db.query(`
        ALTER TABLE notifications
          ADD CONSTRAINT notifications_type_check
          CHECK(type IN (
            'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
            'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast',
            'creator_poll_vote','creator_question_response','system'
          ))
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_poll_votes_created ON creator_poll_votes(created_at DESC,poll_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_question_responses_created ON creator_question_responses(created_at DESC,question_id)');
      await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_creator_community_once ON notifications(user_id,actor_id,type,entity_type,entity_id) WHERE type IN ('creator_poll_vote','creator_question_response')");
    })().catch(error=>{
      creatorCommunityV24Ready=null;
      throw error;
    });
  }
  return creatorCommunityV24Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCommunityV24();
    next();
  }catch(error){
    console.error('RedLibertad V1.24 community insights bootstrap failed:',error);
    res.status(500).json({error:'community_insights_bootstrap_failed'});
  }
});


let creatorCommunityV25Ready=null;
async function ensureCreatorCommunityV25(){
  if(!creatorCommunityV25Ready){
    creatorCommunityV25Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_community_notification_reviews (
          notification_id BIGINT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_community_reviews_creator ON creator_community_notification_reviews(creator_id,reviewed_at DESC)');
    })().catch(error=>{
      creatorCommunityV25Ready=null;
      throw error;
    });
  }
  return creatorCommunityV25Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCommunityV25();
    next();
  }catch(error){
    console.error('RedLibertad V1.25 activity center bootstrap failed:',error);
    res.status(500).json({error:'community_activity_bootstrap_failed'});
  }
});


let creatorCommunityV26Ready=null;
async function ensureCreatorCommunityV26(){
  if(!creatorCommunityV26Ready){
    creatorCommunityV26Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_community_activity_meta (
          notification_id BIGINT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          priority TEXT NOT NULL DEFAULT 'normal',
          private_note VARCHAR(1000) NOT NULL DEFAULT '',
          follow_up BOOLEAN NOT NULL DEFAULT FALSE,
          follow_up_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('ALTER TABLE creator_community_activity_meta ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ');
      const priorityConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_community_activity_priority_check' AND conrelid='creator_community_activity_meta'::regclass LIMIT 1"
      );
      if(!priorityConstraint.rowCount){
        await db.query("ALTER TABLE creator_community_activity_meta ADD CONSTRAINT creator_community_activity_priority_check CHECK(priority IN ('normal','high'))");
      }
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_community_activity_meta_creator ON creator_community_activity_meta(creator_id,follow_up,priority,updated_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_community_activity_follow_up_at ON creator_community_activity_meta(creator_id,follow_up,follow_up_at,priority)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_creator_community_activity_completed_at ON creator_community_activity_meta(creator_id,completed_at DESC) WHERE completed_at IS NOT NULL');
    })().catch(error=>{
      creatorCommunityV26Ready=null;
      throw error;
    });
  }
  return creatorCommunityV26Ready;
}

router.use(async (_req,res,next)=>{
  try{
    await ensureCreatorCommunityV26();
    next();
  }catch(error){
    console.error('RedLibertad V1.26 community follow-up bootstrap failed:',error);
    res.status(500).json({error:'community_follow_up_bootstrap_failed'});
  }
});

function postAudienceWhere(viewerParam=null, alias='p') {
  if (!viewerParam) return `${alias}.audience='public'`;
  return `(
    ${alias}.audience='public'
    OR ${alias}.user_id=${viewerParam}
    OR EXISTS(SELECT 1 FROM users audience_admin WHERE audience_admin.id=${viewerParam} AND audience_admin.is_admin=true)
    OR EXISTS(
      SELECT 1
        FROM creator_vips audience_vip
        JOIN follows audience_follow
          ON audience_follow.follower_id=audience_vip.fan_id
         AND audience_follow.following_id=audience_vip.creator_id
       WHERE audience_vip.creator_id=${alias}.user_id
         AND audience_vip.fan_id=${viewerParam}
    )
    OR EXISTS(
      SELECT 1 FROM post_participants audience_participant
       WHERE audience_participant.post_id=${alias}.id
         AND audience_participant.user_id=${viewerParam}
         AND audience_participant.consent_status='approved'
    )
  )`;
}

async function accessiblePublishedPost(postId, viewerId) {
  const result=await db.query(`
    SELECT p.id,p.user_id,p.audience,p.content_level
      FROM posts p
     WHERE p.id=$1
       AND p.moderation_status='published'
       AND ${postAudienceWhere('$2','p')}
       AND (
         p.user_id=$2
         OR EXISTS(SELECT 1 FROM users access_admin WHERE access_admin.id=$2 AND access_admin.is_admin=true)
         OR p.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id=$2
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id=$2
         )
       )
     LIMIT 1
  `,[postId,viewerId]);
  return result.rows[0] || null;
}

const createSchema = z.object({
  caption: z.string().max(2200).default(''),
  mediaUrl: z.string().max(4096).optional().default(''),
  mediaType: z.enum(['image', 'video']).optional().default('image'),
  mediaProvider: z.string().max(40).optional().default('local'),
  externalId: z.string().max(255).optional().nullable(),
  playbackUrl: z.string().max(4096).optional().nullable(),
  contentLevel: z.enum(['normal', 'sensitive', 'nudity']),
  kind: z.enum(['post', 'reel']).default('post'),
  audience: z.enum(['public','vip']).default('public'),
  publishMode: z.enum(['now','draft','scheduled']).default('now'),
  scheduledFor: z.string().datetime({offset:true}).optional().nullable(),
  editorialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  editorialLabel: z.string().trim().max(40).optional().default(''),
  communityType: z.enum(['none','poll','question']).optional().default('none'),
  communityPrompt: z.string().trim().max(300).optional().default(''),
  pollOptions: z.array(z.string().trim().min(1).max(120)).max(4).optional().default([]),
  participantUsernames: z.array(z.string().min(1).max(30)).max(10).optional().default([])
});

function parseScheduledFor(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function validScheduleDate(date){
  if(!date)return false;
  const now=Date.now();
  return date.getTime()>=now+5*60*1000 && date.getTime()<=now+90*24*60*60*1000;
}

async function sendPendingConsentRequests(postId,actorId,client=db){
  const result=await client.query(`
    SELECT pp.user_id
      FROM post_participants pp
     WHERE pp.post_id=$1
       AND pp.consent_status='pending'
       AND NOT EXISTS(
         SELECT 1 FROM notifications n
          WHERE n.user_id=pp.user_id
            AND n.actor_id=$2
            AND n.type='consent_request'
            AND n.entity_type='post'
            AND n.entity_id=$1
       )
  `,[postId,actorId]);

  for(const participant of result.rows){
    await client.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      VALUES ($1,$2,'consent_request','post',$3,'Solicita tu consentimiento para publicar contenido en el que apareces.')
    `,[participant.user_id,actorId,postId]);
  }
}

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_data', details: parsed.error.flatten() });
  const data = parsed.data;
  const hasText = Boolean(String(data.caption || '').trim());
  const hasMedia = Boolean(String(data.mediaUrl || '').trim());
  const hasCommunity = data.communityType !== 'none';

  if (!hasText && !hasMedia && !hasCommunity) {
    return res.status(400).json({ error: 'empty_post' });
  }
  if (data.kind === 'reel' && !hasMedia) {
    return res.status(400).json({ error: 'reel_media_required' });
  }
  if (!validateContentLevel(data.contentLevel)) {
    return res.status(400).json({ error: 'invalid_content_level' });
  }

  const account=await db.query(
    'SELECT creator_verified,age_verified FROM users WHERE id=$1 LIMIT 1',
    [req.user.id]
  );
  const user=account.rows[0] || {};

  if (data.contentLevel === 'nudity' && (!user.creator_verified || !user.age_verified)) {
    return res.status(403).json({ error: 'verified_creator_required_for_nudity' });
  }
  if (data.audience === 'vip' && !user.creator_verified) {
    return res.status(403).json({ error: 'verified_creator_required_for_vip_content' });
  }
  if (data.publishMode !== 'now' && !user.creator_verified) {
    return res.status(403).json({ error: 'verified_creator_required_for_publishing_tools' });
  }
  if ((data.editorialDate || String(data.editorialLabel || '').trim()) && !user.creator_verified) {
    return res.status(403).json({ error: 'verified_creator_required_for_publishing_tools' });
  }
  if (data.communityType !== 'none' && !user.creator_verified) {
    return res.status(403).json({ error: 'verified_creator_required_for_community_tools' });
  }

  if(data.communityType==='poll'){
    const options=[...new Set(data.pollOptions.map(value=>String(value || '').trim()).filter(Boolean))];
    if(String(data.communityPrompt || '').trim().length<3 || options.length<2 || options.length>4){
      return res.status(400).json({error:'invalid_creator_poll'});
    }
    data.pollOptions=options;
  }else if(data.communityType==='question'){
    if(String(data.communityPrompt || '').trim().length<3){
      return res.status(400).json({error:'invalid_creator_question'});
    }
  }

  let scheduledFor=null;
  if(data.publishMode==='scheduled'){
    scheduledFor=parseScheduledFor(data.scheduledFor);
    if(!validScheduleDate(scheduledFor)){
      return res.status(400).json({error:'invalid_scheduled_time'});
    }
  }

  const names=[...new Set(data.participantUsernames.map(x=>x.trim().replace(/^@/,'').toLowerCase()).filter(Boolean))];
  let participants=[];
  if(names.length){
    const found=await db.query(
      `SELECT id,username FROM users WHERE lower(username)=ANY($1::text[]) AND status='active'`,
      [names]
    );
    participants=found.rows.filter(u=>String(u.id)!==String(req.user.id));
    if(participants.length!==names.filter(n=>n!==String(req.user.username||'').toLowerCase()).length){
      const foundNames=new Set(found.rows.map(x=>x.username.toLowerCase()));
      const missing=names.filter(n=>!foundNames.has(n));
      if(missing.length) return res.status(400).json({error:'participant_not_found',missing});
    }
  }

  const needsConsent=participants.length>0;
  const creatorState=data.publishMode==='draft'
    ? 'draft'
    : data.publishMode==='scheduled'
      ? 'scheduled'
      : 'live';
  const shouldPublishNow=creatorState==='live' && !needsConsent;
  const moderationStatus=shouldPublishNow ? 'published' : 'under_review';

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO posts
        (user_id,caption,media_url,media_type,media_provider,external_id,playback_url,content_level,post_kind,audience,
         creator_state,scheduled_for,editorial_date,editorial_label,moderation_status,consent_state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `,[
      req.user.id,data.caption,data.mediaUrl,data.mediaType,data.mediaProvider,data.externalId,data.playbackUrl,
      data.contentLevel,data.kind,data.audience,creatorState,scheduledFor?.toISOString() || null,
      data.editorialDate || null,data.editorialLabel || '',
      moderationStatus,needsConsent?'pending':'none'
    ]);
    const post=result.rows[0];

    if(data.communityType==='poll'){
      const poll=await client.query(`
        INSERT INTO creator_polls (post_id,question)
        VALUES ($1,$2)
        RETURNING id
      `,[post.id,String(data.communityPrompt || '').trim()]);
      for(let i=0;i<data.pollOptions.length;i++){
        await client.query(`
          INSERT INTO creator_poll_options (poll_id,position,label)
          VALUES ($1,$2,$3)
        `,[poll.rows[0].id,i,data.pollOptions[i]]);
      }
    }else if(data.communityType==='question'){
      await client.query(`
        INSERT INTO creator_questions (post_id,prompt)
        VALUES ($1,$2)
      `,[post.id,String(data.communityPrompt || '').trim()]);
    }

    for(const participant of participants){
      await client.query(`
        INSERT INTO post_participants (post_id,user_id,consent_status)
        VALUES ($1,$2,'pending')
        ON CONFLICT(post_id,user_id) DO NOTHING
      `,[post.id,participant.id]);
    }

    if(creatorState!=='draft' && needsConsent){
      await sendPendingConsentRequests(post.id,req.user.id,client);
    }

    await client.query('COMMIT');

    if(shouldPublishNow){
      try{
        await notifyMentions({
          actorId:req.user.id,
          text:data.caption,
          entityType:'post',
          entityId:post.id,
          audience:data.audience
        });
      }catch(mentionError){
        console.warn('RedLibertad mention notification failed:',mentionError?.message || mentionError);
      }
    }

    res.status(201).json({
      ok:true,
      post,
      consentRequired:needsConsent,
      participants,
      publishMode:data.publishMode,
      communityType:data.communityType
    });
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({error:'post_create_failed'});
  }finally{
    client.release();
  }
});

const publishingScheduleSchema=z.object({
  scheduledFor:z.string().datetime({offset:true})
});

async function requireVerifiedCreator(userId){
  const result=await db.query(
    'SELECT creator_verified FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [userId]
  );
  return result.rows[0]?.creator_verified===true;
}

router.get('/creator/publishing',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const result=await db.query(`
    SELECT
      p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,
      p.content_level,p.post_kind,p.audience,p.creator_state,p.scheduled_for,
      p.editorial_date,p.editorial_label,
      CASE
        WHEN EXISTS(SELECT 1 FROM creator_polls cp WHERE cp.post_id=p.id) THEN 'poll'
        WHEN EXISTS(SELECT 1 FROM creator_questions cq WHERE cq.post_id=p.id) THEN 'question'
        ELSE 'none'
      END AS community_type,
      COALESCE(
        (SELECT cp.question FROM creator_polls cp WHERE cp.post_id=p.id LIMIT 1),
        (SELECT cq.prompt FROM creator_questions cq WHERE cq.post_id=p.id LIMIT 1),
        ''
      ) AS community_prompt,
      p.consent_state,p.moderation_status,p.created_at,p.updated_at,
      (SELECT count(*)::int FROM post_participants pp WHERE pp.post_id=p.id) participant_count,
      (SELECT count(*)::int FROM post_participants pp WHERE pp.post_id=p.id AND pp.consent_status<>'approved') pending_consent_count
    FROM posts p
    WHERE p.user_id=$1
      AND p.creator_state IN ('draft','scheduled')
    ORDER BY
      CASE WHEN p.creator_state='scheduled' THEN 0 ELSE 1 END,
      p.scheduled_for ASC NULLS LAST,
      p.updated_at DESC
    LIMIT 100
  `,[req.user.id]);

  const counts=await db.query(`
    SELECT
      count(*) FILTER (WHERE creator_state='draft')::int AS draft_count,
      count(*) FILTER (WHERE creator_state='scheduled')::int AS scheduled_count
    FROM posts
    WHERE user_id=$1
      AND creator_state IN ('draft','scheduled')
  `,[req.user.id]);

  res.json({
    posts:result.rows,
    summary:counts.rows[0] || {draft_count:0,scheduled_count:0},
    scheduleMinMinutes:5,
    scheduleMaxDays:90
  });
});

router.post('/creator/publishing/:id/publish',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const client=await db.pool.connect();
  let publishedPost=null;
  try{
    await client.query('BEGIN');
    const found=await client.query(`
      SELECT p.id,p.user_id,p.caption,p.audience,p.content_level,p.creator_state,p.consent_state,p.moderation_status,
             u.creator_verified,u.age_verified
      FROM posts p
      JOIN users u ON u.id=p.user_id
      WHERE p.id=$1 AND p.user_id=$2
      FOR UPDATE OF p
    `,[req.params.id,req.user.id]);

    if(!found.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'post_not_found'});
    }

    const post=found.rows[0];
    if(!['draft','scheduled'].includes(post.creator_state)){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'post_not_pending'});
    }
    if(post.moderation_status==='rejected'){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'post_rejected'});
    }
    if(post.audience==='vip' && !post.creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required_for_vip_content'});
    }
    if(post.content_level==='nudity' && (!post.creator_verified || !post.age_verified)){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required_for_nudity'});
    }

    await sendPendingConsentRequests(post.id,req.user.id,client);
    const pending=await client.query(
      "SELECT count(*)::int n FROM post_participants WHERE post_id=$1 AND consent_status<>'approved'",
      [post.id]
    );
    const participantCount=await client.query(
      'SELECT count(*)::int n FROM post_participants WHERE post_id=$1',
      [post.id]
    );
    const waiting=Number(pending.rows[0]?.n || 0)>0;
    const hasParticipants=Number(participantCount.rows[0]?.n || 0)>0;

    const updated=await client.query(`
      UPDATE posts
         SET creator_state='live',
             scheduled_for=NULL,
             moderation_status=$2,
             consent_state=$3,
             created_at=CASE WHEN $2='published' THEN now() ELSE created_at END,
             updated_at=now()
       WHERE id=$1
       RETURNING *
    `,[
      post.id,
      waiting ? 'under_review' : 'published',
      hasParticipants ? (waiting ? 'pending' : 'approved') : 'none'
    ]);

    await client.query('COMMIT');
    publishedPost=updated.rows[0];

    if(!waiting){
      try{
        await notifyMentions({
          actorId:req.user.id,
          text:publishedPost.caption,
          entityType:'post',
          entityId:publishedPost.id,
          audience:publishedPost.audience
        });
      }catch(error){
        console.warn('RedLibertad V1.20 publish mention notification failed:',error?.message || error);
      }
    }

    res.json({
      ok:true,
      post:publishedPost,
      published:!waiting,
      awaitingConsent:waiting
    });
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad V1.20 publish now failed:',error);
    res.status(500).json({error:'publish_now_failed'});
  }finally{
    client.release();
  }
});

router.patch('/creator/publishing/:id/schedule',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const parsed=publishingScheduleSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_scheduled_time'});
  const scheduledFor=parseScheduledFor(parsed.data.scheduledFor);
  if(!validScheduleDate(scheduledFor)){
    return res.status(400).json({error:'invalid_scheduled_time'});
  }

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query(`
      SELECT p.id,p.creator_state,p.moderation_status,p.content_level,p.audience,
             u.creator_verified,u.age_verified
      FROM posts p
      JOIN users u ON u.id=p.user_id
      WHERE p.id=$1 AND p.user_id=$2
      FOR UPDATE OF p
    `,[req.params.id,req.user.id]);

    if(!found.rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'post_not_found'});
    }
    if(!['draft','scheduled'].includes(found.rows[0].creator_state)){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'post_not_pending'});
    }
    if(found.rows[0].moderation_status==='rejected'){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'post_rejected'});
    }
    const source=found.rows[0];
    if(source.audience==='vip' && !source.creator_verified){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required_for_vip_content'});
    }
    if(source.content_level==='nudity' && (!source.creator_verified || !source.age_verified)){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'verified_creator_required_for_nudity'});
    }

    await sendPendingConsentRequests(req.params.id,req.user.id,client);
    const updated=await client.query(`
      UPDATE posts
         SET creator_state='scheduled',
             scheduled_for=$2,
             moderation_status='under_review',
             updated_at=now()
       WHERE id=$1
       RETURNING *
    `,[req.params.id,scheduledFor.toISOString()]);

    await client.query('COMMIT');
    res.json({ok:true,post:updated.rows[0]});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad V1.20 schedule update failed:',error);
    res.status(500).json({error:'schedule_update_failed'});
  }finally{
    client.release();
  }
});

router.post('/creator/publishing/:id/draft',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const updated=await db.query(`
    UPDATE posts
       SET creator_state='draft',
           scheduled_for=NULL,
           moderation_status='under_review',
           updated_at=now()
     WHERE id=$1
       AND user_id=$2
       AND creator_state='scheduled'
       AND moderation_status<>'rejected'
     RETURNING *
  `,[req.params.id,req.user.id]);

  if(!updated.rowCount)return res.status(404).json({error:'post_not_pending'});
  res.json({ok:true,post:updated.rows[0]});
});

const editorialMetaSchema=z.object({
  editorialDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  editorialLabel:z.string().trim().max(40).optional().default('')
});

router.patch('/creator/editorial/:id',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const parsed=editorialMetaSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_editorial_metadata'});

  const updated=await db.query(`
    UPDATE posts
       SET editorial_date=$3,
           editorial_label=$4,
           updated_at=now()
     WHERE id=$1
       AND user_id=$2
     RETURNING id,editorial_date,editorial_label,creator_state,scheduled_for,created_at
  `,[
    req.params.id,
    req.user.id,
    parsed.data.editorialDate || null,
    parsed.data.editorialLabel || ''
  ]);

  if(!updated.rowCount)return res.status(404).json({error:'post_not_found'});
  res.json({ok:true,post:updated.rows[0]});
});

router.get('/creator/calendar',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_publishing_tools'});
  }

  const from=new Date(String(req.query.from || ''));
  const to=new Date(String(req.query.to || ''));
  const dateFrom=String(req.query.dateFrom || '');
  const dateTo=String(req.query.dateTo || '');
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;

  if(!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to<=from ||
     to.getTime()-from.getTime()>45*24*60*60*1000 ||
     !datePattern.test(dateFrom) || !datePattern.test(dateTo)){
    return res.status(400).json({error:'invalid_calendar_range'});
  }

  const result=await db.query(`
    SELECT
      p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,
      p.content_level,p.post_kind,p.audience,p.creator_state,p.scheduled_for,
      p.editorial_date,p.editorial_label,
      CASE
        WHEN EXISTS(SELECT 1 FROM creator_polls cp WHERE cp.post_id=p.id) THEN 'poll'
        WHEN EXISTS(SELECT 1 FROM creator_questions cq WHERE cq.post_id=p.id) THEN 'question'
        ELSE 'none'
      END AS community_type,
      COALESCE(
        (SELECT cp.question FROM creator_polls cp WHERE cp.post_id=p.id LIMIT 1),
        (SELECT cq.prompt FROM creator_questions cq WHERE cq.post_id=p.id LIMIT 1),
        ''
      ) AS community_prompt,
      p.consent_state,p.moderation_status,
      p.created_at,p.updated_at,
      (SELECT count(*)::int FROM post_participants pp WHERE pp.post_id=p.id AND pp.consent_status<>'approved') pending_consent_count
    FROM posts p
    WHERE p.user_id=$1
      AND p.moderation_status<>'rejected'
      AND (
        (p.editorial_date IS NOT NULL AND p.editorial_date >= $2::date AND p.editorial_date < $3::date)
        OR (
          p.editorial_date IS NULL
          AND p.creator_state='scheduled'
          AND p.scheduled_for >= $4::timestamptz
          AND p.scheduled_for < $5::timestamptz
        )
        OR (
          p.editorial_date IS NULL
          AND p.creator_state='live'
          AND p.moderation_status='published'
          AND p.created_at >= $4::timestamptz
          AND p.created_at < $5::timestamptz
        )
      )
    ORDER BY
      COALESCE(p.editorial_date::text,p.scheduled_for::date::text,p.created_at::date::text),
      COALESCE(p.scheduled_for,p.created_at),
      p.id
    LIMIT 500
  `,[req.user.id,dateFrom,dateTo,from.toISOString(),to.toISOString()]);

  const labels=[...new Set(result.rows.map(row=>String(row.editorial_label || '').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'es'));

  res.json({posts:result.rows,labels,from:from.toISOString(),to:to.toISOString(),dateFrom,dateTo});
});

const creatorPollVoteSchema=z.object({
  optionId:z.union([z.string().regex(/^\d+$/),z.number().int().positive()]).transform(value=>String(value))
});

router.post('/:id/poll-vote',requireAuth,async(req,res)=>{
  const parsed=creatorPollVoteSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_poll_vote'});

  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});

  const poll=await db.query(`
    SELECT cp.id,cp.allow_change,cp.is_open,cp.status
      FROM creator_polls cp
     WHERE cp.post_id=$1
     LIMIT 1
  `,[req.params.id]);
  if(!poll.rowCount)return res.status(404).json({error:'poll_not_found'});
  if(poll.rows[0].status!=='active')return res.status(409).json({error:'poll_archived'});
  if(!poll.rows[0].is_open)return res.status(409).json({error:'poll_closed'});

  const option=await db.query(`
    SELECT id
      FROM creator_poll_options
     WHERE id=$1
       AND poll_id=$2
     LIMIT 1
  `,[parsed.data.optionId,poll.rows[0].id]);
  if(!option.rowCount)return res.status(400).json({error:'invalid_poll_option'});

  const existing=await db.query(
    'SELECT option_id FROM creator_poll_votes WHERE poll_id=$1 AND user_id=$2 LIMIT 1',
    [poll.rows[0].id,req.user.id]
  );
  if(existing.rowCount && !poll.rows[0].allow_change && String(existing.rows[0].option_id)!==String(parsed.data.optionId)){
    return res.status(409).json({error:'poll_vote_locked'});
  }

  await db.query(`
    INSERT INTO creator_poll_votes (poll_id,user_id,option_id)
    VALUES ($1,$2,$3)
    ON CONFLICT(poll_id,user_id) DO UPDATE
      SET option_id=excluded.option_id,
          updated_at=now()
  `,[poll.rows[0].id,req.user.id,parsed.data.optionId]);

  if(!existing.rowCount && String(visiblePost.user_id)!==String(req.user.id)){
    await db.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      SELECT $1,$2,'creator_poll_vote','creator_community',$3,'Ha votado en tu encuesta.'
      WHERE NOT EXISTS(
        SELECT 1 FROM notifications
         WHERE user_id=$1
           AND actor_id=$2
           AND type='creator_poll_vote'
           AND entity_type='creator_community'
           AND entity_id=$3
      )
      ON CONFLICT DO NOTHING
    `,[visiblePost.user_id,req.user.id,req.params.id]);
  }

  const attached=await attachCommunityMeta([{id:req.params.id}],req.user.id);
  res.json({ok:true,poll:attached[0]?.community_poll || null});
});

router.delete('/:id/poll-vote',requireAuth,async(req,res)=>{
  const poll=await db.query(
    'SELECT id FROM creator_polls WHERE post_id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!poll.rowCount)return res.status(404).json({error:'poll_not_found'});

  await db.query(
    'DELETE FROM creator_poll_votes WHERE poll_id=$1 AND user_id=$2',
    [poll.rows[0].id,req.user.id]
  );

  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.json({ok:true,poll:null});
  const attached=await attachCommunityMeta([{id:req.params.id}],req.user.id);
  res.json({ok:true,poll:attached[0]?.community_poll || null});
});

const creatorQuestionResponseSchema=z.object({
  body:z.string().trim().min(1).max(1000)
});

router.post('/:id/question-response',requireAuth,async(req,res)=>{
  const parsed=creatorQuestionResponseSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_question_response'});

  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});

  const question=await db.query(
    'SELECT id,is_open,status FROM creator_questions WHERE post_id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!question.rowCount)return res.status(404).json({error:'question_not_found'});
  if(question.rows[0].status!=='active')return res.status(409).json({error:'question_archived'});
  if(!question.rows[0].is_open)return res.status(409).json({error:'question_closed'});

  const existingResponse=await db.query(
    'SELECT id FROM creator_question_responses WHERE question_id=$1 AND user_id=$2 LIMIT 1',
    [question.rows[0].id,req.user.id]
  );

  const response=await db.query(`
    INSERT INTO creator_question_responses (question_id,user_id,body)
    VALUES ($1,$2,$3)
    ON CONFLICT(question_id,user_id) DO UPDATE
      SET body=excluded.body,
          updated_at=now()
    RETURNING id,question_id,user_id,body,created_at,updated_at
  `,[question.rows[0].id,req.user.id,parsed.data.body]);

  if(!existingResponse.rowCount && String(visiblePost.user_id)!==String(req.user.id)){
    await db.query(`
      INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
      SELECT $1,$2,'creator_question_response','creator_community',$3,'Ha respondido a tu pregunta.'
      WHERE NOT EXISTS(
        SELECT 1 FROM notifications
         WHERE user_id=$1
           AND actor_id=$2
           AND type='creator_question_response'
           AND entity_type='creator_community'
           AND entity_id=$3
      )
      ON CONFLICT DO NOTHING
    `,[visiblePost.user_id,req.user.id,req.params.id]);
  }

  const count=await db.query(
    'SELECT count(*)::int n FROM creator_question_responses WHERE question_id=$1',
    [question.rows[0].id]
  );

  res.json({
    ok:true,
    response:response.rows[0],
    responseCount:Number(count.rows[0]?.n || 0)
  });
});

router.delete('/:id/question-response',requireAuth,async(req,res)=>{
  const question=await db.query(
    'SELECT id FROM creator_questions WHERE post_id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!question.rowCount)return res.status(404).json({error:'question_not_found'});

  await db.query(
    'DELETE FROM creator_question_responses WHERE question_id=$1 AND user_id=$2',
    [question.rows[0].id,req.user.id]
  );

  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.json({ok:true,responseCount:null});

  const count=await db.query(
    'SELECT count(*)::int n FROM creator_question_responses WHERE question_id=$1',
    [question.rows[0].id]
  );

  res.json({ok:true,responseCount:Number(count.rows[0]?.n || 0)});
});

const communityManageSchema=z.object({
  action:z.enum(['close','reopen','archive','restore'])
});

router.patch('/creator/community/polls/:pollId',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=communityManageSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_community_action'});

  const found=await db.query(`
    SELECT cp.id,cp.post_id,cp.status,cp.is_open
      FROM creator_polls cp
      JOIN posts p ON p.id=cp.post_id
     WHERE cp.id=$1 AND p.user_id=$2
     LIMIT 1
  `,[req.params.pollId,req.user.id]);
  if(!found.rowCount)return res.status(404).json({error:'poll_not_found'});

  const action=parsed.data.action;
  const updated=await db.query(`
    UPDATE creator_polls
       SET status=CASE
             WHEN $2='archive' THEN 'archived'
             WHEN $2='restore' THEN 'active'
             ELSE status
           END,
           is_open=CASE
             WHEN $2='close' THEN false
             WHEN $2='reopen' THEN true
             WHEN $2='archive' THEN false
             ELSE is_open
           END,
           archived_at=CASE
             WHEN $2='archive' THEN now()
             WHEN $2='restore' THEN NULL
             ELSE archived_at
           END
     WHERE id=$1
     RETURNING id,post_id,status,is_open,archived_at
  `,[req.params.pollId,action]);

  res.json({ok:true,poll:updated.rows[0]});
});

router.patch('/creator/community/questions/:questionId',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=communityManageSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_community_action'});

  const found=await db.query(`
    SELECT cq.id,cq.post_id,cq.status,cq.is_open
      FROM creator_questions cq
      JOIN posts p ON p.id=cq.post_id
     WHERE cq.id=$1 AND p.user_id=$2
     LIMIT 1
  `,[req.params.questionId,req.user.id]);
  if(!found.rowCount)return res.status(404).json({error:'question_not_found'});

  const action=parsed.data.action;
  const updated=await db.query(`
    UPDATE creator_questions
       SET status=CASE
             WHEN $2='archive' THEN 'archived'
             WHEN $2='restore' THEN 'active'
             ELSE status
           END,
           is_open=CASE
             WHEN $2='close' THEN false
             WHEN $2='reopen' THEN true
             WHEN $2='archive' THEN false
             ELSE is_open
           END,
           archived_at=CASE
             WHEN $2='archive' THEN now()
             WHEN $2='restore' THEN NULL
             ELSE archived_at
           END
     WHERE id=$1
     RETURNING id,post_id,status,is_open,archived_at
  `,[req.params.questionId,action]);

  res.json({ok:true,question:updated.rows[0]});
});

const responseStarSchema=z.object({starred:z.boolean()});

router.patch('/creator/community/responses/:responseId/star',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=responseStarSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_star_state'});

  const updated=await db.query(`
    UPDATE creator_question_responses qr
       SET creator_starred=$3,
           starred_at=CASE WHEN $3 THEN now() ELSE NULL END,
           updated_at=now()
      FROM creator_questions cq
      JOIN posts p ON p.id=cq.post_id
     WHERE qr.id=$1
       AND qr.question_id=cq.id
       AND p.user_id=$2
     RETURNING qr.id,qr.question_id,qr.creator_starred,qr.starred_at
  `,[req.params.responseId,req.user.id,parsed.data.starred]);

  if(!updated.rowCount)return res.status(404).json({error:'response_not_found'});
  res.json({ok:true,response:updated.rows[0]});
});

const creatorCommunityReviewSchema=z.object({
  notificationIds:z.array(
    z.union([z.string().regex(/^\d+$/),z.number().int().positive()]).transform(value=>String(value))
  ).min(1).max(100)
});

router.get('/creator/community-activity',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }

  const status=String(req.query.status || 'pending');
  const focus=String(req.query.focus || 'all');
  if(!['pending','reviewed','all'].includes(status)){
    return res.status(400).json({error:'invalid_activity_status'});
  }
  if(!['all','high','followup'].includes(focus)){
    return res.status(400).json({error:'invalid_activity_focus'});
  }

  const rows=await db.query(`
    SELECT
      n.id notification_id,n.type,n.created_at,n.read_at,
      review.reviewed_at,
      COALESCE(meta.priority,'normal') activity_priority,
      COALESCE(meta.private_note,'') activity_note,
      COALESCE(meta.follow_up,false) activity_follow_up,
      meta.follow_up_at activity_follow_up_at,
      meta.updated_at activity_meta_updated_at,
      actor.id actor_id,actor.username actor_username,actor.display_name actor_display_name,
      actor.avatar_url actor_avatar_url,actor.creator_verified actor_creator_verified,
      p.id post_id,p.caption,p.audience,p.created_at post_created_at,
      cp.id poll_id,cp.question poll_question,cp.status poll_status,cp.is_open poll_is_open,
      poll_option.id current_option_id,poll_option.label current_option_label,
      cq.id question_id,cq.prompt question_prompt,cq.status question_status,cq.is_open question_is_open,
      qr.id response_id,qr.body current_response_body,qr.creator_starred response_starred,qr.updated_at response_updated_at
    FROM notifications n
    JOIN posts p
      ON p.id=n.entity_id
     AND p.user_id=$1
    LEFT JOIN users actor ON actor.id=n.actor_id
    LEFT JOIN creator_community_notification_reviews review
      ON review.notification_id=n.id
     AND review.creator_id=$1
    LEFT JOIN creator_community_activity_meta meta
      ON meta.notification_id=n.id
     AND meta.creator_id=$1
    LEFT JOIN creator_polls cp
      ON cp.post_id=p.id
     AND n.type='creator_poll_vote'
    LEFT JOIN creator_poll_votes current_vote
      ON current_vote.poll_id=cp.id
     AND current_vote.user_id=n.actor_id
    LEFT JOIN creator_poll_options poll_option
      ON poll_option.id=current_vote.option_id
    LEFT JOIN creator_questions cq
      ON cq.post_id=p.id
     AND n.type='creator_question_response'
    LEFT JOIN creator_question_responses qr
      ON qr.question_id=cq.id
     AND qr.user_id=n.actor_id
    WHERE n.user_id=$1
      AND n.entity_type='creator_community'
      AND n.type IN ('creator_poll_vote','creator_question_response')
      AND (
        $2='all'
        OR ($2='pending' AND review.reviewed_at IS NULL)
        OR ($2='reviewed' AND review.reviewed_at IS NOT NULL)
      )
      AND (
        $3='all'
        OR ($3='high' AND COALESCE(meta.priority,'normal')='high')
        OR ($3='followup' AND COALESCE(meta.follow_up,false)=true)
      )
    ORDER BY
      COALESCE(meta.priority,'normal')='high' DESC,
      COALESCE(meta.follow_up,false) DESC,
      n.created_at DESC,n.id DESC
    LIMIT 300
  `,[req.user.id,status,focus]);

  const groups=new Map();
  let pendingCount=0;
  for(const row of rows.rows){
    if(!row.reviewed_at)pendingCount++;
    const kind=row.type==='creator_poll_vote' ? 'poll' : 'question';
    const key=`${kind}:${row.post_id}`;
    if(!groups.has(key)){
      groups.set(key,{
        key,
        kind,
        post_id:row.post_id,
        prompt:kind==='poll' ? row.poll_question : row.question_prompt,
        audience:row.audience,
        tool_status:kind==='poll' ? row.poll_status : row.question_status,
        tool_is_open:kind==='poll' ? row.poll_is_open===true : row.question_is_open===true,
        total_count:0,
        pending_count:0,
        latest_at:row.created_at,
        notification_ids:[],
        pending_notification_ids:[],
        items:[]
      });
    }
    const group=groups.get(key);
    group.total_count++;
    if(!row.reviewed_at)group.pending_count++;
    group.notification_ids.push(String(row.notification_id));
    if(!row.reviewed_at)group.pending_notification_ids.push(String(row.notification_id));
    group.items.push({
      notification_id:row.notification_id,
      type:row.type,
      created_at:row.created_at,
      reviewed_at:row.reviewed_at,
      management:{
        priority:row.activity_priority || 'normal',
        note:row.activity_note || '',
        follow_up:row.activity_follow_up===true,
        follow_up_at:row.activity_follow_up_at || null,
        updated_at:row.activity_meta_updated_at || null
      },
      actor:{
        id:row.actor_id,
        username:row.actor_username,
        display_name:row.actor_display_name || row.actor_username || 'Cuenta eliminada',
        avatar_url:row.actor_avatar_url,
        creator_verified:row.actor_creator_verified===true
      },
      interaction:kind==='poll'
        ? {
            withdrawn:!row.current_option_id,
            option_id:row.current_option_id,
            option_label:row.current_option_label || ''
          }
        : {
            withdrawn:!row.response_id,
            response_id:row.response_id,
            body:row.current_response_body || '',
            starred:row.response_starred===true,
            updated_at:row.response_updated_at
          }
    });
  }

  const allCount=await db.query(`
    SELECT
      count(*)::int total_count,
      count(*) FILTER (WHERE review.reviewed_at IS NULL)::int pending_count,
      count(*) FILTER (WHERE COALESCE(meta.priority,'normal')='high')::int high_priority_count,
      count(*) FILTER (WHERE COALESCE(meta.follow_up,false)=true)::int follow_up_count
    FROM notifications n
    JOIN posts activity_post
      ON activity_post.id=n.entity_id
     AND activity_post.user_id=$1
    LEFT JOIN creator_community_notification_reviews review
      ON review.notification_id=n.id
     AND review.creator_id=$1
    LEFT JOIN creator_community_activity_meta meta
      ON meta.notification_id=n.id
     AND meta.creator_id=$1
    WHERE n.user_id=$1
      AND n.entity_type='creator_community'
      AND n.type IN ('creator_poll_vote','creator_question_response')
  `,[req.user.id]);

  res.json({
    status,
    focus,
    totalCount:Number(allCount.rows[0]?.total_count || 0),
    pendingCount:Number(allCount.rows[0]?.pending_count || 0),
    highPriorityCount:Number(allCount.rows[0]?.high_priority_count || 0),
    followUpCount:Number(allCount.rows[0]?.follow_up_count || 0),
    groups:[...groups.values()]
  });
});

router.post('/creator/community-activity/review',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=creatorCommunityReviewSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_activity_review'});

  const ids=[...new Set(parsed.data.notificationIds)];
  const result=await db.query(`
    INSERT INTO creator_community_notification_reviews (notification_id,creator_id,reviewed_at)
    SELECT n.id,$2,now()
      FROM notifications n
     WHERE n.id=ANY($1::bigint[])
       AND n.user_id=$2
       AND n.entity_type='creator_community'
       AND n.type IN ('creator_poll_vote','creator_question_response')
    ON CONFLICT(notification_id) DO UPDATE
      SET creator_id=excluded.creator_id,
          reviewed_at=excluded.reviewed_at
    RETURNING notification_id
  `,[ids,req.user.id]);

  res.json({ok:true,reviewed:result.rows.map(row=>row.notification_id)});
});

router.post('/creator/community-activity/review-all',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }

  const result=await db.query(`
    INSERT INTO creator_community_notification_reviews (notification_id,creator_id,reviewed_at)
    SELECT n.id,$1,now()
      FROM notifications n
      LEFT JOIN creator_community_notification_reviews review
        ON review.notification_id=n.id
       AND review.creator_id=$1
     WHERE n.user_id=$1
       AND n.entity_type='creator_community'
       AND n.type IN ('creator_poll_vote','creator_question_response')
       AND review.notification_id IS NULL
    ON CONFLICT(notification_id) DO UPDATE
      SET creator_id=excluded.creator_id,
          reviewed_at=excluded.reviewed_at
    RETURNING notification_id
  `,[req.user.id]);

  res.json({ok:true,reviewedCount:result.rowCount});
});

const creatorActivityMetaSchema=z.object({
  priority:z.enum(['normal','high']).default('normal'),
  privateNote:z.string().trim().max(1000).default(''),
  followUp:z.boolean().default(false),
  followUpAt:z.string().datetime({offset:true}).nullable().optional()
});

router.patch('/creator/community-activity/:notificationId/meta',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=creatorActivityMetaSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_activity_meta'});

  const data=parsed.data;
  const followUpAt=data.followUp && data.followUpAt ? new Date(data.followUpAt) : null;
  if(followUpAt && !Number.isFinite(followUpAt.getTime())){
    return res.status(400).json({error:'invalid_follow_up_date'});
  }

  const result=await db.query(`
    INSERT INTO creator_community_activity_meta
      (notification_id,creator_id,priority,private_note,follow_up,follow_up_at,updated_at)
    SELECT n.id,$2,$3,$4,$5,$6,now()
      FROM notifications n
     WHERE n.id=$1
       AND n.user_id=$2
       AND n.entity_type='creator_community'
       AND n.type IN ('creator_poll_vote','creator_question_response')
    ON CONFLICT(notification_id) DO UPDATE
      SET creator_id=excluded.creator_id,
          priority=excluded.priority,
          private_note=excluded.private_note,
          follow_up=excluded.follow_up,
          follow_up_at=excluded.follow_up_at,
          completed_at=CASE WHEN excluded.follow_up THEN NULL ELSE creator_community_activity_meta.completed_at END,
          updated_at=now()
    RETURNING notification_id,priority,private_note,follow_up,follow_up_at,completed_at,updated_at
  `,[
    req.params.notificationId,
    req.user.id,
    data.priority,
    data.privateNote,
    data.followUp,
    followUpAt ? followUpAt.toISOString() : null
  ]);

  if(!result.rowCount)return res.status(404).json({error:'activity_not_found'});
  res.json({ok:true,meta:result.rows[0]});
});

const creatorFollowUpBulkSchema=z.object({
  notificationIds:z.array(
    z.union([z.string().regex(/^\d+$/),z.number().int().positive()]).transform(value=>String(value))
  ).min(1).max(100),
  action:z.enum(['priority_high','priority_normal','close_follow_up','mark_reviewed','reopen','reschedule']),
  followUpAt:z.string().datetime({offset:true}).nullable().optional()
});

router.get('/creator/community-follow-ups',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }

  const status=String(req.query.status || 'active');
  const window=String(req.query.window || 'all');
  const priority=String(req.query.priority || 'all');
  const q=String(req.query.q || '').trim().slice(0,120);
  const localDayEnd=new Date(String(req.query.dayEnd || ''));
  if(!['active','completed'].includes(status)){
    return res.status(400).json({error:'invalid_follow_up_status'});
  }
  if(!['all','overdue','today','week','later','undated'].includes(window)){
    return res.status(400).json({error:'invalid_follow_up_window'});
  }
  if(!['all','high','normal'].includes(priority)){
    return res.status(400).json({error:'invalid_follow_up_priority'});
  }
  if(!Number.isFinite(localDayEnd.getTime())){
    return res.status(400).json({error:'invalid_follow_up_day_end'});
  }

  const result=await db.query(`
    SELECT
      n.id notification_id,n.type,n.created_at,
      review.reviewed_at,
      meta.priority,meta.private_note,meta.follow_up,meta.follow_up_at,meta.completed_at,meta.updated_at meta_updated_at,
      actor.id actor_id,actor.username actor_username,actor.display_name actor_display_name,
      actor.avatar_url actor_avatar_url,actor.creator_verified actor_creator_verified,
      p.id post_id,p.caption,p.audience,
      cp.question poll_question,
      cq.prompt question_prompt,
      CASE
        WHEN meta.completed_at IS NOT NULL AND meta.follow_up=false THEN 'completed'
        WHEN meta.follow_up_at IS NULL THEN 'undated'
        WHEN meta.follow_up_at < now() THEN 'overdue'
        WHEN meta.follow_up_at < $6::timestamptz THEN 'today'
        WHEN meta.follow_up_at < now() + interval '7 days' THEN 'week'
        ELSE 'later'
      END follow_up_window
    FROM creator_community_activity_meta meta
    JOIN notifications n
      ON n.id=meta.notification_id
     AND n.user_id=$1
     AND n.entity_type='creator_community'
     AND n.type IN ('creator_poll_vote','creator_question_response')
    JOIN posts p
      ON p.id=n.entity_id
     AND p.user_id=$1
    LEFT JOIN users actor ON actor.id=n.actor_id
    LEFT JOIN creator_community_notification_reviews review
      ON review.notification_id=n.id
     AND review.creator_id=$1
    LEFT JOIN creator_polls cp
      ON cp.post_id=p.id
     AND n.type='creator_poll_vote'
    LEFT JOIN creator_questions cq
      ON cq.post_id=p.id
     AND n.type='creator_question_response'
    WHERE meta.creator_id=$1
      AND (
        ($2='active' AND meta.follow_up=true)
        OR ($2='completed' AND meta.follow_up=false AND meta.completed_at IS NOT NULL)
      )
      AND (
        $2='completed'
        OR $3='all'
        OR ($3='overdue' AND meta.follow_up_at IS NOT NULL AND meta.follow_up_at<now())
        OR ($3='today' AND meta.follow_up_at IS NOT NULL AND meta.follow_up_at>=now() AND meta.follow_up_at<$6::timestamptz)
        OR ($3='week' AND meta.follow_up_at IS NOT NULL AND meta.follow_up_at>=$6::timestamptz AND meta.follow_up_at<now()+interval '7 days')
        OR ($3='later' AND meta.follow_up_at IS NOT NULL AND meta.follow_up_at>=now()+interval '7 days')
        OR ($3='undated' AND meta.follow_up_at IS NULL)
      )
      AND ($4='' OR meta.private_note ILIKE '%' || $4 || '%')
      AND ($5='all' OR meta.priority=$5)
    ORDER BY
      CASE WHEN $2='completed' THEN meta.completed_at END DESC NULLS LAST,
      CASE WHEN $2='active' AND meta.priority='high' THEN 1 ELSE 0 END DESC,
      CASE WHEN $2='active' THEN meta.follow_up_at END ASC NULLS LAST,
      meta.updated_at DESC
    LIMIT 250
  `,[req.user.id,status,window,q,priority,localDayEnd.toISOString()]);

  const summary=await db.query(`
    SELECT
      count(*) FILTER (WHERE follow_up=true)::int total,
      count(*) FILTER (WHERE follow_up=true AND follow_up_at IS NOT NULL AND follow_up_at<now())::int overdue,
      count(*) FILTER (
        WHERE follow_up=true
          AND follow_up_at IS NOT NULL
          AND follow_up_at>=now()
          AND follow_up_at<$2::timestamptz
      )::int today,
      count(*) FILTER (
        WHERE follow_up=true
          AND follow_up_at IS NOT NULL
          AND follow_up_at>=$2::timestamptz
          AND follow_up_at<now()+interval '7 days'
      )::int week,
      count(*) FILTER (WHERE follow_up=true AND follow_up_at IS NOT NULL AND follow_up_at>=now()+interval '7 days')::int later,
      count(*) FILTER (WHERE follow_up=true AND follow_up_at IS NULL)::int undated,
      count(*) FILTER (WHERE priority='high' AND follow_up=true)::int high_priority,
      count(*) FILTER (WHERE completed_at IS NOT NULL AND follow_up=false)::int completed_total,
      count(*) FILTER (WHERE completed_at IS NOT NULL AND follow_up=false AND completed_at>=now()-interval '30 days')::int completed_30d
    FROM creator_community_activity_meta meta
    JOIN notifications n
      ON n.id=meta.notification_id
     AND n.user_id=$1
     AND n.entity_type='creator_community'
     AND n.type IN ('creator_poll_vote','creator_question_response')
    JOIN posts p
      ON p.id=n.entity_id
     AND p.user_id=$1
    WHERE meta.creator_id=$1
  `,[req.user.id,localDayEnd.toISOString()]);

  res.json({
    status,
    window,
    priority,
    q,
    summary:summary.rows[0] || {total:0,overdue:0,today:0,week:0,later:0,undated:0,high_priority:0,completed_total:0,completed_30d:0},
    items:result.rows.map(row=>({
      notification_id:row.notification_id,
      type:row.type,
      reviewed_at:row.reviewed_at,
      priority:row.priority,
      private_note:row.private_note || '',
      follow_up_at:row.follow_up_at,
      completed_at:row.completed_at,
      follow_up_window:row.follow_up_window,
      meta_updated_at:row.meta_updated_at,
      post_id:row.post_id,
      audience:row.audience,
      prompt:row.type==='creator_poll_vote' ? row.poll_question : row.question_prompt,
      actor:{
        id:row.actor_id,
        username:row.actor_username,
        display_name:row.actor_display_name || row.actor_username || 'Cuenta eliminada',
        avatar_url:row.actor_avatar_url,
        creator_verified:row.actor_creator_verified===true
      }
    }))
  });
});

router.patch('/creator/community-follow-ups/bulk',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }
  const parsed=creatorFollowUpBulkSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_follow_up_bulk_action'});

  const ids=[...new Set(parsed.data.notificationIds)];
  const action=parsed.data.action;
  const hasFollowUpAt=Object.prototype.hasOwnProperty.call(parsed.data,'followUpAt');
  const followUpAt=parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null;
  if(action==='reschedule' && !hasFollowUpAt){
    return res.status(400).json({error:'follow_up_date_required'});
  }
  if(followUpAt && !Number.isFinite(followUpAt.getTime())){
    return res.status(400).json({error:'invalid_follow_up_date'});
  }

  let result;
  if(action==='mark_reviewed'){
    result=await db.query(`
      INSERT INTO creator_community_notification_reviews (notification_id,creator_id,reviewed_at)
      SELECT n.id,$2,now()
        FROM notifications n
       WHERE n.id=ANY($1::bigint[])
         AND n.user_id=$2
         AND n.entity_type='creator_community'
         AND n.type IN ('creator_poll_vote','creator_question_response')
      ON CONFLICT(notification_id) DO UPDATE
        SET creator_id=excluded.creator_id,
            reviewed_at=excluded.reviewed_at
      RETURNING notification_id
    `,[ids,req.user.id]);
  }else if(action==='priority_high' || action==='priority_normal'){
    result=await db.query(`
      UPDATE creator_community_activity_meta meta
         SET priority=$3,
             updated_at=now()
        FROM notifications n
       WHERE meta.notification_id=n.id
         AND meta.notification_id=ANY($1::bigint[])
         AND meta.creator_id=$2
         AND n.user_id=$2
         AND n.entity_type='creator_community'
         AND n.type IN ('creator_poll_vote','creator_question_response')
      RETURNING meta.notification_id
    `,[ids,req.user.id,action==='priority_high' ? 'high' : 'normal']);
  }else if(action==='close_follow_up'){
    result=await db.query(`
      UPDATE creator_community_activity_meta meta
         SET follow_up=false,
             completed_at=now(),
             updated_at=now()
        FROM notifications n
       WHERE meta.notification_id=n.id
         AND meta.notification_id=ANY($1::bigint[])
         AND meta.creator_id=$2
         AND meta.follow_up=true
         AND n.user_id=$2
         AND n.entity_type='creator_community'
         AND n.type IN ('creator_poll_vote','creator_question_response')
      RETURNING meta.notification_id
    `,[ids,req.user.id]);
  }else if(action==='reopen'){
    result=await db.query(`
      UPDATE creator_community_activity_meta meta
         SET follow_up=true,
             completed_at=NULL,
             updated_at=now()
        FROM notifications n
       WHERE meta.notification_id=n.id
         AND meta.notification_id=ANY($1::bigint[])
         AND meta.creator_id=$2
         AND meta.follow_up=false
         AND meta.completed_at IS NOT NULL
         AND n.user_id=$2
         AND n.entity_type='creator_community'
         AND n.type IN ('creator_poll_vote','creator_question_response')
      RETURNING meta.notification_id
    `,[ids,req.user.id]);
  }else{
    result=await db.query(`
      UPDATE creator_community_activity_meta meta
         SET follow_up=true,
             follow_up_at=$3,
             completed_at=NULL,
             updated_at=now()
        FROM notifications n
       WHERE meta.notification_id=n.id
         AND meta.notification_id=ANY($1::bigint[])
         AND meta.creator_id=$2
         AND meta.follow_up=true
         AND n.user_id=$2
         AND n.entity_type='creator_community'
         AND n.type IN ('creator_poll_vote','creator_question_response')
      RETURNING meta.notification_id
    `,[ids,req.user.id,followUpAt ? followUpAt.toISOString() : null]);
  }

  res.json({ok:true,updated:result.rows.map(row=>row.notification_id)});
});

router.get('/creator/community-insights',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }

  const [summary,trend,topTools]=await Promise.all([
    db.query(`
      SELECT
        (SELECT count(*)::int
           FROM creator_poll_votes v
           JOIN creator_polls cp ON cp.id=v.poll_id
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1
            AND p.moderation_status='published'
            AND v.created_at>=now()-interval '7 days') votes_7d,
        (SELECT count(*)::int
           FROM creator_poll_votes v
           JOIN creator_polls cp ON cp.id=v.poll_id
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1
            AND p.moderation_status='published'
            AND v.created_at>=now()-interval '30 days') votes_30d,
        (SELECT count(*)::int
           FROM creator_question_responses qr
           JOIN creator_questions cq ON cq.id=qr.question_id
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1
            AND p.moderation_status='published'
            AND qr.created_at>=now()-interval '7 days') responses_7d,
        (SELECT count(*)::int
           FROM creator_question_responses qr
           JOIN creator_questions cq ON cq.id=qr.question_id
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1
            AND p.moderation_status='published'
            AND qr.created_at>=now()-interval '30 days') responses_30d,
        (SELECT count(DISTINCT x.user_id)::int
           FROM (
             SELECT v.user_id
               FROM creator_poll_votes v
               JOIN creator_polls cp ON cp.id=v.poll_id
               JOIN posts p ON p.id=cp.post_id
              WHERE p.user_id=$1
                AND p.moderation_status='published'
                AND v.created_at>=now()-interval '30 days'
             UNION ALL
             SELECT qr.user_id
               FROM creator_question_responses qr
               JOIN creator_questions cq ON cq.id=qr.question_id
               JOIN posts p ON p.id=cq.post_id
              WHERE p.user_id=$1
                AND p.moderation_status='published'
                AND qr.created_at>=now()-interval '30 days'
           ) x) participants_30d
    `,[req.user.id]),
    db.query(`
      WITH days AS (
        SELECT generate_series(current_date-13,current_date,interval '1 day')::date AS day
      ),
      activity AS (
        SELECT v.created_at::date AS day,count(*)::int AS votes,0::int AS responses
          FROM creator_poll_votes v
          JOIN creator_polls cp ON cp.id=v.poll_id
          JOIN posts p ON p.id=cp.post_id
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND v.created_at>=current_date-13
         GROUP BY v.created_at::date
        UNION ALL
        SELECT qr.created_at::date AS day,0::int AS votes,count(*)::int AS responses
          FROM creator_question_responses qr
          JOIN creator_questions cq ON cq.id=qr.question_id
          JOIN posts p ON p.id=cq.post_id
         WHERE p.user_id=$1
           AND p.moderation_status='published'
           AND qr.created_at>=current_date-13
         GROUP BY qr.created_at::date
      )
      SELECT d.day,
             COALESCE(sum(a.votes),0)::int votes,
             COALESCE(sum(a.responses),0)::int responses
        FROM days d
        LEFT JOIN activity a ON a.day=d.day
       GROUP BY d.day
       ORDER BY d.day
    `,[req.user.id]),
    db.query(`
      SELECT *
      FROM (
        SELECT
          'poll'::text kind,
          cp.id tool_id,
          cp.post_id,
          cp.question prompt,
          p.audience,
          cp.status,
          cp.is_open,
          count(v.user_id) FILTER (WHERE v.created_at>=now()-interval '7 days')::int activity_7d,
          count(v.user_id) FILTER (WHERE v.created_at>=now()-interval '30 days')::int activity_30d
        FROM creator_polls cp
        JOIN posts p ON p.id=cp.post_id
        LEFT JOIN creator_poll_votes v ON v.poll_id=cp.id
        WHERE p.user_id=$1
          AND p.moderation_status='published'
        GROUP BY cp.id,cp.post_id,cp.question,p.audience,cp.status,cp.is_open

        UNION ALL

        SELECT
          'question'::text kind,
          cq.id tool_id,
          cq.post_id,
          cq.prompt,
          p.audience,
          cq.status,
          cq.is_open,
          count(qr.id) FILTER (WHERE qr.created_at>=now()-interval '7 days')::int activity_7d,
          count(qr.id) FILTER (WHERE qr.created_at>=now()-interval '30 days')::int activity_30d
        FROM creator_questions cq
        JOIN posts p ON p.id=cq.post_id
        LEFT JOIN creator_question_responses qr ON qr.question_id=cq.id
        WHERE p.user_id=$1
          AND p.moderation_status='published'
        GROUP BY cq.id,cq.post_id,cq.prompt,p.audience,cq.status,cq.is_open
      ) tools
      ORDER BY activity_30d DESC,activity_7d DESC,post_id DESC
      LIMIT 8
    `,[req.user.id])
  ]);

  res.json({
    summary:summary.rows[0] || {
      votes_7d:0,votes_30d:0,responses_7d:0,responses_30d:0,participants_30d:0
    },
    trend:trend.rows,
    topTools:topTools.rows
  });
});

router.get('/creator/community-inbox',requireAuth,async(req,res)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required_for_community_tools'});
  }

  const [summary,responses,polls,questions]=await Promise.all([
    db.query(`
      SELECT
        (SELECT count(*)::int
           FROM creator_polls cp
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published') poll_count,
        (SELECT count(*)::int
           FROM creator_polls cp
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published' AND cp.status='active') active_poll_count,
        (SELECT count(*)::int
           FROM creator_polls cp
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published' AND cp.status='archived') archived_poll_count,
        (SELECT count(*)::int
           FROM creator_poll_votes v
           JOIN creator_polls cp ON cp.id=v.poll_id
           JOIN posts p ON p.id=cp.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published') vote_count,
        (SELECT count(*)::int
           FROM creator_questions cq
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published') question_count,
        (SELECT count(*)::int
           FROM creator_questions cq
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published' AND cq.status='active') active_question_count,
        (SELECT count(*)::int
           FROM creator_questions cq
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published' AND cq.status='archived') archived_question_count,
        (SELECT count(*)::int
           FROM creator_question_responses qr
           JOIN creator_questions cq ON cq.id=qr.question_id
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published') response_count,
        (SELECT count(*)::int
           FROM creator_question_responses qr
           JOIN creator_questions cq ON cq.id=qr.question_id
           JOIN posts p ON p.id=cq.post_id
          WHERE p.user_id=$1 AND p.moderation_status='published' AND qr.creator_starred=true) starred_response_count
    `,[req.user.id]),
    db.query(`
      SELECT
        qr.id,qr.body,qr.created_at,qr.updated_at,qr.creator_starred,qr.starred_at,
        cq.id question_id,cq.prompt,cq.status question_status,cq.is_open question_is_open,
        p.id post_id,p.caption,p.audience,
        u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM creator_question_responses qr
      JOIN creator_questions cq ON cq.id=qr.question_id
      JOIN posts p ON p.id=cq.post_id
      JOIN users u ON u.id=qr.user_id
      WHERE p.user_id=$1
        AND p.moderation_status='published'
        AND u.status='active'
      ORDER BY qr.creator_starred DESC,qr.starred_at DESC NULLS LAST,qr.updated_at DESC
      LIMIT 150
    `,[req.user.id]),
    db.query(`
      SELECT
        cp.id poll_id,cp.question,cp.post_id,cp.status,cp.is_open,cp.archived_at,
        p.caption,p.audience,p.created_at,
        o.id option_id,o.position,o.label,
        count(v.user_id)::int vote_count
      FROM creator_polls cp
      JOIN posts p ON p.id=cp.post_id
      JOIN creator_poll_options o ON o.poll_id=cp.id
      LEFT JOIN creator_poll_votes v ON v.option_id=o.id
      WHERE p.user_id=$1
        AND p.moderation_status='published'
      GROUP BY cp.id,cp.question,cp.post_id,cp.status,cp.is_open,cp.archived_at,p.caption,p.audience,p.created_at,o.id,o.position,o.label
      ORDER BY (cp.status='active') DESC,p.created_at DESC,o.position
      LIMIT 240
    `,[req.user.id]),
    db.query(`
      SELECT
        cq.id question_id,cq.prompt,cq.post_id,cq.status,cq.is_open,cq.archived_at,
        p.caption,p.audience,p.created_at,
        count(qr.id)::int response_count,
        count(qr.id) FILTER (WHERE qr.creator_starred=true)::int starred_count
      FROM creator_questions cq
      JOIN posts p ON p.id=cq.post_id
      LEFT JOIN creator_question_responses qr ON qr.question_id=cq.id
      WHERE p.user_id=$1
        AND p.moderation_status='published'
      GROUP BY cq.id,cq.prompt,cq.post_id,cq.status,cq.is_open,cq.archived_at,p.caption,p.audience,p.created_at
      ORDER BY (cq.status='active') DESC,p.created_at DESC
      LIMIT 100
    `,[req.user.id])
  ]);

  const pollMap=new Map();
  for(const row of polls.rows){
    const key=String(row.poll_id);
    if(!pollMap.has(key)){
      pollMap.set(key,{
        id:row.poll_id,
        post_id:row.post_id,
        question:row.question,
        caption:row.caption,
        audience:row.audience,
        created_at:row.created_at,
        status:row.status,
        is_open:row.is_open===true,
        archived_at:row.archived_at,
        total_votes:0,
        options:[]
      });
    }
    const item=pollMap.get(key);
    const count=Number(row.vote_count || 0);
    item.total_votes+=count;
    item.options.push({
      id:row.option_id,
      position:row.position,
      label:row.label,
      vote_count:count
    });
  }

  res.json({
    summary:summary.rows[0] || {
      poll_count:0,active_poll_count:0,archived_poll_count:0,vote_count:0,
      question_count:0,active_question_count:0,archived_question_count:0,
      response_count:0,starred_response_count:0
    },
    responses:responses.rows,
    polls:[...pollMap.values()].slice(0,40),
    questions:questions.rows
  });
});
async function viewerFrom(req) {
  if (!req.user) return null;
  const vr = await db.query(
    'SELECT id,age_verified,show_sensitive,is_admin FROM users WHERE id=$1',
    [req.user.id]
  );
  return vr.rowCount ? {
    id: vr.rows[0].id,
    ageVerified: vr.rows[0].age_verified,
    showSensitive: vr.rows[0].show_sensitive,
    isAdmin: vr.rows[0].is_admin
  } : null;
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


async function attachCommentPreviews(rows, viewer = null) {
  if (!rows.length) return rows;

  const postIds = rows.map(row => row.id);
  const result = await db.query(`
    SELECT post_id,id,body,created_at,user_id,username,display_name,avatar_url,creator_verified
      FROM (
        SELECT
          c.post_id,
          c.id,
          c.body,
          c.created_at,
          u.id AS user_id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.creator_verified,
          row_number() OVER (
            PARTITION BY c.post_id
            ORDER BY c.created_at DESC, c.id DESC
          ) AS rn
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id = ANY($1::bigint[])
          AND u.status='active'
      ) latest
     WHERE rn <= 2
     ORDER BY post_id, created_at ASC, id ASC
  `, [postIds]);

  const byPost = new Map();

  for (const comment of result.rows) {
    const key = String(comment.post_id);
    if (!byPost.has(key)) byPost.set(key, []);
    byPost.get(key).push({
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at,
      user_id: comment.user_id,
      username: comment.username,
      display_name: comment.display_name,
      avatar_url: comment.avatar_url,
      creator_verified: comment.creator_verified
    });
  }

  return rows.map(row => ({
    ...row,
    latest_comments: (byPost.get(String(row.id)) || []).map(comment => ({
      ...comment,
      can_delete: !!viewer && (
        String(comment.user_id) === String(viewer.id) ||
        String(row.user_id) === String(viewer.id) ||
        viewer.isAdmin === true
      )
    }))
  }));
}

router.get('/consents/pending', requireAuth, async (req,res)=>{
  const r=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.playback_url,p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
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
  const post=await db.query(`
    SELECT p.*,u.id owner_id,u.creator_verified owner_creator_verified,u.age_verified owner_age_verified
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.id=$1
  `,[req.params.id]);
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
    const remaining=await db.query(
      `SELECT count(*)::int n FROM post_participants WHERE post_id=$1 AND consent_status<>'approved'`,
      [req.params.id]
    );

    let publishedNow=false;
    if(Number(remaining.rows[0]?.n || 0)===0){
      const source=post.rows[0];
      const scheduledDue=
        source.creator_state==='scheduled' &&
        source.scheduled_for &&
        new Date(source.scheduled_for).getTime()<=Date.now();
      const eligibleForAudience=source.audience!=='vip' || source.owner_creator_verified===true;
      const eligibleForContent=source.content_level!=='nudity' || (
        source.owner_creator_verified===true && source.owner_age_verified===true
      );
      const shouldPublish=(source.creator_state==='live' || scheduledDue) && eligibleForAudience && eligibleForContent;

      const updated=await db.query(`
        UPDATE posts
           SET consent_state='approved',
               moderation_status=$2,
               creator_state=CASE WHEN $3::boolean THEN 'live' ELSE creator_state END,
               created_at=CASE WHEN $2='published' THEN now() ELSE created_at END,
               updated_at=now()
         WHERE id=$1
         RETURNING id,user_id,caption,audience,creator_state,moderation_status
      `,[
        req.params.id,
        shouldPublish ? 'published' : 'under_review',
        scheduledDue
      ]);

      publishedNow=updated.rows[0]?.moderation_status==='published';
      if(publishedNow){
        try{
          await notifyMentions({
            actorId:updated.rows[0].user_id,
            text:updated.rows[0].caption,
            entityType:'post',
            entityId:updated.rows[0].id,
            audience:updated.rows[0].audience
          });
        }catch(error){
          console.warn('RedLibertad consent publish mention notification failed:',error?.message || error);
        }
      }
    }

    await db.query(`INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text) VALUES ($1,$2,'consent_approved','post',$3,'Ha aprobado aparecer en tu publicación.')`,[ownerId,req.user.id,req.params.id]);
  }
  res.json({ok:true,decision});
});

router.get('/feed', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const mode = ['latest','following','foryou','vip'].includes(req.query.mode) ? req.query.mode : 'latest';
  const params = [];
  const where = [`p.moderation_status='published'`, `u.status='active'`];
  if (req.user) {
    params.push(req.user.id);
    where.push(postAudienceWhere('$1','p'));
    where.push(`p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1)`);
    where.push(`p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)`);
    if (mode === 'vip') where.push("p.audience='vip'");
    if (mode === 'following') where.push(`(
      p.user_id=$1
      OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
      OR p.id IN (
        SELECT rp.post_id
          FROM reposts rp
         WHERE rp.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
      )
    )`);
  } else {
    where.push(postAudienceWhere(null,'p'));
    if (mode === 'following' || mode === 'vip') return res.json({ posts: [], mode });
  }
  const result = await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id AS user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) AS like_count,
           ${req.user ? `EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1)` : 'false'} AS liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) AS comment_count
      FROM posts p JOIN users u ON u.id=p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${mode === 'foryou'
       ? '(SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,'
       : mode === 'following' && req.user
         ? 'GREATEST(p.created_at,COALESCE((SELECT max(rp.created_at) FROM reposts rp WHERE rp.post_id=p.id AND rp.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)),p.created_at)) DESC,'
         : ''} p.created_at DESC
     LIMIT 50
  `, params);
  const participantPosts = await attachApprovedParticipants(result.rows);
  const posts = await attachCommentPreviews(participantPosts, viewer);
  const repostPosts = await attachRepostMeta(posts, req.user?.id || null, mode === 'following');
  res.json({ posts: gateRows(repostPosts, viewer), mode });
});

router.get('/momentum', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);

  const now=Date.now();
  const maxLookback=7*24*60*60*1000;
  const fallback=24*60*60*1000;
  const requested=Date.parse(String(req.query.since || ''));
  const sinceMs=Number.isFinite(requested)
    ? Math.max(now-maxLookback,Math.min(requested,now))
    : now-fallback;
  const since=new Date(sinceMs).toISOString();

  const commonSelect=`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$1 AND mine.following_id=u.id) from_following,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           (SELECT count(*)::int FROM reposts r WHERE r.post_id=p.id) repost_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND p.user_id<>$1
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND ${postAudienceWhere('$1','p')}`;

  const catchupResult=await db.query(`
    ${commonSelect}
       AND p.created_at >= $2
     ORDER BY (
       CASE WHEN EXISTS(
         SELECT 1 FROM follows priority_follow
          WHERE priority_follow.follower_id=$1
            AND priority_follow.following_id=p.user_id
       ) THEN 12 ELSE 0 END
       + (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2
       + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3
       + (SELECT count(*) FROM reposts r2 WHERE r2.post_id=p.id) * 3
     ) DESC,
     p.created_at DESC
     LIMIT 8
  `,[req.user.id,since]);

  const catchupParticipant=await attachApprovedParticipants(catchupResult.rows);
  const catchupComments=await attachCommentPreviews(catchupParticipant,viewer);
  const catchupReposts=await attachRepostMeta(catchupComments,req.user.id);
  const catchup=gateRows(catchupReposts,viewer);

  const highlightResult=await db.query(`
    ${commonSelect}
       AND p.created_at >= now() - interval '24 hours'
     ORDER BY (
       (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2
       + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3
       + (SELECT count(*) FROM reposts r2 WHERE r2.post_id=p.id) * 4
     ) DESC,
     p.created_at DESC
     LIMIT 14
  `,[req.user.id]);

  const highlightParticipant=await attachApprovedParticipants(highlightResult.rows);
  const highlightComments=await attachCommentPreviews(highlightParticipant,viewer);
  const highlightReposts=await attachRepostMeta(highlightComments,req.user.id);
  const catchupIds=new Set(catchup.map(post=>String(post.id)));
  const highlights=gateRows(highlightReposts,viewer)
    .filter(post=>!catchupIds.has(String(post.id)))
    .slice(0,6);

  res.json({
    since,
    catchup,
    highlights,
    catchupCount:catchup.length,
    highlightCount:highlights.length
  });
});

router.get('/discover', optionalAuth, async (req, res) => {
  const viewer = await viewerFrom(req);
  const params=[];
  let block='';
  let likedByMe='false';
  let audienceFilter=postAudienceWhere(null,'p');
  if(req.user){
    params.push(req.user.id);
    block=`AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1 UNION SELECT blocker_id FROM blocks WHERE blocked_id=$1) AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)`;
    likedByMe='EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1)';
    audienceFilter=postAudienceWhere('$1','p');
  }
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           ${likedByMe} AS liked_by_me
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${audienceFilter}
       ${block}
     ORDER BY (SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC,p.created_at DESC
     LIMIT 60
  `,params);
  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachRepostMeta(participantPosts,req.user?.id || null);
  res.json({posts:gateRows(posts,viewer)});
});

router.get('/search', requireAuth, async (req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,80);
  if(q.length<2) return res.json({posts:[],query:q});

  const viewer=await viewerFrom(req);
  const likePattern=`%${q}%`;
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
       AND (
         p.caption ILIKE $2
         OR u.username ILIKE $2
         OR u.display_name ILIKE $2
       )
     ORDER BY p.created_at DESC
     LIMIT 50
  `,[req.user.id,likePattern]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer),query:q});
});

router.get('/trending', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);
  const sort=['score','likes','comments'].includes(String(req.query.sort||'')) ? String(req.query.sort) : 'score';
  const orderBy=sort==='likes'
    ? 'like_count DESC, comment_count DESC'
    : sort==='comments'
      ? 'comment_count DESC, like_count DESC'
      : '((SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) * 2 + (SELECT count(*) FROM comments c2 WHERE c2.post_id=p.id) * 3) DESC';

  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.created_at >= now() - interval '30 days'
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY ${orderBy}, p.created_at DESC
     LIMIT 40
  `,[req.user.id]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer),sort});
});

router.get('/trends', requireAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT p.caption
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND u.status='active'
       AND u.discoverable=true
       AND ${postAudienceWhere('$1','p')}
       AND p.created_at >= now() - interval '30 days'
       AND p.caption <> ''
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY p.created_at DESC
     LIMIT 500
  `,[req.user.id]);

  const counts=new Map();
  const hashtag=/#([\p{L}\p{N}_]{2,40})/gu;
  for(const row of result.rows){
    const text=String(row.caption||'');
    const seen=new Set();
    for(const match of text.matchAll(hashtag)){
      const tag=match[1].normalize('NFKC').toLowerCase();
      if(seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag,(counts.get(tag)||0)+1);
    }
  }

  const trends=[...counts.entries()]
    .sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))
    .slice(0,12)
    .map(([tag,count])=>({tag,count}));

  res.json({trends});
});

router.get('/saved/ids', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const result=await db.query(`
    SELECT sp.post_id
      FROM saved_posts sp
      JOIN posts p ON p.id=sp.post_id
     WHERE sp.user_id=$1
       AND p.moderation_status='published'
       AND ${postAudienceWhere('$1','p')}
     ORDER BY sp.created_at DESC
     LIMIT 500
  `,[req.user.id]);
  res.json({ids:result.rows.map(row=>String(row.post_id))});
});

router.get('/saved', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const viewer=await viewerFrom(req);
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           sp.created_at saved_at
      FROM saved_posts sp
      JOIN posts p ON p.id=sp.post_id
      JOIN users u ON u.id=p.user_id
     WHERE sp.user_id=$1
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
       AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=$1)
     ORDER BY sp.created_at DESC
     LIMIT 100
  `,[req.user.id]);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({posts:gateRows(repostPosts,viewer)});
});

router.post('/:id/save', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post)return res.status(404).json({error:'post_not_found'});
  await db.query(`
    INSERT INTO saved_posts (user_id,post_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
  `,[req.user.id,req.params.id]);
  res.json({ok:true,saved:true});
});

router.delete('/:id/save', requireAuth, async (req,res)=>{
  await ensureSavedPostsTable();
  await db.query(
    'DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2',
    [req.user.id,req.params.id]
  );
  res.json({ok:true,saved:false});
});

router.get('/user/:username', optionalAuth, async (req, res) => {
  await ensureCreatorFeaturedV13();
  const viewer=await viewerFrom(req);
  const mode=['posts','reposts','media'].includes(String(req.query.mode||'')) ? String(req.query.mode) : 'posts';
  const params=[req.params.username];
  let likedByMe='false';
  let audienceFilter=postAudienceWhere(null,'p');
  if(req.user){
    params.push(req.user.id);
    likedByMe='EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$2)';
    audienceFilter=postAudienceWhere('$2','p');
  }

  const source = mode === 'reposts'
    ? `FROM reposts profile_reposts
       JOIN users profile_owner ON profile_owner.id=profile_reposts.user_id
       JOIN posts p ON p.id=profile_reposts.post_id
       JOIN users u ON u.id=p.user_id`
    : `FROM posts p
       JOIN users u ON u.id=p.user_id`;

  const ownerFilter = mode === 'reposts'
    ? `lower(profile_owner.username)=lower($1)`
    : `lower(u.username)=lower($1)`;

  const mediaFilter = mode === 'media'
    ? `AND (COALESCE(p.media_url,'')<>'' OR COALESCE(p.playback_url,'')<>'')`
    : '';

  const featuredSelect = mode === 'reposts'
    ? 'false'
    : 'EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id)';
  const orderBy = mode === 'reposts'
    ? 'profile_reposts.created_at DESC'
    : 'EXISTS(SELECT 1 FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id) DESC, COALESCE((SELECT fp.featured_at FROM creator_featured_posts fp WHERE fp.user_id=p.user_id AND fp.post_id=p.id),p.created_at) DESC';

  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           ${likedByMe} AS liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
           ${featuredSelect} AS featured
      ${source}
     WHERE ${ownerFilter}
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${audienceFilter}
       ${mediaFilter}
     ORDER BY ${orderBy}
     LIMIT 60
  `,params);

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts, viewer);
  const repostPosts=await attachRepostMeta(posts,req.user?.id || null);
  res.json({posts:gateRows(repostPosts,viewer),mode});
});

router.get('/detail/:id', requireAuth, async (req,res)=>{
  const viewer=await viewerFrom(req);
  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.media_provider,p.external_id,p.playback_url,
           p.content_level,p.post_kind,p.audience,p.consent_state,p.created_at,
           u.id user_id,u.username,u.display_name,u.avatar_url,u.creator_verified,
           (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
           EXISTS(SELECT 1 FROM likes my_like WHERE my_like.post_id=p.id AND my_like.user_id=$1) liked_by_me,
           (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.id=$2
       AND p.moderation_status='published'
       AND u.status='active'
       AND ${postAudienceWhere('$1','p')}
       AND p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id=$1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id=$1
       )
     LIMIT 1
  `,[req.user.id,req.params.id]);

  if(!result.rowCount)return res.status(404).json({error:'post_not_found'});

  const participantPosts=await attachApprovedParticipants(result.rows);
  const posts=await attachCommentPreviews(participantPosts,viewer);
  const repostPosts=await attachRepostMeta(posts,req.user.id);
  res.json({post:gateRows(repostPosts,viewer)[0]});
});

router.post('/:id/repost',requireAuth,async(req,res)=>{
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post)return res.status(404).json({error:'post_not_found'});
  if(post.audience==='vip')return res.status(403).json({error:'vip_post_cannot_be_reposted'});
  if(String(post.user_id)===String(req.user.id)){
    return res.status(400).json({error:'cannot_repost_own_post'});
  }

  const inserted=await db.query(`
    INSERT INTO reposts (user_id,post_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
    RETURNING post_id
  `,[req.user.id,req.params.id]);

  if(inserted.rowCount){
    try{
      await db.query(`
        INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
        VALUES ($1,$2,'repost','post',$3,'Ha republicado tu publicación.')
      `,[post.user_id,req.user.id,req.params.id]);
    }catch(notificationError){
      console.warn('RedLibertad repost notification failed:',notificationError?.message || notificationError);
    }
  }

  const count=await db.query('SELECT count(*)::int AS n FROM reposts WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,reposted:true,repostCount:count.rows[0]?.n || 0});
});

router.delete('/:id/repost',requireAuth,async(req,res)=>{
  await db.query('DELETE FROM reposts WHERE user_id=$1 AND post_id=$2',[req.user.id,req.params.id]);
  const count=await db.query('SELECT count(*)::int AS n FROM reposts WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,reposted:false,repostCount:count.rows[0]?.n || 0});
});

router.post('/:id/like', requireAuth, async (req,res)=>{
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});
  const inserted=await db.query(
    `INSERT INTO likes (user_id,post_id)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [req.user.id,req.params.id]
  );

  if(inserted.rowCount){
    const ownerId=visiblePost.user_id;
    if(String(ownerId)!==String(req.user.id)){
      await db.query(`
        INSERT INTO notifications (
          user_id,actor_id,type,entity_type,entity_id,text
        )
        VALUES ($1,$2,'like','post',$3,'Le gusta tu publicación.')
      `,[ownerId,req.user.id,req.params.id]);
    }
  }

  const count=await db.query('SELECT count(*)::int AS n FROM likes WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,liked:true,likeCount:count.rows[0]?.n || 0});
});
router.delete('/:id/like', requireAuth, async (req,res)=>{
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2',[req.user.id,req.params.id]);
  if(!visiblePost)return res.json({ok:true,liked:false,likeCount:null});
  const count=await db.query('SELECT count(*)::int AS n FROM likes WHERE post_id=$1',[req.params.id]);
  res.json({ok:true,liked:false,likeCount:count.rows[0]?.n || 0});
});

const editPostSchema=z.object({
  caption:z.string().max(2200)
});

router.patch('/:id',requireAuth,async(req,res)=>{
  const parsed=editPostSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const found=await db.query(
    'SELECT id,user_id,media_url,moderation_status FROM posts WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!found.rowCount)return res.status(404).json({error:'post_not_found'});

  const post=found.rows[0];
  const allowed=String(post.user_id)===String(req.user.id) || req.user.isAdmin===true;
  if(!allowed)return res.status(403).json({error:'post_edit_not_allowed'});

  const caption=String(parsed.data.caption || '').trim();
  if(!caption && !String(post.media_url || '').trim()){
    return res.status(400).json({error:'empty_post'});
  }

  const updated=await db.query(
    `UPDATE posts
        SET caption=$2,updated_at=now()
      WHERE id=$1
      RETURNING id,caption,updated_at`,
    [req.params.id,caption]
  );

  res.json({ok:true,post:updated.rows[0]});
});

router.delete('/:id',requireAuth,async(req,res)=>{
  const found=await db.query(
    'SELECT id,user_id FROM posts WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  if(!found.rowCount)return res.status(404).json({error:'post_not_found'});

  const post=found.rows[0];
  const allowed=String(post.user_id)===String(req.user.id) || req.user.isAdmin===true;
  if(!allowed)return res.status(403).json({error:'post_delete_not_allowed'});

  await db.query('DELETE FROM posts WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

router.get('/:id/comments', requireAuth, async (req,res)=>{
  const post=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!post){
    return res.status(404).json({error:'post_not_found'});
  }

  const result = await db.query(`
    SELECT
      c.id,
      c.body,
      c.created_at,
      u.id AS user_id,
      u.username,
      u.display_name,
      u.avatar_url,
      u.creator_verified
    FROM comments c
    JOIN users u ON u.id=c.user_id
    WHERE c.post_id=$1
      AND u.status='active'
    ORDER BY c.created_at ASC
    LIMIT 250
  `,[req.params.id]);

  const postOwnerId = post.user_id;

  const comments = result.rows.map(comment => ({
    ...comment,
    can_delete:
      String(comment.user_id) === String(req.user.id) ||
      String(postOwnerId) === String(req.user.id) ||
      req.user.isAdmin === true
  }));

  res.json({comments});
});


router.delete('/:postId/comments/:commentId', requireAuth, async (req,res)=>{
  const found = await db.query(`
    SELECT
      c.id,
      c.user_id AS comment_owner_id,
      c.post_id,
      p.user_id AS post_owner_id
    FROM comments c
    JOIN posts p ON p.id=c.post_id
    WHERE c.id=$1
      AND c.post_id=$2
    LIMIT 1
  `,[req.params.commentId,req.params.postId]);

  if(!found.rowCount){
    return res.status(404).json({error:'comment_not_found'});
  }

  const comment = found.rows[0];
  const allowed =
    String(comment.comment_owner_id) === String(req.user.id) ||
    String(comment.post_owner_id) === String(req.user.id) ||
    req.user.isAdmin === true;

  if(!allowed){
    return res.status(403).json({error:'comment_delete_not_allowed'});
  }

  await db.query(
    'DELETE FROM comments WHERE id=$1 AND post_id=$2',
    [req.params.commentId,req.params.postId]
  );

  res.json({ok:true});
});

const commentSchema=z.object({body:z.string().min(1).max(1000)});
router.post('/:id/comments',requireAuth,async(req,res)=>{
  const parsed=commentSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_comment'});
  const visiblePost=await accessiblePublishedPost(req.params.id,req.user.id);
  if(!visiblePost)return res.status(404).json({error:'post_not_found'});

  const result=await db.query(`
    INSERT INTO comments (user_id,post_id,body)
    VALUES ($1,$2,$3)
    RETURNING id,user_id,post_id,body,created_at
  `,[req.user.id,req.params.id,parsed.data.body]);

  const ownerId=visiblePost.user_id;

  if(String(ownerId)!==String(req.user.id)){
    await db.query(`
      INSERT INTO notifications (
        user_id,actor_id,type,entity_type,entity_id,text
      )
      VALUES ($1,$2,'comment','post',$3,'Ha comentado tu publicación.')
    `,[ownerId,req.user.id,req.params.id]);
  }

  try {
    await notifyMentions({actorId:req.user.id,text:parsed.data.body,entityType:'post',entityId:req.params.id,audience:visiblePost.audience});
  } catch (mentionError) {
    console.warn('RedLibertad comment mention notification failed:',mentionError?.message || mentionError);
  }

  res.status(201).json({ok:true,comment:result.rows[0]});
});

module.exports = router;
