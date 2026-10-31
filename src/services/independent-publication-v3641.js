'use strict';
// V3.6.41: only manually approved + individually published independent articles appear online.
const db=require('../db');
const reviews=require('./independent-review-v3640');
const {validId}=require('./independent-drafts-v3639');
const net=require('node:net');
const safeRevision=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const types={noticia:'Noticia',reportaje:'Reportaje',analisis:'Análisis',opinion:'Opinión'};
const escapeHtml=(value='')=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function publicSource(input){
 try{
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.port||net.isIP(url.hostname)||!url.hostname.includes('.')||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/i.test(url.hostname))return null;
  return url.href;
 }catch(_){return null;}
}
let schemaReady;
async function ensureSchema(){
 if(!schemaReady)schemaReady=(async()=>{
  await reviews.ensureSchema();
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_publications_v3641 (id BIGSERIAL PRIMARY KEY,submission_id BIGINT NOT NULL UNIQUE REFERENCES independent_article_submissions_v3640(id) ON DELETE RESTRICT,published_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,published_at TIMESTAMPTZ NOT NULL DEFAULT now(),unpublished_at TIMESTAMPTZ,unpublished_by BIGINT REFERENCES users(id) ON DELETE SET NULL,unpublish_reason VARCHAR(600) NOT NULL DEFAULT '')");
  await db.query("CREATE INDEX IF NOT EXISTS idx_independent_publications_live_v3641 ON independent_article_publications_v3641(published_at DESC,id DESC) WHERE unpublished_at IS NULL");
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_publication_events_v3641 (id BIGSERIAL PRIMARY KEY,publication_id BIGINT NOT NULL REFERENCES independent_article_publications_v3641(id) ON DELETE RESTRICT,actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,action VARCHAR(15) NOT NULL CHECK(action IN ('published','withdrawn')),reason VARCHAR(600) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
 })().catch(e=>{schemaReady=null;throw e;});
 return schemaReady;
}
async function transaction(work){
 const c=await db.pool.connect();
 try{
  await c.query('BEGIN');
  const result=await work(c);
  await c.query('COMMIT');
  return result;
 }catch(e){try{await c.query('ROLLBACK');}catch(_){}throw e;}
 finally{c.release();}
}
async function readyForPublication(adminId){
 await ensureSchema();
 const sql="SELECT s.id,s.title,s.body,s.kind,s.sources,s.author_user_id,s.review_revision,s.reviewed_at,s.reviewer_user_id,s.author_publish_consent_at,u.username AS author_username FROM independent_article_submissions_v3640 s JOIN users u ON u.id=s.author_user_id LEFT JOIN independent_article_publications_v3641 p ON p.submission_id=s.id WHERE s.status='approved' AND s.reviewed_at IS NOT NULL AND s.reviewer_user_id IS NOT NULL AND s.author_publish_consent_at IS NOT NULL AND u.status='active' AND s.author_user_id<>$1 AND p.id IS NULL ORDER BY s.reviewed_at DESC,s.id DESC LIMIT 30";
 return (await db.query(sql,[adminId])).rows;
}
async function publish(adminId,submissionId,revision,rightsChecked,confirmed){
 if(!validId(submissionId)||!safeRevision(revision)||rightsChecked!==true||confirmed!==true)
  return {error:'confirmacion_publicacion_requerida'};
 await ensureSchema();
 return transaction(async c=>{
  const rows=await c.query("SELECT s.id,s.status,s.review_revision,s.author_user_id,s.reviewed_at,s.reviewer_user_id,s.author_publish_consent_at,u.status AS author_status FROM independent_article_submissions_v3640 s JOIN users u ON u.id=s.author_user_id WHERE s.id=$1 FOR UPDATE OF s",[submissionId]);
  const s=rows.rows[0];
  if(!s||s.status!=='approved'||s.review_revision!==revision||!s.reviewed_at||!s.reviewer_user_id||
     !s.author_publish_consent_at||s.author_status!=='active'||String(s.author_user_id)===String(adminId)||
     String(s.reviewer_user_id)===String(s.author_user_id))return {error:'revision_o_autorizacion_invalida'};
  const result=await c.query("INSERT INTO independent_article_publications_v3641(submission_id,published_by) VALUES($1,$2) ON CONFLICT (submission_id) DO NOTHING RETURNING id,published_at",[submissionId,adminId]);
  if(!result.rowCount)return {error:'publicacion_ya_existente_o_retirada'};
  const item=result.rows[0];
  await c.query("INSERT INTO independent_article_publication_events_v3641(publication_id,actor_user_id,action) VALUES($1,$2,'published')",[item.id,adminId]);
  return {item};
 });
}
async function withdraw(adminId,publicationId,reason,confirmed){
 if(!validId(publicationId)||confirmed!==true||typeof reason!=='string'||reason.trim().length<15||reason.trim().length>600)
  return {error:'motivo_y_confirmacion_requeridos'};
 await ensureSchema();
 return transaction(async c=>{
  const result=await c.query("UPDATE independent_article_publications_v3641 SET unpublished_at=now(),unpublished_by=$2,unpublish_reason=$3 WHERE id=$1 AND unpublished_at IS NULL RETURNING id",[publicationId,adminId,reason.trim()]);
  if(!result.rowCount)return {error:'publicacion_ya_retirada_o_no_disponible'};
  await c.query("INSERT INTO independent_article_publication_events_v3641(publication_id,actor_user_id,action,reason) VALUES($1,$2,'withdrawn',$3)",[publicationId,adminId,reason.trim()]);
  return {item:result.rows[0]};
 });
}
const liveColumns='p.id,p.published_at,s.title,s.body,s.kind,s.sources,u.username AS author_username';
const liveFrom=" FROM independent_article_publications_v3641 p JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id JOIN users u ON u.id=s.author_user_id WHERE p.unpublished_at IS NULL AND s.status='approved' AND s.author_publish_consent_at IS NOT NULL AND u.status='active'";
async function listPublic(limit=20){
 await ensureSchema();
 const out=await db.query("SELECT "+liveColumns+liveFrom+" ORDER BY p.published_at DESC,p.id DESC LIMIT $1",[Math.min(Math.max(1,limit),50)]);
 return out.rows;
}
async function getPublic(id){
 if(!validId(id))return null;
 await ensureSchema();
 const out=await db.query("SELECT "+liveColumns+liveFrom+" AND p.id=$1 LIMIT 1",[id]);
 return out.rows[0]||null;
}
async function liveAdmin(){
 await ensureSchema();
 const out=await db.query("SELECT p.id,p.published_at,s.title,s.kind,u.username AS author_username FROM independent_article_publications_v3641 p JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id JOIN users u ON u.id=s.author_user_id WHERE p.unpublished_at IS NULL ORDER BY p.published_at DESC,p.id DESC LIMIT 30");
 return out.rows;
}
async function urlsForSitemap(){
 await ensureSchema();
 const out=await db.query("SELECT p.id,p.published_at,u.username AS author_username"+liveFrom+" ORDER BY p.published_at DESC,p.id DESC LIMIT 1000");
 return out.rows;
}
module.exports={ensureSchema,readyForPublication,publish,withdraw,listPublic,getPublic,liveAdmin,urlsForSitemap,publicSource,escapeHtml,types};
