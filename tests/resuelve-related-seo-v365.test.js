'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {approvedTopicLinks,renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');

test('V3.6.5: links are absent unless a real approved topic has at least 3 visible solutions',()=>{
 const item={id:'11',title:'Prueba',topic:'hogar',category:'consejo',solution:'Texto revisado'};
 assert.equal(approvedTopicLinks(item,{}),'');
 assert.equal(approvedTopicLinks(item,{topicIndexable:false,related:[{id:'12',title:'A'}]}),'');
 assert.equal(approvedTopicLinks({...item,topic:'falso'},{topicIndexable:true,related:[]}), '');
 const page=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(page,/if\(Array.isArray\(collection\)&&collection.length>=3\)/);
 assert.match(page,/extra\.related=collection\.filter\(row=>String\(row.id\)!==String\(item.id\)\)\.slice\(0,3\)/);
 assert.match(page,/catch\(_\)\{\/\* Los enlaces son opcionales y no bloquean la solución/);
});

test('V3.6.5: internal link titles are escaped and never include unapproved items',()=>{
 const topic={id:'11',topic:'hogar'};
 const html=approvedTopicLinks(topic,{topicIndexable:true,related:[
  {id:'11',title:'No se debe enlazar a sí misma'},
  {id:'12',title:'<script>alert(1)</script>'},
  {id:'13',title:'Guía de orientación'},
  {id:'../14',title:'Identificador incorrecto'},
  {id:'15',title:'Un paso práctico'}
 ]});
 assert.match(html,/href="\/resuelve\/temas\/hogar"/);
 assert.match(html,/href="\/resuelve\/solucion\/12"/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/href="\/resuelve\/solucion\/13"/);
 assert.match(html,/href="\/resuelve\/solucion\/15"/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|\/solucion\/11|\/solucion\/\.\./);
 const noLinks=renderApprovedSolution({id:'11',title:'Consejo',category:'ayuda',solution:'Solución revisada',topic:null});
 assert.doesNotMatch(noLinks,/resuelve-related-links|resuelve\/temas\//);
});

test('V3.6.5: published topic and approved solution share identical privacy conditions',()=>{
 const service=read('src/services/resuelve-v350.js');
 const topics=read('src/services/resuelve-topics-v3531.js');
 const page=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(service,/SELECT q.id,q.title,q.category,q.topic,q.solved_at/);
 assert.match(service,/q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE/);
 assert.match(service,/q.library_approved_answer_id=q.accepted_answer_id/);
 assert.match(topics,/q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE/);
 assert.match(topics,/a.status='visible'/);
 assert.match(topics,/author.status='active'/);
 assert.match(topics,/respondent.status='active'/);
 assert.match(page,/const item=await service.publicSeoSolution\(id\)/);
 assert.match(page,/if\(!item\)return res.status\(404\)/);
 assert.match(page,/const collection=await topics.publishedTopic\(item.topic\)/);
 assert.doesNotMatch(page,/aggregateRating|ratingValue|reviewCount/);
 assert.doesNotThrow(()=>new Function(page));
 const css=read('public/resuelve-v350.css');
 assert.match(css,/\.resuelve-related-links/);
 assert.match(css,/@media\(max-width:650px\)/);
});