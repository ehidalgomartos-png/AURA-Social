'use strict';
// V3.6.40: private author submissions and a separate human-review queue.
// Approval is an internal editorial decision, NEVER public publication.
const db=require('../db');
const drafts=require('./independent-drafts-v3639');
const {validId}=drafts;
const DECISIONS=new Set(['approved','changes_requested','rejected']);
const snapshotColumns='id,draft_id,author_user_id,title,body,kind,sources,status,review_revision,submitted_draft_revision,review_reason,submitted_at,reviewed_at';
const safeRevision=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const MIN_BODY=250;
const MIN_TITLE=12;
function eligible(draft){
 const title=String(draft?.title||'').trim(),body=String(draft?.body||'').trim();
 const sources=Array.isArray(draft?.sources)?draft.sources:[];
 if(title.length<MIN_TITLE||body.length<MIN_BODY||!drafts.TYPES.has(draft?.kind))return false;
 // Facts, reports and analyses must cite at least one original external source.
 if(draft.kind!=='opinion'&&!sources.length)return false;
 return drafts.validateDraft({title,body,kind:draft.kind,sources})!==null;
}
let schemaReady;
async function ensureSchema(){
 if(!schemaReady)schemaReady=(async()=>{
  await drafts.ensureSchema();
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_submissions_v3640 (id BIGSERIAL PRIMARY KEY,draft_id BIGINT NOT NULL UNIQUE REFERENCES independent_article_drafts_v3639(id) ON DELETE RESTRICT,author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,title VARCHAR(180) NOT NULL,body TEXT NOT NULL,kind VARCHAR(16) NOT NULL,sources JSONB NOT NULL,status VARCHAR(25) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','changes_requested','rejected','approved')),review_revision INTEGER NOT NULL DEFAULT 1,submitted_draft_revision INTEGER NOT NULL,review_reason VARCHAR(600) NOT NULL DEFAULT '',reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),reviewed_at TIMESTAMPTZ)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_independent_submissions_pending_v3640 ON independent_article_submissions_v3640(submitted_at,id) WHERE status='pending'");
  await db.query("CREATE TABLE IF NOT EXISTS independent_article_review_events_v3640 (id BIGSERIAL PRIMARY KEY,submission_id BIGINT NOT NULL REFERENCES independent_article_submissions_v3640(id) ON DELETE RESTRICT,actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,action VARCHAR(30) NOT NULL CHECK(action IN ('submitted','resubmitted','approved','changes_requested','rejected')),note VARCHAR(600) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
 })().catch(e=>{schemaReady=null;throw e;});
 return schemaReady;
}
async function inTransaction(action){
 const client=await db.pool.connect();
 try{
  await client.query('BEGIN');
  const out=await action(client);
  await client.query('COMMIT');
  return out;
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}
async function submit(userId,draftId,draftRevision,certified){
 if(!validId(draftId)||!safeRevision(draftRevision)||certified!==true)return {error:'datos_incorrectos'};
 await ensureSchema();
 return inTransaction(async client=>{
  const draftResult=await client.query("SELECT id,author_user_id,title,body,kind,sources,revision FROM independent_article_drafts_v3639 WHERE id=$1 AND author_user_id=$2 AND status='draft' FOR UPDATE",[draftId,userId]);
  const draft=draftResult.rows[0];
  if(!draft)return {error:'borrador_no_disponible'};
  if(draft.revision!==draftRevision)return {error:'borrador_modificado'};
  if(!eligible(draft))return {error:'articulo_incompleto'};
  const prev=(await client.query('SELECT id,status,submitted_draft_revision FROM independent_article_submissions_v3640 WHERE draft_id=$1 FOR UPDATE',[draftId])).rows[0];
  if(prev&&(prev.status!=='changes_requested'||prev.submitted_draft_revision>=draftRevision))return {error:'ya_en_revision_o_finalizado'};
  const values=[draft.id,userId,draft.title,draft.body,draft.kind,JSON.stringify(draft.sources),draftRevision];
  let result;
  if(!prev){
   result=await client.query(
    "INSERT INTO independent_article_submissions_v3640(draft_id,author_user_id,title,body,kind,sources,submitted_draft_revision) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING "+snapshotColumns,
    values);
  }else{
   result=await client.query(
    "UPDATE independent_article_submissions_v3640 SET title=$3,body=$4,kind=$5,sources=$6::jsonb,submitted_draft_revision=$7,status='pending',review_revision=review_revision+1,review_reason='',reviewer_user_id=NULL,reviewed_at=NULL,submitted_at=now() WHERE draft_id=$1 AND author_user_id=$2 AND status='changes_requested' RETURNING "+snapshotColumns,values);
  }
  const item=result.rows[0];
  if(!item)return {error:'ya_en_revision_o_finalizado'};
  await client.query('INSERT INTO independent_article_review_events_v3640(submission_id,actor_user_id,action) VALUES($1,$2,$3)',[item.id,userId,prev?'resubmitted':'submitted']);
  return {item};
 });
}
async function mySubmissions(userId){
 await ensureSchema();
 const out=await db.query("SELECT "+snapshotColumns+" FROM independent_article_submissions_v3640 WHERE author_user_id=$1 ORDER BY submitted_at DESC,id DESC LIMIT 30",[userId]);
 return out.rows;
}
async function pending(adminId){
 await ensureSchema();
 const out=await db.query("SELECT s."+snapshotColumns.split(',').join(',s.')+",u.username AS author_username FROM independent_article_submissions_v3640 s JOIN users u ON u.id=s.author_user_id WHERE s.status='pending' AND s.author_user_id<>$1 ORDER BY s.submitted_at ASC,s.id ASC LIMIT 30",[adminId]);
 return out.rows;
}
async function review(adminId,id,revision,decision,reason,confirmed){
 if(!validId(id)||!safeRevision(revision)||!DECISIONS.has(decision)||confirmed!==true||
    typeof reason!=='string'||reason.trim().length>600||
    (decision!=='approved'&&reason.trim().length<15))return {error:'revision_invalida'};
 await ensureSchema();
 return inTransaction(async client=>{
  const out=await client.query(
   "UPDATE independent_article_submissions_v3640 SET status=$1,review_reason=$2,reviewer_user_id=$3,reviewed_at=now(),review_revision=review_revision+1 WHERE id=$4 AND status='pending' AND review_revision=$5 AND author_user_id<>$3 RETURNING "+snapshotColumns,
   [decision,reason.trim(),adminId,id,revision]);
  const item=out.rows[0];
  if(!item)return {error:'revision_no_disponible'};
  await client.query("INSERT INTO independent_article_review_events_v3640(submission_id,actor_user_id,action,note) VALUES($1,$2,$3,$4)",[item.id,adminId,decision,reason.trim()]);
  return {item};
 });
}
module.exports={ensureSchema,eligible,submit,mySubmissions,pending,review,DECISIONS};
