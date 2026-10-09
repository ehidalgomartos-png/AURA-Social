'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {filterEditorialQueueV3218:filter,editorialQueueSourcesV3218:sources}=require('../public/editorial-queue-v3218');
const items=[
 {id:1,source_id:2,source_name:'El Periódico',source_title:'Nuevos avances tecnológicos en Málaga',
  category:'tecnologia',status:'pending',advice:{priority_label:'alta',possible_duplicates:[]},
  source_excerpt:'Descripción de la noticia',provenance:{warningCount:0}},
 {id:2,source_id:3,source_name:'Agencia Europa',source_title:'El fútbol español prepara una jornada',
  category:'deportes',status:'pending',advice:{priority_label:'media',possible_duplicates:[{id:9}]},
  editorial_title:'Una mirada a la próxima jornada de fútbol',
  editorial_summary:'La jornada incluye varios encuentros que merecen revisar antes de publicarse.',provenance:{warningCount:0}},
 {id:3,source_id:2,source_name:'El Periódico',source_title:'Museo municipal anuncia una exposición',
  category:'cultura',status:'pending',advice:{priority_label:'baja',possible_duplicates:[],
    category_suggestion:{changeSuggested:true}},provenance:{warningCount:2}},
 {id:4,source_id:4,source_name:'Noticias Ciudad',source_title:'Programa de salud',
  category:'sociedad',status:'approved',editorial_title:'La ciudad impulsa una campaña sanitaria',
  editorial_summary:'El programa anunciado por el municipio plantea actividades con seguimiento público.'}
];
test('filtrado libre de efectos secundarios: todos, categoría, medio y combinaciones',()=>{
 const before=JSON.stringify(items);
 assert.deepEqual(filter(items,{}).items.map(x=>x.id),[1,2,3,4]);
 assert.deepEqual(filter(items,{category:'tecnologia'}).items.map(x=>x.id),[1]);
 assert.deepEqual(filter(items,{source:'2'}).items.map(x=>x.id),[1,3]);
 assert.deepEqual(filter(items,{category:'cultura',source:'2'}).items.map(x=>x.id),[3]);
 assert.deepEqual(filter(items,{category:'deportes',source:'2'}).items,[]);
 assert.equal(JSON.stringify(items),before);
});
test('búsqueda normaliza tildes, conserva coincidencia por varias palabras',()=>{
 assert.deepEqual(filter(items,{query:'MALAGA   tecnológicos'}).items.map(x=>x.id),[1]);
 assert.deepEqual(filter(items,{query:'periodico museo'}).items.map(x=>x.id),[3]);
 assert.deepEqual(filter(items,{query:'quimera imposible'}).items,[]);
 assert.deepEqual(filter(items,{query:'<script>alert(1)</script>'}).items,[]);
});
test('filtros rápidos usan solo consejos del RSS y no rechazan noticias',()=>{
 assert.deepEqual(filter(items,{view:'high'}).items.map(x=>x.id),[1]);
 assert.deepEqual(filter(items,{view:'related'}).items.map(x=>x.id),[2]);
 assert.deepEqual(filter(items,{view:'needs-draft'}).items.map(x=>x.id),[1,3]);
 assert.deepEqual(filter(items,{view:'needs-attention'}).items.map(x=>x.id),[3]);
 assert.deepEqual(filter(items,{view:'all'}).items.map(x=>x.id),[1,2,3,4]);
 assert.deepEqual(filter(items,{view:'drop-table'}).items.map(x=>x.id),[1,2,3,4]);
});
test('selección de medios segura, ordenada y sin duplicar',()=>{
 assert.deepEqual(sources(items).map(x=>x.id),['3','2','4']);
 assert.deepEqual(sources([...items, {...items[0],source_id:null},
   {...items[0],source_id:'<script>'}]).map(x=>x.id),['3','2','4']);
});
test('contador indica que solo se han filtrado elementos recibidos, sin prometer toda la base',()=>{
 const hundred=Array.from({length:100},(_,i)=>({...items[0],id:i+1}));
 const x=filter(hundred,{query:'desconocido'});
 assert.equal(x.loaded,100);assert.equal(x.shown,0);assert.equal(x.limited,true);
 assert.equal(filter(items,{}).limited,false);
});
test('UI incorpora herramientas móviles, búsqueda accesible y navegación solo por resultados visibles',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
 for(const id of ['editorialQueueSearchV3218','editorialQueueCategoryV3218',
   'editorialQueueSourceV3218','editorialQueueFocusV3218',
   'editorialQueueResetV3218','editorialQueueCountV3218'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('/editorial-queue-v3218.js?v=3.2.18'));
 assert.ok(js.includes('renderEditorialQueueV3218'));
 assert.ok(js.includes('editorialReviewVisibleV3218'));
 assert.ok(js.includes('editorialReviewVisibleV3218[index+step]'));
 assert.ok(js.includes('editorialReviewHasChangesV3216()'));
 assert.ok(js.includes('resetEditorialQueueV3218({render:false})'));
 assert.ok(js.includes("$('#editorialInboxReload')?.addEventListener('click',()=>loadEditorialInboxV321())"));
 assert.ok(css.includes('@media(max-width:620px)'));
 assert.ok(css.includes('editorial-queue-tools-v3218'));
});
test('revisión segura, sin acción masiva ni cambio de las reglas de aprobación/publicación',()=>{
 const route=read('src/routes/admin-editorial-review-v322.js');
 const service=read('public/editorial-queue-v3218.js');
 const html=read('public/admin.html');
 assert.ok(route.includes('router.use(requireAdmin)'));
 assert.ok(route.includes("if(!isOriginalEditorial(row))"));
 assert.ok(route.includes("!d.factsChecked||!d.rightsChecked||!d.sourceRead"));
 assert.ok(route.includes("INSERT INTO editorial_audit"));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
 assert.doesNotMatch(service,/\b(?:db\.query|INSERT INTO|DELETE FROM|UPDATE users|fetch\(|autoPublish)\b/);
 assert.doesNotMatch(html,/data-editorial-bulk-approve|data-editorial-bulk-publish/);
 assert.ok(read('server.js').includes("APP_VERSION='3.2.21'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.21');
});
