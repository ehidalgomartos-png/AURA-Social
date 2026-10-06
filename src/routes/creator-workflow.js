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

module.exports = router;
