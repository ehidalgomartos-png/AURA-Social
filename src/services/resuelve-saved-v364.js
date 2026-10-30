'use strict';
// V3.6.4 — lista privada y voluntaria de soluciones previamente aprobadas.
const defaultDb=require('../db');
const {ensureSchema:ensureResuelve}=require('./resuelve-v350');
const validId=x=>/^[1-9]\d{0,15}$/.test(String(x??''));
function createSavedSolutionsService({db=defaultDb,ensureBase=ensureResuelve}={}){
 let initialized=null;
 async function ensureSchema(){
  if(!initialized)initialized=(async()=>{
   await ensureBase();
   await db.query([
    "CREATE TABLE IF NOT EXISTS resuelve_saved_solutions_v364 (",
    "user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
    "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "PRIMARY KEY(user_id,question_id))"
   ].join(' '));
   await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_saved_solutions_v364 ON resuelve_saved_solutions_v364(user_id,created_at DESC)");
  })().catch(error=>{initialized=null;throw error;});
  return initialized;
 }
 // El contenido deja de estar disponible si el autor retira su consentimiento de biblioteca
 // o administración revoca su aprobación. No depende del consentimiento SEO.
 const eligible=[
  "JOIN resuelve_questions q ON q.id=s.question_id AND q.status='resolved'",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.library_opt_out=FALSE AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
  "AND char_length(trim(q.body))>=50"
 ].join(' ');
 async function list(userId){
  await ensureSchema();
  const query=[
   "SELECT q.id,q.title,q.category,q.solved_at,",
   "left(trim(split_part(a.body,' Anuncio recomendado:',1)),240) AS solution",
   "FROM resuelve_saved_solutions_v364 s",
   eligible,"AND s.user_id=$1 ORDER BY s.created_at DESC LIMIT 50"
  ].join(' ');
  const r=await db.query(query,[userId]);
  return r.rows;
 }
 async function save(userId,questionId,enabled){
  if(!validId(questionId)||typeof enabled!=='boolean')return null;
  await ensureSchema();
  if(!enabled){
   await db.query("DELETE FROM resuelve_saved_solutions_v364 WHERE user_id=$1 AND question_id=$2",[userId,questionId]);
   return {enabled:false};
  }
  const query=[
   "INSERT INTO resuelve_saved_solutions_v364(user_id,question_id)",
   "SELECT $1,q.id FROM resuelve_questions q",
   "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE q.id=$2 AND q.status='resolved'",
   "AND q.library_opt_out=FALSE AND q.library_approved_answer_id=q.accepted_answer_id",
   "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
   "AND char_length(trim(q.body))>=50",
   "AND (SELECT count(*) FROM resuelve_saved_solutions_v364 WHERE user_id=$1)<50",
   "ON CONFLICT(user_id,question_id) DO NOTHING RETURNING question_id"
  ].join(' ');
  const r=await db.query(query,[userId,questionId]);
  return r.rows[0]?{enabled:true}:null;
 }
 return {ensureSchema,list,save};
}
const resuelveSavedSolutions=createSavedSolutionsService();
module.exports={createSavedSolutionsService,resuelveSavedSolutions};
