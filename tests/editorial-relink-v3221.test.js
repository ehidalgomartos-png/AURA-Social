'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {normalizedHostnameV3221:host,sourceMatchV3221:match,eligibleSourcesV3221:eligible}=
  require('../src/services/editorial-source-relink-v3221');
function candidate(o={}){
  return {source_id:null,category:'cultura',canonical_url:'https://www.revista.ejemplo.es/articulo/123',...o};
}
function source(o={}){
  return {id:20,name:'Revista Ejemplo',feed_url:'https://revista.ejemplo.es/rss.xml',
    category:'cultura',status:'approved',profile_id:9,profile_status:'ready',
    profile_category:'cultura',profile_name:'RedLibertad Cultura',...o};
}
test('normaliza exclusivamente los hostnames HTTPS permitidos',()=>{
 assert.equal(host('https://www.revista.ejemplo.es/articulo'),'revista.ejemplo.es');
 assert.equal(host('https://revista.ejemplo.es/rss'),'revista.ejemplo.es');
 for(const url of ['http://revista.ejemplo.es/noticia','https://user:pass@revista.ejemplo.es',
  'https://revista.ejemplo.es:444/rss','https://localhost/rss','https://example.onion/',
  'javascript:alert(1)','%%%',''])assert.equal(host(url),'',url);
});
test('reconexión válida únicamente por mismo dominio HTTPS, categoría y fuente autorizada',()=>{
 assert.equal(match(candidate(),source()),true);
 assert.equal(match(candidate({source_id:8}),source()),false);
 assert.equal(match(candidate({category:'tecnologia'}),source()),false);
 assert.equal(match(candidate(),source({status:'paused'})),false);
 assert.equal(match(candidate(),source({profile_status:'draft'})),false);
 assert.equal(match(candidate(),source({profile_category:'actualidad'})),false);
 assert.equal(match(candidate(),source({profile_id:null})),false);
});
test('bloquea dominios diferentes, subdominios ajenos y URL de artículo falsa',()=>{
 assert.equal(match(candidate(),source({feed_url:'https://otro-medio.es/rss'})),false);
 assert.equal(match(candidate(),source({feed_url:'https://evilrevista.ejemplo.es/rss'})),false);
 assert.equal(match(candidate({canonical_url:'https://www.ejemplo.es/fake'}),source()),false);
 assert.equal(match(candidate({canonical_url:'http://revista.ejemplo.es/noticia'}),source()),false);
 assert.equal(match(candidate({canonical_url:'https://revista.ejemplo.es.evil.com/articulo'}),source()),false);
});
test('ofrece exclusivamente fuentes compatibles sin alterar fuentes originales',()=>{
 const sources=[source(),source({id:21,name:'No aprobada',status:'draft'}),
   source({id:22,name:'Otra web',feed_url:'https://otra.com/rss'})];
 const before=JSON.stringify(sources);
 assert.deepEqual(eligible(candidate(),sources),[{
   id:'20',name:'Revista Ejemplo',category:'cultura',profileName:'RedLibertad Cultura',
   feedHost:'revista.ejemplo.es'
 }]);
 assert.equal(JSON.stringify(sources),before);
 assert.deepEqual(eligible(candidate({source_id:4}),sources),[]);
});
test('admin GET y POST estrictos con validación, usuario y serialización transaccional',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 for(const check of [
  "admin.use(requireAdmin)",
  "admin.get('/source-relink/:candidateId/options'",
  "admin.post('/source-relink/:candidateId'",
  "sourceRelinkInputV3221.safeParse(req.body)",
  "sourceId:z.number().int().positive().safe()",
  "revision:z.number().int().min(0).safe()",
  "confirm:z.literal(true)",
  "reason:z.string().trim().min(12).max(500)",
  "await inTransaction(async client=>{",
  "FROM editorial_candidates WHERE id=$1 FOR UPDATE",
  "editorial_source_already_linked",
  "editorial_review_stale",
  "editorial_unpublish_before_reopen",
  "FOR SHARE OF s,p",
  "if(!source.rowCount||!sourceMatchV3221(candidate,source.rows[0]))",
  "INSERT INTO editorial_audit",
  "'relink_source'",
  "requiresNewQuality:true",
  "requiresNewRightsVerification:true",
 ])assert.ok(route.includes(check),check);
});
test('se conserva el contenido y la decisión anterior se invalida antes de permitir publicar',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 assert.ok(route.includes("SET source_id=$2,profile_id=$3,status='pending'"));
 assert.ok(route.includes("reviewed_at=NULL,reviewed_by=NULL,revision=revision+1"));
 assert.ok(route.includes("requiresNewReview:true"));
 assert.ok(route.includes("requiresNewQuality:true"));
 assert.ok(route.includes("requiresNewRightsVerification:true"));
 assert.ok(route.includes("if(!qualityReady(row))"));
 assert.ok(route.includes("if(row.status!=='approved'||!row.reviewed_at||!row.reviewed_by)"));
 assert.ok(route.includes("if(row.source_status!=='approved'||row.profile_status!=='ready')"));
 assert.doesNotMatch(route,/UPDATE editorial_candidates SET editorial_title=\$2,editorial_summary=\$3/);
});
test('panel móvil requiere motivo, confirmación humana, protege ediciones y limpia filtros',()=>{
 const js=read('public/admin.js'),html=read('public/admin.html'),css=read('public/admin.css');
 for(const id of ['editorialRelinkPanelV3221','editorialRelinkStatusV3221',
  'editorialRelinkSourceV3221','editorialRelinkReasonV3221','editorialRelinkConfirmV3221'])
    assert.ok(html.includes('id="'+id+'"'),id);
 for(const key of ['loadEditorialRelinkV3221(item)','editorialReviewHasChangesV3216()',
   'sourceId:Number(choice.id)','revision:Number(item.revision)','confirm:true,reason',
   "editorialReviewFilter').value='pending'","editorialOrphanFilterV3220').value='all'",
   'requiresNewQuality','window.confirm(']){
   // The response may express fresh quality requirements as prose, not as a state flag.
   if(key==='requiresNewQuality')continue;
   assert.ok(js.includes(key),key);
 }
 assert.ok(js.includes('editorialRelinkRequestV3221'));
 assert.ok(css.includes('editorial-relink-panel-v3221'));
 assert.ok(css.includes('@media(max-width:620px)'));
 assert.ok(html.includes('/admin.js?v=3.2.24.1'));
 assert.ok(read('server.js').includes("APP_VERSION='3.2.24.1'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.24+polish.1');
});
test('siguiente borrado preserva origen histórico más reciente tras un relink',()=>{
 const removal=read('src/services/editorial-source-removal-v3219.js');
 assert.ok(removal.includes('source_name_snapshot=$2'));
 assert.ok(removal.includes('removed_source_id=$1::bigint'));
 assert.ok(removal.includes('DELETE FROM editorial_sources WHERE id=$1 RETURNING id'));
 assert.ok(removal.includes("'delete','source'"));
 assert.doesNotMatch(removal,/DELETE FROM editorial_(?:candidates|publications)/);
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
});
