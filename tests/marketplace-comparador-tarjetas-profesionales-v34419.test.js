'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const section=css.split('/* V3.4.4.19 — tarjetas profesionales')[1];
test('tarjetas profesionales aisladas en comparador, sin alterar otras secciones',()=>{
 assert.ok(section);
 assert.match(section,/body\.cmp-premium \.cmp-rich-comparison \.comparison-list \.offer/);
 assert.match(section,/:focus-within/);
 assert.match(section,/border-color:#dce6f0/);
});
test('título, tienda y precio diferenciados y legibles',()=>{
 assert.match(section,/\.offer-main>strong/);
 assert.match(section,/overflow-wrap:anywhere/);
 assert.match(section,/\.cmp-offer-shop/);
 assert.match(section,/font-variant-numeric:tabular-nums/);
 assert.match(section,/\.cmp-price-source/);
});
test('búsqueda de Google es una alternativa visual, no una compra simulada',()=>{
 assert.match(section,/a\.offer-link\.offer-search-backup/);
 assert.match(section,/background:#fff;border:1px solid #abc8e2;color:#175481/);
 assert.match(section,/a\.offer-link:not\(\.offer-search-backup\)/);
 const card=route.slice(route.indexOf('function offerMarkup('),route.indexOf('function nonComparableMarkup('));
 assert.match(card,/link\.destination==='shopping-search'\?' offer-search-backup':''/);
 assert.match(card,/merchant\?'Ver oferta en tienda':'Buscar en Google'/);
 assert.match(card,/destinationInfo\.ariaLabel/);
});
test('acciones accesibles, blancos táctiles y aviso de destino intacto',()=>{
 assert.match(section,/:focus-visible/);
 assert.match(section,/min-height:46px/);
 assert.match(section,/min-height:48px/);
 assert.match(section,/\.offer-destination/);
 assert.match(route,/const destinationInfo=describeDestination\(o,link,merchant\)/);
});
test('mobile-first en pantallas medianas y estrechas',()=>{
 assert.match(section,/@media\(max-width:760px\)/);
 assert.match(section,/@media\(max-width:380px\)/);
 assert.match(section,/text-align:left/);
 assert.match(section,/white-space:normal/);
});
test('reduce movimiento cuando se solicita, sin esconder ofertas',()=>{
 assert.match(section,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(section,/transition:none/);
 assert.doesNotMatch(section,/display:\s*none|visibility:\s*hidden|pointer-events:\s*none/);
});
test('no cambia precio, cuotas, enlaces, filtro ni tracking',()=>{
 assert.doesNotMatch(section,/serpapi|provider_usage|fetch\(|price_cents|href=/i);
 const mark=route.slice(route.indexOf('function offerMarkup('),route.indexOf('function nonComparableMarkup('));
 assert.match(mark,/money\(o\.price_cents\)/);
 assert.match(mark,/data-offer-price-cents/);
 assert.match(mark,/data-comparison-merchant-click/);
 assert.match(mark,/esc\(href\)/);
});
