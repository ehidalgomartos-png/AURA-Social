'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const moduleV=require('../src/services/editorial-web-import-v3223');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('solo acepta URLs HTTPS de artículos, sin host privado ni archivos',()=>{
 for(const bad of ['http://periodico.es/noticia','https://127.0.0.1/p',
   'https://localhost/noticia','https://user:pass@medio.es/noticia',
   'https://medio.es/', 'https://medio.es/imagen.svg',
   'https://medio.es/archivo.pdf','javascript:alert(1)','https://medio.es:8443/a']){
    assert.equal(moduleV.articleUrlV3223(bad),null,bad);
 }
 assert.equal(moduleV.articleUrlV3223('https://medio.es/noticia/?utm_source=rss&b=2&a=1'),
   'https://medio.es/noticia?a=1&b=2');
});
test('extrae OpenGraph aunque cambie orden de atributos y escapa HTML',()=>{
 const html='<html><head><title>Título secundario</title>'+
  '<meta content="Una noticia útil &amp; importante" property="og:title">'+
  '<meta name="description" content="Detalles publicados por el medio &quot;local&quot;">'+
  '<meta content="https://cdn.medio.es/portada.webp" property="og:image">'+
  '<meta property="og:site_name" content="El Diario Local">'+
  '<meta property="article:published_time" content="2025-05-12T10:00:00Z"></head>'+
  '<body><script>alert(1)</script></body></html>';
 const data=moduleV.extractPageMetadataV3223(html,'https://medio.es/noticia');
 assert.equal(data.source_title,'Una noticia útil & importante');
 assert.equal(data.source_excerpt,'Detalles publicados por el medio "local"');
 assert.equal(data.source_name,'El Diario Local');
 assert.equal(data.source_image_url,'https://cdn.medio.es/portada.webp');
 assert.equal(data.published_at,'2025-05-12T10:00:00.000Z');
 assert.equal(data.original_content_not_imported,true);
});
test('metadata maliciosa no autoriza medios ni incluye HTML ejecutable',()=>{
 const article=moduleV.extractPageMetadataV3223(
  '<h1>Una información sobre la sociedad actual</h1>'+
  '<meta name="description" content="&lt;script&gt;alert(1)&lt;/script&gt; Contexto general">'+
  '<meta property="og:image" content="http://169.254.169.254/latest/">',
  'https://medio.es/noticia');
 assert.ok(!article.source_excerpt.includes('<script>'));
 assert.equal(article.source_image_url,null);
 const draft=moduleV.draftFromMetadataV3223(article);
 assert.ok(draft.note.includes('metadatos'));
 assert.ok(!draft.note.includes('publicar automáticamente'));
});
test('HTML demasiado grande o sin título identificable se rechaza',()=>{
 assert.throws(()=>moduleV.extractPageMetadataV3223('x'.repeat(moduleV.MAX_PAGE_BYTES+1),'https://medio.es/a'),
  {code:'editorial_web_page_invalid'});
 assert.throws(()=>moduleV.extractPageMetadataV3223('<body>sin titulo</body>','https://medio.es/a'),
  {code:'editorial_web_title_unavailable'});
});
test('descarga HTTPS fijando IP pública, sin seguir redirecciones, sin cookies',async()=>{
 const ip={address:'8.8.8.8',family:4};
 let sent;
 function mockRequest(options,callback){
   sent=options;
   const req=new EventEmitter();
   req.setTimeout=()=>{};req.destroy=()=>{};
   req.end=()=>{
     const res=new EventEmitter();
     res.statusCode=200;
     res.headers={'content-type':'text/html'};
     callback(res);
     res.emit('data',Buffer.from('<meta property="og:title" content="Un tema destacado de la actualidad">'));
     res.emit('end');
   };return req;
 }
 const result=await moduleV.fetchWebPageV3223('https://medio.es/noticia',{
   lookup:async()=>[ip],request:mockRequest
 });
 assert.equal(result.source_title,'Un tema destacado de la actualidad');
 assert.equal(sent.method,'GET');assert.equal(sent.agent,false);
 assert.equal(sent.protocol,'https:');
 assert.equal(sent.headers['Accept-Encoding'],'identity');
 assert.ok(!sent.headers.Cookie);
 sent.lookup('medio.es',{all:true},(e,a)=>{assert.equal(e,null);assert.deepEqual(a,[ip]);});
 function redirect(_options,callback){
   const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};
   req.end=()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://127.0.0.1/admin'};callback(res);};
   return req;
 }
 await assert.rejects(moduleV.fetchWebPageV3223('https://medio.es/noticia',{
   lookup:async()=>[ip],request:redirect
 }),{code:'editorial_web_http_error'});
});
test('límites de bytes y MIME durante la consulta de metadatos',async()=>{
 const ip={address:'8.8.8.8',family:4};
 const fake=(mime,buff)=>(_o,callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};
  req.end=()=>{
   const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':mime};
   callback(res);res.emit('data',buff);res.emit('end');
  };return req;
 };
 await assert.rejects(moduleV.fetchWebPageV3223('https://medio.es/a',{lookup:async()=>[ip],
  request:fake('application/pdf',Buffer.from('PDF'))}),{code:'editorial_web_not_html'});
 await assert.rejects(moduleV.fetchWebPageV3223('https://medio.es/a',{lookup:async()=>[ip],
  request:fake('text/html',Buffer.alloc(moduleV.MAX_PAGE_BYTES+1))}),
  {code:'editorial_web_too_large'});
});
test('importar guarda solo borrador, crea fuente web identificada y bloquea duplicados',()=>{
 const code=read('src/routes/admin-editorial-web-import-v3223.js');
 for(const x of [
  'router.use(requireAdmin)',
  'ensurePublicationSchema()',
  "router.post('/web-import/preview',previewLimiter",
  "router.post('/web-import/save',saveLimiter",
  'confirmedSource:z.literal(true)',
  'confirmedOriginality:z.literal(true)',
  'confirmedPhotoIsNotLicensed:z.literal(true)',
  'profileId:z.number().int().positive().safe()',
  'summary:z.string().trim().min(70).max(1100)',
  "WHERE status='ready'",
  "editorial_web_duplicate",
  "FOR SHARE",
  "'web',$3,$4,'approved','link_only'",
  "'pending',$10,$11,$12,1,now()",
  "source_image_url",
  "INSERT INTO editorial_audit",
  "'import_web'",
  "await client.query('ROLLBACK')",
  'published:false,pendingReview:true,photoLicensed:false',
 ])assert.ok(code.includes(x),x);
 assert.doesNotMatch(code,/INSERT INTO posts|INSERT INTO editorial_publications|fetchImageV3222/);
});
test('fuentes web no se consultan como RSS, pero usan controles existentes de aprobación',()=>{
 const sources=read('src/services/editorial-v320.js');
 const inbox=read('src/routes/admin-editorial-inbox-v321.js');
 const pub=read('src/routes/editorial-publication-v323.js');
 const review=read('src/routes/admin-editorial-review-v322.js');
 assert.ok(sources.includes("ADD COLUMN IF NOT EXISTS source_kind VARCHAR(8)"));
 assert.ok(inbox.includes("source.source_kind==='web'"));
 assert.ok(pub.includes('editorialAlignmentV32181(row).ok'));
 assert.ok(pub.includes("row.status!=='approved'||!row.reviewed_at||!row.reviewed_by"));
 assert.ok(pub.includes('if(!qualityReady(row))'));
 assert.ok(review.includes("if(row.source_status!=='approved'"));
 assert.ok(sources.includes("CHECK(NOT auto_publish_enabled)"));
});
test('móvil, formulario editable, foto sugerida privada y alternativa manual',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 for(const id of ['editorialWebUrlV3223','editorialWebImportFormV3223',
   'editorialWebOriginalTitleV3223','editorialWebOriginalExcerptV3223',
   'editorialWebTitleV3223','editorialWebSummaryV3223','editorialWebProfileV3223',
   'editorialWebPreviewButtonV3223','editorialWebManualV3223',
   'editorialWebConfirmPhotoV3223','editorialWebSaveV3223'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(js.includes('/api/admin/editorial/web-import/preview'));
 assert.ok(js.includes('/api/admin/editorial/web-import/save'));
 assert.ok(js.includes('manualFallback:manual'));
 assert.ok(js.includes('closeEditorialReview()'));
 assert.ok(js.includes('loadEditorialInboxV321(key)'));
 assert.ok(js.includes("s.source_kind!=='web'"));
 assert.ok(read('public/admin.css').includes('.editorial-web-import-v3223'));
 assert.ok(read('public/admin.css').includes('@media(max-width:620px)'));
 assert.ok(html.includes('/admin.js?v=3.2.23'));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.23');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.23'"));
});
