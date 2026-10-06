const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function requireVerifiedCreator(userId){
  const result=await db.query(
    "SELECT creator_verified FROM users WHERE id=$1 AND status='active' LIMIT 1",
    [userId]
  );
  return result.rows[0]?.creator_verified===true;
}

let creatorOpsV129Ready=null;
async function ensureCreatorOpsV129(){
  if(!creatorOpsV129Ready){
    creatorOpsV129Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_tasks (
          id BIGSERIAL PRIMARY KEY,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(160) NOT NULL,
          note VARCHAR(1000) NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'open',
          due_at TIMESTAMPTZ,
          notification_id BIGINT REFERENCES notifications(id) ON DELETE SET NULL,
          related_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
          source_key VARCHAR(180),
          completed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_tasks_source_key ON creator_tasks(creator_id,source_key) WHERE source_key IS NOT NULL");
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_tasks_open_due ON creator_tasks(creator_id,status,priority,due_at,updated_at DESC)");
      const priorityConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_tasks_priority_check' AND conrelid='creator_tasks'::regclass LIMIT 1"
      );
      if(!priorityConstraint.rowCount){
        await db.query("ALTER TABLE creator_tasks ADD CONSTRAINT creator_tasks_priority_check CHECK(priority IN ('normal','high'))");
      }
      const statusConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_tasks_status_check' AND conrelid='creator_tasks'::regclass LIMIT 1"
      );
      if(!statusConstraint.rowCount){
        await db.query("ALTER TABLE creator_tasks ADD CONSTRAINT creator_tasks_status_check CHECK(status IN ('open','completed'))");
      }
    })().catch(error=>{
      creatorOpsV129Ready=null;
      throw error;
    });
  }
  return creatorOpsV129Ready;
}

router.use(async(_req,res,next)=>{
  try{
    await ensureCreatorOpsV129();
    next();
  }catch(error){
    console.error('RedLibertad V1.29 creator tasks bootstrap failed:',error);
    res.status(500).json({error:'creator_tasks_bootstrap_failed'});
  }
});

let creatorCrmV130Ready=null;
async function ensureCreatorCrmV130(){
  if(!creatorCrmV130Ready){
    creatorCrmV130Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_contact_meta (
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          private_note VARCHAR(1000) NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'normal',
          labels JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(creator_id,contact_id),
          CHECK(creator_id<>contact_id)
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_contact_meta_creator_priority ON creator_contact_meta(creator_id,priority,updated_at DESC)");
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_contact_meta_priority_check' AND conrelid='creator_contact_meta'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE creator_contact_meta ADD CONSTRAINT creator_contact_meta_priority_check CHECK(priority IN ('normal','high'))");
      }
    })().catch(error=>{
      creatorCrmV130Ready=null;
      throw error;
    });
  }
  return creatorCrmV130Ready;
}

router.use(async(_req,res,next)=>{
  try{
    await ensureCreatorCrmV130();
    next();
  }catch(error){
    console.error('RedLibertad V1.30 creator CRM bootstrap failed:',error);
    res.status(500).json({error:'creator_crm_bootstrap_failed'});
  }
});

let creatorSegmentsV131Ready=null;
async function ensureCreatorSegmentsV131(){
  if(!creatorSegmentsV131Ready){
    creatorSegmentsV131Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_segments (
          id BIGSERIAL PRIMARY KEY,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(60) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_segment_members (
          segment_id BIGINT NOT NULL REFERENCES creator_segments(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(segment_id,user_id)
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_segments_creator ON creator_segments(creator_id,updated_at DESC)");
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_segment_members_segment ON creator_segment_members(segment_id,created_at DESC)");
    })().catch(error=>{
      creatorSegmentsV131Ready=null;
      throw error;
    });
  }
  return creatorSegmentsV131Ready;
}

router.use(async(_req,res,next)=>{
  try{
    await ensureCreatorSegmentsV131();
    next();
  }catch(error){
    console.error('RedLibertad V1.31 audience segments bootstrap failed:',error);
    res.status(500).json({error:'creator_segments_bootstrap_failed'});
  }
});

let creatorCommunicationsV132Ready=null;
async function ensureCreatorCommunicationsV132(){
  if(!creatorCommunicationsV132Ready){
    creatorCommunicationsV132Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_communications (
          id BIGSERIAL PRIMARY KEY,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(280) NOT NULL,
          audience_type TEXT NOT NULL DEFAULT 'all',
          segment_id BIGINT REFERENCES creator_segments(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          scheduled_for TIMESTAMPTZ,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_communications_creator_status ON creator_communications(creator_id,status,scheduled_for,updated_at DESC)");
      const audienceConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_communications_audience_check' AND conrelid='creator_communications'::regclass LIMIT 1"
      );
      if(!audienceConstraint.rowCount){
        await db.query("ALTER TABLE creator_communications ADD CONSTRAINT creator_communications_audience_check CHECK(audience_type IN ('all','vip','segment','recent_followers','active_30d','inactive_30d','high_priority'))");
      }
      const statusConstraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_communications_status_check' AND conrelid='creator_communications'::regclass LIMIT 1"
      );
      if(!statusConstraint.rowCount){
        await db.query("ALTER TABLE creator_communications ADD CONSTRAINT creator_communications_status_check CHECK(status IN ('draft','scheduled','sending','sent','cancelled'))");
      }
    })().catch(error=>{
      creatorCommunicationsV132Ready=null;
      throw error;
    });
  }
  return creatorCommunicationsV132Ready;
}

router.use(async(_req,res,next)=>{
  try{
    await ensureCreatorCommunicationsV132();
    next();
  }catch(error){
    console.error('RedLibertad V1.32 creator communications bootstrap failed:',error);
    res.status(500).json({error:'creator_communications_bootstrap_failed'});
  }
});

