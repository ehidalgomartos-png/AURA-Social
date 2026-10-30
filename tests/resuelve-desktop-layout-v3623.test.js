'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const css=read('public/resuelve-v350.css');
const html=read('public/resuelve.html');
const js=read('public/resuelve-v350.js');
const marker='/* V3.6.23 — Resuelve Desktop:';
const start=css.indexOf(marker);
const update=start>=0?css.slice(start):'';
const desktop=update.split('/* Tablet:')[0];

test('V3.6.23: la portada de escritorio utiliza sus dos columnas sin espacio vacío',()=>{
 assert.ok(start>=0,'existe bloque de estilos específico para escritorio');
 assert.match(desktop,/@media\s*\(min-width:960px\)/);
 assert.match(desktop,/\.hero\s*\{[\s\S]*?display:grid;/);
 assert.match(desktop,/grid-template-columns:minmax\(0,1\.12fr\) minmax\(350px,\.88fr\)/);
 assert.match(desktop,/\.hero>h1\s*\{[\s\S]*?grid-column:1;grid-row:2;/);
 assert.match(desktop,/\.hero-actions\s*\{[\s\S]*?grid-column:2;grid-row:1\/4;/);
 assert.match(desktop,/\.hero-actions \.hero-main-action\{grid-column:1\/-1/);
 assert.match(desktop,/\.hero-actions\.is-authenticated \.hero-explore\{grid-column:1\/-1\}/);
 assert.match(html,/<section class="hero" aria-labelledby="hero-title">/);
 for(const id of ['hero-title','heroActions','askButton','joinResuelveButton','loginResuelveButton','viewQuestionsLink']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(js,/classList\.toggle\('is-authenticated',!guest\)/);
});

test('V3.6.23: filtros y búsqueda del escritorio tienen filas y tamaños independientes',()=>{
 assert.match(desktop,/#questions \.section-top\s*\{[\s\S]*?display:grid;/);
 assert.match(desktop,/#questions \.filters\s*\{[\s\S]*?flex-wrap:wrap;/);
 assert.match(desktop,/#questionSearchForm\.resuelve-search\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto;/);
 assert.match(desktop,/#questionSearchForm \.resuelve-search-actions\{grid-column:2;flex-wrap:nowrap;/);
 assert.match(desktop,/#questionSearchForm \.resuelve-search-advanced\{grid-column:1\/-1\}/);
 for(const name of ['open','unanswered','resolved']){
  assert.ok(html.includes('data-filter="'+name+'"'),name);
 }
});

test('V3.6.23: móvil conserva sus estilos y controles táctiles originales',()=>{
 const previous=css.slice(0,start);
 assert.match(previous,/@media\(max-width:650px\)\{[\s\S]*?\.hero\{[\s\S]*?padding:17px 17px 16px/);
 assert.match(previous,/@media\(max-width:650px\)\{[\s\S]*?overflow-x:auto/);
 assert.doesNotMatch(update,/max-width:650px/);
 assert.match(update,/@media\s*\(min-width:651px\) and \(max-width:959px\)/);
 assert.doesNotMatch(update,/display:none|visibility:hidden|position:fixed/);
});
