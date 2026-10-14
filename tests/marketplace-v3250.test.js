'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.2.50 mounts marketplace without replacing existing social routes',()=>{
 const server=read('server.js');
 assert.match(server,/app\.use\('\/api\/marketplace',marketplaceRoutes\)/);
 assert.match(server,/app\.get\('\/marketplace',sendHtmlShell\('marketplace\.html'\)\)/);
 assert.match(server,/const APP_VERSION='3\.2\.50'/);
 assert.match(server,/app\.use\('\/api\/messages', messageRoutes\)/);
});

test('marketplace backend validates ownership and filters blocked users',()=>{
 const api=read('src/routes/marketplace-v3250.js');
 for(const op of ["router.get('/')","router.get('/mine'","router.get('/favorites'","router.post('/')","router.patch('/:id'","router.delete('/:id'","router.post('/:id/report'","router.post('/admin/:id/moderate'"]){
  assert.ok(api.includes(op.replace(/\)$/, '')+','),op);
 }
 assert.match(api,/requireAuth/);
 assert.match(api,/seller_id=\$2/);
 assert.match(api,/blocks b WHERE/);
 assert.match(api,/z\.enum\(KINDS\)/);
 assert.match(api,/UNIQUE\(listing_id,reporter_id\)/);
 assert.match(api,/moderation_status[\\s\\S]*?published/);
});

test('marketplace exposes products services and property with no payment capture',()=>{
 const html=read('public/marketplace.html');
 const js=read('public/marketplace-v3250.js');
 for(const term of ['Productos','Servicios','Inmobiliaria','Mis anuncios','Favoritos','Publicar anuncio','Enviar mensaje al vendedor']){
  assert.ok((html+js).includes(term),term);
 }
 assert.match(js,/\/api\/messages\/conversations/);
 assert.match(js,/\/api\/media\/upload/);
 assert.doesNotMatch(js,/stripe|paypal|card_number/i);
});

test('mobile social dock remains unchanged and marketplace stays accessible',()=>{
 const html=read('public/app.html');
 const dock=html.match(/<nav class="bottom-nav"[\s\S]+?<\/nav>/)?.[0]||'';
 assert.equal((dock.match(/<button\b/g)||[]).length,5);
 assert.match(html,/href="\/marketplace"/);
 assert.match(html,/marketplace-entry-v3250\.css/);
 assert.doesNotMatch(html,/href="\/marketplace-v3250\.css"/);
});
