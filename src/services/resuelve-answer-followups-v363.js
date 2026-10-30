'use strict';
// V3.6.3 — aclaraciones públicas y moderables entre las dos personas implicadas.
const defaultDb=require('../db');
const {ensureSchema:ensureResuelve}=require('./resuelve-v350');
const validId=value=>/^[1-9]\d{0,15}$/.test(String(value??''));
function cleanFollowup(raw){
 if(typeof raw!=='string')return null;
 const body=raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return body.length>=20&&body.length<=600?body:null;
}
function createAnswerFollowupsService({db=defaultDb,ensureBase=ensureResuelve}={}){
 let initialized=null;
 async function ensureSchema(){
  if(!initialized)initialized=(async()=>{
   await ensureBase();
   await db.query([
    "CREATE TABLE IF NOT EXISTS resuelve_answer_followups_v363 (",
    "id BIGSERIAL PRIMARY KEY,",
    "answer_id BIGINT NOT NULL REFERENCES resuelve_answers(id) ON DELETE CASCADE,",
    "author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
    "body VARCHAR(600) NOT NULL CHECK(char_length(body) BETWEEN 20 AND 600),",
    "status VARCHAR(12) NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
   ].join(' '));
   await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_followups_answer_v363 ON resuelve_answer_followups_v363(answer_id,id) WHERE status='visible'");
  })().catch(error=>{initialized=null;throw error;});
  return initialized;
 }

 async function list(questionId){
  if(!validId(questionId))return null;
  await ensureSchema();
  const result=await db.query([
   "SELECT f.id,f.answer_id,f.author_id,f.body,f.created_at,u.username AS author_username",
   "FROM resuelve_answer_followups_v363 f",
   "JOIN resuelve_answers a ON a.id=f.answer_id AND a.status='visible'",
   "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
   "JOIN users u ON u.id=f.author_id AND u.status='active'",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE q.id=$1 AND f.status='visible'",
   "ORDER BY f.id ASC LIMIT 100"
  ].join(' '),[questionId]);
  return result.rows;
 }

 async function add(userId,answerId,rawBody){
  if(!validId(answerId))return null;
  const body=cleanFollowup(rawBody);
  if(!body)return null;
  await ensureSchema();
  const result=await db.query([
   "INSERT INTO resuelve_answer_followups_v363(answer_id,author_id,body)",
   "SELECT a.id,$2,$3 FROM resuelve_answers a",
   "JOIN resuelve_questions q ON q.id=a.question_id AND q.status='open'",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE a.id=$1 AND a.status='visible'",
   "AND ($2=q.author_id OR $2=a.author_id)",
   "AND (SELECT count(*) FROM resuelve_answer_followups_v363 f",
   "WHERE f.answer_id=a.id AND f.author_id=$2)<5",
   "RETURNING id,answer_id"
  ].join(' '),[answerId,userId,body]);
  return result.rows[0]||null;
 }

 async function hide(followupId){
  if(!validId(followupId))return null;
  await ensureSchema();
  const result=await db.query(
   "UPDATE resuelve_answer_followups_v363 SET status='hidden' WHERE id=$1 AND status='visible' RETURNING id",
   [followupId]);
  return result.rows[0]||null;
 }
 return {ensureSchema,list,add,hide};
}
const resuelveAnswerFollowups=createAnswerFollowupsService();
module.exports={createAnswerFollowupsService,resuelveAnswerFollowups,cleanFollowup};
