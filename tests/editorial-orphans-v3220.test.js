'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('borrar fuente guarda nombre e ID anteriores, en transacción y sin tocar textos',()=>{
  const service=read('src/services/editorial-source-removal-v3219.js');
  const snapshot=service.indexOf('UPDATE editorial_candidates SET source_name_snapshot=');
  const deleting=service.indexOf('DELETE FROM editorial_sources WHERE id=$1 RETURNING id');
  assert.ok(snapshot>0&&deleting>snapshot);
  assert.ok(service.includes('removed_source_id=$1::bigint'));
  assert.ok(service.includes('[id,snapshot.name]'));
  assert.ok(service.includes("await client.query('BEGIN')"));
  assert.ok(service.includes("await client.query('COMMIT')"));
  assert.ok(service.includes("await client.query('ROLLBACK')"));
  assert.doesNotMatch(service,/UPDATE editorial_candidates SET (?:editorial_title|editorial_summary|status)=/);
  assert.doesNotMatch(service,/DELETE FROM editorial_(?:candidates|publications)/);
});
test('migración aditiva del esquema sin borrar candidatos históricos',()=>{
 const route=read('src/routes/admin-editorial-review-v322.js');
 const remove=read('src/routes/admin-editorial-v320.js');
 assert.ok(route.includes('ADD COLUMN IF NOT EXISTS source_name_snapshot VARCHAR(100)'));
 assert.ok(route.includes('ADD COLUMN IF NOT EXISTS removed_source_id BIGINT'));
 assert.ok(remove.includes('await ensurePublicationSchema()'));
 assert.ok(read('src/routes/admin-editorial-inbox-v321.js').includes(
   'source_id BIGINT REFERENCES editorial_sources(id) ON DELETE SET NULL'));
});
test('lista administrativa permite localizar huérfanos en base de datos, no solo entre últimos 100',()=>{
 const src=read('src/routes/admin-editorial-review-v322.js');
 assert.ok(src.includes("const orphaned=req.query.orphaned==='only'?'only':'all'"));
 assert.ok(src.includes("($3::text <> 'only' OR c.source_id IS NULL)"));
 assert.ok(src.includes("[status,focus,orphaned]"));
 assert.ok(src.includes("COALESCE(s.name,c.source_name_snapshot) AS source_name"));
 assert.ok(src.includes('c.removed_source_id'));
 assert.ok(src.includes('orphanedFilter:orphaned'));
 assert.ok(src.includes('router.use(requireAdmin)'));
 assert.ok(src.includes('LIMIT 100'));
});
test('fuentes borradas no pueden aprobarse ni publicarse sin RSS autorizada',()=>{
 const review=read('src/routes/admin-editorial-review-v322.js');
 const publication=read('src/routes/editorial-publication-v323.js');
 assert.ok(review.includes("if(row.source_status!=='approved'||!canonicalArticleUrl(row.canonical_url))"));
 assert.ok(publication.includes("if(row.source_status!=='approved'||row.profile_status!=='ready')"));
 assert.ok(publication.includes("if(!editorialAlignmentV32181(row).ok)"));
 assert.ok(publication.includes('COALESCE(es.name,c.source_name_snapshot) AS source_name'));
 assert.ok(publication.includes('c.removed_source_id'));
 assert.ok(publication.includes('c.source_id'));
 assert.ok(publication.includes("requireAdmin"));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
});
test('filtro de fuentes ausentes no permite descartar ediciones sin avisar',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
 assert.ok(html.includes('id="editorialOrphanFilterV3220"'));
 assert.ok(html.includes('<option value="only">Solo sin fuente</option>'));
 assert.ok(js.includes("'&orphaned='+encodeURIComponent(orphaned)"));
 assert.ok(js.includes('editorialReviewActiveOrphanV3220'));
 assert.ok(js.includes('editorialReviewHasChangesV3216()'));
 assert.ok(js.includes('editorialOrphanFilterV3220').toString());
 assert.ok(js.includes('resetEditorialQueueV3218({render:false})'));
 assert.ok(js.includes('loadEditorialInboxV321()'));
 assert.ok(css.includes('editorial-orphan-warning-v3220'));
 assert.ok(css.includes('@media(max-width:620px)'));
});
test('noticias históricas quedan identificadas sin inventar origen desconocido',()=>{
 const js=read('public/admin.js'),route=read('src/routes/admin-editorial-review-v322.js');
 assert.ok(js.includes('item.removed_source_id!=null'));
 assert.ok(js.includes('Fuente RSS eliminada'));
 assert.ok(js.includes('Sin fuente RSS vinculada'));
 assert.ok(js.includes('Medio histórico no identificado'));
 assert.ok(js.includes('Sin fuente RSS aprobada y activa no puede aprobarse ni publicarse'));
 assert.ok(route.includes('source_name_snapshot'));
 assert.ok(route.includes('source_id IS NULL'));
});
test('versión completa, assets correctos y flujo de publicación separado',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 assert.ok(html.includes('/admin.js?v=3.2.24.1'));
 assert.ok(html.includes('/admin.css?v=3.2.24.1'));
 assert.ok(read('server.js').includes("APP_VERSION='3.2.24.1'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.24.1');
 assert.ok(js.includes('data-editorial-publish'));
 assert.ok(js.includes('data-editorial-unpublish'));
 assert.doesNotMatch(read('src/services/editorial-source-removal-v3219.js'),/INSERT INTO posts|INSERT INTO users/);
});
