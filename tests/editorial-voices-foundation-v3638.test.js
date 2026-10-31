'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('src/routes/editorial-publication-v323.js');
const css=read('public/editorial-voices-v3638.css');
const plan=read('docs/ROADMAP-VOCES-INDEPENDIENTES-V3638.md');
const {renderIndependentVoicesLanding}=require('../src/services/independent-voices-v3638');
const {page}=require('../src/routes/editorial-publication-v323');

test('V3.6.38: propuesta pública informativa no finge una plataforma ya operativa',()=>{
 const html=renderIndependentVoicesLanding();
 assert.match(html,/<h1 id="voicesTitleV3638">Voces Independientes<\/h1>/);
 assert.match(html,/PROYECTO EN PREPARACIÓN/);
 assert.match(html,/Ya puedes redactar borradores y enviarlos a revisión humana/);
 assert.match(html,/Ahora mismo no se reciben ni se pagan propinas/);
 assert.match(html,/artículos originales/);
 assert.match(html,/Fuentes y revisión/);
 assert.match(html,/noticia y qué es opinión/);
 assert.match(html,/No mostraremos a personas o artículos como verificados sin revisión/);
 assert.doesNotMatch(html,/form\b|<input\b|<button\b|data-pay|checkout|coins|balance|payout/ig);
});
test('V3.6.38: enlaces reales, accesibles y ninguna ruta de escritura monetaria',()=>{
 const html=renderIndependentVoicesLanding();
 assert.match(html,/href="\/noticias">Leer noticias actuales/);
 assert.match(html,/href="#como-funcionara"/);
 assert.match(html,/id="como-funcionara"/);
 assert.match(html,/href="\/resuelve"/);
 assert.match(source,/publicRouter\.get\('\/redactores'/);
 assert.doesNotMatch(source,/publicRouter\.(?:post|put|patch|delete)\('\/redactores'/);
 assert.ok(source.indexOf("publicRouter.get('/redactores'")<source.indexOf('publicRouter.use(async(_req,res,next)=>{try{await ensurePublicationSchema()'));
});
test('V3.6.38: SEO noindex y contenido separado de las noticias ya publicadas',()=>{
 const html=page({
  title:'Voces Independientes — proyecto en preparación',
  description:'Espacio en preparación para redactores independientes de RedLibertad.',
  pathname:'/noticias/redactores',body:renderIndependentVoicesLanding(),
  noindex:true,independentVoices:true
 });
 assert.match(html,/meta name="robots" content="noindex,follow"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/noticias\/redactores"/);
 assert.match(html,/property="og:type" content="website"/);
 assert.match(html,/editorial-voices-v3638\.css\?v=3\.6\.38/);
 assert.match(html,/id="ed-main"/);
 assert.match(html,/href="\/noticias"/);
 assert.match(source,/noindex:true,independentVoices:true/);
 assert.match(source,/href="\/noticias\/redactores">Conoce el proyecto/);
 assert.match(source,/Todavía no recibe publicaciones ni propinas/);
 assert.doesNotMatch(source,/INSERT INTO independent_articles|UPDATE independent_articles|DELETE FROM independent_articles/);
});
test('V3.6.38: portada de Noticias conserva categoría y artículos existentes',()=>{
 assert.match(source,/publicRouter\.get\('\/'/);
 assert.match(source,/discoveryV3248\.categoryTabs\(category\)/);
 assert.match(source,/items\.rows\.map\(card\)/);
 assert.match(source,/publicRouter\.get\('\/p\/:id'/);
 assert.match(source,/publicRouter\.get\('\/perfil\/:slug'/);
 assert.match(source,/publicRouter\.get\('\/sitemap\.xml'/);
 assert.match(source,/pub\.unpublished_at IS NULL/);
 assert.match(source,/ep\.status='ready'/);
});
test('V3.6.38: responsive accesible sin votos ni fondos falsos',()=>{
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/safe-area-inset-bottom|ed-mobile-nav/); // se usa navegación móvil existente
 assert.doesNotMatch(css,/display:none|position:fixed|pointer-events:none|outline:none/);
});
test('V3.6.38: roadmap distingue artículos, reconocimientos y futuros pagos TEST',()=>{
 assert.match(plan,/V3\.6\.39/);
 assert.match(plan,/V3\.6\.40/);
 assert.match(plan,/V3\.6\.41/);
 assert.match(plan,/V3\.6\.42/);
 assert.match(plan,/V3\.7\.0/);
 assert.match(plan,/Stripe TEST/);
 assert.match(plan,/sin dinero real|sin pagos reales/i);
 assert.match(plan,/propinas|transferencias/i);
 assert.match(plan,/revisión humana/i);
 assert.match(plan,/No convertir los apoyos en dinero/);
 assert.match(plan,/sin autopuntuación/);
 assert.match(plan,/una sola cuenta|Una sola cuenta/i);
});
