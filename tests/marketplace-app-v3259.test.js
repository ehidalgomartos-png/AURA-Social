'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const db=require('../src/db');
const seo=require('../src/routes/marketplace-seo-v3251');
const {icon}=require('../src/marketplace-icons-v3259');
const read=p=>fs.readFileSync(p,'utf8');
const route=p=>seo.router.stack.find(x=>x.route?.path===p)?.route.stack[0].handle;
const response=()=>({statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},type(v){this.contentType=v;return this;},send(v){this.body=v;return this;},status(v){this.statusCode=v;return this;},sendStatus(v){this.statusCode=v;return this;}});
test('Independent marketplace release: separate manifest and valid PWA scripts',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.64.3');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.64.3'"));
 for(const file of ['public/marketplace-pwa-v3259.js','public/marketplace-sw-v3259.js'])assert.doesNotThrow(()=>new vm.Script(read(file)));
 assert.ok(read('public/manifest.webmanifest').includes('"id": "/app"'));
 assert.ok(read('public/marketplace.html').includes('href="/marketplace/manifest.webmanifest"'));
 assert.ok(read('src/routes/marketplace-seo-v3251.js').includes('<link rel="manifest" href="/marketplace/manifest.webmanifest"'));
 const out=response();route('/marketplace/manifest.webmanifest')({},out);
 const manifest=JSON.parse(out.body);
 assert.equal(manifest.id,'/marketplace');assert.equal(manifest.scope,'/marketplace');
 assert.equal(manifest.start_url,'/marketplace/explorar');assert.equal(manifest.display,'standalone');
 assert.equal(manifest.short_name,'Marketplace');
 assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
 assert.ok(manifest.icons.every(i=>i.src.startsWith('/marketplace/icon-')&&i.type==='image/png'));
 assert.ok(read('public/marketplace-pwa-v3259.js').includes("scope:'/marketplace'"));
});
test('Marketplace icon endpoints produce true 192/512 PNG with unique icon data',()=>{
 const handler=route('/marketplace/icon-:size.png');assert.equal(typeof handler,'function');
 for(const size of [192,512]){
  const out=response();handler({params:{size:String(size)}},out);
  assert.equal(out.contentType,'image/png');assert.ok(Buffer.isBuffer(out.body));
  assert.deepEqual([...out.body.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(out.body.readUInt32BE(16),size);assert.equal(out.body.readUInt32BE(20),size);
  assert.deepEqual(out.body,icon(size));
 }
 const invalid=response();handler({params:{size:'123'}},invalid);assert.equal(invalid.statusCode,404);
});
test('Marketplace worker does not cache private pages or API responses',()=>{
 const sw=read('public/marketplace-sw-v3259.js');
 assert.ok(sw.includes("request.method!=='GET'"));
 assert.ok(sw.includes("request.mode!=='navigate'"));
 assert.ok(sw.includes('fetch(request)'));
 assert.ok(!sw.includes('caches.open('));assert.ok(!sw.includes('cache.put('));
});
test('Guests see public catalogue immediately, contact/publish/report deep links are preserved',()=>{
 const s=read('public/marketplace-v3250.js');
 assert.ok(s.includes("location.replace('/marketplace/explorar')"));
 assert.ok(s.includes("me.status===401&&!explicitIntent"));
 assert.ok(s.includes("'publicar','contact','listing','report'"));
 assert.ok(s.includes("get('publicar')==='1')openEditor()"));
 assert.ok(read('src/routes/marketplace-seo-v3251.js').includes('href="/marketplace?publicar=1"'));
});
test('Typed XML category sitemap routes enforce public visibility and parameterized type',async()=>{
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('count(*)::integer AS total'))return {rows:[{total:1}],rowCount:1};
  if(sql.includes('SELECT l.id,l.title,l.image_urls,l.updated_at'))return {rows:[{id:7,title:'Taza para regalo',image_urls:[],updated_at:'2026-10-14T10:00:00.000Z'}],rowCount:1};
  return {rows:[],rowCount:0};
 };
 try{
  for(const [label,kind] of Object.entries({productos:'product',servicios:'service',inmuebles:'property'})){
   const indexFn=route('/sitemap-marketplace-'+label+'.xml'),pageFn=route('/sitemap-marketplace-'+label+'-:page.xml');
   assert.equal(typeof indexFn,'function');assert.equal(typeof pageFn,'function');
   const a=response();await indexFn({},a,e=>{throw e;});
   assert.ok(a.body.includes('/sitemap-marketplace-'+label+'-1.xml'));
   const b=response();await pageFn({params:{page:'1'}},b,e=>{throw e;});
   assert.ok(b.body.includes('/marketplace/p/7/taza-para-regalo'));
   assert.ok(b.body.includes('<lastmod>2026-10-14T10:00:00.000Z</lastmod>'));
   const cc=calls.filter(c=>c.args?.[0]===kind);
   assert.equal(cc.length,2);
   assert.ok(cc.every(c=>c.sql.includes("l.status='active'")&&c.sql.includes("l.moderation_status='published'")&&c.sql.includes("u.status='active'")&&c.sql.includes('u.discoverable=true')&&c.sql.includes('l.kind=$1')));
   assert.deepEqual(cc[1].args,[kind,2000,0]);
  }
  const invalid=response();
  await route('/sitemap-marketplace-inmuebles-:page.xml')({params:{page:'0'}},invalid,e=>{throw e;});
  assert.equal(invalid.statusCode,404);
 }finally{db.query=original;}
});
test('Sitemaps indexed in robots and sitemap-index; old Marketplace sitemap retained',()=>{
 const s=read('server.js');
 for(const label of ['productos','servicios','inmuebles']){
  assert.ok(s.includes("origin+'/sitemap-marketplace-"+label+".xml'"));
  assert.ok(s.includes('Sitemap: '+String.fromCharCode(36,123)+'origin}/sitemap-marketplace-'+label+'.xml'));
 }
 assert.ok(s.includes("origin+'/sitemap-marketplace-1.xml'"));
 assert.ok(s.includes('Sitemap: '+String.fromCharCode(36,123)+'origin}/sitemap-marketplace.xml'));
});
