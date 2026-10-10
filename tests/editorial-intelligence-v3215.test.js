'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {CATEGORIES,categoryAdvice,possibleDuplicates,advise,enrich}=require('../src/services/editorial-intelligence-v3215');
const now=new Date('2026-10-09T11:00:00.000Z');
const item=(id,title,source=1,category='actualidad')=>({id,source_id:source,category,source_name:'Medio '+source,source_title:title,source_excerpt:'',status:'pending',fetched_at:'2026-10-09T09:00:00Z',published_at:'2026-10-09T09:00:00Z'});

test('clasificación sugerida con señales específicas y sin alterar categoría ambigua',()=>{
 assert.equal(CATEGORIES.length,6);
 assert.equal(categoryAdvice(item(1,'Apple presenta novedades de macbook y software')).category,'tecnologia');
 assert.equal(categoryAdvice(item(2,'La estafa del falso empleado de banco alerta a consumidores',1,'tecnologia')).category,'sociedad');
 assert.equal(categoryAdvice(item(3,'Fútbol: la liga de campeones prepara nuevos partidos')).category,'deportes');
 assert.equal(categoryAdvice(item(4,'Bibliotecas, museos y patrimonio cultural')).category,'cultura');
 const vague=categoryAdvice(item(5,'Qué pasa mañana con las cosas',1,'sociedad'));
 assert.equal(vague.category,'sociedad');assert.equal(vague.changeSuggested,false);
});
test('temas similares entre medios y no falsos duplicados de una misma fuente',()=>{
 const one=item(1,'La estafa del falso empleado de banca: mensajes SMS fraudulentos',1);
 const two=item(2,'Mensajes SMS fraudulentos: la estafa del falso empleado de banca',2);
 const same=item(3,'Mensajes SMS fraudulentos: la estafa del falso empleado de banca',1);
 const matches=possibleDuplicates(one,[one,two,same]);
 assert.equal(matches.length,1);assert.equal(String(matches[0].id),'2');
 assert.ok(matches[0].similarity>=60);
 assert.deepEqual(possibleDuplicates(one,[{...two,published_at:'2026-08-01T09:00:00Z'}]),[]);
});
test('prioridad explicable y variedad entre categorías y fuentes',()=>{
 const a=item(1,'Estafa del falso empleado de banca y mensajes fraudulentos',1,'sociedad');
 const b=item(2,'Mensajes fraudulentos: estafa del falso empleado de banca',2,'sociedad');
 const hint=advise(a,[b],now);
 assert.equal(hint.provisional,true);
 assert.ok(hint.possible_duplicates.length===1);
 const stale=advise({...a,published_at:'2026-09-01T09:00:00Z'},[],now);
 assert.equal(stale.priority_label,'baja');
 const many=[...Array.from({length:5},(_,i)=>item(i+1,'Apple software macbook y tecnología '+i,1,'tecnologia')),item(10,'El congreso debate la nueva ley de gobierno',2),item(11,'Museos anuncian exposiciones de pintura',3)];
 const ranked=enrich(many,many,now);
 assert.equal(ranked.length,7);
 assert.ok(ranked.slice(0,5).some(row=>row.id===10||row.id===11));
});
test('revisión: sólo el administrador puede recategorizar pendientes a perfiles listos',()=>{
 const code=read('src/routes/admin-editorial-review-v322.js');
 for(const term of ['router.use(requireAdmin)','router.patch(\'/review/:id/category\'','editorial_category_profile_missing','editorial_category_duplicate','editorial_review_stale','revision=revision+1','recategorize','published:false','LIMIT 450']){
  assert.ok(code.includes(term),term);
 }
});
test('interfaces: sugerencias legibles, decisión manual, diaria y publicación no automática',()=>{
 const js=read('public/admin.js'),html=read('public/admin.html'),daily=read('src/routes/admin-editorial-daily-v327.js');
 for(const term of ['editorial-advice-summary','renderEditorialAdviceV3215','data-editorial-category-apply','¿Asignar esta noticia','priority_score','possible_duplicates']){
  assert.ok(js.includes(term),term);
 }
 assert.ok(html.includes('id="editorialIntelligence"'));
 assert.ok(daily.includes('pending:pendingAdvised.slice(0,35)'));
 assert.ok(daily.includes('manualOnly:true,autoPublishing:false'));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
});
test('versión 3.2.24 y controles de calidad intactos',()=>{
 assert.ok(read('server.js').includes("APP_VERSION='3.2.24'"));
 assert.ok(read('package.json').includes('"version": "3.2.24"'));
 assert.ok(read('src/routes/editorial-publication-v323.js').includes('editorial_quality_clearance_required'));
});
