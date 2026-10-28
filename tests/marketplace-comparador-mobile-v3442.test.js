'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const section=css.split('/* V3.4.4.2 — pulido mobile-first')[1];
test('mobile-first: ofertas compactas, botones táctiles y ausencia de desbordes',()=>{
 assert.ok(section);
 for(const s of ['@media(max-width:760px)','@media(max-width:380px)',
  'overflow-x:clip','grid-template-columns:72px minmax(0,1fr)',
  'grid-column:1/-1','min-height:46px','overflow-wrap:anywhere',
  'font-variant-numeric:tabular-nums']){
  assert.ok(section.includes(s),s);
 }
});
test('los filtros combinados permanecen accesibles en móvil estrecho',()=>{
 assert.match(section,/\.cmp-facet-group\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(section,/@media\(max-width:380px\)\{/);
 assert.match(section,/\.cmp-facet-group\{grid-template-columns:1fr\}/);
 assert.match(section,/\.cmp-access-option\{\s*min-height:44px/);
});
test('no oculta ofertas ni altera enlaces o precios por CSS',()=>{
 assert.doesNotMatch(section,/display:\s*none|pointer-events:\s*none|visibility:\s*hidden/);
 assert.doesNotMatch(section,/https?:\/\/|url\(/);
 const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(js,/applyComparisonFilters/);
 assert.match(js,/X-Requested-With/);
});