let creatorAutomationV134Ready=null;
async function ensureCreatorAutomationV134(){
  if(!creatorAutomationV134Ready){
    creatorAutomationV134Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS creator_automation_rules (
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rule_key TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          threshold INTEGER NOT NULL DEFAULT 3,
          last_run_at TIMESTAMPTZ,
          last_result JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(creator_id,rule_key)
        )
      `);
      const constraint=await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname='creator_automation_rule_key_check' AND conrelid='creator_automation_rules'::regclass LIMIT 1"
      );
      if(!constraint.rowCount){
        await db.query("ALTER TABLE creator_automation_rules ADD CONSTRAINT creator_automation_rule_key_check CHECK(rule_key IN ('overdue_task_priority','repeat_participant_task','overdue_followup_task','high_priority_contact_task'))");
      }
      await db.query("CREATE INDEX IF NOT EXISTS idx_creator_automation_enabled ON creator_automation_rules(enabled,creator_id,updated_at DESC)");
    })().catch(error=>{
      creatorAutomationV134Ready=null;
      throw error;
    });
  }
  return creatorAutomationV134Ready;
}

router.use(async(_req,res,next)=>{
  try{
    await ensureCreatorAutomationV134();
    next();
  }catch(error){
    console.error('RedLibertad V1.34 creator automation bootstrap failed:',error);
    res.status(500).json({error:'creator_automation_bootstrap_failed'});
  }
});

router.use(requireAuth);
router.use(async(req,res,next)=>{
  if(!await requireVerifiedCreator(req.user.id)){
    return res.status(403).json({error:'verified_creator_required'});
  }
  next();
});

const taskId=z.union([z.string().regex(/^\d+$/),z.number().int().positive()]).transform(value=>String(value));
const nullableTaskId=z.union([taskId,z.null()]).optional();
const taskCreateSchema=z.object({
  title:z.string().trim().min(1).max(160),
  note:z.string().trim().max(1000).optional().default(''),
  priority:z.enum(['normal','high']).optional().default('normal'),
  dueAt:z.string().datetime({offset:true}).nullable().optional(),
  notificationId:nullableTaskId,
  relatedUserId:nullableTaskId,
  postId:nullableTaskId
});
const taskPatchSchema=z.object({
  title:z.string().trim().min(1).max(160).optional(),
  note:z.string().trim().max(1000).optional(),
  priority:z.enum(['normal','high']).optional(),
  status:z.enum(['open','completed']).optional(),
  dueAt:z.string().datetime({offset:true}).nullable().optional()
}).refine(value=>Object.keys(value).length>0);
const taskBulkSchema=z.object({
  taskIds:z.array(taskId).min(1).max(100),
  action:z.enum(['complete','reopen','priority_high','priority_normal','reschedule']),
  dueAt:z.string().datetime({offset:true}).nullable().optional()
});

async function validateTaskRelations(creatorId,data){
  if(data.notificationId){
    const notification=await db.query(
      "SELECT id FROM notifications WHERE id=$1 AND user_id=$2 LIMIT 1",
      [data.notificationId,creatorId]
    );
    if(!notification.rowCount)return 'notification_not_found';
  }
  if(data.relatedUserId){
    const user=await db.query(
      "SELECT id FROM users WHERE id=$1 AND status='active' LIMIT 1",
      [data.relatedUserId]
    );
    if(!user.rowCount)return 'related_user_not_found';
  }
  if(data.postId){
    const post=await db.query(
      "SELECT id FROM posts WHERE id=$1 AND user_id=$2 LIMIT 1",
      [data.postId,creatorId]
    );
    if(!post.rowCount)return 'post_not_found';
  }
  return null;
}

router.get('/tasks',async(req,res)=>{
  const status=String(req.query.status || 'open');
  const priority=String(req.query.priority || 'all');
  const q=String(req.query.q || '').trim().slice(0,120);
  if(!['open','completed','all'].includes(status))return res.status(400).json({error:'invalid_task_status'});
  if(!['all','normal','high'].includes(priority))return res.status(400).json({error:'invalid_task_priority'});

  const result=await db.query(`
    SELECT
      t.id,t.title,t.note,t.priority,t.status,t.due_at,t.completed_at,t.created_at,t.updated_at,
      t.notification_id,t.related_user_id,t.post_id,
      u.username related_username,u.display_name related_display_name,u.avatar_url related_avatar_url,
      p.caption related_post_caption
    FROM creator_tasks t
    LEFT JOIN users u ON u.id=t.related_user_id
    LEFT JOIN posts p ON p.id=t.post_id AND p.user_id=t.creator_id
    WHERE t.creator_id=$1
      AND ($2='all' OR t.status=$2)
      AND ($3='all' OR t.priority=$3)
      AND ($4='' OR t.title ILIKE '%' || $4 || '%' OR t.note ILIKE '%' || $4 || '%')
    ORDER BY
      CASE WHEN t.status='open' AND t.priority='high' THEN 0 ELSE 1 END,
      CASE WHEN t.status='open' THEN t.due_at END ASC NULLS LAST,
      t.completed_at DESC NULLS LAST,
      t.updated_at DESC
    LIMIT 250
  `,[req.user.id,status,priority,q]);

  const summary=await db.query(`
    SELECT
      count(*) FILTER (WHERE status='open')::int open,
      count(*) FILTER (WHERE status='open' AND priority='high')::int high,
      count(*) FILTER (WHERE status='open' AND due_at IS NOT NULL AND due_at<now())::int overdue,
      count(*) FILTER (WHERE status='completed')::int completed,
      count(*) FILTER (WHERE status='completed' AND completed_at>=now()-interval '30 days')::int completed_30d
    FROM creator_tasks
    WHERE creator_id=$1
  `,[req.user.id]);

  res.json({status,priority,q,summary:summary.rows[0] || {},tasks:result.rows});
});

router.post('/tasks',async(req,res)=>{
  const parsed=taskCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_task'});
  const data=parsed.data;
  const relationError=await validateTaskRelations(req.user.id,data);
  if(relationError)return res.status(404).json({error:relationError});

  const dueAt=data.dueAt ? new Date(data.dueAt) : null;
  const result=await db.query(`
    INSERT INTO creator_tasks
      (creator_id,title,note,priority,due_at,notification_id,related_user_id,post_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `,[
    req.user.id,data.title,data.note,data.priority,dueAt ? dueAt.toISOString() : null,
    data.notificationId || null,data.relatedUserId || null,data.postId || null
  ]);
  res.status(201).json({ok:true,task:result.rows[0]});
});

router.patch('/tasks/:id',async(req,res)=>{
  const parsed=taskPatchSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_task_update'});
  const data=parsed.data;
  const hasDueAt=Object.prototype.hasOwnProperty.call(data,'dueAt');
  const dueAt=data.dueAt ? new Date(data.dueAt) : null;
  const result=await db.query(`
    UPDATE creator_tasks
       SET title=CASE WHEN $3 THEN $4 ELSE title END,
           note=CASE WHEN $5 THEN $6 ELSE note END,
           priority=CASE WHEN $7 THEN $8 ELSE priority END,
           status=CASE WHEN $9 THEN $10 ELSE status END,
           due_at=CASE WHEN $11 THEN $12 ELSE due_at END,
           completed_at=CASE
             WHEN $9 AND $10='completed' THEN COALESCE(completed_at,now())
             WHEN $9 AND $10='open' THEN NULL
             ELSE completed_at
           END,
           updated_at=now()
     WHERE id=$1 AND creator_id=$2
     RETURNING *
  `,[
    req.params.id,req.user.id,
    Object.prototype.hasOwnProperty.call(data,'title'),data.title || '',
    Object.prototype.hasOwnProperty.call(data,'note'),data.note || '',
    Object.prototype.hasOwnProperty.call(data,'priority'),data.priority || 'normal',
    Object.prototype.hasOwnProperty.call(data,'status'),data.status || 'open',
    hasDueAt,dueAt ? dueAt.toISOString() : null
  ]);
  if(!result.rowCount)return res.status(404).json({error:'creator_task_not_found'});
  res.json({ok:true,task:result.rows[0]});
});

router.patch('/tasks/bulk',async(req,res)=>{
  const parsed=taskBulkSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_task_bulk_action'});
  const ids=[...new Set(parsed.data.taskIds)];
  const action=parsed.data.action;
  if(action==='reschedule' && !Object.prototype.hasOwnProperty.call(parsed.data,'dueAt')){
    return res.status(400).json({error:'task_due_at_required'});
  }
  const dueAt=parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const result=await db.query(`
    UPDATE creator_tasks
       SET status=CASE
             WHEN $3='complete' THEN 'completed'
             WHEN $3='reopen' THEN 'open'
             ELSE status
           END,
           priority=CASE
             WHEN $3='priority_high' THEN 'high'
             WHEN $3='priority_normal' THEN 'normal'
             ELSE priority
           END,
           due_at=CASE WHEN $3='reschedule' THEN $4 ELSE due_at END,
           completed_at=CASE
             WHEN $3='complete' THEN COALESCE(completed_at,now())
             WHEN $3='reopen' THEN NULL
             ELSE completed_at
           END,
           updated_at=now()
     WHERE creator_id=$2
       AND id=ANY($1::bigint[])
     RETURNING id
  `,[ids,req.user.id,action,dueAt ? dueAt.toISOString() : null]);
  res.json({ok:true,updated:result.rows.map(row=>row.id)});
});


const contactMetaSchema=z.object({
  privateNote:z.string().trim().max(1000).optional().default(''),
  priority:z.enum(['normal','high']).optional().default('normal'),
  labels:z.array(z.string().trim().min(1).max(30)).max(10).optional().default([])
});

router.get('/contacts',async(req,res)=>{
  const priority=String(req.query.priority || 'all');
  const q=String(req.query.q || '').trim().slice(0,120);
  if(!['all','normal','high'].includes(priority))return res.status(400).json({error:'invalid_contact_priority'});

  const result=await db.query(`
    WITH contact_ids AS (
      SELECT follower_id AS user_id
        FROM follows
       WHERE following_id=$1
      UNION
      SELECT v.user_id
        FROM creator_poll_votes v
        JOIN creator_polls cp ON cp.id=v.poll_id
        JOIN posts p ON p.id=cp.post_id
       WHERE p.user_id=$1
      UNION
      SELECT qr.user_id
        FROM creator_question_responses qr
        JOIN creator_questions cq ON cq.id=qr.question_id
        JOIN posts p ON p.id=cq.post_id
       WHERE p.user_id=$1
    ),
    activity AS (
      SELECT user_id,count(*)::int interaction_count_30d,max(created_at) last_interaction_at
      FROM (
        SELECT l.user_id,l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1 AND l.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT c.user_id,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1 AND c.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT r.user_id,r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1 AND r.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT v.user_id,v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1 AND v.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT qr.user_id,qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1 AND qr.created_at>=now()-interval '30 days'
      ) events
      GROUP BY user_id
    )
    SELECT
      u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,
      f.created_at followed_at,
      (f.follower_id IS NOT NULL) is_follower,
      (cv.fan_id IS NOT NULL) is_vip,
      COALESCE(meta.priority,'normal') priority,
      COALESCE(meta.private_note,'') private_note,
      COALESCE(meta.labels,'[]'::jsonb) labels,
      meta.updated_at meta_updated_at,
      COALESCE(activity.interaction_count_30d,0)::int interaction_count_30d,
      activity.last_interaction_at,
      (SELECT count(*)::int FROM creator_tasks t WHERE t.creator_id=$1 AND t.related_user_id=u.id AND t.status='open') open_task_count
    FROM contact_ids ids
    JOIN users u ON u.id=ids.user_id AND u.status='active'
    LEFT JOIN follows f ON f.following_id=$1 AND f.follower_id=u.id
    LEFT JOIN creator_vips cv ON cv.creator_id=$1 AND cv.fan_id=u.id
    LEFT JOIN creator_contact_meta meta ON meta.creator_id=$1 AND meta.contact_id=u.id
    LEFT JOIN activity ON activity.user_id=u.id
    WHERE u.id<>$1
      AND ($2='all' OR COALESCE(meta.priority,'normal')=$2)
      AND (
        $3=''
        OR u.username ILIKE '%' || $3 || '%'
        OR COALESCE(u.display_name,'') ILIKE '%' || $3 || '%'
        OR COALESCE(meta.private_note,'') ILIKE '%' || $3 || '%'
        OR COALESCE(meta.labels,'[]'::jsonb)::text ILIKE '%' || $3 || '%'
      )
    ORDER BY
      COALESCE(meta.priority,'normal')='high' DESC,
      COALESCE(activity.interaction_count_30d,0) DESC,
      activity.last_interaction_at DESC NULLS LAST,
      f.created_at DESC NULLS LAST,
      u.id DESC
    LIMIT 200
  `,[req.user.id,priority,q]);

  const summary=await db.query(`
    WITH contacts AS (
      SELECT follower_id user_id FROM follows WHERE following_id=$1
      UNION
      SELECT v.user_id FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1
      UNION
      SELECT qr.user_id FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1
    )
    SELECT
      count(*)::int total,
      count(*) FILTER (WHERE meta.priority='high')::int high_priority,
      count(*) FILTER (WHERE cv.fan_id IS NOT NULL)::int vip,
      count(*) FILTER (WHERE f.follower_id IS NOT NULL)::int followers
    FROM contacts c
    JOIN users u ON u.id=c.user_id AND u.status='active'
    LEFT JOIN creator_contact_meta meta ON meta.creator_id=$1 AND meta.contact_id=c.user_id
    LEFT JOIN creator_vips cv ON cv.creator_id=$1 AND cv.fan_id=c.user_id
    LEFT JOIN follows f ON f.following_id=$1 AND f.follower_id=c.user_id
    WHERE c.user_id<>$1
  `,[req.user.id]);

  res.json({priority,q,summary:summary.rows[0] || {},contacts:result.rows});
});

router.patch('/contacts/:id',async(req,res)=>{
  const parsed=contactMetaSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_contact_meta'});
  const contact=await db.query(
    "SELECT id FROM users WHERE id=$1 AND id<>$2 AND status='active' LIMIT 1",
    [req.params.id,req.user.id]
  );
  if(!contact.rowCount)return res.status(404).json({error:'contact_not_found'});
  const labels=[...new Set(parsed.data.labels.map(value=>value.trim()).filter(Boolean))];
  const result=await db.query(`
    INSERT INTO creator_contact_meta (creator_id,contact_id,private_note,priority,labels,updated_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,now())
    ON CONFLICT(creator_id,contact_id) DO UPDATE
      SET private_note=excluded.private_note,
          priority=excluded.priority,
          labels=excluded.labels,
          updated_at=now()
    RETURNING *
  `,[req.user.id,req.params.id,parsed.data.privateNote,parsed.data.priority,JSON.stringify(labels)]);
  res.json({ok:true,meta:result.rows[0]});
});


const segmentCreateSchema=z.object({
  name:z.string().trim().min(2).max(60)
});
const segmentMemberSchema=z.object({
  username:z.string().trim().min(3).max(30).transform(value=>value.replace(/^@/,'').toLowerCase())
});

const automaticSegmentKeys=['recent_followers','active_30d','vip','inactive_30d','high_priority'];

async function automaticSegmentCounts(creatorId){
  const result=await db.query(`
    SELECT
      (SELECT count(*)::int FROM follows f JOIN users u ON u.id=f.follower_id AND u.status='active'
        WHERE f.following_id=$1 AND f.created_at>=now()-interval '30 days') recent_followers,
      (SELECT count(DISTINCT user_id)::int FROM (
        SELECT l.user_id FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1 AND l.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT c.user_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1 AND c.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT r.user_id FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1 AND r.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT v.user_id FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1 AND v.created_at>=now()-interval '30 days'
        UNION ALL
        SELECT qr.user_id FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1 AND qr.created_at>=now()-interval '30 days'
      ) active) active_30d,
      (SELECT count(*)::int FROM creator_vips cv JOIN users u ON u.id=cv.fan_id AND u.status='active' WHERE cv.creator_id=$1) vip,
      (SELECT count(*)::int
         FROM follows f
         JOIN users u ON u.id=f.follower_id AND u.status='active'
        WHERE f.following_id=$1
          AND NOT EXISTS(
            SELECT 1 FROM (
              SELECT l.user_id,l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1
              UNION ALL SELECT c.user_id,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1
              UNION ALL SELECT r.user_id,r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1
              UNION ALL SELECT v.user_id,v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1
              UNION ALL SELECT qr.user_id,qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1
            ) activity
            WHERE activity.user_id=f.follower_id AND activity.created_at>=now()-interval '30 days'
          )) inactive_30d,
      (SELECT count(*)::int FROM creator_contact_meta meta JOIN users u ON u.id=meta.contact_id AND u.status='active'
        WHERE meta.creator_id=$1 AND meta.priority='high') high_priority
  `,[creatorId]);
  return result.rows[0] || {};
}

function autoSegmentMembersSql(key){
  if(key==='recent_followers')return `
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM follows f JOIN users u ON u.id=f.follower_id
     WHERE f.following_id=$1 AND f.created_at>=now()-interval '30 days' AND u.status='active'
     ORDER BY f.created_at DESC LIMIT 200
  `;
  if(key==='vip')return `
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM creator_vips cv JOIN users u ON u.id=cv.fan_id
     WHERE cv.creator_id=$1 AND u.status='active'
     ORDER BY cv.created_at DESC LIMIT 200
  `;
  if(key==='high_priority')return `
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM creator_contact_meta meta JOIN users u ON u.id=meta.contact_id
     WHERE meta.creator_id=$1 AND meta.priority='high' AND u.status='active'
     ORDER BY meta.updated_at DESC LIMIT 200
  `;
  if(key==='inactive_30d')return `
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM follows f JOIN users u ON u.id=f.follower_id
     WHERE f.following_id=$1 AND u.status='active'
       AND NOT EXISTS(
         SELECT 1 FROM (
           SELECT l.user_id,l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1
           UNION ALL SELECT c.user_id,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1
           UNION ALL SELECT r.user_id,r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1
           UNION ALL SELECT v.user_id,v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1
           UNION ALL SELECT qr.user_id,qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1
         ) a WHERE a.user_id=f.follower_id AND a.created_at>=now()-interval '30 days'
       )
     ORDER BY f.created_at DESC LIMIT 200
  `;
  return `
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified
    FROM users u
    JOIN (
      SELECT user_id,count(*) interactions FROM (
        SELECT l.user_id FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1 AND l.created_at>=now()-interval '30 days'
        UNION ALL SELECT c.user_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1 AND c.created_at>=now()-interval '30 days'
        UNION ALL SELECT r.user_id FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1 AND r.created_at>=now()-interval '30 days'
        UNION ALL SELECT v.user_id FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1 AND v.created_at>=now()-interval '30 days'
        UNION ALL SELECT qr.user_id FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1 AND qr.created_at>=now()-interval '30 days'
      ) events GROUP BY user_id HAVING count(*)>=3
    ) activity ON activity.user_id=u.id
    WHERE u.status='active'
    ORDER BY activity.interactions DESC,u.id DESC LIMIT 200
  `;
}

router.get('/segments',async(req,res)=>{
  const counts=await automaticSegmentCounts(req.user.id);
  const custom=await db.query(`
    SELECT s.id,s.name,s.created_at,s.updated_at,count(sm.user_id)::int member_count
      FROM creator_segments s
      LEFT JOIN creator_segment_members sm ON sm.segment_id=s.id
     WHERE s.creator_id=$1
     GROUP BY s.id
     ORDER BY s.updated_at DESC,s.id DESC
     LIMIT 50
  `,[req.user.id]);
  res.json({
    automatic:[
      {key:'recent_followers',name:'Seguidores recientes',description:'Te siguen desde hace menos de 30 días.',member_count:Number(counts.recent_followers||0)},
      {key:'active_30d',name:'Más activos · 30 días',description:'Al menos 3 interacciones recientes.',member_count:Number(counts.active_30d||0)},
      {key:'vip',name:'Círculo VIP',description:'Personas incluidas en tu círculo VIP.',member_count:Number(counts.vip||0)},
      {key:'inactive_30d',name:'Sin interacción · 30 días',description:'Seguidores sin interacción reciente contigo.',member_count:Number(counts.inactive_30d||0)},
      {key:'high_priority',name:'Prioridad alta',description:'Marcados como prioridad alta en Creator CRM.',member_count:Number(counts.high_priority||0)}
    ],
    custom:custom.rows
  });
});

router.get('/segments/auto/:key/members',async(req,res)=>{
  const key=String(req.params.key||'');
  if(!automaticSegmentKeys.includes(key))return res.status(404).json({error:'automatic_segment_not_found'});
  const result=await db.query(autoSegmentMembersSql(key),[req.user.id]);
  res.json({key,members:result.rows});
});

router.post('/segments',async(req,res)=>{
  const parsed=segmentCreateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_segment'});
  const existing=await db.query("SELECT count(*)::int n FROM creator_segments WHERE creator_id=$1",[req.user.id]);
  if(Number(existing.rows[0]?.n||0)>=20)return res.status(409).json({error:'creator_segment_limit'});
  const result=await db.query(
    "INSERT INTO creator_segments (creator_id,name) VALUES ($1,$2) RETURNING *",
    [req.user.id,parsed.data.name]
  );
  res.status(201).json({ok:true,segment:result.rows[0]});
});

router.get('/segments/:id/members',async(req,res)=>{
  const segment=await db.query("SELECT id,name FROM creator_segments WHERE id=$1 AND creator_id=$2 LIMIT 1",[req.params.id,req.user.id]);
  if(!segment.rowCount)return res.status(404).json({error:'creator_segment_not_found'});
  const members=await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,sm.created_at
      FROM creator_segment_members sm
      JOIN users u ON u.id=sm.user_id
     WHERE sm.segment_id=$1 AND u.status='active'
     ORDER BY sm.created_at DESC
     LIMIT 250
  `,[req.params.id]);
  res.json({segment:segment.rows[0],members:members.rows});
});

