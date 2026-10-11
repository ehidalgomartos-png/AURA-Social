'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const service=require('../src/services/editorial-v320');
test('categorías editoriales previstas',()=>{
  assert.equal(service.CATEGORIES.length,6);
  assert.ok(service.CATEGORIES.includes('tecnologia'));
});
test('validación de URL RSS restringe HTTPS y destinos especiales',()=>{
  for(const url of ['http://example.com/rss','https://localhost/feed','https://127.0.0.1/rss','https://[::1]/rss','https://user:pass@example.com/rss','https://example.com:8443/rss','https://example.com/#fragment','https://myhost.local/feed']){
    assert.equal(service.validateFeedUrl(url),null,url);
  }
  assert.equal(service.validateFeedUrl('https://example.com/feed.xml'),'https://example.com/feed.xml');
});
test('medios restringidos a rutas locales simples',()=>{
  for(const url of ['https://example.com/photo.jpg','/api/admin','/uploads/../private','/uploads//test.png','javascript:alert(1)'])assert.equal(service.validateLocalImage(url),null);
  assert.equal(service.validateLocalImage('/uploads/avatar_123.png'),'/uploads/avatar_123.png');
});
test('ingestión y auto publicación no se pueden activar en V3.2',()=>{
  const schema=read('src/services/editorial-v320.js');
  assert.match(schema,/CHECK\(NOT ingestion_enabled\)/);
  assert.match(schema,/CHECK\(NOT auto_publish_enabled\)/);
  assert.match(schema,/review_required BOOLEAN NOT NULL DEFAULT TRUE CHECK\(review_required\)/);
  const admin=read('src/routes/admin-editorial-v320.js');
  assert.doesNotMatch(admin,/router\.(?:post|put|patch)\('\/(?:publish|ingest|run|settings)/);
});
test('centro editorial solo visible con rol admin y guarda auditoría',()=>{
  const source=read('src/routes/admin-editorial-v320.js');
  assert.match(source,/router\.use\(requireAdmin\)/);
  assert.match(source,/editorial_audit/);
  assert.match(source,/checkCommunity\(client,d\.communityId,req\.user\.id\)/);
});
test('servicio editorial aislado: no crea cuentas ni publicaciones',()=>{
  const serviceCode=read('src/services/editorial-v320.js');
  const routeCode=read('src/routes/admin-editorial-v320.js');
  for(const sql of [/INSERT INTO users\b/,/INSERT INTO posts\b/,/INSERT INTO community_posts\b/]){
    assert.doesNotMatch(serviceCode,sql);assert.doesNotMatch(routeCode,sql);
  }
});
test('versión y panel conectados sin alterar los endpoints existentes',()=>{
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.34'/);
  assert.match(read('server.js'),/app\.use\('\/api\/admin\/editorial', adminEditorialV320Routes\)/);
  assert.match(read('public/admin.html'),/id="editorialCenter"/);
  assert.match(read('public/admin.js'),/loadEditorialV320\(\)/);
});
