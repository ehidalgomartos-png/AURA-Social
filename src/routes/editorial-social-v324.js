'use strict';

// V3.2.4: real users interact with the public editorial edition.
// This never fabricates user profiles, engagement, posts or notifications.
const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth,requireAdmin}=require('../middleware/auth');
const {ensurePublicationSchema,safeId}=require('./editorial-publication-v323');

const router=express.Router();
let ready;
async function ensureSocialSchema(){
  if(!ready)ready=(async()=>{
    await ensurePublicationSchema();
    await db.query('CREATE TABLE IF NOT EXISTS editorial_likes (publication_id BIGINT NOT NULL REFERENCES editorial_publications(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(publication_id,user_id))');
    await db.query("CREATE TABLE IF NOT EXISTS editorial_comments (id BIGSERIAL PRIMARY KEY, publication_id BIGINT NOT NULL REFERENCES editorial_publications(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body VARCHAR(600) NOT NULL CHECK(length(btrim(body)) >= 2),status VARCHAR(12) NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),removed_at TIMESTAMPTZ)");
    await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_comments_public ON editorial_comments(publication_id,status,created_at DESC,id DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_comments_actor ON editorial_comments(user_id,created_at DESC)');
    await db.query("CREATE TABLE IF NOT EXISTS editorial_comment_reports (id BIGSERIAL PRIMARY KEY,comment_id BIGINT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason VARCHAR(20) NOT NULL CHECK(reason IN ('abuse','spam','misinformation','other')),status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),reviewed_at TIMESTAMPTZ,reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,UNIQUE(comment_id,reporter_id))");
    await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_reports_open ON editorial_comment_reports(status,created_at DESC)');
  })().catch(err=>{ready=null;throw err;});
  return ready;
}
router.use(async(_req,res,next)=>{try{await ensureSocialSchema();next();}catch(e){console.error('Editorial social schema failed',e);res.status(503).json({error:'editorial_social_unavailable'});}});
function error(res,code,status=400){return res.status(status).json({error:code});}
async function livePublication(id,lock=false,client=db){
  const result=await client.query(
    "SELECT p.id,p.title,p.profile_id FROM editorial_publications p JOIN editorial_profiles ep ON ep.id=p.profile_id WHERE p.id=$1 AND p.unpublished_at IS NULL AND ep.status='ready'"+(lock?' FOR UPDATE OF p':''),
    [id]
  );
  return result.rows[0]||null;
}
function safeWrap(fn){return(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
  console.error('Editorial social request failed',e);
  res.status(500).json({error:'editorial_social_failed'});
});}
const commentSchema=z.object({body:z.string().trim().min(2).max(600)}).strict();
const reportSchema=z.object({reason:z.enum(['abuse','spam','misinformation','other'])}).strict();

router.get('/discover',safeWrap(async(_req,res)=>{
  const result=await db.query(
    "SELECT p.id,p.title,p.summary,p.category,p.published_at,ep.name AS profile_name,p.source_name,p.image_url,p.image_alt,p.image_credit,(SELECT count(*)::int FROM editorial_likes l WHERE l.publication_id=p.id) AS like_count,(SELECT count(*)::int FROM editorial_comments c JOIN users u ON u.id=c.user_id WHERE c.publication_id=p.id AND c.status='published' AND u.status='active') AS comment_count FROM editorial_publications p JOIN editorial_profiles ep ON ep.id=p.profile_id WHERE p.unpublished_at IS NULL AND ep.status='ready' ORDER BY p.published_at DESC,p.id DESC LIMIT 12"
  );
  res.set('Cache-Control','no-store').json({items:result.rows,editorial:true});
}));

router.get('/:id/overview',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id);if(!id)return error(res,'invalid_editorial_id');
  if(!await livePublication(id))return error(res,'editorial_not_found',404);
  const [totals,comments]=await Promise.all([
    db.query("SELECT (SELECT count(*)::int FROM editorial_likes WHERE publication_id=$1) AS likes,(SELECT count(*)::int FROM editorial_comments c JOIN users u ON u.id=c.user_id WHERE c.publication_id=$1 AND c.status='published' AND u.status='active') AS comments",[id]),
    db.query("SELECT c.id,c.user_id,c.body,c.created_at,u.username,u.display_name FROM editorial_comments c JOIN users u ON u.id=c.user_id WHERE c.publication_id=$1 AND c.status='published' AND u.status='active' ORDER BY c.created_at DESC,c.id DESC LIMIT 40",[id])
  ]);
  res.set('Cache-Control','no-store').json({likes:totals.rows[0].likes,commentCount:totals.rows[0].comments,comments:comments.rows});
}));

