'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const discovery=require('../src/services/independent-discovery-v3643');
const reports=require('../src/services/independent-reports-v3643');
const pages=require('../src/services/independent-public-pages-v3641');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const article={id:7,kind:'noticia',title:'Información contrastada sobre nuestro barrio',
 body:'Información original con fuentes externas e identificación de autor.',
 published_at:'2026-10-31T12:00:00Z',author_username:'autor.real',sources:['https://example.org/a']};
test('V3.6.43: filtros y nombres de autor validados sin rangos arbitrarios',()=>{
 assert.equal(discovery.validKind(null),true);
 assert.equal(discovery.validKind('noticia'),true);
 assert.equal(discovery.validKind('opinion'),true);
 assert.equal(discovery.validKind('cualquier-cosa'),false);
 assert.equal(discovery.validAuthor('autor.real'),true);
 assert.equal(discovery.validAuthor('María-García'),true);
 assert.equal(discovery.validAuthor('..%2Fadmin'),false);
 assert.equal(discovery.validAuthor('../admin'),false);
 assert.equal(discovery.validAuthor('<script>'),false);
 assert.equal(discovery.validAuthor('a'.repeat(49)),false);
});
test('V3.6.43: filtros y fichas consultan exclusivamente publicaciones visibles y autorizadas',async()=>{
 const original=db.query;
 const logs=[];
 db.query=async(sql,args=[])=>{logs.push({sql,args});return{rows:[article],rowCount:1};};
 try{
  const list=await discovery.browse('noticia');
  assert.equal(list[0].title,article.title);
  const all=await discovery.browse();
  assert.equal(all.length,1);
  const byAuthor=await discovery.author('autor.real');
  assert.equal(byAuthor.length,1);
  assert.equal(await discovery.browse('falseado'),null);
  assert.equal(await discovery.author('../no'),null);
  const selects=logs.filter(v=>v.sql.startsWith('SELECT '));
  assert.equal(selects.length,3);
  for(const item of selects){
   assert.match(item.sql,/p\.unpublished_at IS NULL/);
   assert.match(item.sql,/s\.status='approved'/);
   assert.match(item.sql,/s\.author_publish_consent_at IS NOT NULL/);
   assert.match(item.sql,/u\.status='active'/);
   assert.doesNotMatch(item.sql,/SELECT \*/);
  }
  assert.match(selects[0].sql,/s\.kind=\$1/);
  assert.deepEqual(selects[0].args,['noticia',24]);
  assert.deepEqual(selects[1].args,[24]);
  assert.match(selects[2].sql,/LOWER\(u\.username\)=LOWER\(\$1\)/);
  assert.deepEqual(selects[2].args,['autor.real']);
 }finally{db.query=original;}
});
test('V3.6.43: textos y nombres de perfiles nunca se interpolan como HTML',()=>{
 const tainted={...article,title:'<script>peligro</script>',author_username:'maria<svg>',body:'Texto <img src=x> & hola'};
 const html=pages.directory([tainted],'opinion'),profile=pages.authorProfile('maria<svg>',[tainted]),single=pages.article(tainted);
 assert.match(html,/href="\/noticias\/redactores\/voces\?tipo=opinion" aria-current="page"/);
 assert.match(html,/&lt;script&gt;peligro&lt;\/script&gt;/);
 assert.match(profile,/&lt;svg&gt;/);
 assert.match(single,/Avisar de un posible error en este artículo/);
 assert.match(single,/id="voicesReportFormV3643"/);
 assert.match(single,/id="voicesReportReasonV3643"/);
 assert.match(single,/id="voicesReportDetailsV3643"/);
 assert.doesNotMatch(html,/<script>|<svg>|<img/);
 assert.doesNotMatch(profile,/<script>|<svg>|<img/);
 assert.doesNotMatch(single,/<script>|<svg>|<img/);
});
test('V3.6.43: avisos necesitan motivo y explicación completa',()=>{
 assert.equal(reports.validate('inexactitud','La fecha de esta información es incorrecta.' ).reason,'inexactitud');
 assert.equal(reports.validate('no_valido','Un texto suficientemente largo'),null);
 assert.equal(reports.validate('privacidad','muy corto'),null);
 assert.equal(reports.validate('plagio','x'.repeat(1201)),null);
 assert.equal(reports.validate('otro',[]),null);
});
test('V3.6.43: reportar exige artículo público ajeno, evita duplicados y no retira automáticamente',async()=>{
 const query=db.query,connect=db.pool.connect,logs=[];
 let author=12,inserted=true,exists=true;
 db.query=async(sql,args=[])=>{logs.push({sql,args});return{rows:[],rowCount:0};};
 db.pool.connect=async()=>({
  release(){},
  query:async(sql,args=[])=>{
   logs.push({sql,args});
   if(sql.startsWith('SELECT p.id,s.author_user_id'))return{rows:exists?[{id:5,author_user_id:author}]:[],rowCount:exists?1:0};
   if(sql.startsWith('INSERT INTO independent_article_reports_v3643'))return {rows:inserted?[{id:8}]:[],rowCount:inserted?1:0};
   return{rows:[],rowCount:0};
  }
 });
 try{
  assert.deepEqual(await reports.report(3,'bad','otro','Este aviso cumple la longitud mínima.',true),{error:'denuncia_invalida'});
  assert.deepEqual(await reports.report(3,'5','otro','Este aviso cumple la longitud mínima.',false),{error:'denuncia_invalida'});
  const saved=await reports.report(3,'5','otro','Este aviso cumple la longitud mínima.',true);
  assert.deepEqual(saved,{accepted:true,alreadyReported:false});
  assert.ok(logs.some(v=>v.sql.includes('CREATE TABLE IF NOT EXISTS independent_article_reports_v3643')));
  assert.ok(logs.some(v=>v.sql.includes('UNIQUE(publication_id,reporter_user_id)')));
  const live=logs.find(v=>v.sql.startsWith('SELECT p.id,s.author_user_id'));
  assert.match(live.sql,/p\.unpublished_at IS NULL/);
  assert.match(live.sql,/s\.status='approved'/);
  assert.match(live.sql,/author.status='active'/);
  assert.match(live.sql,/FOR UPDATE OF p/);
  assert.ok(logs.some(v=>v.sql.includes('ON CONFLICT (publication_id,reporter_user_id) DO NOTHING')));
  assert.equal(logs.some(v=>v.sql.includes('unpublished_at=now()')),false);
  inserted=false;
  assert.deepEqual(await reports.report(3,'5','otro','Este aviso cumple la longitud mínima.',true),{accepted:true,alreadyReported:true});
  author=3;
  assert.deepEqual(await reports.report(3,'5','otro','Este aviso cumple la longitud mínima.',true),{error:'denuncia_propia_no_permitida'});
  exists=false;
  assert.deepEqual(await reports.report(3,'5','otro','Este aviso cumple la longitud mínima.',true),{error:'articulo_no_disponible'});
 }finally{db.query=query;db.pool.connect=connect;}
});
test('V3.6.43: decisiones privadas solo por personal autorizado, con motivo y sin retirar artículo',async()=>{
 const old=db.query,logs=[];
 db.query=async(sql,args=[])=>{
  logs.push({sql,args});
  if(sql.startsWith('UPDATE independent_article_reports_v3643'))return{rows:[{id:8,status:'reviewed'}],rowCount:1};
  return{rows:[{id:8}],rowCount:1};
 };
 try{
  assert.deepEqual(await reports.decide(2,'3','removed','Motivo suficientemente detallado',true),{error:'revision_invalida'});
  assert.deepEqual(await reports.decide(2,'3','reviewed','muy breve',true),{error:'revision_invalida'});
  const x=await reports.decide(2,'8','reviewed','Se ha contrastado la fuente y corregido el artículo.',true);
  assert.equal(x.item.status,'reviewed');
  const write=logs.find(v=>v.sql.startsWith('UPDATE independent_article_reports_v3643'));
  assert.match(write.sql,/status='open' AND reporter_user_id<>\$3/);
  assert.doesNotMatch(write.sql,/UPDATE independent_article_publications/);
  assert.equal(write.args[2],2);
 }finally{db.query=old;}
});
test('V3.6.43: rutas y UI públicas y administrativas permanecen separadas',()=>{
 const routes=read('src/routes/independent-drafts-v3639.js');
 const editor=read('src/routes/editorial-publication-v323.js');
 const admin=read('public/editorial-voices-reports-admin-v3643.js');
 const reader=read('public/editorial-voices-report-v3643.js');
 const css=read('public/editorial-voices-discovery-v3643.css');
 const html=read('src/services/independent-voices-v3638.js');
 assert.match(routes,/router\.post\('\/voces\/:id\/denunciar',sameOrigin,throttle/);
 assert.match(routes,/router\.get\('\/admin\/denuncias',requireAdmin/);
 assert.match(routes,/router\.post\('\/admin\/denuncias\/:id\/revisar',requireAdmin,sameOrigin,throttle/);
 assert.match(routes,/router\.use\(requireAuth\)/);
 assert.match(editor,/publicRouter\.get\('\/redactores\/autores\/:username'/);
 assert.match(editor,/independentDiscoveryV3643\.browse\(kind\)/);
 assert.match(editor,/noindex:articles\.length===0\|\|!!kind/);
 assert.match(html,/id="voicesReportsListV3643"/);
 assert.match(reader,/credentials:'same-origin'/);
 assert.match(reader,/window\.confirm/);
 assert.match(reader,/status\.textContent/);
 assert.match(admin,/encodeURIComponent\(report\.id\)/);
 assert.match(admin,/window\.confirm/);
 assert.doesNotMatch(reader,/\.innerHTML\s*=/);
 assert.doesNotMatch(admin,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(reader));
 assert.doesNotThrow(()=>new Function(admin));
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
});
