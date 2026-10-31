'use strict';
// V3.6.42: one optional, non-monetary recognition per account and live original article.
// A count is not a measure of truth, expertise, payment or journalistic accreditation.
const db=require('../db');
const publication=require('./independent-publication-v3641');
const {validId}=require('./independent-drafts-v3639');
let ready;
async function ensureSchema(){
 if(!ready)ready=(async()=>{
  await publication.ensureSchema();
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_support_v3642 (publication_id BIGINT NOT NULL REFERENCES independent_article_publications_v3641(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(publication_id,user_id))");
  await db.query("CREATE INDEX IF NOT EXISTS idx_independent_support_user_v3642 ON independent_article_support_v3642(user_id,created_at DESC)");
 })().catch(error=>{ready=null;throw error;});
 return ready;
}
const live="FROM independent_article_publications_v3641 p JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id JOIN users author ON author.id=s.author_user_id WHERE p.id=$1 AND p.unpublished_at IS NULL AND s.status='approved' AND s.author_publish_consent_at IS NOT NULL AND author.status='active'";
async function summary(articleId,viewerId=null){
 if(!validId(articleId))return null;
 await ensureSchema();
 const sql="SELECT p.id,s.author_user_id,"+
  "(SELECT count(*)::int FROM independent_article_support_v3642 v JOIN users supporter ON supporter.id=v.user_id AND supporter.status='active' WHERE v.publication_id=p.id) AS support_count,"+
  "EXISTS(SELECT 1 FROM independent_article_support_v3642 own WHERE own.publication_id=p.id AND own.user_id=$2::bigint) AS viewer_supported "+
  live+" LIMIT 1";
 const row=(await db.query(sql,[articleId,viewerId])).rows[0];
 if(!row)return null;
 const count=Number(row.support_count);
 if(!Number.isSafeInteger(count)||count<0)throw Error('invalid_support_count');
 return {count,supported:viewerId===null?null:row.viewer_supported===true,
  canSupport:viewerId===null?null:String(row.author_user_id)!==String(viewerId)};
}
async function setSupport(userId,articleId,supported){
 if(!validId(articleId)||!validId(userId)||typeof supported!=='boolean')
  return {error:'apoyo_invalido'};
 await ensureSchema();
 const client=await db.pool.connect();
 try{
  await client.query('BEGIN');
  const item=(await client.query(
   "SELECT p.id,s.author_user_id "+live+" FOR UPDATE OF p",[articleId]
  )).rows[0];
  if(!item){
   await client.query('COMMIT');
   return {error:'articulo_no_disponible'};
  }
  if(String(item.author_user_id)===String(userId)){
   await client.query('COMMIT');
   return {error:'apoyo_propio_no_permitido'};
  }
  if(supported)await client.query(
   "INSERT INTO independent_article_support_v3642(publication_id,user_id) VALUES($1,$2) ON CONFLICT (publication_id,user_id) DO NOTHING",[articleId,userId]);
  else await client.query("DELETE FROM independent_article_support_v3642 WHERE publication_id=$1 AND user_id=$2",[articleId,userId]);
  const stats=await client.query(
   "SELECT count(*)::int AS support_count FROM independent_article_support_v3642 v JOIN users supporter ON supporter.id=v.user_id AND supporter.status='active' WHERE v.publication_id=$1",[articleId]);
  const count=Number(stats.rows[0]?.support_count);
  if(!Number.isSafeInteger(count)||count<0)throw Error('invalid_support_count');
  await client.query('COMMIT');
  return {count,supported};
 }catch(error){
  try{await client.query('ROLLBACK');}catch(_){}
  throw error;
 }finally{client.release();}
}
module.exports={ensureSchema,summary,setSupport};
