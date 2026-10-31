'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const review=require('../src/services/independent-review-v3640');
const {renderIndependentVoicesEditor,renderIndependentVoicesLanding,renderIndependentVoicesReviewPanel}=require('../src/services/independent-voices-v3638');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function draft(overrides={}){
 return {id:'9',author_user_id:31,title:'Información local sobre un asunto ciudadano',body:'Descripción documentada de la situación. '.repeat(13),kind:'noticia',sources:['https://example.org/fuente'],revision:4,...overrides};
}
test('V3.6.40: una opinión no necesita fuente, pero noticias y reportajes completos sí',()=>{
 assert.equal(review.eligible(draft()),true);
 assert.equal(review.eligible(draft({body:'muy corto'})),false);
 assert.equal(review.eligible(draft({title:'Breve'})),false);
 assert.equal(review.eligible(draft({sources:[]})),false);
 assert.equal(review.eligible(draft({kind:'analisis',sources:[]})),false);
 assert.equal(review.eligible(draft({kind:'reportaje',sources:[]})),false);
 assert.equal(review.eligible(draft({kind:'opinion',sources:[]})),true);
 assert.equal(review.eligible(draft({sources:['javascript:alert(1)']})),false);
});
test('V3.6.40: solicitud humana exige consentimiento y revisión positiva',async()=>{
 assert.deepEqual(await review.submit(31,'0',4,true),{error:'datos_incorrectos'});
 assert.deepEqual(await review.submit(31,'9',4,false),{error:'datos_incorrectos'});
 assert.deepEqual(await review.submit(31,'9',0,true),{error:'datos_incorrectos'});
 assert.deepEqual(await review.review(5,'2',1,'approved','',false),{error:'revision_invalida'});
 assert.deepEqual(await review.review(5,'2',1,'rejected','breve',true),{error:'revision_invalida'});
 assert.deepEqual(await review.review(5,'2',1,'publish','aprobado',true),{error:'revision_invalida'});
 assert.deepEqual(await review.review(5,'2',0,'approved','',true),{error:'revision_invalida'});
});
test('V3.6.40: envío con snapshot, bloqueo por revisión vieja, y auditoría transaccional',async()=>{
 const originalQuery=db.query,originalConnect=db.pool.connect;
 const statements=[],rows=[draft()];
 const client={
  query:async(sql,args=[])=>{
   statements.push({sql,args});
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rowCount:0,rows:[]};
   if(sql.includes('FROM independent_article_drafts_v3639')&&sql.includes('FOR UPDATE'))return{rowCount:1,rows:[rows[0]]};
   if(sql.startsWith('SELECT id,status,submitted_draft_revision'))return{rowCount:0,rows:[]};
   if(sql.startsWith('INSERT INTO independent_article_submissions_v3640'))return{rowCount:1,rows:[{id:27,status:'pending',author_user_id:31,submitted_draft_revision:4,review_revision:1}]};
   if(sql.startsWith('INSERT INTO independent_article_review_events_v3640'))return{rowCount:1,rows:[{id:2}]};
   throw Error('Unexpected SQL: '+sql);
  },release:()=>{}
 };
 db.query=async(sql,args=[])=>{statements.push({sql,args});return{rows:[],rowCount:0};};
 db.pool.connect=async()=>client;
 try{
  const result=await review.submit(31,'9',4,true);
  assert.equal(result.item.id,27);
  assert.ok(statements.some(s=>s.sql==='BEGIN'));
  assert.ok(statements.some(s=>s.sql==='COMMIT'));
  assert.ok(statements.some(s=>s.sql.includes('CREATE TABLE IF NOT EXISTS independent_article_submissions_v3640')));
  assert.ok(statements.some(s=>s.sql.includes('CREATE TABLE IF NOT EXISTS independent_article_review_events_v3640')));
  assert.ok(statements.some(s=>s.sql.includes("status IN ('pending','changes_requested','rejected','approved')")));
  const scoped=statements.find(s=>s.sql.includes('FOR UPDATE')&&s.sql.includes('independent_article_drafts_v3639'));
  assert.match(scoped.sql,/author_user_id=\$2 AND status='draft'/);
  assert.deepEqual(scoped.args,['9',31]);
  const log=statements.find(s=>s.sql.startsWith('INSERT INTO independent_article_review_events_v3640'));
  assert.deepEqual(log.args,[27,31,'submitted']);
  rows[0].revision=5;
  assert.deepEqual(await review.submit(31,'9',4,true),{error:'borrador_modificado'});
 }finally{db.query=originalQuery;db.pool.connect=originalConnect;}
});
test('V3.6.40: revisión humana sin autopremio, pública ni dinero',async()=>{
 const originalConnect=db.pool.connect;
 let updateSQL,events=[];
 db.pool.connect=async()=>({
  query:async(sql,args=[])=>{
   if(sql.startsWith('UPDATE independent_article_submissions_v3640')){
    updateSQL=sql;
    assert.deepEqual(args,['changes_requested','Faltan citas y contrastar fuentes.',77,'8',3]);
    return{rows:[{id:'8',status:'changes_requested'}],rowCount:1};
   }
   if(sql.startsWith('INSERT INTO independent_article_review_events_v3640')){events.push(args);return{rows:[],rowCount:1};}
   return{rows:[],rowCount:0};
  },
  release:()=>{}
 });
 try{
  const out=await review.review(77,'8',3,'changes_requested','Faltan citas y contrastar fuentes.',true);
  assert.equal(out.item.status,'changes_requested');
  assert.match(updateSQL,/status='pending' AND review_revision=\$5 AND author_user_id<>\$3/);
  assert.equal(events[0][1],77);
  assert.equal(events[0][2],'changes_requested');
 }finally{db.pool.connect=originalConnect;}
});
test('V3.6.40: rutas y páginas de administración requieren permisos, no exponen artículos',()=>{
 const routes=read('src/routes/independent-drafts-v3639.js');
 const editorial=read('src/routes/editorial-publication-v323.js');
 const svc=read('src/services/independent-review-v3640.js');
 const html=renderIndependentVoicesEditor(),landing=renderIndependentVoicesLanding(),admin=renderIndependentVoicesReviewPanel();
 const js=read('public/editorial-voices-review-v3640.js');
 const ui=read('public/editorial-voices-drafts-v3639.js');
 const css=read('public/editorial-voices-review-v3640.css');
 assert.match(routes,/router\.use\(requireAuth\)/);
 assert.match(routes,/router\.get\('\/admin\/pendientes',requireAdmin/);
 assert.match(routes,/router\.post\('\/admin\/envios\/:id\/revisar',requireAdmin,sameOrigin,throttle/);
 assert.match(routes,/router\.post\('\/borradores\/:id\/enviar',sameOrigin,throttle/);
 assert.match(editorial,/publicRouter\.get\('\/redactores\/admin',requireAdmin/);
 assert.match(editorial,/noindex:true,independentVoices:true/);
 assert.match(svc,/WHERE author_user_id=\$1 ORDER BY submitted_at DESC/);
 assert.match(svc,/status='pending' AND s.author_user_id<>\$1/);
 assert.match(svc,/ON DELETE RESTRICT/);
 assert.doesNotMatch(svc,/INSERT INTO editorial_publications|INSERT INTO posts|INSERT INTO transactions|stripe/i);
 assert.doesNotMatch(routes,/\/publish|\/checkout|\/tips|\/vote/i);
 assert.match(html,/id="draftCertifyV3640"/);
 assert.match(html,/id="draftSubmitV3640"/);
 assert.match(html,/id="draftReviewStatusV3640"/);
 assert.match(admin,/id="reviewQueueV3640"/);
 assert.match(landing,/Ya puedes redactar borradores y enviarlos a revisión humana/);
 assert.match(ui,/published|publicad/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/window\.confirm/);
 assert.match(js,/textContent=String\(txt\)/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotThrow(()=>new Function(ui));
 assert.doesNotThrow(()=>new Function(js));
});
