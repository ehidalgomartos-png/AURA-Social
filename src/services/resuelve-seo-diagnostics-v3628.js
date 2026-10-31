'use strict';
// V3.6.28 — diagnóstico SEO agregado para administradores. No consulta Google.
const defaultDb=require('../db');
const resuelve=require('./resuelve-v350');
const topicsService=require('./resuelve-topics-v3531');
const PUBLIC_TOPIC_MINIMUM=3;
const SOLUTIONS_SITEMAP_LIMIT=2000;
const EDITORIAL_URLS=Object.freeze([
 {path:'/resuelve/como-funciona',label:'Cómo funciona Resuelve'},
 {path:'/resuelve/guia-pedir-ayuda',label:'Cómo pedir ayuda'},
 {path:'/resuelve/guia-ayudar-personas',label:'Cómo ayudar a otras personas'}
]);
function count(value){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0)throw Error('resuelve_seo_count_invalid');
 return n;
}
function createResuelveSeoDiagnostics({
 db=defaultDb,ensureResuelve=resuelve.ensureSchema,
 topics=topicsService.TOPICS,eligibility=topicsService.eligibility
}={}){
 async function summary(){
  await ensureResuelve();
  // Mismo criterio de elegibilidad que las fichas y el sitemap de soluciones:
  // autorización explícita, revisión humana, respuesta visible y contenido suficiente.
  const eligibleSql=[
   'SELECT q.topic,count(*)::int AS eligible_count',
   eligibility,
   'GROUP BY q.topic'
  ].join(' ');
  // Estados diagnósticos de las solicitudes CON permiso. No exponer textos ni usuarios.
  const stagesSql=[
   'SELECT',
   "count(*) FILTER(WHERE q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE)::int AS consented_resolved,",
   "count(*) FILTER(WHERE q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
   "AND a.id IS NOT NULL AND a.status='visible' AND respondent.id IS NOT NULL",
   "AND (q.library_approved_answer_id IS NULL OR q.library_approved_answer_id<>q.accepted_answer_id))::int AS awaiting_editorial,",
   "count(*) FILTER(WHERE q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
   "AND a.id IS NOT NULL AND a.status='visible' AND respondent.id IS NOT NULL",
   "AND q.library_approved_answer_id=q.accepted_answer_id",
   "AND (char_length(trim(q.body))<50 OR",
   "char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))<80))::int AS short_content,",
   "count(*) FILTER(WHERE q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
   "AND (a.id IS NULL OR a.status<>'visible' OR respondent.id IS NULL))::int AS unavailable_answer",
   'FROM resuelve_questions q',
   "JOIN users author ON author.id=q.author_id AND author.status='active'",
   'LEFT JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id',
   "LEFT JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
   "WHERE q.status='resolved'"
  ].join(' ');
  const [eligibleResult,stagesResult]=await Promise.all([
   db.query(eligibleSql),db.query(stagesSql)
  ]);
  const byTopic=Object.fromEntries(Object.keys(topics).map(key=>[key,0]));
  let eligibleSolutions=0,withoutTopic=0;
  for(const row of eligibleResult.rows){
   const n=count(row.eligible_count);
   if(eligibleSolutions+n>Number.MAX_SAFE_INTEGER)throw Error('resuelve_seo_count_invalid');
   eligibleSolutions+=n;
   if(row.topic!==null&&Object.prototype.hasOwnProperty.call(byTopic,row.topic)){
    byTopic[row.topic]=n;
   }else withoutTopic+=n;
  }
  const stage=stagesResult.rows[0];
  if(!stage)throw Error('resuelve_seo_counts_unavailable');
  const consentedResolved=count(stage.consented_resolved);
  const awaitingEditorial=count(stage.awaiting_editorial);
  const shortContent=count(stage.short_content);
  const unavailableAnswer=count(stage.unavailable_answer);
  // Contadores independientes y comprobables: los bloqueos nunca son "indexación".
  if(eligibleSolutions+awaitingEditorial+shortContent+unavailableAnswer>consentedResolved)
   throw Error('resuelve_seo_counts_inconsistent');
  const topicRows=Object.entries(topics).map(([slug,info])=>{
   const eligible=byTopic[slug],ready=eligible>=PUBLIC_TOPIC_MINIMUM;
   return {slug,label:info.title,eligible,ready,
    missing:Math.max(0,PUBLIC_TOPIC_MINIMUM-eligible)};
  });
  return {
   metrics:{
    eligibleSolutions,consentedResolved,awaitingEditorial,shortContent,
    unavailableAnswer,withoutTopic,
    readyTopics:topicRows.filter(item=>item.ready).length,
    sitemapLimitReached:eligibleSolutions>SOLUTIONS_SITEMAP_LIMIT
   },
   topics:topicRows,
   editorialPages:EDITORIAL_URLS.map(page=>({...page})),
   requirements:{
    topicMinimum:PUBLIC_TOPIC_MINIMUM,
    solutionsSitemapLimit:SOLUTIONS_SITEMAP_LIMIT,
    googleIndexingVerified:false
   }
  };
 }
 return {summary};
}
const resuelveSeoDiagnostics=createResuelveSeoDiagnostics();
module.exports={createResuelveSeoDiagnostics,resuelveSeoDiagnostics,PUBLIC_TOPIC_MINIMUM,SOLUTIONS_SITEMAP_LIMIT,EDITORIAL_URLS,count};
