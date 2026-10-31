'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {allServices,renderMap}=require('../src/services/services-map-v3645');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('V3.6.56: mapa lleva a preguntas sin respuesta en un solo toque',()=>{
 const url='/resuelve?sin_respuestas=1#questions';
 const help=allServices().find(s=>s.id==='ayudar');
 assert.ok(help);
 assert.equal(help.href,url);
 assert.match(help.description,/sin respuestas visibles/);
 const html=renderMap();
 assert.equal((html.match(/href="\/resuelve\?sin_respuestas=1#questions"/g)||[]).length,2);
 assert.match(html,/class="sm-intent" href="\/resuelve\?sin_respuestas=1#questions"[^>]*>/);
 assert.match(html,/href="\/resuelve\?sin_respuestas=1#questions" data-service-id="ayudar"/);
 assert.doesNotMatch(html,/href="\/resuelve#questions"/);
 assert.doesNotMatch(url,/^\/\//);
 assert.equal(new URL(url,'https://redlibertad.com').origin,'https://redlibertad.com');
});

test('V3.6.56: Resuelve interpreta el enlace y pide solo preguntas públicas sin respuesta',()=>{
 const js=read('public/resuelve-v350.js');
 const html=read('public/resuelve.html');
 const api=read('src/routes/resuelve-v350.js');
 const service=read('src/services/resuelve-v350.js');
 assert.match(js,/get\('sin_respuestas'\)==='1'/);
 assert.match(js,/state\.filter='unanswered'/);
 assert.match(js,/state\.filter==='unanswered'\)params\.set\('sin_respuestas','si'\)/);
 assert.match(js,/params\.set\('estado',state\.filter==='unanswered'\?'open':state\.filter\)/);
 assert.match(html,/<button data-filter="unanswered"/);
 assert.match(api,/unansweredOnly:unanswered==='si'/);
 assert.match(service,/a_unanswered\.status='visible'/);
 assert.match(service,/u\.status='active'/);
});

test('V3.6.56: se preserva la elección y el resto del mapa, sin nuevas cuentas ni datos simulados',()=>{
 const services=allServices();
 assert.equal(services.length,17);
 assert.equal(services.find(s=>s.id==='resuelve').href,'/resuelve');
 assert.equal(services.find(s=>s.id==='soluciones').href,'/resuelve#solutions');
 const html=renderMap();
 assert.match(html,/href="\/resuelve">/);
 assert.match(html,/id="sm-intents"/);
 assert.match(html,/id="sm-search" type="search"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/explorar"/);
 assert.doesNotMatch(html,/nuevos usuarios ayudando|respuesta artificial|activas ahora/i);
});
