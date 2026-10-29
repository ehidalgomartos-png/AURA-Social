'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const rules=css.split('/* V3.4.4.23 — control de anchuras en tablets y móviles muy estrechos.')[1];
test('tablet 761–1024 px reserva espacio para título, foto y precio',()=>{
 assert.ok(rules);
 assert.match(rules,/@media\(min-width:761px\) and \(max-width:1024px\)/);
 assert.match(rules,/grid-template-columns:92px minmax\(0,1fr\) minmax\(150px,174px\)/);
 assert.match(rules,/width:92px;height:96px/);
 assert.match(rules,/min-width:0/);
});
test('móvil estrecho mantiene botones y filtros visibles en una columna',()=>{
 assert.match(rules,/@media\(max-width:340px\)/);
 assert.match(rules,/\.cmp-access-options\{\s*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(rules,/\.cmp-access-option\{\s*min-height:48px/);
 assert.match(rules,/a\.offer-link,/);
 assert.match(rules,/button\.offer-link\{/);
});
test('metadatos de la oferta y enlaces compartidos permiten envolver el texto',()=>{
 assert.match(rules,/\.cmp-offer-meta\{\s*flex-direction:column;align-items:flex-start/);
 assert.match(rules,/\.cmp-share-offer\{\s*max-width:100%;white-space:normal;overflow-wrap:anywhere/);
 assert.match(rules,/overflow-wrap:anywhere/);
});
test('preserva accesibilidad y preferencias de movimiento previas',()=>{
 assert.match(css,/\.cmp-advanced-filters>summary:focus-visible/);
 assert.match(css,/\.cmp-first-visible-link:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/min-height:46px/);
});
test('no introduce barras flotantes ni oculta ofertas o accesos comerciales',()=>{
 assert.doesNotMatch(rules,/position:fixed|position:sticky|display:\s*none|visibility:\s*hidden|pointer-events:\s*none/);
 assert.match(route,/data-primary-offers/);
 assert.match(route,/data-comparison-merchant-click/);
 assert.match(route,/money\(o\.price_cents\)/);
 assert.match(js,/comparison:results-updated/);
});
test('solo CSS, sin consultas nuevas ni cambios en los datos',()=>{
 assert.doesNotMatch(rules,/serpapi|fetch\(|price_cents|marketplace_compare_provider_usage|href=/i);
 assert.match(route,/data-offer-price-cents/);
 assert.match(route,/href="\x27\+esc\(href\)/);
});
