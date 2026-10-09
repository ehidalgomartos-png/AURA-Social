'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const {page,esc}=require('../src/routes/editorial-publication-v323');

test('cabecera y navegación reutilizan identidad RedLibertad y se adaptan a móvil',()=>{
  const html=page({title:'Noticias y actualidad',description:'Noticias verificadas y revisadas',pathname:'/noticias',body:'<article>Contenido visible</article>'});
  assert.match(html,/<html lang="es">/);
  assert.match(html,/name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html,/src="\/assets\/logo-mark.svg"/);
  assert.match(html,/class="ed-brand"/);
  assert.match(html,/class="ed-side"/);
  assert.match(html,/class="ed-mobile-nav"/);
  assert.match(html,/aria-current="page"/);
  assert.match(html,/class="ed-skip" href="#ed-main"/);
  assert.match(html,/rel="canonical"/);
  assert.ok(html.includes('<article>Contenido visible</article>'));
});
test('cabecera y metadatos escapan textos suministrados por usuarios',()=>{
  const html=page({title:'<svg/onload=alert(1)>',description:'" onclick="bad',pathname:'/noticias',body:'<p>correcto</p>'});
  assert.ok(html.includes(esc('<svg/onload=alert(1)>')));
  assert.ok(!html.includes('<svg/onload'));
  assert.ok(!html.includes('onclick="bad'));
  assert.match(html,/Contenido editorial identificado y revisado/);
});
test('noticia se presenta como perfil editorial identificado, no como usuario simulado',()=>{
  const route=read('src/routes/editorial-publication-v323.js');
  assert.match(route,/class="ed-post-head"/);
  assert.match(route,/class="ed-profile-avatar"/);
  assert.match(route,/class="ed-post-badge"/);
  assert.match(route,/Perfil editorial/);
  assert.match(route,/Revisado por el equipo/);
  assert.match(route,/Publicado en RedLibertad|Fecha de publicación en RedLibertad/);
  assert.match(route,/Fuente: /);
  assert.match(route,/Leer información original/);
  assert.match(route,/Consulta el medio para conocer la fecha y el contexto originales/);
  assert.doesNotMatch(route,/INSERT INTO users\b|INSERT INTO posts\b|INSERT INTO community_posts\b/);
});
test('interacciones equilibradas y accesibles con controles existentes, sin alterar endpoints',()=>{
  const route=read('src/routes/editorial-publication-v323.js');
  const client=read('public/editorial-social-v324.js');
  for(const id of ['edLike','edLikeCount','edLikeLabel','edJumpComments','edCommentCount','edShare',
                   'edFeedback','edDiscussion','edCommentForm','edCommentText','edLoginCta','edComments']){
    assert.ok(route.includes('id="'+id+'"'),id);
  }
  assert.match(route,/aria-pressed="false"/);
  assert.match(route,/aria-live="polite"/);
  assert.match(route,/data-article-id/);
  assert.match(route,/editorial-social-v324\.js/);
  assert.match(client,/edLikeLabel/);
  assert.match(client,/edJumpComments/);
  assert.match(client,/edLoginCta/);
  assert.match(client,/edCommentForm'\)\.hidden=!loggedIn/);
  assert.match(client,/\/api\/editorial-social\/.+\/like/);
  assert.match(client,/\/api\/editorial-social\/.+\/comments/);
  assert.doesNotMatch(client,/innerHTML\s*=/);
});
test('comentarios de usuarios reales usan contenido seguro y avatar de inicial, sin HTML remoto',()=>{
  const js=read('public/editorial-social-v324.js');
  assert.match(js,/message\.textContent=String\(entry\.body/);
  assert.match(js,/person\.textContent=displayName/);
  assert.match(js,/avatar\.textContent=displayName/);
  assert.match(js,/ed-comment-avatar/);
  assert.match(js,/removeComment\(entry\.id\)/);
  assert.match(js,/reportComment\(entry\.id\)/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
});
test('colores del tema social y comportamiento adaptativo de tarjeta y barra de acciones',()=>{
  const css=read('public/editorial-v323.css');
  const social=read('public/social.css');
  for(const token of ['--navy:#0d2238','--paper:#fffdf9','--teal:#2bb7a9','--coral:#ef7a5d']){
    assert.ok(css.includes(token),'Editorial token: '+token);
    assert.ok(social.includes(token),'Social token: '+token);
  }
  assert.match(css,/\.ed-post-head/);
  assert.match(css,/\.ed-social-actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:740px\)/);
  assert.match(css,/@media\(max-width:380px\)/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('sin nuevas dependencias ni cambios en publicación manual o control editorial',()=>{
  const route=read('src/routes/editorial-publication-v323.js');
  assert.match(route,/admin\.post\('\/publish\/:candidateId'/);
  assert.match(route,/editorial_quality_clearance_required/);
  assert.match(route,/editorial_already_published/);
  assert.match(route,/admin\.post\('\/unpublish\/:candidateId'/);
  assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.12'/);
  assert.match(read('package.json'),/"version": "3\.2\.12"/);
});
