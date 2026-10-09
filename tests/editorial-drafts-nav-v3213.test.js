'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {editorialDraftV3213}=require('../public/editorial-draft-v3213');

test('propuesta automática orientativa: titular diferente, resumen amplio, nota y edición humana',()=>{
 const source={source_name:'El País',source_title:'La estafa del falso empleado de banca',category:'tecnologia',source_excerpt:'Recibir un SMS que alerta sobre un movimiento sospechoso...'};
 const original=JSON.stringify(source);
 const d=editorialDraftV3213(source);
 assert.ok(d.title.length>=12&&d.title.length<=220);
 assert.ok(d.summary.length>=70&&d.summary.length<=1100);
 assert.match(d.title,/Qué explica El País sobre/);
 assert.notEqual(d.title.toLowerCase(),source.source_title.toLowerCase());
 assert.ok(!d.summary.includes(source.source_excerpt));
 assert.match(d.summary,/no representa una comprobación de los hechos/);
 assert.match(d.note,/metadatos RSS, no revisada/);
 assert.deepEqual(source,JSON.parse(original));
 assert.equal(d.provisional,true);
});
test('propuesta gestionada con longitudes y campos incompletos',()=>{
 const max=editorialDraftV3213({
   source_name:'A'.repeat(130),source_title:'Tema sobre tecnología'.repeat(18),category:'tecnologia'
 });
 assert.ok(max.title.length<=220&&max.title.length>=12);
 assert.ok(max.summary.length<=1100&&max.summary.length>=70);
 assert.equal(editorialDraftV3213({source_title:'breve'}).title,'');
});
test('el editor prepara sugerencia al abrir una noticia pendiente y no sobrescribe una edición humana',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 assert.match(html,/id="editorialSuggestDraft"/);
 assert.match(html,/editorial-draft-v3213\.js\?v=3\.2\.13\.1/);
 assert.match(html,/id="editorialSuggestionStatus"/);
 assert.match(js,/function fillEditorialDraftV3213\(item,force=false\)/);
 assert.match(js,/if\(item\.status==='pending'\)fillEditorialDraftV3213\(item,false\)/);
 assert.match(js,/force\|\|!title\.value\.trim\(\)/);
 assert.match(js,/force\|\|!summary\.value\.trim\(\)/);
 assert.match(js,/window\.confirm\('¿Sustituir/);
 assert.ok(js.includes("$('#editorialSuggestDraft')"));
 assert.match(js,/no se ha guardado todavía/);
 assert.match(html,/no resume ni verifica el artículo completo/);
 assert.doesNotMatch(js,/autoPublish\s*:\s*true|auto_publish_enabled\s*=\s*true/);
});
test('Mesa editorial lleva el ID de cada noticia, activa su filtro y abre el editor concreto',()=>{
 const js=read('public/admin.js'),review=read('src/routes/admin-editorial-review-v322.js');
 assert.match(js,/data-editorial-daily-id=/);
 assert.match(js,/loadEditorialInboxV321\(candidateId\)/);
 assert.match(js,/editorialReviewItems\.find\(row=>String\(row\.id\)===candidateId\)/);
 assert.match(js,/openEditorialReview\(item\)/);
 assert.match(js,/closeEditorialReview\(\)/);
 assert.match(review,/req\.query\.focus/);
 assert.match(review,/ORDER BY \(c\.id=\$2::bigint\) DESC/);
 assert.match(review,/\[status,focus\]/);
 assert.match(review,/router\.use\(requireAdmin\)/);
});
test('Mesa editorial lleva el ID exacto a controles de calidad y abre el detalle',()=>{
 const js=read('public/admin.js'),quality=read('src/routes/admin-editorial-quality-v325.js');
 assert.match(js,/loadEditorialQualityV325\(candidateId\)/);
 assert.match(js,/data-editorial-quality-id/);
 assert.match(js,/detail\.open=true/);
 assert.match(js,/detail\.scrollIntoView/);
 assert.match(quality,/req\.query\.focus/);
 assert.match(quality,/ORDER BY \(c\.id=\$1::bigint\) DESC/);
 assert.match(quality,/\[focus\]/);
 assert.match(quality,/router\.use\(requireAdmin\)/);
});
test('seguridad editorial: nadie aprueba ni publica de modo automático',()=>{
 const js=read('public/admin.js');
 const review=read('src/routes/admin-editorial-review-v322.js');
 const publishing=read('src/routes/editorial-publication-v323.js');
 assert.match(js,/window\.confirm\('¿Aprobar internamente/);
 assert.match(review,/!d\.factsChecked\|\|!d\.rightsChecked\|\|!d\.sourceRead/);
 assert.match(review,/row\.status!=='pending'/);
 assert.match(publishing,/editorial_quality_clearance_required/);
 assert.match(publishing,/admin\.post\('\/publish\/:candidateId'/);
 assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
});
test('cambios de versión',()=>{
 assert.match(read('server.js'),/const APP_VERSION='3\.2\.13\.1'/);
 assert.match(read('package.json'),/"version": "3\.2\.13\.1"/);
 assert.match(read('src/routes/admin-editorial-v320.js'),/version:'3\.2\.13\.1'/);
});
