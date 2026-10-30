'use strict';
// V3.5.31 — temas elegidos explícitamente por el autor. Solo soluciones autorizadas y revisadas.
const db=require('../db');
const resuelve=require('./resuelve-v350');
const TOPICS=Object.freeze({
 hogar:{title:'Hogar',description:'Experiencias útiles para resolver dudas cotidianas del hogar, mantenimiento y organización.'},
 tecnologia:{title:'Tecnología',description:'Consejos compartidos para resolver dudas sobre dispositivos, aplicaciones y tecnología cotidiana.'},
 tramites:{title:'Trámites',description:'Orientación general y experiencias compartidas para entender gestiones y trámites.'},
 estudios:{title:'Estudios',description:'Ayuda entre personas para aprender, organizarse y resolver dudas sobre estudios.'},
 'vida-cotidiana':{title:'Vida cotidiana',description:'Soluciones prácticas y experiencias para pequeños problemas del día a día.'}
});
const validTopic=topic=>typeof topic==='string'&&Object.hasOwn(TOPICS,topic);
const eligibility=[
 "FROM resuelve_questions q",
 "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
 "JOIN users author ON author.id=q.author_id AND author.status='active'",
 "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
 "WHERE q.status='resolved' AND q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
 "AND q.library_approved_answer_id=q.accepted_answer_id",
 "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
 "AND char_length(trim(q.body))>=50"
].join(' ');
async function publishedTopic(topic){
 if(!validTopic(topic))return null;
 await resuelve.ensureSchema();
 const r=await db.query([
  "SELECT q.id,q.title,q.solved_at,trim(split_part(a.body,' Anuncio recomendado:',1)) AS solution",
  eligibility,
  "AND q.topic=$1",
  "ORDER BY q.solved_at DESC,q.id DESC LIMIT 16"
 ].join(' '),[topic]);
 return r.rows;
}
async function topicSummary(){
 await resuelve.ensureSchema();
 const r=await db.query([
  "SELECT q.topic,count(*)::int AS approved_count",
  eligibility,
  "AND q.topic IS NOT NULL GROUP BY q.topic"
 ].join(' '));
 const counts=Object.fromEntries(Object.keys(TOPICS).map(topic=>[topic,0]));
 for(const row of r.rows){
  const n=Number(row.approved_count);
  if(validTopic(row.topic)&&Number.isSafeInteger(n)&&n>=0)counts[row.topic]=n;
 }
 return counts;
}
module.exports={TOPICS,validTopic,publishedTopic,topicSummary,eligibility};
