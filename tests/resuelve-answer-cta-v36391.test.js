'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/resuelve-v350.js');
const css=read('public/resuelve-help-cta-v36391.css');
const html=read('public/resuelve.html');
const fn=js.slice(js.indexOf('function renderDetail(data){'),js.indexOf('function restoreBrowse(replaceUrl=true){'));

test('V3.6.39.1: solo se ofrece responder a preguntas abiertas de otras personas no contestadas',()=>{
 assert.match(fn,/const solved=q\.status==='resolved'/);
 assert.match(fn,/const mine=state\.user&&String\(state\.user\.id\)===String\(q\.author_id\)/);
 assert.match(fn,/const alreadyAnswered=!!state\.user&&Array\.isArray\(data\.answers\)/);
 assert.match(fn,/data\.answers\.some\(a=>String\(a\.author_id\)===String\(state\.user\.id\)\)/);
 assert.match(fn,/if\(!solved&&!mine&&!alreadyAnswered\)/);
 assert.match(fn,/No hace falta recomendar productos/);
 assert.doesNotMatch(fn,/window\.location\.href\s*=|location\.assign\(/);
});
test('V3.6.39.1: respuesta directa respeta sesión, formulario y foco accesible',()=>{
 assert.match(fn,/state\.user\?'Escribir mi respuesta':'Entrar para ayudar'/);
 assert.match(fn,/if\(!state\.user\)\{openAuth\('login'\);return;\}/);
 assert.match(fn,/if\(answerForm\.hidden\)return/);
 assert.match(fn,/answerForm\.scrollIntoView\(\{block:'start',behavior:'auto'\}\)/);
 assert.match(fn,/el\('answerBody'\)\.focus\(\{preventScroll:true\}\)/);
 assert.match(fn,/action\.setAttribute\('aria-controls',state\.user\?'answerForm':'resuelveAuthPanel'\)/);
 assert.match(js,/form\.hidden=!\(state\.user&&!mine&&!solved\)/);
 assert.match(html,/id="answerForm"/);
 assert.match(html,/id="resuelveAuthPanel"/);
 assert.match(html,/resuelve-help-cta-v36391\.css\?v=3\.6\.39\.1/);
});
test('V3.6.39.1: diseño táctil adaptable, sin cambios comerciales ni backend',()=>{
 assert.match(css,/#questionDetail \.resuelve-detail-help-cta-v36391/);
 assert.match(css,/#questionDetail \.resuelve-detail-help-button-v36391:focus-visible/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/position:fixed|outline:none|display:none|pointer-events:none/);
 assert.match(html,/Pide ayuda\. Comparte lo que sabes\./);
 assert.match(js,/\bquestionShareControl\(/);
 assert.doesNotThrow(()=>new Function(js));
});
