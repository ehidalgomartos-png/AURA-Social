'use strict';
// V3.6.2 — pendientes propios y recordatorios internos, siempre voluntarios.
const defaultDb=require('../db');
const {ensureSchema:ensureResuelveSchema}=require('./resuelve-v350');
const validId=value=>/^[1-9]\d{0,15}$/.test(String(value??''));
const POLL_INTERVAL_MS=60*60*1000;
const REMINDER_WITH_ANSWERS='Tu petición de Resuelve tiene respuestas pendientes de revisar.';
const REMINDER_WITHOUT_ANSWERS='Tu petición de Resuelve sigue sin respuesta. Puedes aclararla o compartirla.';

function createPendingService({db=defaultDb,ensureResuelve=ensureResuelveSchema,
 timers={setInterval,clearInterval},logger=console}={}){
 let initialized=null,running=null,timer=null,closed=false;

 async function ensureSchema(){
  if(!initialized)initialized=(async()=>{
   await ensureResuelve();
   await db.query([
    "CREATE TABLE IF NOT EXISTS resuelve_question_reminders_v362 (",
    "user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
    "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,",
    "enabled BOOLEAN NOT NULL DEFAULT FALSE,",
    "last_reminded_at TIMESTAMPTZ,",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "PRIMARY KEY(user_id,question_id))"
   ].join(' '));
   await db.query([
    "CREATE INDEX IF NOT EXISTS idx_resuelve_reminders_due_v362",
    "ON resuelve_question_reminders_v362(last_reminded_at,created_at)",
    "WHERE enabled=TRUE"
   ].join(' '));
  })().catch(error=>{initialized=null;throw error;});
  return initialized;
 }

 // No devuelve el cuerpo ni los datos de otra persona.
 async function listPending(userId){
  await ensureSchema();
  const sql=[
   "SELECT q.id,q.title,q.created_at,",
   "(SELECT count(*)::int FROM resuelve_answers a",
   "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
   "FROM resuelve_questions q",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "WHERE q.author_id=$1 AND q.status='open'",
   "ORDER BY answer_count ASC,q.id DESC LIMIT 12"
  ].join(' ');
  const r=await db.query(sql,[userId]);
  return r.rows;
 }

 async function reminderPreference(userId,questionId){
  if(!validId(questionId))return null;
  await ensureSchema();
  const r=await db.query([
   "SELECT q.status,COALESCE(p.enabled,FALSE) AS enabled",
   "FROM resuelve_questions q",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "LEFT JOIN resuelve_question_reminders_v362 p",
   "ON p.question_id=q.id AND p.user_id=$1",
   "WHERE q.id=$2 AND q.author_id=$1 AND q.status<>'hidden'"
  ].join(' '),[userId,questionId]);
  return r.rows[0]||null;
 }

 async function saveReminder(userId,questionId,enabled){
  if(!validId(questionId)||typeof enabled!=='boolean')return null;
  await ensureSchema();
  if(!enabled){
   // La revocación se permite incluso después de resolver la petición.
   const own=await reminderPreference(userId,questionId);
   if(!own)return null;
   await db.query("DELETE FROM resuelve_question_reminders_v362 WHERE user_id=$1 AND question_id=$2",[userId,questionId]);
   return {enabled:false};
  }
  const r=await db.query([
   "INSERT INTO resuelve_question_reminders_v362(user_id,question_id,enabled)",
   "SELECT $1,q.id,TRUE FROM resuelve_questions q",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "WHERE q.id=$2 AND q.author_id=$1 AND q.status='open'",
   "ON CONFLICT(user_id,question_id) DO UPDATE",
   "SET enabled=TRUE,updated_at=now() RETURNING enabled"
  ].join(' '),[userId,questionId]);
  return r.rows[0]||null;
 }

 // Una sola operación SQL: claim + aviso se confirman juntos, incluso con varios procesos.
 async function poll(){
  if(closed)return {skipped:'stopped'};
  if(running)return running;
  running=(async()=>{
   try{
    await ensureSchema();
    const sql=[
     "WITH due AS (",
     "SELECT p.user_id,p.question_id",
     "FROM resuelve_question_reminders_v362 p",
     "JOIN resuelve_questions q ON q.id=p.question_id AND q.author_id=p.user_id",
     "JOIN users u ON u.id=p.user_id AND u.status='active'",
     "WHERE p.enabled=TRUE AND q.status='open'",
     "AND q.created_at<=now()-interval '3 days'",
     "AND p.created_at<=now()-interval '1 day'",
     "AND (p.last_reminded_at IS NULL OR p.last_reminded_at<=now()-interval '7 days')",
     "ORDER BY p.question_id FOR UPDATE OF p SKIP LOCKED LIMIT 25",
     "), claimed AS (",
     "UPDATE resuelve_question_reminders_v362 p SET last_reminded_at=now(),updated_at=now()",
     "FROM due WHERE p.user_id=due.user_id AND p.question_id=due.question_id",
     "AND p.enabled=TRUE",
     "RETURNING p.user_id,p.question_id)",
     "INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)",
     "SELECT claimed.user_id,NULL,'system','resuelve',claimed.question_id,",
     "CASE WHEN EXISTS(SELECT 1 FROM resuelve_answers a",
     "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
     "WHERE a.question_id=claimed.question_id AND a.status='visible')",
     "THEN $1 ELSE $2 END FROM claimed RETURNING id"
    ].join(' ');
    const result=await db.query(sql,[REMINDER_WITH_ANSWERS,REMINDER_WITHOUT_ANSWERS]);
    return {sent:result.rowCount??result.rows.length};
   }catch(error){
    logger.warn('Resuelve optional reminder worker unavailable:',error?.code||error?.message||'error');
    return {skipped:'temporarily_unavailable'};
   }finally{running=null;}
  })();
  return running;
 }

 function start(){
  if(closed||timer)return;
  void poll();
  timer=timers.setInterval(()=>{void poll();},POLL_INTERVAL_MS);
  timer.unref?.();
 }
 function stop(){closed=true;if(timer){timers.clearInterval(timer);timer=null;}}
 return {ensureSchema,listPending,reminderPreference,saveReminder,poll,start,stop};
}
const resuelvePendingService=createPendingService();
module.exports={createPendingService,resuelvePendingService,POLL_INTERVAL_MS};
