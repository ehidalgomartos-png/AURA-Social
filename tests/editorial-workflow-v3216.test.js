'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {editorialDraftV3216}=require('../public/editorial-draft-v3216');
const {sourceCoverage,topicOverlap,enrich}=require('../src/services/editorial-intelligence-v3216');
const now=new Date('2026-10-09T11:00:00Z');
const news=(id,title,source,category='actualidad')=>({
 id,source_id:source,source_name:'Diario '+source,source_title:title,source_excerpt:'Información adicional disponible en el RSS del medio.',
 category,status:'pending',published_at:'2026-10-09T09:00:00Z',fetched_at:'2026-10-09T09:00:00Z'
});
test('titular y resumen sugeridos se basan en el RSS y no inventan datos',()=>{
 const row=news(1,'Apple presenta nuevas funciones de seguridad en sus teléfonos',1,'tecnologia');
 const generated=editorialDraftV3216(row);
 assert.ok(generated.title.length>=12&&generated.title.length<=220);
 assert.ok(generated.summary.length>=70&&generated.summary.length<=1100);
 assert.ok(generated.title.includes('Apple'));
 assert.ok(generated.summary.includes('Diario 1'));
 assert.ok(generated.note.includes('NO VERIFICADO'));
 assert.ok(generated.quotedExcerptWords<=18);
 assert.equal(generated.provisional,true);
 assert.equal(editorialDraftV3216({...row,source_title:' '}).title,'');
 assert.ok(!generated.summary.includes('se ha confirmado que'));
});
test('descripciones RSS ausentes no se rellenan con hechos inventados',()=>{
 const row={...news(1,'El ayuntamiento presenta su propuesta para el nuevo parque',1),source_excerpt:''};
 const draft=editorialDraftV3216(row);
 assert.equal(draft.evidence,'title-only');
 assert.ok(draft.summary.includes('no incluye una descripción suficiente'));
});
test('la similitud temática incluye la misma fuente sin ocultar entradas',()=>{
 const a=news(1,'Nueva medida para controlar la contaminación del aire de la ciudad',1);
 const b=news(2,'Contaminación del aire de la ciudad: nueva medida para controlar',1);
 const c=news(3,'Museos presentan exposición de pintura y escultura',2,'cultura');
 assert.ok(topicOverlap(a,b)>=0.43);
 assert.equal(topicOverlap(a,c),0);
 assert.equal(topicOverlap(a,{...b,published_at:'2026-08-01T09:00:00Z'}),0);
 const result=enrich([a,b,c],[a,b,c],now);
 assert.equal(result.length,3);
 assert.ok(result.find(x=>x.id===2).advice.topic_note);
 assert.ok(result.slice(0,2).some(x=>x.id===3));
});
test('la cobertura RSS muestra huecos, sin introducir fuentes automáticamente',()=>{
 const coverage=sourceCoverage([
  {id:1,status:'approved',category:'tecnologia'},
  {id:1,status:'approved',category:'tecnologia'},
  {id:2,status:'paused',category:'sociedad'},
  {id:3,status:'approved',category:'cultura'}
 ]);
 assert.equal(coverage.approvedSources,2);
 assert.equal(coverage.byCategory.tecnologia,1);
 assert.ok(coverage.categoriesWithoutApprovedSources.includes('sociedad'));
});
test('rutas y controles humanos permanecen intactos',()=>{
 const route=get('src/routes/admin-editorial-review-v322.js');
 const daily=get('src/routes/admin-editorial-daily-v327.js');
 const js=get('public/admin.js'),html=get('public/admin.html');
 assert.ok(route.includes("require('../services/editorial-intelligence-v3216')"));
 assert.ok(daily.includes("require('../services/editorial-intelligence-v3216')"));
 for(const key of ['editorialReviewPreviousV3216','editorialReviewNextV3216','editorialReviewProgressV3216'])assert.ok(html.includes(key));
 for(const key of ['moveEditorialReviewV3216','topic_note','editorialDraftV3216'])assert.ok(js.includes(key));
 assert.ok(html.includes('/editorial-draft-v3216.js?v=3.2.16'));
 assert.ok(get('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
 assert.ok(route.includes("router.use(requireAdmin)"));
 assert.ok(get('server.js').includes("APP_VERSION='3.2.20'"));
 assert.equal(JSON.parse(get('package.json')).version,'3.2.20');
});
