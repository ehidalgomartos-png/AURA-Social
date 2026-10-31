'use strict';
// Human triage only. Reporting an article never automatically withdraws it.
const db=require('../db');
const publications=require('./independent-publication-v3641');
const {validId}=require('./independent-drafts-v3639');
const reasons=new Set(['inexactitud','sin_fuentes','plagio','privacidad','otro']);
let initialized;
async function ensureSchema(){
 if(!initialized)initialized=(async()=>{
  await publications.ensureSchema();
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_reports_v3643 (id BIGSERIAL PRIMARY KEY,publication_id BIGINT NOT NULL REFERENCES independent_article_publications_v3641(id) ON DELETE RESTRICT,reporter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason VARCHAR(24) NOT NULL CHECK(reason IN ('inexactitud','sin_fuentes','plagio','privacidad','otro')),details VARCHAR(1200) NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),reviewed_at TIMESTAMPTZ,reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,review_note VARCHAR(600) NOT NULL DEFAULT '',UNIQUE(publication_id,reporter_user_id))");
  await db.query("CREATE INDEX IF NOT EXISTS idx_independent_reports_open_v3643 ON independent_article_reports_v3643(reported_at,id) WHERE status='open'");
 })().catch(error=>{initialized=null;throw error;});
 return initialized;
}
function validate(reason,details){
 if(!reasons.has(reason)||typeof details!=='string')return null;
 const note=details.trim();
 if(note.length<20||note.length>1200)return null;
 return {reason,details:note};
}
async function transaction(fn){
 const client=await db.pool.connect();
 try{
  await client.query('BEGIN');
  const result=await fn(client);
  await client.query('COMMIT');
  return result;
 }catch(error){try{await client.query('ROLLBACK');}catch(_){}throw error;}
 finally{client.release();}
}
async function report(userId,publicationId,reason,details,confirmed){
 if(!validId(publicationId)||!validId(userId)||confirmed!==true)return {error:'denuncia_invalida'};
 const data=validate(reason,details);
 if(!data)return {error:'denuncia_invalida'};
 await ensureSchema();
 return transaction(async client=>{
  const found=await client.query(
   "SELECT p.id,s.author_user_id FROM independent_article_publications_v3641 p JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id JOIN users author ON author.id=s.author_user_id WHERE p.id=$1 AND p.unpublished_at IS NULL AND s.status='approved' AND s.author_publish_consent_at IS NOT NULL AND author.status='active' FOR UPDATE OF p",
   [publicationId]);
  const item=found.rows[0];
  if(!item)return {error:'articulo_no_disponible'};
  if(String(item.author_user_id)===String(userId))return {error:'denuncia_propia_no_permitida'};
  const inserted=await client.query(
   "INSERT INTO independent_article_reports_v3643(publication_id,reporter_user_id,reason,details) VALUES($1,$2,$3,$4) ON CONFLICT (publication_id,reporter_user_id) DO NOTHING RETURNING id",
   [publicationId,userId,data.reason,data.details]);
  return {accepted:true,alreadyReported:inserted.rowCount===0};
 });
}
async function pending(){
 await ensureSchema();
 const out=await db.query(
  "SELECT r.id,r.publication_id,r.reason,r.details,r.reported_at,s.title,p.unpublished_at IS NOT NULL AS withdrawn FROM independent_article_reports_v3643 r JOIN independent_article_publications_v3641 p ON p.id=r.publication_id JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id WHERE r.status='open' ORDER BY r.reported_at ASC,r.id ASC LIMIT 40");
 return out.rows;
}
async function decide(adminId,id,decision,note,confirmed){
 if(!validId(id)||!validId(adminId)||!['reviewed','dismissed'].includes(decision)||confirmed!==true||
    typeof note!=='string'||note.trim().length<15||note.trim().length>600)return {error:'revision_invalida'};
 await ensureSchema();
 const result=await db.query(
  "UPDATE independent_article_reports_v3643 SET status=$1,review_note=$2,reviewer_user_id=$3,reviewed_at=now() WHERE id=$4 AND status='open' AND reporter_user_id<>$3 RETURNING id,status",
  [decision,note.trim(),adminId,id]);
 if(!result.rowCount)return {error:'denuncia_no_disponible'};
 return {item:result.rows[0]};
}
module.exports={reasons,validate,ensureSchema,report,pending,decide};
