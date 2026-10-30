'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const topics=require('../src/services/resuelve-topics-v3531');
const {renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');
const {renderTopicPage}=require('../src/routes/resuelve-topics-v3531');

test('V3.6.5: related solution lookup reuses strict SEO consent and human approval criteria',()=>{
 const code=read('src/services/resuelve-topics-v3531.js');
 const snippet=code.slice(code.indexOf('async function relatedApprovedTopicSolutions('),code.indexOf('module.exports='));
 assert.match(snippet,/if\(!validTopic\(topic\)\|\|!resuelve\.validId\(excludeId\)\)/);
 assert.match(snippet,/eligibility,/);
 assert.match(snippet,/AND q\.topic=\$1/);
 assert.match(snippet,/count\(\*\) OVER\(\)::int AS topic_count/);
 assert.match(snippet,/ORDER BY q\.solved_at DESC,q\.id DESC LIMIT 5/);
 assert.doesNotMatch(snippet,/q\.body|a\.body|email|phone|password|INSERT|UPDATE|DELETE/);
 assert.match(topics.eligibility,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(topics.eligibility,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(topics.eligibility,/a\.status='visible'/);
 assert.match(topics.eligibility,/author\.status='active'/);
 assert.match(topics.eligibility,/respondent\.status='active'/);
});

test('V3.6.5: related links come only from actual consented rows, exclude current and invalid IDs',async()=>{
 const db=require('../src/db'),original=db.query,calls=[];
 db.query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('count(*) OVER()::int AS topic_count'))return {rows:[
   {id:'9',title:'Página actual',topic_count:5},
   {id:'11',title:'Consejo <script>alert(1)</script>',topic_count:5},
   {id:'12',title:'Consejo 2',topic_count:5},
   {id:'../bad',title:'Ruta inválida',topic_count:5},
   {id:'13',title:'Consejo 3',topic_count:5}
  ],rowCount:5};
  return {rows:[],rowCount:0};
 };
 try{
  const info=await topics.relatedApprovedTopicSolutions('hogar','9');
  assert.equal(info.topicCount,5);
  assert.deepEqual(info.related.map(row=>String(row.id)),['11','12','13']);
  assert.deepEqual(calls.find(row=>row.sql.includes('count(*) OVER()')).args,['hogar']);
  const count=calls.length;
  assert.deepEqual(await topics.relatedApprovedTopicSolutions('fake','9'),{topicCount:0,related:[]});
  assert.deepEqual(await topics.relatedApprovedTopicSolutions('hogar','../9'),{topicCount:0,related:[]});
  assert.equal(calls.length,count);
 }finally{db.query=original;}
});

test('V3.6.5: approved solution links back only to populated public topics',()=>{
 const item={id:'9',title:'Solución <script>alert(1)</script>',
  solution:'Consejo útil con <img src=x onerror=alert(1)> que no debe ejecutarse.',
  category:'ayuda',topic:'hogar'};
 const related=[{id:'11',title:'Prueba <svg onload=alert(1)>'},{id:'12',title:'Otra solución'}];
 const publicHtml=renderApprovedSolution(item,{topicCount:3,related});
 assert.match(publicHtml,/href="\/resuelve\/temas\/hogar"/);
 assert.match(publicHtml,/href="\/resuelve\/solucion\/11"/);
 assert.match(publicHtml,/aria-label="Ruta de navegación"/);
 assert.match(publicHtml,/aria-label="Más soluciones útiles"/);
 assert.match(publicHtml,/"@type":"BreadcrumbList"/);
 assert.match(publicHtml,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(publicHtml,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(publicHtml,/<script>alert\(1\)<\/script>|<svg onload=alert\(1\)>/);
 assert.doesNotMatch(publicHtml,/aggregateRating|ratingValue|reviewCount/);
 const thin=renderApprovedSolution(item,{topicCount:2,related:[]});
 assert.doesNotMatch(thin,/href="\/resuelve\/temas\/hogar"/);
 const unclassified=renderApprovedSolution({...item,topic:null},{topicCount:999,related:[]});
 assert.doesNotMatch(unclassified,/\/resuelve\/temas\/hogar/);
});

test('V3.6.5: topics link only to other topics with at least three verified public solutions',()=>{
 const question={id:'9',title:'Una solución <script>alert(1)</script>',solution:'Experiencia compartida'};
 const page=renderTopicPage('hogar',[question,{...question,id:'10'},{...question,id:'11'}],3,{
  hogar:3,tecnologia:4,tramites:1,estudios:0,'vida-cotidiana':3
 });
 assert.match(page,/href="\/resuelve\/temas\/tecnologia"/);
 assert.match(page,/href="\/resuelve\/temas\/vida-cotidiana"/);
 assert.doesNotMatch(page,/href="\/resuelve\/temas\/tramites"|href="\/resuelve\/temas\/estudios"/);
 assert.match(page,/aria-label="Ruta de navegación"/);
 assert.match(page,/aria-label="Otros temas con soluciones"/);
 assert.match(page,/name="robots" content="index,follow"/);
 const thin=renderTopicPage('hogar',[question],1,{hogar:1,tecnologia:1});
 assert.match(thin,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(thin,/aria-label="Otros temas con soluciones"/);
 const route=read('src/routes/resuelve-topics-v3531.js');
 assert.match(route,/renderTopicPage\(topic,items,counts\[topic\],counts\)/);
});

test('V3.6.5: approved solution query carries explicit topic; route never bypasses consent',()=>{
 const service=read('src/services/resuelve-v350.js');
 const block=service.slice(service.indexOf('async function publicSeoSolution('),service.indexOf('// V3.5.30'));
 assert.match(block,/SELECT q\.id,q\.title,q\.category,q\.topic,q\.solved_at/);
 assert.match(block,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(block,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 const route=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(route,/if\(!item\)return res\.status\(404\)/);
 assert.match(route,/topics\.relatedApprovedTopicSolutions\(item\.topic,id\)/);
 assert.match(route,/renderApprovedSolution\(item,navigation\)/);
 assert.match(route,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
 const css=read('public/resuelve-v350.css');
 assert.match(css,/\.resuelve-seo-breadcrumbs/);
 assert.match(css,/\.resuelve-seo-related/);
 assert.match(css,/@media\(max-width:650px\)/);
});