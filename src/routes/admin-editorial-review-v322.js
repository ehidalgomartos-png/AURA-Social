'use strict';

// V3.2.2: human editorial decisions only. Approval NEVER creates a public post.
const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureEditorialSchema}=require('../services/editorial-v320');
const {canonicalArticleUrl,normalizedTitle}=require('../services/editorial-rss-v321');

const router=express.Router();

const draftSchema=z.object({
  revision:z.number().int().min(0).safe(),
  title:z.string().trim().min(12).max(220),
  summary:z.string().trim().min(70).max(1100),
  note:z.string().trim().max(500).default('')
}).strict();
const decisionSchema=z.object({
  revision:z.number().int().min(0).safe(),
  decision:z.enum(['approve','reject','reopen']),
  note:z.string().trim().max(500).default(''),
  factsChecked:z.boolean().default(false),
  rightsChecked:z.boolean().default(false),
  sourceRead:z.boolean().default(false)
}).strict();

function isOriginalEditorial(row){
  const title=String(row.editorial_title||'').trim();
  const summary=String(row.editorial_summary||'').trim();
  const raw=String(row.source_excerpt||'').trim();
  return title.length>=12 && title.length<=220 && summary.length>=70 &&
    summary.length<=1100 &&
    normalizedTitle(title)!==normalizedTitle(row.source_title||'') &&
    (!raw || normalizedTitle(summary)!==normalizedTitle(raw));
}
function reviewError(status,code){
  const e=new Error(code);e.status=status;e.code=code;return e;
}
function checkedId(value){
  const str=String(value||'');
  return /^[1-9][0-9]{0,14}$/.test(str)?str:null;
}
let schemaReady=null;
async function ensureReviewSchema(){
  if(!schemaReady){
    schemaReady=(async()=>{
      await ensureEditorialSchema(db);
      // V3.2.1 route initializes the base candidates table when accessed.
      // The create-if-not-exists is included so this route remains self-sufficient.
      await db.query("CREATE TABLE IF NOT EXISTS editorial_candidates (id BIGSERIAL PRIMARY KEY, source_id BIGINT REFERENCES editorial_sources(id) ON DELETE SET NULL, profile_id BIGINT REFERENCES editorial_profiles(id) ON DELETE SET NULL, category VARCHAR(30) NOT NULL CHECK(category IN ('actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento')), source_title VARCHAR(240) NOT NULL, source_excerpt VARCHAR(400) NOT NULL DEFAULT '', canonical_url TEXT NOT NULL UNIQUE, title_fingerprint CHAR(64) NOT NULL, published_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ, reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL, CHECK(status='pending' OR reviewed_at IS NOT NULL))");
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS editorial_title VARCHAR(220)");
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS editorial_summary VARCHAR(1100)");
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS editor_note VARCHAR(500) NOT NULL DEFAULT ''");
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0");
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ");
      await db.query("CREATE INDEX IF NOT EXISTS idx_editorial_review_status ON editorial_candidates(status,fetched_at DESC,id DESC)");
    })().catch(e=>{schemaReady=null;throw e;});
  }
  return schemaReady;
}
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensureReviewSchema();next();}
  catch(e){console.error('Editorial V3.2.2 schema bootstrap failed:',e);res.status(500).json({error:'editorial_review_unavailable'});}
});

const guarded=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
  if(e.status)return res.status(e.status).json({error:e.code});
  console.error('Editorial V3.2.2 review failed:',e);
  return res.status(500).json({error:'editorial_review_failed'});
});

router.get('/review',guarded(async(req,res)=>{
  const status=['pending','approved','rejected'].includes(req.query.status)?req.query.status:'pending';
  const focus=/^[1-9][0-9]{0,14}$/.test(String(req.query.focus||''))?String(req.query.focus):'0';
  const r=await db.query(
    "SELECT c.id,c.source_id,c.profile_id,c.category,c.source_title,c.source_excerpt,c.canonical_url,c.published_at,c.status,c.fetched_at,c.editorial_title,c.editorial_summary,c.editor_note,c.revision,c.edited_at,c.reviewed_at,c.reviewed_by,s.name AS source_name,s.status AS source_status,s.rights_mode,u.username AS reviewer_username FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id LEFT JOIN users u ON u.id=c.reviewed_by WHERE c.status=$1 ORDER BY (c.id=$2::bigint) DESC,c.fetched_at DESC,c.id DESC LIMIT 100",
    [status,focus]
  );
  res.json({items:r.rows,status,publishingEnabled:false,reviewRequired:true});
}));

