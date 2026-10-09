'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const images=require('../src/services/editorial-image-v3222');
const {parseFeed}=require('../src/services/editorial-rss-v321');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const now=new Date('2026-10-10T00:00:00Z');
const feed=body=>'<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>'+
  '<item><title>Nuevos proyectos y propuestas de la comunidad</title>'+
  '<link>https://medio.ejemplo.es/articulo</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate>'+
  body+'</item></channel></rss>';
test('RSS reconoce media:content, media:thumbnail y enclosure sin descargar la foto',()=>{
 for(const tag of [
  '<media:content url="https://cdn.ejemplo.es/foto.webp" type="image/webp"/>',
  '<media:thumbnail url="https://cdn.ejemplo.es/foto.webp"/>',
  '<enclosure url="https://cdn.ejemplo.es/foto.webp" type="image/webp" length="100"/>'
 ]){
   const rows=parseFeed(feed(tag),{category:'actualidad',now});
   assert.equal(rows.length,1);
   assert.equal(rows[0].source_image_url,'https://cdn.ejemplo.es/foto.webp');
   assert.equal(Object.hasOwn(rows[0],'editorial_image_url'),false);
 }
});
test('RSS antiguo sin imagen sigue siendo válido y no pide descargas',()=>{
 const rows=parseFeed(feed('<description>Una noticia con texto.</description>'),{category:'cultura',now});
 assert.equal(rows.length,1);assert.equal(rows[0].source_image_url,null);
});
test('metadata de imagen nunca acepta HTTP, IP privada, credenciales o tipos no-imagen',()=>{
 for(const url of ['http://cdn.ejemplo.es/a.jpg','https://localhost/image.jpg',
 'https://127.0.0.1/x','https://169.254.169.254/x',
 'https://user:pass@cdn.ejemplo.es/x','https://cdn.ejemplo.es:444/a',
 'https://cdn.ejemplo.es/x#tag','javascript:alert(1)','https://cdn.ejemplo.es/x\nA']){
   assert.equal(images.validatedImageUrl(url),'',url);
 }
 assert.equal(images.validatedImageUrl('https://cdn.ejemplo.es/x?a=1'),'https://cdn.ejemplo.es/x?a=1');
 assert.equal(images.extractRssImageV3222({enclosure:{'@_url':'https://cdn.ejemplo.es/movie.mp4','@_type':'video/mp4'}}),'');
});
test('solo JPEG, PNG y WebP con firma real pueden almacenarse',()=>{
 const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(14)]);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20)]);
 const webp=Buffer.concat([Buffer.from('RIFF1234WEBP','ascii'),Buffer.alloc(12)]);
 assert.equal(images.mimeOfImage(jpeg).mime,'image/jpeg');
 assert.equal(images.mimeOfImage(png).mime,'image/png');
 assert.equal(images.mimeOfImage(webp).mime,'image/webp');
 assert.equal(images.mimeOfImage(Buffer.from('<svg><script/></svg>')),null);
 assert.equal(images.mimeOfImage(Buffer.from('<html>hello</html>')),null);
 assert.ok(images.MAX_IMAGE_BYTES<=4*1024*1024);
});
test('la descarga usa DNS público fijado, TLS HTTPS y no sigue redirecciones',async()=>{
 const address={family:4,address:'8.8.8.8'};
 let called;
 function request(opts,callback){
  called=opts;
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};
  req.end=()=>{
    const response=new EventEmitter();
    response.statusCode=200;
    response.headers={'content-type':'image/png'};
    callback(response);
    response.emit('data',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(12)]));
    response.emit('end');
  };
  return req;
 }
 const image=await images.fetchImageV3222('https://cdn.ejemplo.es/x.png',{
   lookup:async()=>[address],request
 });
 assert.equal(image.mime,'image/png');
 assert.equal(called.protocol,'https:');assert.equal(called.method,'GET');
 assert.equal(called.agent,false);
 called.lookup(called.hostname,{all:true},(e,addrs)=>{
   assert.equal(e,null);assert.deepEqual(addrs,[address]);
 });
 function redirected(opts,callback){
   const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};
   req.end=()=>{const r=new EventEmitter();r.statusCode=302;r.headers={location:'https://127.0.0.1/'};
     callback(r);};return req;
 }
 await assert.rejects(images.fetchImageV3222('https://cdn.ejemplo.es/x',{
   lookup:async()=>[address],request:redirected
 }),{code:'editorial_image_http_error'});
});
test('rechaza respuestas HTML disfrazadas de foto y datos grandes',async()=>{
 const address={family:4,address:'8.8.8.8'};
 function makeRequest({mime,bytes}){
  return (_opts,callback)=>{
   const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};
   req.end=()=>{
     const response=new EventEmitter();response.statusCode=200;
     response.headers={'content-type':mime};callback(response);
     response.emit('data',bytes);response.emit('end');
   };return req;
  };
 }
 const args={lookup:async()=>[address]};
 await assert.rejects(images.fetchImageV3222('https://cdn.ejemplo.es/x',{
  ...args,request:makeRequest({mime:'image/jpeg',bytes:Buffer.from('<html>not image</html>')})
 }),{code:'editorial_image_type_invalid'});
 await assert.rejects(images.fetchImageV3222('https://cdn.ejemplo.es/x',{
  ...args,request:makeRequest({mime:'image/png',bytes:Buffer.alloc(images.MAX_IMAGE_BYTES+1)})
 }),{code:'editorial_image_too_large'});
});
test('GET de previsualización es privado y POST exige documento de derechos fotográficos',()=>{
 const route=read('src/routes/admin-editorial-images-v3222.js');
 for(const token of [
  'router.use(requireAdmin)',
  "router.get('/images/:id/preview',limiter",
  "router.post('/images/:id/use',limiter",
  "confirmedPhotoRights:z.literal(true)",
  "photoRightsReference:z.string().trim().min(12).max(1000)",
  "rights_mode!=='licensed'",
  "source.rows[0].status!=='approved'",
  'fetchImageV3222',
  'saveEditorialImageV3222',
  "'Cache-Control','private, no-store'",
  'editorial_unpublish_before_reopen',
  'FOR UPDATE OF c',
  'FOR SHARE',
  "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1",
  "INSERT INTO editorial_audit",
  "'license_image'",
  "await client.query('ROLLBACK')",
  "await fs.unlink(stored.absolutePath)",
  "requiresNewReview:true,requiresNewQuality:true"
 ])assert.ok(route.includes(token),token);
});
test('la imagen se guarda solo como archivo local; la publicación conserva su propia copia',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 const review=read('src/routes/admin-editorial-review-v322.js');
 const inbox=read('src/routes/admin-editorial-inbox-v321.js');
 for(const token of [
  'ADD COLUMN IF NOT EXISTS source_image_url TEXT',
  'ADD COLUMN IF NOT EXISTS editorial_image_url TEXT',
  'ADD COLUMN IF NOT EXISTS editorial_image_rights_reference VARCHAR(1000)'
 ])assert.ok(review.includes(token),token);
 assert.ok(inbox.includes('entry.source_image_url'));
 for(const token of [
  'ADD COLUMN IF NOT EXISTS image_url TEXT','ADD COLUMN IF NOT EXISTS image_credit VARCHAR(200)',
  'safeLocalImageV3222(row.editorial_image_url)',
  "row.rights_mode!=='licensed'",
  'row.editorial_image_rights_reference',
  'image_url=$9,image_alt=$10,image_credit=$11',
  'pub.image_url,pub.image_alt,pub.image_credit',
  'ed-article-photo','ed-card-photo',
  "safeLocalImageV3222(p.image_url)"
 ])assert.ok(route.includes(token),token);
 assert.ok(images.safeLocalImageV3222('/uploads/editorial/12345678-1234-1234-1234-123456789012.jpg'));
 assert.equal(images.safeLocalImageV3222('https://a.com/a.jpg'),false);
 assert.equal(images.safeLocalImageV3222('/uploads/evil.svg'),false);
});
test('la interfaz no hace hotlink ni baja imágenes al consultar RSS',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 const reader=read('src/routes/admin-editorial-inbox-v321.js');
 const rss=read('src/services/editorial-rss-v321.js');
 assert.ok(html.includes('editorialImagePanelV3222'));
 assert.ok(html.includes('editorialImageConfirmRightsV3222'));
 assert.ok(html.includes('editorialImageRightsReferenceV3222'));
 assert.ok(js.includes('editorialImagePreviewButtonV3222'));
 assert.ok(js.includes("'/api/admin/editorial/images/'"));
 assert.ok(js.includes('confirmedPhotoRights:true'));
 assert.ok(js.includes('editorialReviewHasChangesV3216()'));
 assert.ok(js.includes('imageLocalV3222(item.editorial_image_url)'));
 assert.doesNotMatch(reader,/fetchImageV3222|saveEditorialImageV3222/);
 assert.doesNotMatch(rss,/req\.file|downloadImage|fetchImageV3222/);
 assert.ok(html.includes('/admin.js?v=3.2.23'));
});
test('mismo sistema gratis y multimedia persistente del VPS, sin romper publicación manual',()=>{
 const server=read('server.js'),route=read('src/routes/editorial-publication-v323.js');
 assert.ok(server.includes("APP_VERSION='3.2.23'"));
 assert.ok(server.includes("editorialImagesV3222Admin"));
 assert.ok(server.includes("app.use('/api/admin/editorial', editorialImagesV3222Admin)"));
 assert.ok(route.includes("admin.post('/publish/:candidateId'"));
 assert.ok(route.includes("if(!qualityReady(row))"));
 assert.ok(read('src/services/editorial-v320.js').includes('CHECK(NOT auto_publish_enabled)'));
 assert.ok(read('src/services/editorial-image-v3222.js').includes('process.env.UPLOAD_DIR'));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.23');
 assert.ok(read('public/editorial-v323.css').includes('ed-article-photo'));
});
