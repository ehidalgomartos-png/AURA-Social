'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html'),js=read('public/social.js');
const css=read('public/social.css'),posts=read('src/routes/posts.js');

test('Inicio abre Nuevo y nunca arranca silenciosamente en Para ti',()=>{
  assert.match(js,/let currentMode = 'latest';/);
  assert.match(js,/loadStories\(\), loadFeed\('latest'\), loadConversations\(\)/);
  assert.match(html,/<button data-mode="latest" class="active">Nuevo<\/button>/);
  assert.doesNotMatch(html,/<button data-mode="foryou" class="active">Para ti<\/button>/);
  assert.match(js,/all\('\[data-mode\]'\)\.forEach\(b => b\.onclick/);
  assert.match(js,/loadFeed\(b\.dataset\.mode\)/);
});

test('el feed Nuevo muestra siempre posts más nuevos primero y desempata por ID',()=>{
  const i=posts.indexOf("router.get('/feed', optionalAuth");
  const j=posts.indexOf("router.get('/new-activity'",i);
  assert.ok(i>0&&j>i);
  const route=posts.slice(i,j);
  assert.match(route,/mode = \['latest','following','foryou','vip','close'\]/);
  assert.match(route,/ORDER BY \$\{mode === 'foryou'/);
  assert.match(route,/date_trunc\('hour',p\.created_at\) DESC/);
  assert.match(route,/p\.created_at DESC,p\.id DESC/);
  assert.match(route,/\? "date_trunc/);
  assert.match(route,/postAudienceWhere\('\$1','p'\)/);
  assert.match(route,/blocked_id FROM blocks/);
  assert.match(route,/muted_id FROM mutes/);
  // Ranking por popularidad solo dentro de la hora, no por delante de novedades de otros días.
  assert.ok(route.indexOf("date_trunc('hour',p.created_at) DESC") < route.indexOf("(SELECT count(*) FROM likes l2 WHERE l2.post_id=p.id) DESC"));
});

test('en móvil las personas se leen completas, dos tarjetas apiladas por desplazamiento',()=>{
  const idx=css.lastIndexOf('/* V3.2.149.1');
  assert.ok(idx>0);
  const patch=css.slice(idx);
  assert.match(patch,/@media\(max-width:760px\)/);
  assert.match(patch,/grid-auto-columns:100%/);
  assert.match(patch,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(patch,/overflow:hidden/);
  assert.match(patch,/text-overflow:ellipsis/);
  assert.match(patch,/grid-template-columns:40px minmax\(0,1fr\) auto/);
  assert.match(patch,/scroll-snap-type:x mandatory/);
  assert.match(html,/id="activePeople" class="active-people-strip"/);
  assert.match(html,/data-explore-target="people">Ver todas/);
});

test('cambio acotado, mantiene perfiles reales y ocultación privacidad',()=>{
  assert.match(js,/\/api\/profiles\/suggestions\?limit=5&mode=new/);
  assert.match(js,/\/api\/profiles\/suggestions\?limit=12&mode=for_you/);
  const profiles=read('src/routes/profiles.js');
  const start=profiles.indexOf("router.get('/suggestions', requireAuth");
  const end=profiles.indexOf('async function ensureFavoritesCircle(',start);
  const sql=profiles.slice(start,end);
  for(const token of ["u.status='active'","u.is_admin=false","u.discoverable=true","FROM discovery_hidden_items hidden","blocked.blocker_id","FROM mutes muted"]) assert.ok(sql.includes(token),token);
  assert.doesNotMatch(js.slice(js.indexOf('async function loadActivePeople()'),js.indexOf('async function loadHomeMomentum()')),/INSERT INTO|simulated|fake_user/);
});