async function mutateCandidate(req,res,kind){
  const id=checkedId(req.params.id);
  if(!id)throw reviewError(400,'editorial_id_invalid');
  const parsed=(kind==='draft'?draftSchema:decisionSchema).safeParse(req.body);
  if(!parsed.success)throw reviewError(400,'editorial_review_invalid_data');
  const d=parsed.data;
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(
      "SELECT c.*,s.status AS source_status FROM editorial_candidates c LEFT JOIN editorial_sources s ON s.id=c.source_id WHERE c.id=$1 FOR UPDATE OF c",
      [id]
    );
    if(!result.rowCount)throw reviewError(404,'editorial_candidate_not_found');
    const row=result.rows[0];
    if(row.revision!==d.revision)throw reviewError(409,'editorial_review_stale');
    if(kind==='draft'){
      if(row.status!=='pending')throw reviewError(409,'editorial_review_locked');
      const saved=await client.query(
        "UPDATE editorial_candidates SET editorial_title=$2,editorial_summary=$3,editor_note=$4,revision=revision+1,edited_at=now() WHERE id=$1 RETURNING id,status,revision",
        [id,d.title,d.summary,d.note]
      );
      await client.query("INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'edit','candidate',$2,$3::jsonb)",
        [req.user.id,id,JSON.stringify({revision:saved.rows[0].revision})]);
      await client.query('COMMIT');
      return res.json({ok:true,candidate:saved.rows[0],published:false});
    }
    if(d.decision==='reopen'){
      // Do not reopen an approved candidate while its public editorial snapshot is live.
      const table=await client.query("SELECT to_regclass('public.editorial_publications') AS table_name");
      if(table.rows[0]?.table_name){
        const live=await client.query(
          'SELECT 1 FROM editorial_publications WHERE candidate_id=$1 AND unpublished_at IS NULL LIMIT 1',[id]
        );
        if(live.rowCount)throw reviewError(409,'editorial_unpublish_before_reopen');
      }
      if(row.status==='pending')throw reviewError(409,'editorial_already_pending');
      const reopened=await client.query(
        "UPDATE editorial_candidates SET status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,editor_note=$2 WHERE id=$1 RETURNING id,status,revision",
        [id,d.note]
      );
      await client.query("INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'reopen','candidate',$2,$3::jsonb)",
        [req.user.id,id,JSON.stringify({previousStatus:row.status,revision:reopened.rows[0].revision,note:d.note})]);
      await client.query('COMMIT');
      return res.json({ok:true,candidate:reopened.rows[0],published:false});
    }
    if(row.status!=='pending')throw reviewError(409,'editorial_review_locked');
    if(d.decision==='approve'){
      if(row.source_status!=='approved'||!canonicalArticleUrl(row.canonical_url))throw reviewError(409,'editorial_source_not_approved');
      if(!isOriginalEditorial(row))throw reviewError(422,'editorial_original_draft_required');
      if(!d.factsChecked||!d.rightsChecked||!d.sourceRead)throw reviewError(422,'editorial_review_confirmation_required');
      if(d.note.length<8)throw reviewError(422,'editorial_approval_note_required');
    }
    if(d.decision==='reject'&&d.note.length<8)throw reviewError(422,'editorial_rejection_reason_required');
    const status=d.decision==='approve'?'approved':'rejected';
    const updated=await client.query(
      "UPDATE editorial_candidates SET status=$2,reviewed_at=now(),reviewed_by=$3,editor_note=$4,revision=revision+1 WHERE id=$1 RETURNING id,status,revision,reviewed_at",
      [id,status,req.user.id,d.note]
    );
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,'candidate',$3,$4::jsonb)",
      [req.user.id,d.decision,id,JSON.stringify({revision:updated.rows[0].revision,note:d.note,source_id:row.source_id})]
    );
    await client.query('COMMIT');
    return res.json({ok:true,candidate:updated.rows[0],published:false});
  }catch(e){
    try{await client.query('ROLLBACK');}catch(rollbackErr){console.error('Editorial review rollback failed:',rollbackErr);}
    throw e;
  }finally{client.release();}
}

router.patch('/review/:id/draft',guarded((req,res)=>mutateCandidate(req,res,'draft')));
router.post('/review/:id/decision',guarded((req,res)=>mutateCandidate(req,res,'decision')));

module.exports={router,isOriginalEditorial,draftSchema,decisionSchema,ensureReviewSchema};
