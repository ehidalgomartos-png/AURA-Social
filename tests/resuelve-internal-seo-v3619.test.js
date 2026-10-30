'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {MARKER,renderPublicTopicLinks,renderAboutWithTopics,createResuelveAboutHandler}
 =require('../src/services/resuelve-public-directory-v3619');
const {renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');
const {renderTopicPage}=require('../src/routes/resuelve-topics-v3531');
const {TOPICS,eligibility}=require('../src/services/resuelve-topics-v3531');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.19: enlaces rastreables solo para temas con tres soluciones realmente aprobadas',()=>{
 const html=renderPublicTopicLinks({hogar:3,tecnologia:4,tramites:2,estudios:0,'vida-cotidiana':'10'});
 assert.match(html,/id="publicTopicsTitleV3619"/);
 assert.match(html,/href="\/resuelve\/temas\/hogar"/);
 assert.match(html,/href="\/resuelve\/temas\/tecnologia"/);
 assert.doesNotMatch(html,/href="\/resuelve\/temas\/tramites"/);
 assert.doesNotMatch(html,/href="\/resuelve\/temas\/estudios"/);
 assert.doesNotMatch(html,/href="\/resuelve\/temas\/vida-cotidiana"/);
 assert.match(html,/revisadas y autorizadas/);
 assert.equal(renderPublicTopicLinks({hogar:2,tecnologia:0}),'');
 assert.equal(renderPublicTopicLinks({hogar:-1,tecnologia:3.3}),'');
 assert.equal(renderPublicTopicLinks({hogar:NaN}), '');
 assert.deepEqual(Object.keys(TOPICS),['hogar','tecnologia','tramites','estudios','vida-cotidiana']);
 assert.match(eligibility,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(eligibility,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(eligibility,/respondent\.status='active'/);
 assert.match(eligibility,/a\.status='visible'/);
});

test('V3.6.19: la portada pública enlaza a la red principal y conserva autorización',()=>{
 const template=read('public/resuelve-como-funciona-v3533.html');
 assert.equal((template.match(new RegExp(MARKER,'g'))||[]).length,1);
 assert.match(template,/href="\/">RedLibertad, una red social para conectar, conversar y compartir/);
 assert.match(template,/No tienes que registrarte dos veces/);
 assert.match(template,/Para aparecer en buscadores requiere, además, tu autorización/);
 const expanded=renderAboutWithTopics(template,{hogar:3,tecnologia:4,tramites:2});
 assert.match(expanded,/href="\/resuelve\/temas\/hogar"/);
 assert.match(expanded,/href="\/resuelve\/temas\/tecnologia"/);
 assert.doesNotMatch(expanded,/href="\/resuelve\/temas\/tramites"/);
 assert.doesNotMatch(expanded,/RESUELVE_PUBLIC_TOPICS_V3619/);
 assert.equal((expanded.match(/<h1\b/g)||[]).length,1);
 const empty=renderAboutWithTopics(template,{});
 assert.doesNotMatch(empty,/\/resuelve\/temas\//);
 assert.match(empty,/href="\/resuelve\?registro=1"/);
 assert.throws(()=>renderAboutWithTopics('<h1>Sin marcador</h1>',{hogar:3}),/invalid_resuelve_public_template/);
});

test('V3.6.19: endpoints públicos conservan cabeceras, no fabrican temas en fallos',async()=>{
 const template=read('public/resuelve-como-funciona-v3533.html');
 const app=express();
 app.get('/resuelve/como-funciona',createResuelveAboutHandler({
  readTemplate:async()=>template,
  getCounts:async()=>({hogar:3,tecnologia:2})
 }));
 app.get('/fallo',createResuelveAboutHandler({
  readTemplate:async()=>template,
  getCounts:async()=>{throw Error('db unavailable')}
 }));
 app.get('/sin-plantilla',createResuelveAboutHandler({
  readTemplate:async()=>{throw Error('filesystem unavailable')},
  getCounts:async()=>({hogar:3})
 }));
 const server=await new Promise(resolve=>{
  const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
 });
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const success=await fetch(url+'/resuelve/como-funciona');
  assert.equal(success.status,200);
  assert.equal(success.headers.get('cache-control'),'no-store');
  assert.equal(success.headers.get('x-robots-tag'),'index,follow');
  assert.match(success.headers.get('content-type'),/text\/html/);
  const html=await success.text();
  assert.match(html,/href="\/resuelve\/temas\/hogar"/);
  assert.doesNotMatch(html,/href="\/resuelve\/temas\/tecnologia"/);
  const degraded=await fetch(url+'/fallo');
  assert.equal(degraded.status,200);
  const fallback=await degraded.text();
  assert.match(fallback,/id="aboutTitle"/);
  assert.doesNotMatch(fallback,/href="\/resuelve\/temas\//);
  assert.doesNotMatch(fallback,/RESUELVE_PUBLIC_TOPICS_V3619/);
  const error=await fetch(url+'/sin-plantilla');
  assert.equal(error.status,503);
  assert.doesNotMatch(await error.text(),/filesystem unavailable|stack|Error:/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});

test('V3.6.19: páginas públicas conectan con inicio y Resuelve sin exponer preguntas privadas',()=>{
 const approved=renderApprovedSolution({id:'12',title:'Organizar las fotos familiares',
  solution:'Realiza una copia de seguridad antes de reorganizar las carpetas. '.repeat(3),
  category:'consejo',topic:'hogar'
 },{topicCount:3});
 const thin=renderTopicPage('tecnologia',[{id:'13',title:'Consejo',
  solution:'Apoya a otras personas con recomendaciones reales.'}],1,{tecnologia:1});
 for(const page of [approved,thin]){
  assert.match(page,/href="\/">Conocer RedLibertad<\/a>/);
  assert.match(page,/href="\/resuelve\/como-funciona">Cómo funciona Resuelve<\/a>/);
  assert.doesNotMatch(page,/href="\/admin|href="\/resuelve\/admin/);
 }
 assert.match(approved,/name="robots" content="index,follow"/);
 assert.match(thin,/name="robots" content="noindex,follow"/);
 const server=read('server.js');
 assert.match(server,/app\.get\('\/resuelve\/como-funciona',createResuelveAboutHandler\(\)\)/);
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 assert.match(server,/app\.get\('\/resuelve',\(_req,res\)=>\{/);
 assert.match(server,/res\.setHeader\('X-Robots-Tag','noindex,follow'\)/);
 const css=read('public/resuelve-como-funciona-v3533.css');
 assert.match(css,/\/\* V3\.6\.19/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/:focus-visible/);
});
