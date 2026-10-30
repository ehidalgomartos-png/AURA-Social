'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {escapeHtml,countsWithinBudget,renderPublicTopicLinks,createResuelveAboutHandler}
 =require('../src/services/resuelve-public-directory-v3619');
const template=fs.readFileSync(path.join(__dirname,'..','public','resuelve-como-funciona-v3533.html'),'utf8');

test('V3.6.20: tiempo limitado no bloquea la presentación si PostgreSQL tarda demasiado',async()=>{
 const started=Date.now();
 const slow=()=>new Promise(()=>{});
 const counts=await countsWithinBudget(slow,25);
 assert.deepEqual(counts,{});
 assert.ok(Date.now()-started<600,'la petición editorial no debe quedarse esperando la base de datos');
 assert.deepEqual(await countsWithinBudget(async()=>({hogar:4}),25),{hogar:4});
 assert.deepEqual(await countsWithinBudget(()=>Promise.reject(Error('db-down')),25).catch(()=>({})),{});
});

test('V3.6.20: el renderer escapa siempre texto, sin convertir etiquetas en HTML activo',()=>{
 assert.equal(escapeHtml('<script>"&\'</script>'),'&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
 const home=renderPublicTopicLinks({hogar:3,tecnologia:2});
 assert.match(home,/href="\/resuelve\/temas\/hogar"/);
 assert.doesNotMatch(home,/href="\/resuelve\/temas\/tecnologia"/);
 assert.doesNotMatch(home,/<script|onerror=|javascript:/i);
});

test('V3.6.20: retirada de consentimiento se refleja en la siguiente lectura, sin cachear números',async()=>{
 let calls=0,reads=0;
 const app=express();
 app.get('/resuelve/como-funciona',createResuelveAboutHandler({
  readTemplate:async()=>{reads++;return template;},
  getCounts:async()=>{calls++;return calls===1?{hogar:3}:{hogar:0};},
  countWaitMs:100
 }));
 const server=await new Promise(resolve=>{
  const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
 });
 try{
  const base='http://127.0.0.1:'+server.address().port+'/resuelve/como-funciona';
  const first=await fetch(base);
  assert.equal(first.status,200);
  assert.equal(first.headers.get('cache-control'),'no-store');
  const shown=await first.text();
  assert.match(shown,/href="\/resuelve\/temas\/hogar"/);
  const second=await fetch(base);
  assert.equal(second.status,200);
  assert.equal(second.headers.get('x-robots-tag'),'index,follow');
  const withdrawn=await second.text();
  assert.doesNotMatch(withdrawn,/href="\/resuelve\/temas\/hogar"/);
  assert.equal(reads,2);
  assert.equal(calls,2);
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});

test('V3.6.20: si una consulta no responde se sirve contenido editorial sin enlaces inventados',async()=>{
 const app=express();
 app.get('/resuelve/como-funciona',createResuelveAboutHandler({
  readTemplate:async()=>template,
  getCounts:()=>new Promise(()=>{}),
  countWaitMs:20
 }));
 const server=await new Promise(resolve=>{
  const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
 });
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/resuelve/como-funciona');
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  const html=await response.text();
  assert.match(html,/Pide ayuda, encuentra respuestas y comparte experiencias/);
  assert.doesNotMatch(html,/href="\/resuelve\/temas\//);
  assert.doesNotMatch(html,/RESUELVE_PUBLIC_TOPICS_V3619/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});

test('V3.6.20: sin operaciones de escritura ni pérdida de elegibilidad y seguridad',()=>{
 const service=fs.readFileSync(path.join(__dirname,'..','src','services','resuelve-public-directory-v3619.js'),'utf8');
 const eligibility=fs.readFileSync(path.join(__dirname,'..','src','services','resuelve-topics-v3531.js'),'utf8');
 assert.match(service,/countsWithinBudget\(getCounts,countWaitMs\)/);
 assert.match(service,/templatePromise/);
 assert.match(service,/countWaitMs=1800/);
 assert.match(service,/res\.set\('Cache-Control','no-store'\)/);
 assert.doesNotMatch(service,/INSERT|UPDATE|DELETE|TRUNCATE|localStorage|postMessage/);
 assert.match(eligibility,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(eligibility,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(eligibility,/respondent\.status='active'/);
});
