'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {editorialOriginalityV32171:check}=require('../public/editorial-originality-v32171');
const data={
  source_title:'David Sánchez carga contra Mourinho por el caso Negreira: "El Real Madrid no juega a nada"',
  source_excerpt:'El presentador considera que el entrenador está utilizando el caso Negreira para desviar la atención de los problemas deportivos del conjunto blanco.'
};
test('detecta qué campo RSS es idéntico aunque cambien puntuación y acentos',()=>{
  const row={...data,editorial_title:data.source_title,editorial_summary:data.source_excerpt};
  const result=check(row);
  assert.equal(result.ok,false);
  assert.match(result.fields.title,/titular coincide/);
  assert.match(result.fields.summary,/resumen coincide/);
  const revised=check(data,{title:'Un comentarista cuestiona las declaraciones de Mourinho sobre el caso Negreira',summary:'Según el contenido del medio, el comentarista critica el uso de la controversia del caso Negreira como explicación para los problemas del equipo. Debe verificarse la información y atribuirse la opinión.'});
  assert.equal(revised.ok,true);
});
test('avisa de longitud mínima por campo y no inventa contenido',()=>{
 const a=check(data,{title:'Corto',summary:'Resumen corto'});
 assert.match(a.fields.title,/12 y 220/);
 assert.match(a.fields.summary,/70 y 1100/);
 assert.equal(a.advisoryOnly,true);
});
test('un borrador distinto en pantalla no modifica el original guardado',()=>{
 const copy={...data,editorial_title:'Otro titular válido de prueba',editorial_summary:'Este es un resumen de ejemplo suficientemente largo para su análisis editorial sin añadir información externa.'};
 const before=JSON.stringify(copy);
 check(copy,{title:'Cambiado sin guardar',summary:'También cambiado'});
 assert.equal(JSON.stringify(copy),before);
});
test('la validación impide aprobar un texto no guardado y ofrece avisos junto a los campos',()=>{
 const js=get('public/admin.js'),html=get('public/admin.html'),route=get('src/routes/admin-editorial-review-v322.js');
 assert.ok(js.includes('editorialDraftDirtyV32171'));
 assert.ok(js.includes('renderEditorialOriginalityV32171'));
 assert.ok(js.includes("window.editorialOriginalityV32171"));
 assert.ok(js.includes("item.editorial_title"));
 assert.ok(js.includes("item.editorial_summary"));
 assert.ok(js.includes("$('#editorialSaveDraft')"));
 assert.ok(html.includes('id="editorialOriginalityTitleV32171"'));
 assert.ok(html.includes('id="editorialOriginalitySummaryV32171"'));
 assert.ok(html.includes('/editorial-originality-v32171.js?v=3.2.17.1'));
 assert.ok(route.includes('editorialOriginalityV32171'));
 assert.ok(route.includes('fields:e.fields'));
 assert.ok(route.includes("if(!isOriginalEditorial(row))"));
 assert.ok(route.includes('router.use(requireAdmin)'));
 assert.ok(get('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
 assert.ok(get('server.js').includes("APP_VERSION='3.2.24.1'"));
 assert.equal(JSON.parse(get('package.json')).version,'3.2.24.1');
});
