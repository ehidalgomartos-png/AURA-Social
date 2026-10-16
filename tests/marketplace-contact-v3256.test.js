'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../src/db');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('public/marketplace-v3250.js');
const routeSource=read('src/routes/marketplace-seo-v3251.js');
test('V3.2.62 JS syntax, version, cache and smoke wiring',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'3.2.71');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.69\.1'/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.69\.1/);
 assert.match(read('public/marketplace.html'),/id="contactContext"/);
 assert.match(routeSource,/marketplace-seo-v3251\.css\?v=3\.2\.69\.1/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:marketplace-contact/);
});
test('Contact by listing ID checks active status, ownership and seller before creating a chat',async()=>{
 const start=js.indexOf('async function contactListing(id,expectedSeller=');
 const end=js.indexOf('async function init(){',start);
 assert.ok(start>=0&&end>start);
 const calls=[],messages=[];
 const item={id:25,seller_id:7,seller_username:'vendedor',status:'active',moderation_status:'published'};
 const sandbox={
  window:{currentUserId:8},location:{href:''},
  request:async(url,options)=>{
   calls.push([url,options?.method||'GET']);
   if(url==='/api/marketplace/25')return {ok:true,item};
   if(url==='/api/messages/conversations')return {ok:true,conversationId:41};
   return {ok:false};
  },
  note:s=>messages.push(s),alert:s=>messages.push(s),encodeURIComponent,
 };
 vm.createContext(sandbox);
 const extracted=js.slice(start,end);
 vm.runInContext(extracted,sandbox);
 await vm.runInContext('contactListing("25")',sandbox);
 assert.deepEqual(calls.map(a=>a[0]),['/api/marketplace/25','/api/messages/conversations']);
 assert.equal(sandbox.location.href,'/app?view=messages&conversation=41&marketListing=25');
 calls.length=0;item.seller_id=8;sandbox.location.href='';
 await vm.runInContext('contactListing("25")',sandbox);
 assert.deepEqual(calls.map(a=>a[0]),['/api/marketplace/25']);
 assert.equal(sandbox.location.href,'');
 calls.length=0;item.seller_id=7;item.status='paused';
 await vm.runInContext('contactListing("25")',sandbox);
 assert.deepEqual(calls.map(a=>a[0]),['/api/marketplace/25']);
 calls.length=0;
 await vm.runInContext('contactListing("bad")',sandbox);
 assert.equal(calls.length,0);
});
test('Contact context verifies listed seller and never sends messages automatically',()=>{
 assert.match(js,/String\(item\.seller_username\)\.toLowerCase\(\)===contactName\.toLowerCase\(\)/);
 assert.match(js,/String\(item\.seller_id\)!==String\(window\.currentUserId\)/);
 assert.match(js,/No se envía ningún mensaje automáticamente/);
 assert.match(js,/data-contact-id/);
 assert.match(js,/await setMode\('mine'\)/);
});
test('Favorites offer an explicit remove action and preserve server authorization',()=>{
 assert.match(js,/Quitar de favoritos/);
 assert.match(js,/const removing=!!item\.is_favorite/);
 assert.match(js,/method:removing\?'DELETE':'POST'/);
 assert.match(read('src/routes/marketplace-v3250.js'),/WHERE l\.id=\$2 AND l\.seller_id<>\$1/);
});
test('Public seller collection requires an active discoverable profile and only public active listings',async()=>{
 assert.match(routeSource,/router\.get\('\/marketplace\/vendedor\/:username'/);
 assert.match(routeSource,/u\.status='active' AND u\.discoverable=true AND l\.status='active' AND l\.moderation_status='published'/);
 assert.match(routeSource,/ORDER BY l\.created_at DESC,l\.id DESC LIMIT 25 OFFSET \$2/);
 assert.match(routeSource,/robots:'noindex,follow'/);
 const handler=seo.router.stack.find(layer=>layer.route?.path==='/marketplace/vendedor/:username')?.route.stack[0].handle;
 assert.equal(typeof handler,'function');
 const old=db.query,queries=[];
 const sample={id:25,title:'Taza personalizada',kind:'product',deal:'sale',city:'Valencia',
  details:{province:'Valencia'},price_cents:1599,image_urls:[],
  seller_username:'ejemplo',seller_name:'Ejemplo'};
 db.query=async(sql,args)=>{
  queries.push([sql,args]);
  if(sql.includes('SELECT l.id,l.title,l.kind,l.deal'))return {rowCount:1,rows:[sample]};
  return {rowCount:0,rows:[]};
 };
 const res={code:200,body:'',headers:{},setHeader(k,v){this.headers[k]=v;return this;},
  status(code){this.code=code;return this;},type(){return this;},
  send(body){this.body=body;return this;},redirect(code,url){this.code=code;this.redirectUrl=url;return this;}};
 try{
  await handler({params:{username:'ejemplo'},query:{}},res,e=>{throw e;});
  assert.equal(res.code,200);
  assert.match(res.body,/Anuncios de Ejemplo/);
  assert.match(res.body,/noindex,follow/);
  assert.match(res.body,/\/marketplace\/p\/25\/taza-personalizada/);
  assert.deepEqual(queries.find(([sql])=>sql.includes('SELECT l.id,l.title,l.kind,l.deal'))[1],['ejemplo',0]);
 }finally{db.query=old;}
});
test('Seller identity, profile and transaction safety remain visible in public listing',()=>{
 const row={id:25,title:'Taza personalizada',description:'Taza nueva con nombre personalizado y envío acordado.',
  kind:'product',deal:'sale',category:'Tazas',city:'Valencia',price_cents:1599,
  image_urls:[],details:{province:'Valencia'},status:'active',moderation_status:'published',
  seller_username:'ejemplo',seller_name:'Ejemplo',created_at:'2026-10-14T13:00:00Z',
  updated_at:'2026-10-14T14:00:00Z'};
 const html=seo.listingHtml(row);
 assert.match(html,/\/marketplace\/vendedor\/ejemplo/);
 assert.match(html,/\/marketplace\?contact=ejemplo&amp;listing=25/);
 assert.match(html,/\/perfil\/ejemplo/);
 assert.match(html,/RedLibertad no interviene|Las transacciones no se realizan dentro de RedLibertad|RedLibertad no procesa pagos ni garantiza las transacciones/);
 assert.doesNotMatch(html,/aggregateRating/);
});
