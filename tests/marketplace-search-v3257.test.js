'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../src/db');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=path=>fs.readFileSync(path,'utf8');
const api=read('src/routes/marketplace-v3250.js');
const src=read('src/routes/marketplace-seo-v3251.js');
const ui=read('public/marketplace-v3250.js');
const fixture={
 id:31,title:'Sofá en Valencia',description:'Sofá cómodo, a recoger en Valencia, en buen estado.',
 category:'Hogar y muebles',kind:'product',deal:'sale',city:'Valencia',
 details:{province:'Valencia'},price_cents:15999,image_urls:[],
 seller_username:'ventas',seller_name:'Vendedor de Valencia',status:'active',
 moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-14T10:00:00Z',updated_at:'2026-10-14T11:00:00Z'
};
test('Version and front-end JavaScript are V3.2.58',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.58');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.58'"));
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.ok(read('public/marketplace.html').includes('name="sort"'));
 assert.ok(read('public/marketplace.html').includes('marketplace-v3250.js?v=3.2.58'));
 assert.ok(src.includes('marketplace-seo-v3251.css?v=3.2.58'));
});
test('Authenticated search uses an allowlist for price sorting',()=>{
 assert.ok(api.includes("const SORTS={recent:"));
 assert.ok(api.includes("price_asc:'l.price_cents ASC,l.id DESC'"));
 assert.ok(api.includes("price_desc:'l.price_cents DESC,l.id DESC'"));
 assert.ok(api.includes('Object.hasOwn(SORTS,req.query.sort)'));
 assert.ok(api.includes("' ORDER BY '+SORTS[sort]+' LIMIT"));
 assert.ok(ui.includes("sort:String(f.get('sort')||'recent')"));
});
test('Only a listing owner can change a status, preserving moderation',()=>{
 assert.ok(api.includes("router.patch('/:id/status'"));
 assert.ok(api.includes('z.enum(STATUSES)'));
 assert.ok(api.includes('WHERE id=$1 AND seller_id=$2 RETURNING id,status'));
 assert.ok(!api.includes('SET status=$3,moderation_status='));
 for(const status of ['active','reserved','sold','paused'])
  assert.ok(ui.includes('data-to="'+status+'"'));
 assert.ok(ui.includes("state.mode!=='mine'"));
});
test('Public discovery search sorts safely and avoids indexing filtered copies',async()=>{
 const handle=seo.router.stack.find(layer=>layer.route?.path==='/marketplace/explorar')?.route.stack[0].handle;
 assert.equal(typeof handle,'function');
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('SELECT l.id,l.title,l.kind,l.deal'))return {rowCount:1,rows:[fixture]};
  return {rowCount:0,rows:[]};
 };
 const res={statusCode:200,html:'',setHeader(){return this;},status(v){this.statusCode=v;return this;},
  type(){return this;},send(v){this.html=v;return this;}};
 try{
  await handle({query:{q:'sofá',ciudad:'Valencia',tipo:'product',orden:'price_asc'}},res,error=>{throw error;});
  assert.equal(res.statusCode,200);
  assert.ok(res.html.includes('noindex,follow'));
  assert.ok(res.html.includes('Sofá en Valencia'));
  assert.ok(res.html.includes('name="orden"'));
  const query=calls.find(c=>c.sql.includes('SELECT l.id,l.title,l.kind,l.deal'));
  assert.ok(query.sql.includes('ORDER BY l.price_cents ASC,l.id DESC LIMIT 25 OFFSET $5'));
  assert.ok(query.args.includes('%sofá%'));
  assert.ok(query.args.includes('%Valencia%'));
  assert.ok(query.args.includes('product'));
  assert.ok(!query.sql.includes('sofá'));
 }finally{db.query=original;}
});
test('Related listings require visibility, exclude the current listing, and remain factual',()=>{
 assert.ok(src.includes("l.id<>$1 AND l.kind=$2"));
 assert.ok(src.includes("l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true"));
 assert.ok(src.includes('LIMIT 4'));
 const related={...fixture,id:42,title:'Silla de comedor'};
 const rendered=seo.listingHtml(fixture,[related]);
 assert.ok(rendered.includes('También te puede interesar'));
 assert.ok(rendered.includes('Silla de comedor'));
 assert.ok(rendered.includes('/marketplace/p/42/silla-de-comedor'));
 assert.ok(!seo.listingHtml(fixture).includes('También te puede interesar'));
 assert.ok(rendered.includes('RedLibertad no procesa pagos'));
});
