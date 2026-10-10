'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const {esc,safeId,page,confirmation,assertApprovedForPublication}=require('../src/routes/editorial-publication-v323');

function approvedRow(overrides={}){
 return {
  id:5,revision:3,status:'approved',reviewed_at:'2026-10-09',reviewed_by:1,
  editorial_title:'Un avance científico explicado con contexto',
  editorial_summary:'Nuestro equipo editorial ha revisado esta información y describe qué se conoce y qué detalles siguen pendientes de confirmación.',
  source_title:'Nuevo hallazgo anunciado en revista',source_excerpt:'Breve texto facilitado por la fuente',
  source_status:'approved',profile_status:'ready',category:'tecnologia',profile_category:'tecnologia',
  source_category:'tecnologia',source_profile_category:'tecnologia',source_profile_status:'ready',
  source_profile_id:9,profile_id:9,canonical_url:'https://example.org/articulo',quality_decision:'clear',quality_candidate_revision:3,...overrides
 };
}
function clientFor(row){
 return {query:async(sql,params)=>{
   assert.match(sql,/FOR UPDATE OF c/);
   assert.deepEqual(params,['5']);
   return {rowCount:row?1:0,rows:row?[row]:[]};
 }};
}
test('HTML de títulos, fuentes y resúmenes siempre se escapa',()=>{
 assert.equal(esc('<img src=x onerror="bad">&'), '&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;');
 const html=page({title:'<script>alert(1)</script>',description:'<svg>',pathname:'/noticias',body:'<p>safe text</p>'});
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('rel="canonical"')||html.includes('rel="stylesheet"'));
 assert.ok(html.includes('Contenido editorial identificado y revisado'));
 assert.ok(html.includes('/assets/logo-mark.svg'));
 assert.ok(html.includes('class="ed-mobile-nav"'));
 assert.ok(html.includes('href="/noticias"'));
});
test('IDs y confirmaciones explícitas',()=>{
 assert.equal(safeId('12'),'12');
 for(const v of ['-1','0','1 OR 1=1','2/3','',null])assert.equal(safeId(v),null);
 assert.equal(confirmation({revision:3,confirm:true}),true);
 assert.equal(confirmation({revision:3,confirm:'true'}),false);
 assert.equal(confirmation({revision:-1,confirm:true}),false);
});
test('publicación exige revisión humana, fuente y perfil preparados',async()=>{
 assert.equal((await assertApprovedForPublication(clientFor(approvedRow()),'5',3)).id,5);
 for(const [changes,code] of [
   [{status:'pending'},'editorial_review_required'],
   [{reviewed_by:null},'editorial_review_required'],
   [{source_status:'paused'},'editorial_source_or_profile_not_ready'],
   [{profile_status:'draft'},'editorial_source_or_profile_not_ready'],
   [{profile_category:'cultura'},'editorial_profile_mismatch'],
   [{source_category:'cultura'},'editorial_profile_mismatch'],
   [{source_profile_category:'cultura'},'editorial_profile_mismatch'],
   [{source_profile_status:'paused'},'editorial_profile_mismatch'],
   [{source_profile_id:10},'editorial_profile_mismatch'],
   [{editorial_title:'Nuevo hallazgo anunciado en revista'},'editorial_original_draft_required'],
   [{canonical_url:'http://example.org/noticia'},'editorial_source_link_invalid'],
   [{canonical_url:'https://local.test/noticia'},'editorial_source_link_invalid']
 ])await assert.rejects(assertApprovedForPublication(clientFor(approvedRow(changes)),'5',3),{code});
 await assert.rejects(assertApprovedForPublication(clientFor(approvedRow()),'5',2),{code:'editorial_review_stale'});
 await assert.rejects(assertApprovedForPublication(clientFor(null),'5',3),{code:'editorial_candidate_not_found'});
});
test('publicación aislada: jamás crea usuarios ni posts del feed habitual',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 const review=read('src/routes/admin-editorial-review-v322.js');
 assert.match(route,/admin\.use\(requireAdmin\)/);
 assert.match(route,/editorial_publications/);
 assert.match(route,/candidate_id BIGINT NOT NULL UNIQUE/);
 assert.match(route,/pg_advisory_xact_lock\(323,1\)/);
 assert.match(route,/editorial_daily_limit/);
 assert.match(route,/editorial_already_published/);
 assert.match(route,/AND ep\.status='ready'/);
 assert.match(route,/WHERE pub\.unpublished_at IS NULL/);
 assert.match(route,/unpublished_at=now\(\)/);
 assert.match(route,/INSERT INTO editorial_audit/);
 assert.match(review,/editorial_unpublish_before_reopen/);
 for(const source of [route,review]){
   assert.doesNotMatch(source,/INSERT INTO posts\b|INSERT INTO users\b|INSERT INTO community_posts\b|INSERT INTO stories\b/);
 }
});
test('fuentes, perfiles, enlaces públicos y sitemap presentes',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 assert.match(route,/publicRouter\.get\('\/'/);
 assert.match(route,/publicRouter\.get\('\/p\/:id'/);
 assert.match(route,/publicRouter\.get\('\/perfil\/:slug'/);
 assert.match(route,/publicRouter\.get\('\/sitemap.xml'/);
 assert.match(route,/source_name/);
 assert.match(route,/source_url/);
 assert.match(read('public/index.html'),/href="\/noticias"/);
 assert.match(read('public/app.html'),/editorial-discovery-entry/);
 assert.match(read('server.js'),/app\.use\('\/noticias', editorialPublishV323Public\)/);
 assert.match(read('server.js'),/const APP_VERSION='3\.2\.26'/);
});
test('Centro Editorial exige confirmación y permite retirar publicaciones',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 assert.match(html,/id="editorialPublication"/);
 assert.match(html,/id="editorialPublicItems"/);
 assert.match(js,/loadEditorialPublicV323/);
 assert.match(js,/window\.confirm\(question\)/);
 assert.match(js,/data-editorial-publish/);
 assert.match(js,/data-editorial-unpublish/);
 assert.match(js,/\/api\/admin\/editorial\/publication-queue/);
 assert.match(js,/editorialDailyLimit|editorial_daily_limit/);
 const pub=read('src/routes/editorial-publication-v323.js');
 assert.match(pub,/admin\.post\('\/publish\/:candidateId'/);
 assert.match(pub,/admin\.post\('\/unpublish\/:candidateId'/);
});
