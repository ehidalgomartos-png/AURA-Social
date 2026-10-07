const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth,requireAdmin}=require('../middleware/auth');
const {requireFeature}=require('../services/release-control');

const router=express.Router();

let supportSchemaReady=null;
async function ensureSupportSchema(){
  if(!supportSchemaReady){
    supportSchemaReady=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS beta_feedback (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('bug','suggestion','question')),
          subject VARCHAR(160) NOT NULL,
          message VARCHAR(4000) NOT NULL,
          status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','resolved')),
          admin_note VARCHAR(2000) NOT NULL DEFAULT '',
          context JSONB NOT NULL DEFAULT '{}'::jsonb,
          request_id VARCHAR(100),
          reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_created ON beta_feedback(user_id,created_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_created ON beta_feedback(status,type,created_at DESC)');
    })().catch(error=>{
      supportSchemaReady=null;
      throw error;
    });
  }
  return supportSchemaReady;
}

router.use(requireAuth);
router.use(async (_req,res,next)=>{
  try{
    await ensureSupportSchema();
    next();
  }catch(error){
    console.error('RedLibertad V1.72 support bootstrap failed:',error);
    res.status(500).json({error:'support_bootstrap_failed'});
  }
});

const contextSchema=z.object({
  currentView:z.string().max(40).optional(),
  path:z.string().max(160).optional(),
  viewportClass:z.enum(['mobile','tablet','desktop']).optional(),
  online:z.boolean().optional(),
  appVersion:z.string().max(30).optional()
}).strict();

const createSchema=z.object({
  type:z.enum(['bug','suggestion','question']),
  subject:z.string().trim().min(3).max(160),
  message:z.string().trim().min(10).max(4000),
  context:contextSchema.optional().default({})
});

router.get('/mine',requireFeature('support_center'),async(req,res)=>{
  const result=await db.query(`
    SELECT id,type,subject,message,status,admin_note,context,created_at,updated_at,resolved_at
      FROM beta_feedback
     WHERE user_id=$1
     ORDER BY created_at DESC
     LIMIT 50
  `,[req.user.id]);
  res.json({feedback:result.rows});
});

router.post('/',requireFeature('support_center'),async(req,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feedback'});

  const recent=await db.query(`
    SELECT count(*)::int n
      FROM beta_feedback
     WHERE user_id=$1
       AND created_at>=now()-interval '1 hour'
  `,[req.user.id]);
  if(Number(recent.rows[0]?.n||0)>=5){
    return res.status(429).json({error:'feedback_rate_limited'});
  }

  const d=parsed.data;
  const result=await db.query(`
    INSERT INTO beta_feedback(user_id,type,subject,message,context,request_id)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)
    RETURNING id,type,subject,message,status,admin_note,context,created_at,updated_at,resolved_at
  `,[
    req.user.id,
    d.type,
    d.subject,
    d.message,
    JSON.stringify(d.context||{}),
    req.requestId || null
  ]);

  res.status(201).json({feedback:result.rows[0]});
});

router.get('/admin',requireAdmin,async(req,res)=>{
  const status=String(req.query.status||'open');
  const type=String(req.query.type||'all');
  const allowedStatus=new Set(['open','all','new','reviewing','resolved']);
  const allowedType=new Set(['all','bug','suggestion','question']);
  if(!allowedStatus.has(status)||!allowedType.has(type)){
    return res.status(400).json({error:'invalid_feedback_filter'});
  }

  const params=[];
  const where=[];
  if(status==='open')where.push("f.status IN ('new','reviewing')");
  else if(status!=='all'){params.push(status);where.push(`f.status=$${params.length}`);}
  if(type!=='all'){params.push(type);where.push(`f.type=$${params.length}`);}

  const result=await db.query(`
    SELECT f.id,f.type,f.subject,f.message,f.status,f.admin_note,f.context,f.request_id,
           f.created_at,f.updated_at,f.resolved_at,
           u.id user_id,u.username,u.display_name,u.email,
           reviewer.username reviewed_by_username
      FROM beta_feedback f
      JOIN users u ON u.id=f.user_id
      LEFT JOIN users reviewer ON reviewer.id=f.reviewed_by
      ${where.length?'WHERE '+where.join(' AND '):''}
     ORDER BY
       CASE f.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
       f.created_at DESC
     LIMIT 200
  `,params);

  res.json({feedback:result.rows});
});

const updateSchema=z.object({
  status:z.enum(['new','reviewing','resolved']).optional(),
  adminNote:z.string().trim().max(2000).optional()
}).refine(value=>Object.keys(value).length>0,{message:'feedback_update_required'});

router.patch('/admin/:id',requireAdmin,async(req,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_feedback_update'});

  const current=await db.query('SELECT * FROM beta_feedback WHERE id=$1 LIMIT 1',[req.params.id]);
  if(!current.rowCount)return res.status(404).json({error:'feedback_not_found'});
  const d=parsed.data;
  const status=d.status ?? current.rows[0].status;
  const note=d.adminNote ?? current.rows[0].admin_note;

  const result=await db.query(`
    UPDATE beta_feedback
       SET status=$2,
           admin_note=$3,
           reviewed_by=$4,
           resolved_at=CASE WHEN $2='resolved' THEN COALESCE(resolved_at,now()) ELSE NULL END,
           updated_at=now()
     WHERE id=$1
     RETURNING id,type,subject,message,status,admin_note,context,request_id,created_at,updated_at,resolved_at
  `,[req.params.id,status,note,req.user.id]);

  res.json({feedback:result.rows[0]});
});

module.exports=router;
