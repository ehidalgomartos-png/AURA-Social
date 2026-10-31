'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const pub=require('../src/services/independent-publication-v3641');
const pages=require('../src/services/independent-public-pages-v3641');
const {renderIndependentVoicesEditor,renderIndependentVoicesReviewPanel}=require('../src/services/independent-voices-v3638');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.41: enlaces externos y HTML de usuarios no atraviesan las vistas públicas',()=>{
 assert.equal(pub.publicSource('https://example.org/reportaje?x=1'),'https://example.org/reportaje?x=1');
 for(const url of ['http://example.org/','javascript:alert(1)','https://localhost/',
 'https://127.0.0.1/path','https://intranet.local/','https://invalid.test/',
 'https://usuario:clave@example.org/','https://example.org:8443/path']){
  assert.equal(pub.publicSource(url),null,url);
 }
 assert.equal(pub.escapeHtml('<script>"&\'</script>'),'&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
 const item={
  id:3,kind:'opinion',title:'<img src=x onerror=alert(1)>',
  body:'Texto con <script>alert(1)</script> y ampersand &',
  sources:['https://example.org/noticia','javascript:alert(1)'],
  published_at:'2026-10-31T11:00:00Z',author_username:'prueba<svg>'
 };
 const article=pages.article(item),directory=pages.directory([item]);
 assert.match(article,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(article,/<script>|<svg>|<img/);
 assert.match(article,/rel="nofollow noopener noreferrer external"/);
 assert.match(article,/Artículo de @prueba&lt;svg&gt;/);
 assert.match(directory,/noticias\/redactores\/voces\/3/);
 assert.match(directory,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(directory,/<img src=x/);
});
test('V3.6.41: los permisos y el consentimiento son independientes de aprobar artículos',()=>{
 const review=read('src/services/independent-review-v3640.js');
 const routes=read('src/routes/independent-drafts-v3639.js');
 const editorial=read('src/routes/editorial-publication-v323.js');
 const authorUI=read('public/editorial-voices-drafts-v3639.js');
 const adminUI=read('public/editorial-voices-publication-v3641.js');
 const panel=renderIndependentVoicesReviewPanel(),editor=renderIndependentVoicesEditor();
 assert.match(review,/author_publish_consent_at TIMESTAMPTZ/);
 assert.match(review,/publishConsent!==true/);
 assert.match(review,/author_publish_consent_at=now\(\)/);
 assert.match(routes,/req\.body\?\.publishConsent/);
 assert.match(routes,/router\.post\('\/admin\/envios\/:id\/publicar',requireAdmin,sameOrigin,throttle/);
 assert.match(routes,/router\.post\('\/admin\/publicaciones\/:id\/retirar',requireAdmin,sameOrigin,throttle/);
 assert.match(editorial,/publicRouter\.get\('\/redactores\/voces\/:id'/);
 assert.match(editorial,/publicRouter\.get\('\/redactores\/voces'/);
 assert.match(editorial,/independentPublicationV3641\.getPublic\(id\)/);
 assert.match(editorial,/noindex:articles\.length===0/);
 assert.match(editorial,/independentPublicationV3641\.urlsForSitemap/);
 assert.match(panel,/id="approvedQueueV3641"/);
 assert.match(panel,/id="liveQueueV3641"/);
 assert.match(editor,/id="draftPublishConsentV3641"/);
 assert.match(authorUI,/publishConsent:true/);
 assert.match(authorUI,/draftPublishConsentV3641'\)\.checked/);
 assert.match(adminUI,/rightsChecked:true,confirmed:true/);
 assert.match(adminUI,/window\.confirm/);
 assert.match(adminUI,/\/publicaciones\//);
 assert.match(adminUI,/encodeURIComponent\(item\.id\)/);
 assert.doesNotMatch(adminUI,/\.innerHTML\s*=/);
 assert.doesNotMatch(authorUI,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(adminUI));
 assert.doesNotThrow(()=>new Function(authorUI));
});
test('V3.6.41: publicación exige aprobación humana y consentimiento real; retirada permanente',async()=>{
 assert.deepEqual(await pub.publish(2,'0',1,true,true),{error:'confirmacion_publicacion_requerida'});
 assert.deepEqual(await pub.publish(2,'3',1,false,true),{error:'confirmacion_publicacion_requerida'});
 assert.deepEqual(await pub.publish(2,'3',1,true,false),{error:'confirmacion_publicacion_requerida'});
 assert.deepEqual(await pub.withdraw(2,'3','breve',true),{error:'motivo_y_confirmacion_requeridos'});
 const queryOrig=db.query,connectOrig=db.pool.connect;
 const statements=[];
 let row={id:'3',status:'approved',review_revision:3,author_user_id:17,reviewed_at:'2026-10-30',reviewer_user_id:29,author_publish_consent_at:'2026-10-30',author_status:'active'};
 let published=true,allowNew=true;
 db.query=async(sql,args=[])=>{statements.push({sql,args});return {rows:[],rowCount:0};};
 db.pool.connect=async()=>({
  release(){},
  async query(sql,args=[]){
   statements.push({sql,args});
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[],rowCount:0};
   if(sql.startsWith('SELECT s.id,s.status'))return {rows:row?[row]:[],rowCount:row?1:0};
   if(sql.startsWith('INSERT INTO independent_article_publications_v3641'))return allowNew?{rows:[{id:'14'}],rowCount:1}:{rows:[],rowCount:0};
   if(sql.startsWith('UPDATE independent_article_publications_v3641'))return published?{rows:[{id:'14'}],rowCount:1}:{rows:[],rowCount:0};
   return{rows:[],rowCount:1};
  }
 });
 try{
  const okay=await pub.publish(2,'3',3,true,true);
  assert.equal(okay.item.id,'14');
  assert.ok(statements.some(x=>x.sql.includes('CREATE TABLE IF NOT EXISTS independent_article_publications_v3641')));
  assert.ok(statements.some(x=>x.sql.includes('UNIQUE REFERENCES independent_article_submissions_v3640')));
  assert.ok(statements.some(x=>x.sql.includes('ON CONFLICT (submission_id) DO NOTHING')));
  assert.ok(statements.some(x=>x.sql.includes("action) VALUES($1,$2,'published')")));
  row={...row,author_publish_consent_at:null};
  assert.deepEqual(await pub.publish(2,'3',3,true,true),{error:'revision_o_autorizacion_invalida'});
  row={...row,author_publish_consent_at:'2026-10-30',status:'pending'};
  assert.deepEqual(await pub.publish(2,'3',3,true,true),{error:'revision_o_autorizacion_invalida'});
  row={...row,status:'approved',author_user_id:2};
  assert.deepEqual(await pub.publish(2,'3',3,true,true),{error:'revision_o_autorizacion_invalida'});
  row={...row,author_user_id:17};
  allowNew=false;
  assert.deepEqual(await pub.publish(2,'3',3,true,true),{error:'publicacion_ya_existente_o_retirada'});
  const withdrawn=await pub.withdraw(2,'14','Fuentes incorrectas, se retira.',true);
  assert.equal(withdrawn.item.id,'14');
  assert.ok(statements.some(x=>x.sql.includes('unpublished_at IS NULL RETURNING id')));
  assert.ok(statements.some(x=>x.sql.includes("'withdrawn',$3")));
  published=false;
  assert.deepEqual(await pub.withdraw(2,'14','Fuentes incorrectas, se retira.',true),{error:'publicacion_ya_retirada_o_no_disponible'});
 }finally{db.query=queryOrig;db.pool.connect=connectOrig;}
});
test('V3.6.41: las consultas públicas solo incluyen autores activos y textos aprobados no retirados',async()=>{
 const old=db.query;let sqls=[];
 db.query=async(sql,args=[])=>{sqls.push({sql,args});return{rows:[],rowCount:0};};
 try{
  assert.deepEqual(await pub.listPublic(20),[]);
  assert.equal(await pub.getPublic('2'),null);
  assert.equal(await pub.getPublic('../2'),null);
  assert.deepEqual(await pub.urlsForSitemap(),[]);
  for(const item of sqls){
   if(!item.sql.startsWith('SELECT'))continue;
   if(item.sql.includes('published_at DESC')||item.sql.includes('p.id=$1')){
    assert.match(item.sql,/p\.unpublished_at IS NULL/);
    assert.match(item.sql,/s\.status='approved'/);
    assert.match(item.sql,/s\.author_publish_consent_at IS NOT NULL/);
    assert.match(item.sql,/u\.status='active'/);
   }
  }
 }finally{db.query=old;}
});
test('V3.6.41: responsive seguro y navegación sin propinas ni recompensa simulada',()=>{
 const css=read('public/editorial-voices-public-v3641.css');
 const routes=read('src/routes/independent-drafts-v3639.js');
 const service=read('src/services/independent-publication-v3641.js');
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/position:fixed|pointer-events:none|outline:none/);
 assert.doesNotMatch(routes,/checkout|tipJar|payout|donation/);
 assert.doesNotMatch(service,/stripe|paypal|wallet|points|coins/);
});
