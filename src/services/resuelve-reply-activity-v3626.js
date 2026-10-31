'use strict';
// V3.6.26 — actividad real de respuestas, privada y de solo lectura.
const defaultDb=require('../db');
const {ensureSchema}=require('./resuelve-v350');

function createResuelveReplyActivity({db=defaultDb,ensureResuelve=ensureSchema}={}){
 async function listForOwner(userId){
  await ensureResuelve();
  const sql=[
   "SELECT q.id,q.title,count(a.id)::int AS answer_count,max(a.created_at) AS last_answer_at",
   "FROM resuelve_questions q",
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   "JOIN resuelve_answers a ON a.question_id=q.id AND a.status='visible'",
   "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE q.author_id=$1 AND q.status IN ('open','resolved')",
   "GROUP BY q.id,q.title",
   "ORDER BY last_answer_at DESC,q.id DESC LIMIT 6"
  ].join(' ');
  const r=await db.query(sql,[userId]);
  return r.rows;
 }
 return {listForOwner};
}
const resuelveReplyActivity=createResuelveReplyActivity();
module.exports={createResuelveReplyActivity,resuelveReplyActivity};
