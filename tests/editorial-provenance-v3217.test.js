'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {editorialProvenanceV3217:check}=require('../public/editorial-provenance-v3217');
const source=()=>({
 source_title:'El ayuntamiento anuncia una nueva zona verde en el centro de la ciudad',
 source_excerpt:'El ayuntamiento ha anunciado una nueva zona verde que se construirá en el centro de la ciudad con nuevos espacios para caminar y actividades culturales.',
 source_status:'approved',source_name:'Periódico de ejemplo',published_at:'2026-10-09T11:00:00Z',
 canonical_url:'https://example.org/noticia'
});
const has=(result,code)=>result.warnings.some(w=>w.code===code);
test('alertas exactas y coincidencias largas sin denunciar automáticamente plagio',()=>{
 const a=source();
 assert.ok(has(check({...a,editorial_title:a.source_title}),'title_exact'));
 assert.ok(has(check({...a,editorial_summary:a.source_excerpt}),'summary_exact'));
 assert.ok(has(check(a,{title:'Análisis: '+a.source_title}),'title_extended_match'));
 assert.ok(has(check(a,{summary:'Resumen con contexto: '+a.source_excerpt+' Consulta también las fuentes primarias.'}),'summary_extended_match'));
 const normal=check(a,{title:'El consistorio estudia cambios en el espacio urbano',summary:'Las autoridades locales estudian un proyecto de urbanismo en una zona de la ciudad. El alcance y las fechas deben cotejarse con la documentación original.'});
 assert.ok(!normal.warnings.some(w=>w.code.startsWith('title_')||w.code.startsWith('summary_')));
 assert.equal(normal.rightsVerified,false);
 assert.equal(normal.reviewedFacts,false);
});
test('señala metadatos escasos o fechas inválidas, sin inventar hechos',()=>{
 const result=check({...source(),source_excerpt:'',published_at:null,source_status:'paused'});
 for(const code of ['excerpt_metadata_sparse','publication_date_missing','source_not_approved'])assert.ok(has(result,code),code);
 assert.equal(result.advisoryOnly,true);
 assert.equal(result.provisional,true);
});
test('no muta el artículo ni el borrador y no muestra HTML de entrada',()=>{
 const article=source(),draft={title:'<img src=x onerror=alert(1)>',summary:'Una descripción propia y extensa basada en documentación revisada por el editor.'};
 const before=JSON.stringify({article,draft});
 const result=check(article,draft);
 assert.equal(JSON.stringify({article,draft}),before);
 assert.ok(!JSON.stringify(result.warnings).includes('<img'));
});
test('la interfaz permite revisión instantánea sin guardar ni aprobar',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js'),route=read('src/routes/admin-editorial-review-v322.js');
 assert.ok(html.includes('id="editorialProvenanceV3217"'));
 assert.ok(html.includes('/editorial-provenance-v3217.js?v=3.2.17'));
 assert.ok(js.includes('renderEditorialProvenanceV3217'));
 assert.ok(js.includes("window.editorialProvenanceV3217"));
 assert.ok(route.includes("require('../../public/editorial-provenance-v3217')"));
 assert.ok(route.includes('provenance:editorialProvenanceV3217(row)'));
 assert.ok(route.includes('router.use(requireAdmin)'));
 assert.ok(route.includes("if(!isOriginalEditorial(row))"));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
 assert.ok(read('server.js').includes("APP_VERSION='3.2.37'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.37');
});
