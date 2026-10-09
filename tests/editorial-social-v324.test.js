'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const social=require('../src/routes/editorial-social-v324');
const {esc}=require('../src/routes/editorial-publication-v323');

test('comentarios y denuncias validan datos estrictamente',()=>{
  const ok=social.commentSchema.safeParse({body:'Una opinión personal contextualizada.'});
  assert.equal(ok.success,true);
  for(const body of ['','A','a'.repeat(601),23])assert.equal(social.commentSchema.safeParse({body}).success,false);
  assert.equal(social.commentSchema.safeParse({body:'Correcto',script:'inject'}).success,false);
  for(const reason of ['spam','abuse','misinformation','other'])assert.equal(social.reportSchema.safeParse({reason}).success,true);
  for(const reason of ['publish','hack',null])assert.equal(social.reportSchema.safeParse({reason}).success,false);
});
test('nombres, titulares y textos públicos no se insertan como HTML sin escapar',()=>{
  const html=esc('<img src=x onerror=alert(1)>');
  assert.equal(html,'&lt;img src=x onerror=alert(1)&gt;');
  const js=source('public/editorial-social-v324.js');
  assert.match(js,/message\.textContent=String\(entry\.body/);
  assert.match(js,/person\.textContent=String\(entry\.display_name/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
  const home=source('public/editorial-home-v324.js');
  assert.match(home,/heading\.textContent=String\(item\.title/);
  assert.doesNotMatch(home,/innerHTML\s*=/);
});
test('likes idempotentes por cuenta y artículo, acciones solo de usuarios reales',()=>{
  const s=source('src/routes/editorial-social-v324.js');
  assert.match(s,/PRIMARY KEY\(publication_id,user_id\)/);
  assert.match(s,/router\.use\(requireAuth\)/);
  assert.match(s,/ON CONFLICT DO NOTHING/);
  assert.match(s,/router\.put\('\/:id\/like'/);
  assert.match(s,/router\.delete\('\/:id\/like'/);
  assert.match(s,/SELECT p\.id,p\.title,p\.profile_id/);
  assert.match(s,/p\.unpublished_at IS NULL AND ep\.status='ready'/);
  assert.doesNotMatch(s,/INSERT INTO users\b|INSERT INTO posts\b|INSERT INTO community_posts\b/);
});
test('comentarios limitados, eliminables por autor y reportables',()=>{
  const s=source('src/routes/editorial-social-v324.js');
  assert.match(s,/length\(btrim\(body\)\) >= 2/);
  assert.match(s,/pg_advisory_xact_lock\(324,hashtext/);
  assert.match(s,/day_count>=20/);
  assert.match(s,/30\*1000/);
  assert.match(s,/AND user_id=\$3 AND status='published'/);
  assert.match(s,/c\.user_id<>\$3/);
  assert.match(s,/editorial_comment_reports/);
  assert.match(s,/editorial_comments SET status='removed'/);
});
test('moderación separada: solo admin, retirada y auditoría',()=>{
  const s=source('src/routes/editorial-social-v324.js');
  assert.match(s,/admin\.use\(requireAdmin\)/);
  assert.match(s,/admin\.get\('\/comment-reports'/);
  assert.match(s,/admin\.post\('\/comment-reports\/:id\/resolve'/);
  assert.match(s,/INSERT INTO editorial_audit/);
  const html=source('public/admin.html');
  assert.match(html,/id="editorialSocialModeration"/);
  assert.match(source('public/admin.js'),/loadEditorialSocialModeration/);
});
test('compartición a comunidad solo por miembro real, pública, sin sanciones',()=>{
  const s=source('src/routes/communities.js');
  assert.match(s,/router\.post\('\/:id\/share-editorial'/);
  assert.match(s,/state\.privacy!=='public'/);
  assert.match(s,/blockedBetween\(req\.user\.id,state\.owner_id\)/);
  assert.match(s,/!state\.is_member/);
  assert.match(s,/activeCommunityRestriction\(state\.id,req\.user\.id\)/);
  assert.match(s,/ep\.status='ready'/);
  assert.match(s,/p\.unpublished_at IS NULL/);
  assert.match(s,/String\(pub\.rows\[0\]\.community_id\)!==String\(state\.id\)/);
  assert.match(s,/PRIMARY KEY\(publication_id,community_id,user_id\)/);
  assert.match(s,/INSERT INTO community_posts\(community_id,user_id,body,content_level\)/);
  assert.doesNotMatch(s.slice(s.indexOf('// V3.2.4: only'),s.indexOf("router.delete('/:id/posts/:postId'")),/INSERT INTO users\b|INSERT INTO posts\b/);
});
test('al retirar un artículo se ocultan sus comparticiones en comunidades',()=>{
  const s=source('src/routes/editorial-publication-v323.js');
  assert.match(s,/UPDATE community_posts SET moderation_status='removed'/);
  assert.match(s,/WHERE publication_id=\$1/);
  assert.match(s,/editorial_community_shares/);
  assert.match(source('src/routes/admin-editorial-review-v322.js'),/editorial_unpublish_before_reopen/);
});
test('noticias siguen diferenciadas de perfiles humanos y accesibles desde Inicio',()=>{
  const s=source('src/routes/editorial-publication-v323.js');
  assert.match(s,/data-article-id/);
  assert.match(s,/editorial-social-v324\.js/);
  assert.match(s,/Contenido editorial automatizado/);
  assert.match(source('public/app.html'),/id="editorialHomeBlock"/);
  assert.match(source('public/app.html'),/editorial-home-v324\.js/);
  assert.match(source('src/routes/editorial-social-v324.js'),/router\.get\('\/discover'/);
  assert.match(source('src/routes/editorial-social-v324.js'),/LIMIT 3/);
  assert.match(source('server.js'),/const APP_VERSION='3\.2\.7\.1'/);
});
