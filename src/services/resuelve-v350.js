'use strict';
// V3.5.0: RedLibertad Resuelve, solo personas reales, sin mensajes automáticos.
const db=require('../db');
let ready=null;
const CATEGORIES=['consejo','busco','ayuda','experiencia'];
const validId=x=>/^[1-9]\d{0,15}$/.test(String(x??''));
function clean(v,max){return typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,max+1):'';}
async function ensureSchema(){
 if(!ready)ready=(async()=>{
  const ddl=[
   "CREATE TABLE IF NOT EXISTS resuelve_questions (id BIGSERIAL PRIMARY KEY,",
   "author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "title VARCHAR(125) NOT NULL CHECK(char_length(title) BETWEEN 8 AND 125),",
   "body VARCHAR(1800) NOT NULL CHECK(char_length(body) BETWEEN 20 AND 1800),",
   "category VARCHAR(24) NOT NULL CHECK(category IN ('consejo','busco','ayuda','experiencia')),",
   "status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','hidden')),",
   "accepted_answer_id BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),solved_at TIMESTAMPTZ)"
  ].join(' ');
  const answers=[
   "CREATE TABLE IF NOT EXISTS resuelve_answers (id BIGSERIAL PRIMARY KEY,",
   "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,",
   "author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "body VARCHAR(1500) NOT NULL CHECK(char_length(body) BETWEEN 10 AND 1500),",
   "status VARCHAR(12) NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),",
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  ].join(' ');
  await db.query(ddl);
  await db.query(answers);
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_questions_feed ON resuelve_questions(status,created_at DESC,id DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_answers_question ON resuelve_answers(question_id,created_at ASC,id ASC) WHERE status='visible'");
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_questions_author ON resuelve_questions(author_id,created_at DESC)");
 })().catch(e=>{ready=null;throw e;});
 return ready;
}
function validateQuestion(body){
 const title=clean(body?.title,125),description=clean(body?.body,1800),category=body?.category;
 return title.length>=8&&title.length<=125&&description.length>=20&&description.length<=1800&&
  CATEGORIES.includes(category)?{title,body:description,category}:null;
}
function validateAnswer(body){const v=clean(body?.body,1500);return v.length>=10&&v.length<=1500?v:null;}
async function list({filter='open',before=null}={}){
 await ensureSchema();
 const state=['open','resolved','all'].includes(filter)?filter:'open';
 const cursor=validId(before)?String(before):null;
 const sql=[
  "SELECT q.id,q.title,q.body,q.category,q.status,q.created_at,q.solved_at,",
  "u.username AS author_username,",
  "(SELECT count(*)::int FROM resuelve_answers a WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.status <> 'hidden' AND ($1='all' OR q.status=$1) AND ($2::bigint IS NULL OR q.id<$2::bigint)",
  "ORDER BY q.id DESC LIMIT 24"
 ].join(' ');
 return (await db.query(sql,[state,cursor])).rows;
}
// V3.5.4 — solo el autor autenticado consulta sus peticiones (paginación estable).
async function listMine(userId,{before=null}={}){
 await ensureSchema();
 const cursor=validId(before)?String(before):null;
 const sql=[
  "SELECT q.id, q.title, q.body, q.category, q.status, q.created_at, q.solved_at,",
  "u.username AS author_username,",
  "(SELECT count(*)::int FROM resuelve_answers a WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.author_id=$1 AND q.status <> 'hidden' AND ($2::bigint IS NULL OR q.id<$2::bigint)",
  "ORDER BY q.id DESC LIMIT 24"
 ].join(' ');
 return (await db.query(sql,[userId,cursor])).rows;
}
async function detail(id){
 await ensureSchema();
 const q=await db.query([
  "SELECT q.id,q.author_id,q.title,q.body,q.category,q.status,q.accepted_answer_id,",
  "q.created_at,q.solved_at,u.username AS author_username",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.id=$1 AND q.status<>'hidden'"
 ].join(' '),[id]);
 if(!q.rowCount)return null;
 const answers=await db.query([
  "SELECT a.id,a.question_id,a.author_id,a.body,a.created_at,u.username AS author_username",
  "FROM resuelve_answers a JOIN users u ON u.id=a.author_id AND u.status='active'",
  "WHERE a.question_id=$1 AND a.status='visible'",
  "ORDER BY (a.id=$2::bigint) DESC,a.id ASC LIMIT 100"
 ].join(' '),[id,q.rows[0].accepted_answer_id||null]);
 return {question:q.rows[0],answers:answers.rows};
}
async function ask(userId,data){
 await ensureSchema();
 const r=await db.query("INSERT INTO resuelve_questions(author_id,title,body,category) VALUES($1,$2,$3,$4) RETURNING id",
  [userId,data.title,data.body,data.category]);return r.rows[0];
}
async function answer(userId,id,body){
 await ensureSchema();
 const r=await db.query([
  "INSERT INTO resuelve_answers(question_id,author_id,body)",
  "SELECT q.id,$2,$3 FROM resuelve_questions q",
  "WHERE q.id=$1 AND q.status='open' AND q.author_id<>$2 RETURNING id"
 ].join(' '),[id,userId,body]);
 const saved=r.rows[0]||null;
 if(saved){
  // La respuesta es válida aunque el sistema de notificaciones falle.
  try{
   await db.query([
    "INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)",
    "SELECT q.author_id,$2,'system','resuelve',q.id,",
    "'Han respondido a tu petición en RedLibertad Resuelve.'",
    "FROM resuelve_questions q WHERE q.id=$1 AND q.author_id<>$2 AND q.status<>'hidden'"
   ].join(' '),[id,userId]);
  }catch(error){console.warn('Resuelve: notificación no disponible',error?.code||error?.message||'error');}
 }
 return saved;
}
async function solve(userId,qid,aid){
 await ensureSchema();
 const r=await db.query([
  "UPDATE resuelve_questions q SET status='resolved',accepted_answer_id=$3,solved_at=now(),updated_at=now()",
  "WHERE q.id=$1 AND q.author_id=$2 AND q.status='open'",
  "AND EXISTS(SELECT 1 FROM resuelve_answers a WHERE a.id=$3 AND a.question_id=q.id AND a.status='visible')",
  "RETURNING q.id,q.accepted_answer_id"
 ].join(' '),[qid,userId,aid]);return r.rows[0]||null;
}
async function reopen(userId,qid){
 await ensureSchema();
 const r=await db.query([
  "UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL,solved_at=NULL,updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status='resolved' RETURNING id"
 ].join(' '),[qid,userId]);return r.rows[0]||null;
}
async function moderate(kind,id){
 await ensureSchema();
 if(kind==='question'){
  const r=await db.query("UPDATE resuelve_questions SET status='hidden',accepted_answer_id=NULL,solved_at=NULL,updated_at=now() WHERE id=$1 RETURNING id",[id]);
  return r.rows[0]||null;
 }
 if(kind==='answer'){
  const r=await db.query("UPDATE resuelve_answers SET status='hidden' WHERE id=$1 RETURNING id,question_id",[id]);
  if(!r.rowCount)return null;
  await db.query("UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL,solved_at=NULL,updated_at=now() WHERE accepted_answer_id=$1 AND status='resolved'",[id]);
  return r.rows[0];
 }
 return null;
}
module.exports={ensureSchema,validateQuestion,validateAnswer,validId,list,listMine,detail,ask,answer,solve,reopen,moderate,CATEGORIES};
