'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const {isOriginalEditorial,draftSchema,decisionSchema}=require('../src/routes/admin-editorial-review-v322');

test('solo un título y resumen originales suficientemente completos son aprobables',()=>{
  const row={source_title:'Titular original sobre la investigación',source_excerpt:'Según informa este medio, hay novedades sobre la investigación.'};
  assert.equal(isOriginalEditorial({...row,editorial_title:'Nueva investigación en la comunidad científica',editorial_summary:'Una revisión independiente explica el contexto científico, las limitaciones de los hallazgos y el alcance de la investigación.'}),true);
  assert.equal(isOriginalEditorial({...row,editorial_title:row.source_title,editorial_summary:'Una síntesis independiente con suficiente contexto sobre la investigación y sus limitaciones científicas y editoriales.'}),false);
  assert.equal(isOriginalEditorial({...row,editorial_title:'Nueva investigación en la comunidad científica',editorial_summary:row.source_excerpt}),false);
  assert.equal(isOriginalEditorial({...row,editorial_title:'Nueva investigación en la comunidad científica',editorial_summary:'Corto'}),false);
});
test('esquema de borrador limita texto, exige versión y rechaza propiedades inesperadas',()=>{
  const valid={revision:0,title:'Una perspectiva diferente sobre nuevos avances',summary:'En esta revisión se describen los avances, las fuentes consultadas y lo que todavía no está confirmado.',note:'Fuente comprobada'};
  assert.equal(draftSchema.safeParse(valid).success,true);
  for(const invalid of [
    {...valid,title:'Corto'}, {...valid,summary:'Breve'}, {...valid,title:'X'.repeat(221)},
    {...valid,summary:'x'.repeat(1101)}, {...valid,revision:-1},
    {...valid,autoPublish:true}
  ])assert.equal(draftSchema.safeParse(invalid).success,false);
});
test('decisión permitida solo approve/reject/reopen y booleanos estrictos',()=>{
  const good={revision:1,decision:'approve',note:'Datos contrastados',factsChecked:true,rightsChecked:true,sourceRead:true};
  assert.equal(decisionSchema.safeParse(good).success,true);
  for(const bad of [{...good,decision:'publish'},{...good,sourceRead:'true'},{...good,extraField:123},{...good,revision:-1}])
    assert.equal(decisionSchema.safeParse(bad).success,false);
});
test('decisiones humanas necesitan evidencia, motivo, bloqueo de fuente, revisión y transacción',()=>{
  const src=read('src/routes/admin-editorial-review-v322.js');
  for(const expected of [
    "router.use(requireAdmin)", "status!=='pending'", "row.source_status!=='approved'",
    "!d.factsChecked||!d.rightsChecked||!d.sourceRead", "d.note.length<8",
    "row.revision!==d.revision","FOR UPDATE OF c","await client.query('BEGIN')",
    "await client.query('COMMIT')","await client.query('ROLLBACK')",
    "INSERT INTO editorial_audit", "editorial_review_stale", "editorial_review_locked"
  ])assert.ok(src.includes(expected),expected);
});
test('datos originales preservados, aprobación no publica y reapertura limpia revisiones',()=>{
  const src=read('src/routes/admin-editorial-review-v322.js');
  assert.match(src,/editorial_title=\$2,editorial_summary=\$3/);
  assert.match(src,/status='pending',reviewed_at=NULL,reviewed_by=NULL/);
  assert.match(src,/reviewed_at=now\(\),reviewed_by=\$3/);
  assert.doesNotMatch(src,/INSERT INTO posts\b|INSERT INTO users\b|INSERT INTO community_posts\b/);
  assert.doesNotMatch(src,/router\.(?:post|patch)\('\/publish/);
  assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
});
test('panel móvil ofrece edición original, trazabilidad, tres verificaciones y filtros',()=>{
  const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
  for(const key of ['editorialReviewForm','editorialReviewFilter','editorialReviewEditor','sourceRead','factsChecked','rightsChecked','editorialCancelEditor'])assert.ok(html.includes(key),key);
  assert.ok(js.includes("'/api/admin/editorial/review?status='"));
  assert.ok(js.includes("submitEditorialReview('save')"));
  assert.ok(js.includes("action==='approve'"));
  assert.ok(js.includes("no se publicará")||js.includes("NO se publicará"));
  assert.ok(css.includes('#editorialReviewEditor'));
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.21'/);
  assert.match(read('package.json'),/"version": "3\.2\.21"/);
});

test('V3.2.10 botón Reabrir se muestra al estar aprobado y oculta con pendientes',()=>{
  const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
  assert.match(html,/<button type="button" class="soft" hidden data-editorial-decision="reopen">Reabrir para edición<\/button>/);
  assert.doesNotMatch(html,/class="soft hidden" data-editorial-decision="reopen"/);
  assert.match(js,/reopenBtn\.hidden=pending/);
  assert.match(js,/reopenBtn\.classList\.toggle\('hidden',pending\)/);
  assert.match(css,/#editorialReviewActions button\[hidden\]\{display:none!important\}/);
  assert.match(js,/if\(action==='reopen' && \$\('#editorialReviewFilter'\)\) \$\('#editorialReviewFilter'\)\.value='pending'/);
  assert.match(js,/loadEditorialPublicV323\(\),loadEditorialQualityV325\(\),loadEditorialPlanningV326\(\),loadEditorialDailyV327\(\)/);
});