router.use(requireAuth);
router.get('/:id/mine',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id);if(!id)return error(res,'invalid_editorial_id');
  if(!await livePublication(id))return error(res,'editorial_not_found',404);
  const r=await db.query('SELECT EXISTS(SELECT 1 FROM editorial_likes WHERE publication_id=$1 AND user_id=$2) AS liked',[id,req.user.id]);
  res.set('Cache-Control','no-store').json({liked:r.rows[0].liked,userId:req.user.id});
}));
router.put('/:id/like',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id);if(!id)return error(res,'invalid_editorial_id');
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    if(!await livePublication(id,true,client)){await client.query('ROLLBACK');return error(res,'editorial_not_found',404);}
    await client.query('INSERT INTO editorial_likes(publication_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,req.user.id]);
    await client.query('COMMIT');
    res.json({ok:true,liked:true});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.delete('/:id/like',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id);if(!id)return error(res,'invalid_editorial_id');
  await db.query('DELETE FROM editorial_likes WHERE publication_id=$1 AND user_id=$2',[id,req.user.id]);
  res.json({ok:true,liked:false});
}));
router.post('/:id/comments',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id);if(!id)return error(res,'invalid_editorial_id');
  const parsed=commentSchema.safeParse(req.body);
  if(!parsed.success)return error(res,'invalid_editorial_comment');
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    if(!await livePublication(id,true,client)){await client.query('ROLLBACK');return error(res,'editorial_not_found',404);}
    await client.query('SELECT pg_advisory_xact_lock(324,hashtext($1::text))',[req.user.id]);
    // Prevent bursts per user; modest daily cap before any paid moderation tooling.
    const recent=await client.query(
      "SELECT count(*)::int AS day_count,max(created_at) AS last_at FROM editorial_comments WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[req.user.id]
    );
    const row=recent.rows[0];
    if(row.day_count>=20||row.last_at&&Date.now()-new Date(row.last_at).getTime()<30*1000){
      await client.query('ROLLBACK');return error(res,'editorial_comment_rate_limited',429);
    }
    const r=await client.query(
      'INSERT INTO editorial_comments(publication_id,user_id,body) VALUES($1,$2,$3) RETURNING id,created_at',
      [id,req.user.id,parsed.data.body]
    );
    await client.query('COMMIT');
    res.status(201).json({ok:true,comment:r.rows[0]});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.delete('/:id/comments/:commentId',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id),cid=safeId(req.params.commentId);
  if(!id||!cid)return error(res,'invalid_editorial_id');
  const r=await db.query(
    "UPDATE editorial_comments SET status='removed',removed_at=now() WHERE publication_id=$1 AND id=$2 AND user_id=$3 AND status='published' RETURNING id",
    [id,cid,req.user.id]
  );
  if(!r.rowCount)return error(res,'editorial_comment_not_found',404);
  res.json({ok:true});
}));
router.post('/:id/comments/:commentId/report',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id),cid=safeId(req.params.commentId);
  if(!id||!cid)return error(res,'invalid_editorial_id');
  const parsed=reportSchema.safeParse(req.body);if(!parsed.success)return error(res,'invalid_editorial_report');
  const r=await db.query(
    "INSERT INTO editorial_comment_reports(comment_id,reporter_id,reason) SELECT c.id,$3,$4 FROM editorial_comments c JOIN editorial_publications p ON p.id=c.publication_id JOIN editorial_profiles ep ON ep.id=p.profile_id WHERE c.publication_id=$1 AND c.id=$2 AND c.status='published' AND c.user_id<>$3 AND p.unpublished_at IS NULL AND ep.status='ready' ON CONFLICT(comment_id,reporter_id) DO NOTHING RETURNING id",
    [id,cid,req.user.id,parsed.data.reason]
  );
  if(!r.rowCount)return error(res,'editorial_report_not_available',409);
  res.status(201).json({ok:true});
}));

const admin=express.Router();
admin.use(requireAdmin);
admin.use(async(_req,res,next)=>{try{await ensureSocialSchema();next();}catch(e){console.error('Editorial reports schema failed',e);res.status(503).json({error:'editorial_social_unavailable'});}});
admin.get('/comment-reports',safeWrap(async(_req,res)=>{
  const rows=await db.query(
    "SELECT r.id,r.reason,r.created_at,c.id AS comment_id,c.body AS comment_body,c.publication_id,u.username AS comment_author FROM editorial_comment_reports r JOIN editorial_comments c ON c.id=r.comment_id JOIN users u ON u.id=c.user_id WHERE r.status='open' ORDER BY r.created_at DESC,r.id DESC LIMIT 100"
  );
  res.json({reports:rows.rows});
}));
admin.post('/comment-reports/:id/resolve',safeWrap(async(req,res)=>{
  const id=safeId(req.params.id),action=req.body?.action;
  if(!id||!['remove','dismiss'].includes(action))return error(res,'invalid_editorial_report_action');
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const r=await client.query("SELECT comment_id FROM editorial_comment_reports WHERE id=$1 AND status='open' FOR UPDATE",[id]);
    if(!r.rowCount){await client.query('ROLLBACK');return error(res,'editorial_report_not_found',404);}
    if(action==='remove')await client.query("UPDATE editorial_comments SET status='removed',removed_at=now() WHERE id=$1 AND status='published'",[r.rows[0].comment_id]);
    await client.query("UPDATE editorial_comment_reports SET status='resolved',reviewed_at=now(),reviewed_by=$2 WHERE comment_id=$1 AND status='open'",[r.rows[0].comment_id,req.user.id]);
    await client.query("INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,'editorial_comment',$3,$4::jsonb)",[req.user.id,action==='remove'?'remove_comment':'dismiss_report',r.rows[0].comment_id,JSON.stringify({reportId:id})]);
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
module.exports={router,admin,ensureSocialSchema,commentSchema,reportSchema,livePublication};
