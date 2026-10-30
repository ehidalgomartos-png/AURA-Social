'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.15: preguntas frecuentes nativas tienen controles grandes y foco visible',()=>{
 const html=read('public/resuelve-como-funciona-v3533.html');
 const css=read('public/resuelve-como-funciona-v3533.css');
 const block=css.slice(css.lastIndexOf('/* V3.6.15'));
 assert.ok(block.startsWith('/* V3.6.15'));
 assert.equal((html.match(/<details><summary>/g)||[]).length,5);
 assert.equal((html.match(/<\/details>/g)||[]).length,5);
 assert.match(html,/id="faqTitulo"/);
 assert.match(block,/\.resuelve-about-faq summary\{/);
 assert.match(block,/min-height:44px/);
 assert.match(block,/min-height:48px/);
 assert.match(block,/:focus-visible/);
 assert.match(block,/@media\(max-width:720px\)/);
 assert.doesNotMatch(block,/display:none|outline:none|pointer-events:none/);
 assert.match(html,/¿Se publica mi problema en Google\?/);
 assert.match(html,/el permiso se puede retirar/);
});

test('V3.6.15: fichas y temas no desbordan en móvil ni reducen áreas táctiles',()=>{
 const css=read('public/resuelve-v350.css');
 const tail=css.slice(css.lastIndexOf('/* V3.6.15'));
 assert.ok(tail.startsWith('/* V3.6.15'));
 assert.match(tail,/\.resuelve-seo-solution h1/);
 assert.match(tail,/\.resuelve-topic-item h2/);
 assert.match(tail,/overflow-wrap:anywhere/);
 assert.match(tail,/\.resuelve-seo-breadcrumbs/);
 assert.match(tail,/flex-wrap:wrap/);
 assert.match(tail,/\.resuelve-topic-item h2 a/);
 assert.match(tail,/\.resuelve-question-topic summary/);
 assert.match(tail,/min-height:44px/);
 assert.match(tail,/:focus-visible/);
 assert.match(tail,/@media\(max-width:650px\)/);
 assert.doesNotMatch(tail,/display:none|overflow:hidden|white-space:nowrap|position:fixed/);
});

test('V3.6.15: permanece protección noindex y solo soluciones aprobadas',()=>{
 const home=read('public/resuelve.html');
 const source=read('src/routes/resuelve-public-seo-v3529.js');
 const service=read('src/services/resuelve-v350.js');
 const server=read('server.js');
 assert.match(home,/meta name="robots" content="noindex,follow"/);
 assert.match(source,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
 assert.match(source,/if\(!item\)return res\.status\(404\)/);
 assert.match(source,/res\.set\('X-Robots-Tag','index,follow'\)/);
 assert.match(service,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(service,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 assert.match(server,/noindex,nofollow,noarchive/);
});
