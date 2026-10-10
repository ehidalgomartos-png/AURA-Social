'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const {qualitySchema,qualityReady,reviewSignals,ageDays}=require('../src/services/editorial-quality-v325');

test('aprobación de calidad exige verificaciones humanas, motivo y nota',()=>{
  const valid={
    revision:4,decision:'clear',reason:'accuracy',
    note:'Fuente original y contexto comprobados por el equipo.',
    sourceChecked:true,contextChecked:true,rightsChecked:true
  };
  assert.equal(qualitySchema.safeParse(valid).success,true);
  assert.equal(qualitySchema.safeParse({...valid,decision:'hold',sourceChecked:false,rightsChecked:false}).success,true);
  for(const x of [
    {...valid,decision:'publish'}, {...valid,reason:'score'},
    {...valid,note:'Breve'}, {...valid,sourceChecked:false},
    {...valid,contextChecked:false}, {...valid,rightsChecked:false},
    {...valid,revision:-1}, {...valid,autoPublish:true},
    {...valid,sourceChecked:'true'}
  ])assert.equal(qualitySchema.safeParse(x).success,false,JSON.stringify(x));
});
test('calidad válida solo en exactamente la versión editorial evaluada',()=>{
  assert.equal(qualityReady({quality_decision:'clear',quality_candidate_revision:4,revision:4}),true);
  assert.equal(qualityReady({quality_decision:'clear',quality_candidate_revision:3,revision:4}),false);
  assert.equal(qualityReady({quality_decision:'hold',quality_candidate_revision:4,revision:4}),false);
  assert.equal(qualityReady({quality_decision:null,quality_candidate_revision:null,revision:4}),false);
});
test('señales objetivas explicables, no falsos scores ni juicios automatizados',()=>{
  const now=new Date('2026-10-09T12:00:00Z');
  const good={source_status:'approved',profile_status:'ready',published_at:'2026-10-08T12:00:00Z',editorial_title:'Titular editorial propio',editorial_summary:'Resumen original revisado por el equipo',canonical_url:'https://example.org/noticia'};
  assert.deepEqual(reviewSignals(good,now),[]);
  const bad={...good,published_at:'2026-08-09T12:00:00Z',source_status:'paused',profile_status:'draft',editorial_title:'',canonical_url:'http://example.org'};
  assert.deepEqual(reviewSignals(bad,now),['noticia_antigua','fuente_no_aprobada','perfil_no_preparado','texto_editorial_incompleto','enlace_no_https']);
  assert.equal(ageDays('2026-10-08T12:00:00Z',now),1);
  assert.equal(ageDays('invalid',now),null);
});
test('analytics solamente administrativos: agregado de acciones registradas',()=>{
  const src=read('src/routes/admin-editorial-quality-v325.js');
  assert.match(src,/router\.use\(requireAdmin\)/);
  assert.match(src,/router\.get\('\/quality\/overview'/);
  assert.match(src,/WHERE fetched_at>=now\(\)-interval '30 days'/);
  assert.match(src,/published_30d/);
  assert.match(src,/likes_30d/);
  assert.match(src,/comments_30d/);
  assert.match(src,/reports_30d/);
  assert.match(src,/duplicates_30d/);
  assert.match(src,/editorial_sources es/);
  assert.match(src,/res\.set\('Cache-Control','no-store'\)/);
  assert.doesNotMatch(src,/SELECT \* FROM users|password_hash|birth_date|email/);
});
test('revisión de calidad auditada, con permisos y aislamiento de noticias activas',()=>{
  const src=read('src/routes/admin-editorial-quality-v325.js');
  assert.match(src,/router\.put\('\/quality\/:id'/);
  assert.match(src,/qualitySchema\.safeParse/);
  assert.match(src,/FOR UPDATE OF c/);
  assert.match(src,/candidate\.revision!==data\.revision/);
  assert.match(src,/candidate\.status!=='approved'/);
  assert.match(src,/editorial_quality_unpublish_first/);
  assert.match(src,/editorial_quality_source_not_ready/);
  assert.match(src,/ON CONFLICT\(candidate_id\) DO UPDATE/);
  assert.match(src,/INSERT INTO editorial_audit/);
  assert.match(src,/ROLLBACK/);
  assert.doesNotMatch(src,/INSERT INTO posts\b|INSERT INTO users\b|INSERT INTO editorial_publications\b/);
});
test('la publicación manual bloquea calidades sin aprobar y no altera las noticias anteriores',()=>{
  const src=read('src/routes/editorial-publication-v323.js');
  assert.match(src,/ensureQualitySchema\(db\)/);
  assert.match(src,/qualityReady\(row\)/);
  assert.match(src,/editorial_quality_clearance_required/);
  assert.match(src,/LEFT JOIN editorial_quality_assessments qa/);
  assert.match(src,/ON CONFLICT|pg_advisory_xact_lock\(323,1\)/);
  assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
});
test('panel móvil enlazado con revisión y estadísticas reales, sin publicar solo por evaluar',()=>{
  const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
  assert.match(html,/id="editorialQuality"/);
  assert.match(js,/loadEditorialQualityV325/);
  assert.match(js,/\/api\/admin\/editorial\/quality\/overview/);
  assert.match(js,/data-editorial-quality/);
  assert.match(js,/data-quality-decision="clear"/);
  assert.match(js,/data-quality-decision="hold"/);
  assert.match(js,/loadEditorialPublicV323\(\)/);
  assert.match(css,/#editorialQuality \.editorial-quality-form/);
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.30'/);
  assert.match(read('package.json'),/"version": "3\.2\.30"/);
});
