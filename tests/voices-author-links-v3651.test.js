'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {article,authorPath}=require('../src/services/independent-public-pages-v3641');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const row=(username='ana.valencia')=>({id:41,kind:'opinion',title:'Una reflexión sobre nuestra ciudad',body:'Texto original y personal.',author_username:username,published_at:'2026-10-31T12:00:00Z',sources:[]});

test('V3.6.51: artículo público enlaza al historial público del autor y a otras voces',()=>{
 const html=article(row());
 assert.match(html,/Artículo de <a rel="author" href="\/noticias\/redactores\/autores\/ana\.valencia">@ana\.valencia<\/a>/);
 assert.match(html,/class="voices-author-links-v3651" aria-label="Seguir leyendo"/);
 assert.match(html,/href="\/noticias\/redactores\/autores\/ana\.valencia">Más artículos de @ana\.valencia<\/a>/);
 assert.match(html,/href="\/noticias\/redactores\/voces">Explorar otras voces<\/a>/);
 assert.match(html,/Revisión editorial previa/);
 assert.match(html,/Las opiniones son del autor|las opiniones son del autor/i);
 assert.doesNotMatch(html,/\bseguidores verificados\b|\bacreditado profesional\b/i);
});

test('V3.6.51: nombres válidos con acentos se codifican; otros no crean enlaces',()=>{
 const html=article(row('Álvaro'));
 assert.match(html,/rel="author" href="\/noticias\/redactores\/autores\/%C3%81lvaro"/);
 assert.equal(authorPath('Álvaro'),'/noticias/redactores/autores/%C3%81lvaro');
 const bad=article(row('<script>alert(1)</script>'));
 assert.doesNotMatch(bad,/rel="author"/);
 assert.doesNotMatch(bad,/Más artículos de/);
 assert.match(bad,/@&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(bad,/<script>alert\(1\)<\/script>/);
 assert.match(bad,/href="\/noticias\/redactores\/voces"/);
});

test('V3.6.51: artículo carga estilo móvil sin modificar acceso ni publicación',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 const css=read('public/editorial-voices-author-links-v3651.css');
 assert.match(route,/const article=await independentPublicationV3641\.getPublic\(id\)/);
 assert.match(route,/if\(!article\)return res\.status\(404\)/);
 assert.match(route,/editorial-voices-author-links-v3651\.css\?v=3\.6\.51/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.voices-author-links-v3651 a:focus-visible/);
 assert.match(css,/min-height:48px/);
 assert.doesNotMatch(css,/position:fixed|display:none!important/);
});