router.post('/segments/:id/members',async(req,res)=>{
  const parsed=segmentMemberSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_segment_member'});
  const segment=await db.query("SELECT id FROM creator_segments WHERE id=$1 AND creator_id=$2 LIMIT 1",[req.params.id,req.user.id]);
  if(!segment.rowCount)return res.status(404).json({error:'creator_segment_not_found'});
  const user=await db.query("SELECT id,username FROM users WHERE lower(username)=$1 AND status='active' AND id<>$2 LIMIT 1",[parsed.data.username,req.user.id]);
  if(!user.rowCount)return res.status(404).json({error:'segment_member_not_found'});
  await db.query("INSERT INTO creator_segment_members (segment_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",[req.params.id,user.rows[0].id]);
  await db.query("UPDATE creator_segments SET updated_at=now() WHERE id=$1",[req.params.id]);
  res.json({ok:true,user:user.rows[0]});
});

router.delete('/segments/:id/members/:userId',async(req,res)=>{
  const result=await db.query(`
    DELETE FROM creator_segment_members sm
     USING creator_segments s
     WHERE sm.segment_id=s.id
       AND s.id=$1
       AND s.creator_id=$2
       AND sm.user_id=$3
     RETURNING sm.user_id
  `,[req.params.id,req.user.id,req.params.userId]);
  if(!result.rowCount)return res.status(404).json({error:'segment_member_not_found'});
  await db.query("UPDATE creator_segments SET updated_at=now() WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});

router.delete('/segments/:id',async(req,res)=>{
  const result=await db.query("DELETE FROM creator_segments WHERE id=$1 AND creator_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!result.rowCount)return res.status(404).json({error:'creator_segment_not_found'});
  res.json({ok:true});
});


const communicationSchema=z.object({
  body:z.string().trim().min(1).max(280),
  audienceType:z.enum(['all','vip','segment','recent_followers','active_30d','inactive_30d','high_priority']).default('all'),
  segmentId:z.union([taskId,z.null()]).optional(),
  mode:z.enum(['draft','send','schedule']).default('draft'),
  scheduledFor:z.string().datetime({offset:true}).nullable().optional()
});

async function creatorNextCommunicationAt(creatorId,client=db){
  const result=await client.query(`
    SELECT max(sent_at) last_sent
    FROM (
      SELECT created_at sent_at FROM creator_broadcasts WHERE user_id=$1
      UNION ALL
      SELECT sent_at FROM creator_communications WHERE creator_id=$1 AND status='sent' AND sent_at IS NOT NULL
    ) sent
  `,[creatorId]);
  const last=result.rows[0]?.last_sent ? new Date(result.rows[0].last_sent) : null;
  return last ? new Date(last.getTime()+24*60*60*1000) : null;
}

async function validateCommunicationAudience(creatorId,audienceType,segmentId,client=db){
  if(audienceType!=='segment')return true;
  if(!segmentId)return false;
  const segment=await client.query("SELECT id FROM creator_segments WHERE id=$1 AND creator_id=$2 LIMIT 1",[segmentId,creatorId]);
  return segment.rowCount>0;
}

function communicationRecipientSql(audienceType){
  const common=`
    JOIN users recipient ON recipient.id=f.follower_id AND recipient.status='active'
    WHERE f.following_id=$1
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=f.follower_id AND m.muted_id=$1)
      AND NOT EXISTS(
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=f.follower_id AND b.blocked_id=$1)
            OR (b.blocker_id=$1 AND b.blocked_id=f.follower_id)
      )
  `;
  if(audienceType==='vip')return `
    SELECT f.follower_id user_id FROM follows f
    JOIN creator_vips cv ON cv.creator_id=$1 AND cv.fan_id=f.follower_id
    ${common}
  `;
  if(audienceType==='segment')return `
    SELECT f.follower_id user_id FROM follows f
    JOIN creator_segment_members sm ON sm.user_id=f.follower_id AND sm.segment_id=$2
    JOIN creator_segments s ON s.id=sm.segment_id AND s.creator_id=$1
    ${common}
  `;
  if(audienceType==='recent_followers')return `
    SELECT f.follower_id user_id FROM follows f
    ${common}
      AND f.created_at>=now()-interval '30 days'
  `;
  if(audienceType==='high_priority')return `
    SELECT f.follower_id user_id FROM follows f
    JOIN creator_contact_meta meta ON meta.creator_id=$1 AND meta.contact_id=f.follower_id AND meta.priority='high'
    ${common}
  `;
  if(audienceType==='inactive_30d')return `
    SELECT f.follower_id user_id FROM follows f
    ${common}
      AND NOT EXISTS(
        SELECT 1 FROM (
          SELECT l.user_id,l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1
          UNION ALL SELECT c.user_id,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1
          UNION ALL SELECT r.user_id,r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1
          UNION ALL SELECT v.user_id,v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1
          UNION ALL SELECT qr.user_id,qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1
        ) activity
        WHERE activity.user_id=f.follower_id AND activity.created_at>=now()-interval '30 days'
      )
  `;
  if(audienceType==='active_30d')return `
    SELECT f.follower_id user_id FROM follows f
    ${common}
      AND (
        SELECT count(*) FROM (
          SELECT l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1 AND l.user_id=f.follower_id AND l.created_at>=now()-interval '30 days'
          UNION ALL SELECT c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1 AND c.user_id=f.follower_id AND c.created_at>=now()-interval '30 days'
          UNION ALL SELECT r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1 AND r.user_id=f.follower_id AND r.created_at>=now()-interval '30 days'
          UNION ALL SELECT v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1 AND v.user_id=f.follower_id AND v.created_at>=now()-interval '30 days'
          UNION ALL SELECT qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1 AND qr.user_id=f.follower_id AND qr.created_at>=now()-interval '30 days'
        ) events
      )>=3
  `;
  return `SELECT f.follower_id user_id FROM follows f ${common}`;
}

async function dispatchCreatorCommunication(id,creatorId=null){
  await ensureCreatorCommunicationsV132();
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const params=creatorId ? [id,creatorId] : [id];
    const communication=await client.query(`
      SELECT * FROM creator_communications
       WHERE id=$1
         ${creatorId ? 'AND creator_id=$2' : ''}
         AND status IN ('draft','scheduled')
       FOR UPDATE
    `,params);
    if(!communication.rowCount){
      await client.query('ROLLBACK');
      return {ok:false,error:'communication_not_sendable'};
    }
    const item=communication.rows[0];
    if(item.status==='scheduled' && item.scheduled_for && new Date(item.scheduled_for).getTime()>Date.now()){
      await client.query('ROLLBACK');
      return {ok:false,error:'communication_not_due'};
    }
    const nextAt=await creatorNextCommunicationAt(item.creator_id,client);
    if(nextAt && nextAt.getTime()>Date.now()){
      if(item.status==='scheduled'){
        await client.query("UPDATE creator_communications SET scheduled_for=$2,updated_at=now() WHERE id=$1",[item.id,nextAt.toISOString()]);
        await client.query('COMMIT');
        return {ok:false,error:'communication_cooldown',nextSendAt:nextAt.toISOString(),rescheduled:true};
      }
      await client.query('ROLLBACK');
      return {ok:false,error:'communication_cooldown',nextSendAt:nextAt.toISOString()};
    }
    await client.query("UPDATE creator_communications SET status='sending',updated_at=now() WHERE id=$1",[item.id]);
    const recipientParams=item.audience_type==='segment' ? [item.creator_id,item.segment_id] : [item.creator_id];
    const recipients=await client.query(communicationRecipientSql(item.audience_type),recipientParams);
    if(recipients.rowCount){
      await client.query(`
        INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
        SELECT unnest($1::bigint[]),$2,'creator_broadcast','creator_communication',$3,$4
      `,[recipients.rows.map(row=>row.user_id),item.creator_id,item.id,item.body]);
    }
    const sent=await client.query(`
      UPDATE creator_communications
         SET status='sent',recipient_count=$2,sent_at=now(),scheduled_for=NULL,updated_at=now()
       WHERE id=$1
       RETURNING *
    `,[item.id,recipients.rowCount]);
    await client.query('COMMIT');
    return {ok:true,communication:sent.rows[0]};
  }catch(error){
    await client.query('ROLLBACK');
    await db.query("UPDATE creator_communications SET status='draft',updated_at=now() WHERE id=$1 AND status='sending'",[id]).catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}

async function dispatchDueCreatorCommunications(){
  await ensureCreatorCommunicationsV132();
  const due=await db.query("SELECT id FROM creator_communications WHERE status='scheduled' AND scheduled_for<=now() ORDER BY scheduled_for ASC LIMIT 20");
  for(const row of due.rows){
    try{await dispatchCreatorCommunication(row.id);}catch(error){console.error('RedLibertad scheduled creator communication failed:',row.id,error?.message||error);}
  }
}

router.get('/communications',async(req,res)=>{
  await dispatchDueCreatorCommunications();
  const result=await db.query(`
    SELECT c.id,c.body,c.audience_type,c.segment_id,c.status,c.scheduled_for,c.recipient_count,c.sent_at,c.created_at,c.updated_at,
           s.name segment_name
      FROM creator_communications c
      LEFT JOIN creator_segments s ON s.id=c.segment_id AND s.creator_id=c.creator_id
     WHERE c.creator_id=$1
     ORDER BY COALESCE(c.sent_at,c.scheduled_for,c.updated_at) DESC
     LIMIT 100
  `,[req.user.id]);
  const nextAt=await creatorNextCommunicationAt(req.user.id);
  res.json({communications:result.rows,nextSendAt:nextAt?.toISOString() || null});
});

router.post('/communications',async(req,res)=>{
  const parsed=communicationSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_creator_communication'});
  const data=parsed.data;
  if(!await validateCommunicationAudience(req.user.id,data.audienceType,data.segmentId)){
    return res.status(400).json({error:'invalid_communication_audience'});
  }
  const scheduledFor=data.scheduledFor ? new Date(data.scheduledFor) : null;
  if(data.mode==='schedule' && (!scheduledFor || scheduledFor.getTime()<Date.now()+5*60*1000)){
    return res.status(400).json({error:'invalid_communication_schedule'});
  }
  const status=data.mode==='schedule' ? 'scheduled' : 'draft';
  const inserted=await db.query(`
    INSERT INTO creator_communications (creator_id,body,audience_type,segment_id,status,scheduled_for)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
  `,[req.user.id,data.body,data.audienceType,data.audienceType==='segment' ? data.segmentId : null,status,scheduledFor?.toISOString() || null]);
  if(data.mode==='send'){
    const sent=await dispatchCreatorCommunication(inserted.rows[0].id,req.user.id);
    if(!sent.ok)return res.status(sent.error==='communication_cooldown'?429:409).json(sent);
    return res.status(201).json(sent);
  }
  res.status(201).json({ok:true,communication:inserted.rows[0]});
});

router.post('/communications/:id/send',async(req,res)=>{
  const sent=await dispatchCreatorCommunication(req.params.id,req.user.id);
  if(!sent.ok)return res.status(sent.error==='communication_cooldown'?429:409).json(sent);
  res.json(sent);
});

router.post('/communications/:id/cancel',async(req,res)=>{
  const result=await db.query(`
    UPDATE creator_communications
       SET status='cancelled',updated_at=now()
     WHERE id=$1 AND creator_id=$2 AND status IN ('draft','scheduled')
     RETURNING *
  `,[req.params.id,req.user.id]);
  if(!result.rowCount)return res.status(404).json({error:'communication_not_cancellable'});
  res.json({ok:true,communication:result.rows[0]});
});

const creatorCommunicationTimer=setInterval(()=>{
  dispatchDueCreatorCommunications().catch(error=>console.error('RedLibertad V1.32 communication scheduler failed:',error?.message||error));
},60*1000);
if(typeof creatorCommunicationTimer.unref==='function')creatorCommunicationTimer.unref();


router.get('/analytics/advanced',async(req,res)=>{
  const days=Number(req.query.days || 30);
  if(![7,30,90].includes(days))return res.status(400).json({error:'invalid_analytics_period'});

  const [overview,interactions,community,trend,topContent]=await Promise.all([
    db.query(`
      SELECT
        (SELECT count(*)::int FROM follows WHERE following_id=$1) total_followers,
        (SELECT count(*)::int FROM follows WHERE following_id=$1 AND created_at>=now()-$2*interval '1 day') followers_current,
        (SELECT count(*)::int FROM follows WHERE following_id=$1 AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day') followers_previous,
        (SELECT count(*)::int FROM posts WHERE user_id=$1 AND moderation_status='published' AND created_at>=now()-$2*interval '1 day') posts_current,
        (SELECT count(*)::int FROM posts WHERE user_id=$1 AND moderation_status='published' AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day') posts_previous,
        (SELECT count(*)::int FROM creator_tasks WHERE creator_id=$1 AND status='completed' AND completed_at>=now()-$2*interval '1 day') tasks_current,
        (SELECT count(*)::int FROM creator_tasks WHERE creator_id=$1 AND status='completed' AND completed_at>=now()-($2*2)*interval '1 day' AND completed_at<now()-$2*interval '1 day') tasks_previous,
        (SELECT count(*)::int FROM creator_communications WHERE creator_id=$1 AND status='sent' AND sent_at>=now()-$2*interval '1 day') communications_current,
        (SELECT count(*)::int FROM creator_communications WHERE creator_id=$1 AND status='sent' AND sent_at>=now()-($2*2)*interval '1 day' AND sent_at<now()-$2*interval '1 day') communications_previous,
        (SELECT COALESCE(sum(recipient_count),0)::int FROM creator_communications WHERE creator_id=$1 AND status='sent' AND sent_at>=now()-$2*interval '1 day') recipients_current,
        (SELECT COALESCE(sum(recipient_count),0)::int FROM creator_communications WHERE creator_id=$1 AND status='sent' AND sent_at>=now()-($2*2)*interval '1 day' AND sent_at<now()-$2*interval '1 day') recipients_previous
    `,[req.user.id,days]),
    db.query(`
      WITH events AS (
        SELECT 'like' type,l.user_id,l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1
        UNION ALL SELECT 'comment',c.user_id,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1
        UNION ALL SELECT 'repost',r.user_id,r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1
        UNION ALL SELECT 'save',sp.user_id,sp.created_at FROM saved_posts sp JOIN posts p ON p.id=sp.post_id WHERE p.user_id=$1
      )
      SELECT
        count(*) FILTER (WHERE created_at>=now()-$2*interval '1 day')::int total_current,
        count(*) FILTER (WHERE created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int total_previous,
        count(*) FILTER (WHERE type='like' AND created_at>=now()-$2*interval '1 day')::int likes_current,
        count(*) FILTER (WHERE type='like' AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int likes_previous,
        count(*) FILTER (WHERE type='comment' AND created_at>=now()-$2*interval '1 day')::int comments_current,
        count(*) FILTER (WHERE type='comment' AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int comments_previous,
        count(*) FILTER (WHERE type='repost' AND created_at>=now()-$2*interval '1 day')::int reposts_current,
        count(*) FILTER (WHERE type='repost' AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int reposts_previous,
        count(*) FILTER (WHERE type='save' AND created_at>=now()-$2*interval '1 day')::int saves_current,
        count(*) FILTER (WHERE type='save' AND created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int saves_previous,
        count(DISTINCT user_id) FILTER (WHERE created_at>=now()-$2*interval '1 day')::int unique_current,
        count(DISTINCT user_id) FILTER (WHERE created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day')::int unique_previous
      FROM events
    `,[req.user.id,days]),
    db.query(`
      WITH activity AS (
        SELECT v.user_id,v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1
        UNION ALL
        SELECT qr.user_id,qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1
      ),
      current_users AS (
        SELECT user_id,count(*) n FROM activity WHERE created_at>=now()-$2*interval '1 day' GROUP BY user_id
      ),
      previous_users AS (
        SELECT user_id,count(*) n FROM activity WHERE created_at>=now()-($2*2)*interval '1 day' AND created_at<now()-$2*interval '1 day' GROUP BY user_id
      )
      SELECT
        (SELECT COALESCE(sum(n),0)::int FROM current_users) participations_current,
        (SELECT COALESCE(sum(n),0)::int FROM previous_users) participations_previous,
        (SELECT count(*)::int FROM current_users) participants_current,
        (SELECT count(*)::int FROM previous_users) participants_previous,
        (SELECT count(*)::int FROM current_users WHERE n>=2) recurring_current,
        (SELECT count(*)::int FROM previous_users WHERE n>=2) recurring_previous,
        (SELECT count(*)::int FROM current_users cu WHERE EXISTS(SELECT 1 FROM follows f WHERE f.following_id=$1 AND f.follower_id=cu.user_id)) follower_participants_current,
        (SELECT count(*)::int FROM previous_users pu WHERE EXISTS(SELECT 1 FROM follows f WHERE f.following_id=$1 AND f.follower_id=pu.user_id)) follower_participants_previous
    `,[req.user.id,days]),
    db.query(`
      WITH dates AS (
        SELECT generate_series((current_date-13)::date,current_date::date,interval '1 day')::date day
      ),
      events AS (
        SELECT l.created_at FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=$1 AND l.created_at>=current_date-13
        UNION ALL SELECT c.created_at FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=$1 AND c.created_at>=current_date-13
        UNION ALL SELECT r.created_at FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.user_id=$1 AND r.created_at>=current_date-13
        UNION ALL SELECT sp.created_at FROM saved_posts sp JOIN posts p ON p.id=sp.post_id WHERE p.user_id=$1 AND sp.created_at>=current_date-13
        UNION ALL SELECT v.created_at FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id WHERE p.user_id=$1 AND v.created_at>=current_date-13
        UNION ALL SELECT qr.created_at FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id WHERE p.user_id=$1 AND qr.created_at>=current_date-13
      )
      SELECT d.day,count(e.created_at)::int activity
        FROM dates d LEFT JOIN events e ON e.created_at::date=d.day
       GROUP BY d.day ORDER BY d.day
    `,[req.user.id]),
    db.query(`
      SELECT p.id,p.caption,p.media_url,p.media_type,p.post_kind,p.audience,p.created_at,
        (
          (SELECT count(*) FROM likes l WHERE l.post_id=p.id AND l.created_at>=now()-$2*interval '1 day')+
          (SELECT count(*) FROM comments c WHERE c.post_id=p.id AND c.created_at>=now()-$2*interval '1 day')+
          (SELECT count(*) FROM reposts r WHERE r.post_id=p.id AND r.created_at>=now()-$2*interval '1 day')+
          (SELECT count(*) FROM saved_posts sp WHERE sp.post_id=p.id AND sp.created_at>=now()-$2*interval '1 day')
        )::int engagement
      FROM posts p
      WHERE p.user_id=$1 AND p.moderation_status='published'
      ORDER BY engagement DESC,p.created_at DESC
      LIMIT 5
    `,[req.user.id,days])
  ]);

  const o=overview.rows[0] || {};
  const i=interactions.rows[0] || {};
  const c=community.rows[0] || {};
  res.json({
    periodDays:days,
    totalFollowers:Number(o.total_followers||0),
    current:{
      followers:Number(o.followers_current||0),posts:Number(o.posts_current||0),
      interactions:Number(i.total_current||0),likes:Number(i.likes_current||0),comments:Number(i.comments_current||0),
      reposts:Number(i.reposts_current||0),saves:Number(i.saves_current||0),uniqueInteractors:Number(i.unique_current||0),
      communityParticipations:Number(c.participations_current||0),communityParticipants:Number(c.participants_current||0),
      recurringParticipants:Number(c.recurring_current||0),followerParticipants:Number(c.follower_participants_current||0),
      tasksCompleted:Number(o.tasks_current||0),communications:Number(o.communications_current||0),communicationRecipients:Number(o.recipients_current||0)
    },
    previous:{
      followers:Number(o.followers_previous||0),posts:Number(o.posts_previous||0),
      interactions:Number(i.total_previous||0),likes:Number(i.likes_previous||0),comments:Number(i.comments_previous||0),
      reposts:Number(i.reposts_previous||0),saves:Number(i.saves_previous||0),uniqueInteractors:Number(i.unique_previous||0),
      communityParticipations:Number(c.participations_previous||0),communityParticipants:Number(c.participants_previous||0),
      recurringParticipants:Number(c.recurring_previous||0),followerParticipants:Number(c.follower_participants_previous||0),
      tasksCompleted:Number(o.tasks_previous||0),communications:Number(o.communications_previous||0),communicationRecipients:Number(o.recipients_previous||0)
    },
    trend:trend.rows,
    topContent:topContent.rows
  });
});


const automationRuleKeys=['overdue_task_priority','repeat_participant_task','overdue_followup_task','high_priority_contact_task'];
const automationPatchSchema=z.object({
  enabled:z.boolean(),
  threshold:z.number().int().min(2).max(20).optional()
});

async function ensureCreatorAutomationDefaults(creatorId){
  for(const key of automationRuleKeys){
    await db.query(`
      INSERT INTO creator_automation_rules (creator_id,rule_key,enabled,threshold)
      VALUES ($1,$2,false,$3)
      ON CONFLICT(creator_id,rule_key) DO NOTHING
    `,[creatorId,key,key==='repeat_participant_task'?3:2]);
  }
}

async function runCreatorAutomationRule(creatorId,rule){
  let affected=0;
  if(rule.rule_key==='overdue_task_priority'){
    const result=await db.query(`
      UPDATE creator_tasks SET priority='high',updated_at=now()
       WHERE creator_id=$1 AND status='open' AND due_at IS NOT NULL AND due_at<now() AND priority<>'high'
       RETURNING id
    `,[creatorId]);
    affected=result.rowCount;
  }else if(rule.rule_key==='repeat_participant_task'){
    const result=await db.query(`
      WITH participants AS (
        SELECT user_id,count(*)::int n
        FROM (
          SELECT v.user_id FROM creator_poll_votes v JOIN creator_polls cp ON cp.id=v.poll_id JOIN posts p ON p.id=cp.post_id
           WHERE p.user_id=$1 AND v.created_at>=now()-interval '30 days'
          UNION ALL
          SELECT qr.user_id FROM creator_question_responses qr JOIN creator_questions cq ON cq.id=qr.question_id JOIN posts p ON p.id=cq.post_id
           WHERE p.user_id=$1 AND qr.created_at>=now()-interval '30 days'
        ) activity
        GROUP BY user_id HAVING count(*)>=$2
      )
      INSERT INTO creator_tasks (creator_id,title,note,priority,related_user_id,source_key)
      SELECT $1,'Revisar participación de @'||u.username,
             'Creada automáticamente por participación recurrente en comunidad.',
             'normal',u.id,'auto:repeat:'||u.id||':'||to_char(current_date,'YYYY-MM')
        FROM participants p
        JOIN users u ON u.id=p.user_id AND u.status='active'
       WHERE u.id<>$1
      ON CONFLICT(creator_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
      RETURNING id
    `,[creatorId,Number(rule.threshold||3)]);
    affected=result.rowCount;
  }else if(rule.rule_key==='overdue_followup_task'){
    const result=await db.query(`
      INSERT INTO creator_tasks
        (creator_id,title,note,priority,due_at,notification_id,related_user_id,post_id,source_key)
      SELECT
        $1,
        'Revisar seguimiento vencido · '||COALESCE(actor.username,'comunidad'),
        'Creada automáticamente desde un seguimiento privado vencido.',
        meta.priority,
        meta.follow_up_at,
        n.id,
        n.actor_id,
        n.entity_id,
        'auto:followup:'||n.id||':'||to_char(meta.follow_up_at,'YYYY-MM-DD')
      FROM creator_community_activity_meta meta
      JOIN notifications n ON n.id=meta.notification_id AND n.user_id=$1
      LEFT JOIN users actor ON actor.id=n.actor_id
      JOIN posts p ON p.id=n.entity_id AND p.user_id=$1
      WHERE meta.creator_id=$1
        AND meta.follow_up=true
        AND meta.follow_up_at IS NOT NULL
        AND meta.follow_up_at<now()
      ON CONFLICT(creator_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
      RETURNING id
    `,[creatorId]);
    affected=result.rowCount;
  }else if(rule.rule_key==='high_priority_contact_task'){
    const result=await db.query(`
      INSERT INTO creator_tasks (creator_id,title,note,priority,related_user_id,source_key)
      SELECT
        $1,
        'Revisar contacto prioritario · @'||u.username,
        'Creada automáticamente desde Creator CRM.',
        'high',
        meta.contact_id,
        'auto:crm-high:'||meta.contact_id||':'||to_char(current_date,'YYYY-MM')
      FROM creator_contact_meta meta
      JOIN users u ON u.id=meta.contact_id AND u.status='active'
      WHERE meta.creator_id=$1
        AND meta.priority='high'
        AND NOT EXISTS(
          SELECT 1 FROM creator_tasks t
           WHERE t.creator_id=$1 AND t.related_user_id=meta.contact_id AND t.status='open'
        )
      ON CONFLICT(creator_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
      RETURNING id
    `,[creatorId]);
    affected=result.rowCount;
  }
  const result={affected,ranAt:new Date().toISOString()};
  await db.query(`
    UPDATE creator_automation_rules
       SET last_run_at=now(),last_result=$3::jsonb,updated_at=now()
     WHERE creator_id=$1 AND rule_key=$2
  `,[creatorId,rule.rule_key,JSON.stringify(result)]);
  return result;
}

async function runCreatorAutomations(creatorId){
  await ensureCreatorAutomationV134();
  await ensureCreatorAutomationDefaults(creatorId);
  const rules=await db.query("SELECT * FROM creator_automation_rules WHERE creator_id=$1 AND enabled=true ORDER BY rule_key",[creatorId]);
  const results={};
  for(const rule of rules.rows){
    try{results[rule.rule_key]=await runCreatorAutomationRule(creatorId,rule);}
    catch(error){results[rule.rule_key]={error:error?.message||'automation_failed'};}
  }
  return results;
}

router.get('/automations',async(req,res)=>{
  await ensureCreatorAutomationDefaults(req.user.id);
  const result=await db.query("SELECT rule_key,enabled,threshold,last_run_at,last_result,updated_at FROM creator_automation_rules WHERE creator_id=$1 ORDER BY rule_key",[req.user.id]);
  const metadata={
    overdue_task_priority:{name:'Subir prioridad de tareas vencidas',description:'Marca como prioridad alta las tareas privadas que ya han vencido.'},
    repeat_participant_task:{name:'Tarea por participación recurrente',description:'Crea una tarea mensual para personas con varias participaciones en 30 días.'},
    overdue_followup_task:{name:'Tarea por seguimiento vencido',description:'Convierte seguimientos privados vencidos en tareas relacionadas.'},
    high_priority_contact_task:{name:'Tarea para contactos prioritarios',description:'Crea una tarea mensual si un contacto de prioridad alta no tiene otra tarea abierta.'}
  };
  res.json({rules:result.rows.map(rule=>({...rule,...metadata[rule.rule_key]}))});
});

router.patch('/automations/:key',async(req,res)=>{
  const key=String(req.params.key||'');
  if(!automationRuleKeys.includes(key))return res.status(404).json({error:'automation_rule_not_found'});
  const parsed=automationPatchSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_automation_rule'});
  await ensureCreatorAutomationDefaults(req.user.id);
  const threshold=key==='repeat_participant_task' ? (parsed.data.threshold || 3) : 2;
  const result=await db.query(`
    UPDATE creator_automation_rules
       SET enabled=$3,threshold=$4,updated_at=now()
     WHERE creator_id=$1 AND rule_key=$2
     RETURNING *
  `,[req.user.id,key,parsed.data.enabled,threshold]);
  res.json({ok:true,rule:result.rows[0]});
});

router.post('/automations/run',async(req,res)=>{
  const results=await runCreatorAutomations(req.user.id);
  res.json({ok:true,results});
});

async function runEnabledCreatorAutomations(){
  await ensureCreatorAutomationV134();
  const creators=await db.query("SELECT DISTINCT creator_id FROM creator_automation_rules WHERE enabled=true");
  for(const row of creators.rows){
    try{await runCreatorAutomations(row.creator_id);}
    catch(error){console.error('RedLibertad creator automation failed:',row.creator_id,error?.message||error);}
  }
}

const creatorAutomationTimer=setInterval(()=>{
  runEnabledCreatorAutomations().catch(error=>console.error('RedLibertad V1.34 automation runner failed:',error?.message||error));
},60*60*1000);
if(typeof creatorAutomationTimer.unref==='function')creatorAutomationTimer.unref();

module.exports = router;
