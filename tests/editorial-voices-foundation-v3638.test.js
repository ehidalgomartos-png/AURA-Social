'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('src/routes/editorial-publication-v323.js');
const css=read('public/editorial-voices-v3638.css');
const {renderIndependentVoicesLanding,renderIndependentVoicesEditor}=require('../src/services/independent-voices-v3638');
const {page}=require('../src/routes/editorial-publication-v323');

test('V3.6.38/V3.6.44: presentación honesta del flujo editorial ya disponible',()=>{
 const html=renderIndependentVoicesLanding();
 assert.match(html,/<h1 id="voicesTitleV3638">Voces Independientes<\/h1>/);
 assert.match(html,/ARTÍCULOS ORIGINALES · COMUNIDAD REDLIBERTAD/);
 assert.match(html,/Ya puedes redactar borradores y enviarlos a revisión humana/);
 assert.match(html,/Los artículos autorizados y aprobados pueden publicarse/);
 assert.match(html,/artículos originales/);
 assert.match(html,/Fuentes y revisión/);
 assert.match(html,/hechos y opiniones/);
 assert.match(html,/La revisión editorial no equivale a certificar la profesión/);
 assert.doesNotMatch(html,/PROYECTO EN PREPARACIÓN|Un futuro espacio|todavía no recibe publicaciones/);
 assert.doesNotMatch(html,/<form\b|<input\b|<button\b|data-pay|checkout|coins|balance|payout/i);
});
test('V3.6.44: navegación real entre Noticias, autores y escritura',()=>{
 const html=renderIndependentVoicesLanding();
 assert.match(html,/href="\/noticias\/redactores\/escribir">Escribir un artículo/);
 assert.match(html,/href="\/noticias\/redactores\/voces">Explorar artículos/);
 assert.match(html,/href="\/noticias">Leer noticias actuales/);
 assert.match(html,/href="#como-funcionara"/);
 assert.match(html,/id="como-funcionara"/);
 assert.match(html,/href="\/resuelve"/);
 assert.match(source,/publicRouter\.get\('\/redactores'/);
 assert.doesNotMatch(source,/publicRouter\.(?:post|put|patch|delete)\('\/redactores'/);
 assert.ok(source.indexOf("publicRouter.get('/redactores'")<
   source.indexOf('publicRouter.use(async(_req,res,next)=>{try{await ensurePublicationSchema()'));
});
test('V3.6.44: portada de artículos públicos indexable; editores privados siguen noindex',()=>{
 const html=page({
  title:'Voces Independientes — publica y descubre artículos originales',
  description:'Escribe artículos originales de personas independientes.',
  pathname:'/noticias/redactores',body:renderIndependentVoicesLanding(),
  noindex:false,independentVoices:true
 });
 assert.doesNotMatch(html,/meta name="robots" content="noindex,follow"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/noticias\/redactores"/);
 assert.match(html,/property="og:type" content="website"/);
 assert.match(html,/editorial-voices-v3638\.css\?v=3\.6\.38/);
 assert.match(html,/editorial-voices-active-v3644\.css\?v=3\.6\.44/);
 assert.match(html,/id="ed-main"/);
 assert.match(source,/noindex:false,independentVoices:true/);
 assert.match(source,/href="\/noticias\/redactores\/voces">Leer artículos/);
 assert.match(source,/href="\/noticias\/redactores\/escribir">Escribir/);
 assert.match(source,/noindex:true,independentVoices:true/); // private editor and admin
 assert.doesNotMatch(source,/INSERT INTO independent_articles|UPDATE independent_articles|DELETE FROM independent_articles/);
});
test('V3.6.38: noticias importadas y categorías existentes siguen intactas',()=>{
 assert.match(source,/publicRouter\.get\('\/'/);
 assert.match(source,/discoveryV3248\.categoryTabs\(category\)/);
 assert.match(source,/items\.rows\.map\(card\)/);
 assert.match(source,/publicRouter\.get\('\/p\/:id'/);
 assert.match(source,/publicRouter\.get\('\/perfil\/:slug'/);
 assert.match(source,/publicRouter\.get\('\/sitemap\.xml'/);
 assert.match(source,/pub\.unpublished_at IS NULL/);
 assert.match(source,/ep\.status='ready'/);
});
test('V3.6.38: diseño original accesible sin elementos superpuestos',()=>{
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/safe-area-inset-bottom|ed-mobile-nav/);
 assert.doesNotMatch(css,/display:none|position:fixed|pointer-events:none|outline:none/);
});
test('V3.6.44: la zona de escritura representa el estado real del producto',()=>{
 const html=renderIndependentVoicesEditor();
 assert.match(html,/Guarda tus ideas y vuelve a editarlas/);
 assert.match(html,/publicar requiere una decisión editorial posterior y tu autorización expresa/);
 assert.match(html,/id="draftCertifyV3640"/);
 assert.match(html,/id="draftPublishConsentV3641"/);
 assert.match(html,/id="draftSaveV3639"/);
 assert.match(html,/id="draftSubmitV3640"/);
 assert.doesNotMatch(html,/futuras versiones|proyecto en preparación/i);
});
