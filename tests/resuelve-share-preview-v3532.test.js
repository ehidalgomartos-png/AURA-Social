'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.32: publicly shareable question preview never exposes response or private question text',()=>{
 const source=read('src/services/resuelve-v350.js');
 const fn=source.slice(source.indexOf('async function publicQuestionSharePreview('),source.indexOf('async function detail('));
 assert.match(fn,/SELECT q\.id,q\.title FROM resuelve_questions q/);
 assert.match(fn,/JOIN users author ON author\.id=q\.author_id AND author\.status='active'/);
 assert.match(fn,/q\.status<>'hidden'/);
 assert.match(fn,/if\(!validId\(id\)\)return null/);
 assert.doesNotMatch(fn,/q\.body|a\.body|email|phone|password|SELECT \*/);
 const {renderQuestionSharePreview}=require('../src/routes/resuelve-public-seo-v3529');
 const html=renderQuestionSharePreview({
  id:'78',title:'Ayuda con <script>alert(1)</script>',
  body:'No copiar el teléfono 600 000 000 ni respuestas'
 });
 assert.match(html,/meta name="robots" content="noindex,follow"/);
 assert.match(html,/property="og:title"/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|600 000 000/);
 assert.match(html,/\/resuelve\?id=78/);
 assert.throws(()=>renderQuestionSharePreview({id:'../78',title:'x'}),/id_invalido/);
 const route=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(route,/router\.get\('\/pregunta\/:id'/);
 assert.match(route,/res\.set\('X-Robots-Tag','noindex,follow'\)/);
 assert.match(route,/if\(!question\)return res\.status\(404\)/);
 assert.match(route,/res\.set\('Cache-Control','no-store'\)/);
});

test('V3.5.32: sharing is explicit, with Facebook and standard channels',()=>{
 const js=read('public/resuelve-v350.js');
 assert.match(js,/questionUrl=new URL\('\/resuelve\/pregunta\/'\+encodeURIComponent\(q\.id\)/);
 assert.match(js,/https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
 assert.match(js,/https:\/\/api\.whatsapp\.com\/send\?text=/);
 assert.match(js,/https:\/\/t\.me\/share\/url\?/);
 assert.match(js,/mailto:\?/);
 assert.match(js,/navigator\.share\(/);
 assert.match(js,/navigator\.clipboard\.writeText\(questionUrl\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});

test('V3.5.32: share solutions only with active publication permission and editorial approval',()=>{
 const js=read('public/resuelve-v350.js');
 const block=js.slice(js.indexOf('function solutionShareControl('),js.indexOf('async function loadSolutions('));
 assert.match(block,/function solutionShareControl\(q\)/);
 assert.match(block,/url=new URL\('\/resuelve\/solucion\/'\+encodeURIComponent\(q\.id\)/);
 assert.match(block,/if\(q\.seo_public_opt_in===true\)/);
 assert.match(block,/article\.append\(publicLink,solutionShareControl\(q\)\)/);
 assert.match(block,/https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
 assert.match(block,/https:\/\/api\.whatsapp\.com\/send\?text=/);
 assert.match(block,/mailto:\?/);
 assert.match(block,/navigator\.clipboard\.writeText\(url\)/);
 assert.doesNotMatch(block,/\/api\/posts|\.submit\(|auto.?publish/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/q\.seo_public_opt_in,split_part\(a\.body/);
 assert.match(service,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 const css=read('public/resuelve-v350.css');
 assert.match(css,/\.solution-share-links/);
 assert.match(css,/@media\(max-width:650px\)/);
});