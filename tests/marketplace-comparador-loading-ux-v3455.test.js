'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('la búsqueda tiene estado de envío y barra accesible',()=>{
 const route=read('src/routes/marketplace-comparador-v32132.js');
 const script=read('public/comparador-v32135.js');
 const css=read('public/comparador-v32135.css');
 assert.match(route,/data-compare-submit-progress role="status" aria-live="polite" hidden/);
 assert.match(route,/Buscando precios y tiendas…/);
 assert.match(route,/compare-progress-track/);
 assert.match(script,/form\.compare-search/);
 assert.match(script,/checkValidity/);
 assert.match(script,/pageshow/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/compare-submit-progress\[hidden\]/);
});
test('el estado de espera funciona sin recarga manual y sin porcentajes inventados',()=>{
 const route=read('src/routes/marketplace-comparador-v32132.js');
 const script=read('public/comparador-v32135.js');
 assert.doesNotMatch(route,/Actualizar resultados manualmente/);
 assert.match(route,/Esta página se actualiza automáticamente/);
 assert.match(script,/const maxAttempts=18/);
 assert.match(script,/setInterval\(refresh,5000\)/);
 assert.match(script,/querySelector\('\.compare-progress-track'\)\?\.remove/);
});
test('sin foto no aparece un candado: hay icono neutro y texto claro',()=>{
 const image=read('public/assets/comparador-producto-v3432.svg');
 const route=read('src/routes/marketplace-comparador-v32132.js');
 assert.match(image,/<svg /);
 assert.match(image,/aria-label="Producto sin fotografía"/);
 assert.match(image,/circle cx="47"/);
 assert.doesNotMatch(image,/M45 47V36/);
 assert.match(route,/Sin fotografía/);
});
