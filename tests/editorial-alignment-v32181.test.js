'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const {editorialAlignmentV32181:check}=require('../src/services/editorial-alignment-v32181');
const ok=()=>({
  status:'approved',source_status:'approved',
  category:'entretenimiento',profile_id:7,profile_status:'ready',profile_category:'entretenimiento',
  source_category:'entretenimiento',source_profile_id:7,source_profile_status:'ready',
  source_profile_category:'entretenimiento',publication_id:null,unpublished_at:null
});
test('asignación íntegra es apta, sin reparación innecesaria',()=>{
 const r=check(ok());
 assert.equal(r.ok,true);assert.deepEqual(r.issues,[]);
 assert.equal(r.canReconcile,false);
});
test('caso de la captura: candidato aprobado distinto al perfil de la fuente',()=>{
 const row={...ok(),profile_id:3,profile_category:'actualidad',category:'actualidad'};
 const r=check(row);assert.equal(r.ok,false);assert.equal(r.canReconcile,true);
 for(const code of ['candidate_profile_mismatch','candidate_source_category_mismatch'])
   assert.ok(r.issues.some(x=>x.code===code),code);
});
test('nunca sugiere reparar si la fuente y su perfil no son coherentes',()=>{
 const r=check({...ok(),source_category:'actualidad'});
 assert.equal(r.ok,false);assert.equal(r.canReconcile,false);
 assert.ok(r.issues.some(i=>i.code==='source_category_mismatch'));
 assert.equal(check({...ok(),source_profile_id:null}).canReconcile,false);
 assert.equal(check({...ok(),source_profile_status:'draft'}).canReconcile,false);
 assert.equal(check({...ok(),source_status:'paused'}).canReconcile,false);
});
test('prohíbe reparación de publicaciones visibles y de candidatos pendientes',()=>{
 assert.equal(check({...ok(),profile_category:'actualidad',publication_id:30,unpublished_at:null}).canReconcile,false);
 assert.equal(check({...ok(),profile_category:'actualidad',status:'pending'}).canReconcile,false);
 assert.equal(check({...ok(),profile_category:'actualidad',publication_id:30,unpublished_at:'2026-10-09T10:00:00Z'}).canReconcile,true);
});
test('no muta noticias ni introduce cambios o decisiones silenciosas',()=>{
 const row={...ok(),source_category:'actualidad'},copy=JSON.stringify(row);
 check(row);assert.equal(JSON.stringify(row),copy);
});
test('cola de publicación informa antes de ofrecer publicar y aplica el bloqueo en servidor',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 assert.ok(route.includes("require('../services/editorial-alignment-v32181')"));
 assert.ok(route.includes("alignment:editorialAlignmentV32181(row)"));
 assert.ok(route.includes("if(!editorialAlignmentV32181(row).ok)"));
 assert.ok(route.includes("source_category"));
 assert.ok(route.includes("source_profile_category"));
 assert.ok(route.includes("LEFT JOIN editorial_profiles sp ON sp.id=es.profile_id"));
 assert.ok(route.includes("editorial_profile_mismatch"));
 assert.ok(route.includes("qualityReady(row)"));
 assert.ok(route.includes("admin.use(requireAdmin)"));
});
test('reasignación exige confirmación y conserva trazabilidad, revisión y calidad',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 for(const required of [
  "admin.post('/reconcile/:candidateId'",
  "confirmation(req.body||{})","row.revision!==req.body.revision",
  "row.status!=='approved'","editorial_unpublish_before_reopen",
  "if(!alignment.canReconcile)","UPDATE editorial_candidates SET profile_id=$2,category=$3,status='pending'",
  "reviewed_at=NULL,reviewed_by=NULL,revision=revision+1",
  "INSERT INTO editorial_audit","'reconcile_assignment'",
  "requiresNewReview:true,requiresNewQuality:true"
 ])assert.ok(route.includes(required),required);
 const source=read('src/routes/admin-editorial-v320.js');
 assert.ok(source.includes('checkApprovedSourceAssignmentV32181'));
 assert.ok(source.includes('editorial_source_profile_category_mismatch'));
 assert.ok(source.includes("p.rows[0].category!==data.category"));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
});
test('interfaz no permite publicar si hay discrepancia y ofrece solución manual',()=>{
 const js=read('public/admin.js'),css=read('public/admin.css'),html=read('public/admin.html');
 assert.ok(js.includes('item.alignment'));
 assert.ok(js.includes('aligned && qualityOk'));
 assert.ok(js.includes('data-editorial-reconcile'));
 assert.ok(js.includes("'/api/admin/editorial/reconcile/'"));
 assert.ok(js.includes('closeEditorialReview()'));
 assert.ok(js.includes('loadEditorialQualityV325()'));
 assert.ok(js.includes('Reasignar y devolver a revisión'));
 assert.ok(js.includes('NO se publicará'));
 assert.ok(css.includes('editorial-assignment-alert-v32181'));
 assert.ok(html.includes('/admin.js?v=3.2.25'));
 assert.ok(read('server.js').includes("APP_VERSION='3.2.36'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.36');
});
