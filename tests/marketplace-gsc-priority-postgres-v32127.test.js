'use strict';
// V3.2.127 real PostgreSQL 18; isolated disposable localhost CI schema.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const pending=require('../src/services/marketplace-gsc-uninspected-v32126');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');
const databaseUrl=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(databaseUrl).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal GSC priority PostgreSQL test');

test('V3.2.127 PG18 prioritizes the entire public eligible catalogue before pagination, over age, photos and description',async()=>{
 const db=new Client({connectionString:databaseUrl,connectionTimeoutMillis:5000});
 await db.connect();
 const schema='gsc_priority_ci_v32127';
 try{
  await db.query('CREATE SCHEMA '+schema);
  await db.query('SET search_path TO '+schema);
  await db.query('CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES (100,'active',true),(101,'active',false),(102,'suspended',true)");
  await db.query("CREATE TABLE marketplace_listings(id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL REFERENCES users(id),title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Tazas',image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,kind TEXT NOT NULL DEFAULT 'product',deal TEXT NOT NULL DEFAULT 'sale',status TEXT NOT NULL DEFAULT 'active',moderation_status TEXT NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await followup.ensureSchema(db);
  const make=async(id,{days=1,title='Taza personalizada '+id,description='Taza de cerámica con una descripción original suficientemente detallada.',images=['/uploads/taza-'+id+'.webp'],category='Tazas',seller=100,kind='product',deal='sale',status='active',moderation='published',shift=0}={})=>{
   await db.query("INSERT INTO marketplace_listings(id,seller_id,title,description,category,image_urls,kind,deal,status,moderation_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,now()-($11::int * interval '1 day'),now()+($12::int * interval '1 minute'))",
    [id,seller,title,description,category,JSON.stringify(images),kind,deal,status,moderation,days,shift]);
  };
  await make(1,{days:40,shift:1});
  await make(2,{days:10,shift:200});
  await make(3,{days:1,shift:300});
  await make(4,{days:90,images:[],shift:500});
  await make(5,{days:60,description:'Muy breve',shift:400});
  await make(6,{days:55,title:'Taza',shift:600});
  await make(7,{days:80}); // inspected recently, excluded
  await make(8,{days:120,seller:101});
  await make(9,{days:130,seller:102});
  await make(10,{days:140,moderation:'hidden'});
  await make(11,{days:150,status:'paused'});
  await make(12,{days:160,deal:'buy'});
  await make(13,{days:170,kind:'service',deal:'offer'});
  await make(14,{days:25,shift:900});
  await make(15,{days:100,shift:2}); // inspected 91 days ago: pending again
  await make(16,{days:35,images:['https://remote.example/private.png'],shift:800});
  await db.query(followup.INSERT_SQL,['7','indexed','PASS','Indexed',null]);
  await db.query("INSERT INTO "+followup.TABLE+
   "(listing_id,status_code,verdict,coverage_state,checked_at) VALUES(15,'indexed','PASS','Indexed',now()-interval '91 days')");
  let priority=await pending.pending(db,{listingPath:seo.listingPath,order:'priority'});
  assert.equal(priority.order,'priority');
  assert.equal(priority.totalPublicSaleProducts,10);
  assert.equal(priority.withoutRecentInspection,9);
  assert.equal(priority.inspectedInWindow,1);
  assert.deepEqual(priority.products.map(row=>row.id),['15','1','14','2','3','4','5','6','16']);
  assert.deepEqual(priority.products.map(row=>row.reviewPriority.code),
   ['review_first','review_first','review_first','review_first','ready_recent','improve_card','improve_card','improve_card','improve_card']);
  assert.ok(priority.products[5].reviewPriority.attention.some(note=>note.includes('fotografía')));
  assert.ok(priority.products[6].reviewPriority.attention.some(note=>note.includes('Descripción')));
  assert.ok(priority.products[7].reviewPriority.attention.some(note=>note.includes('Título')));
  assert.ok(priority.products.every(row=>!['7','8','9','10','11','12','13'].includes(row.id)));
  const recent=await pending.pending(db,{listingPath:seo.listingPath,order:'recent'});
  assert.equal(recent.products[0].id,'14'); // Most recently modified != priority.
  assert.ok(!Object.hasOwn(recent.products[0],'reviewPriority'));
  const filtered=await pending.pending(db,{listingPath:seo.listingPath,order:'priority',search:'personalizada 1'});
  assert.equal(filtered.products.every(x=>x.title.toLowerCase().includes('personalizada 1')),true);
  assert.equal(filtered.withoutRecentInspection,4); // IDs 1,14,15,16; 13 is service.
  // An already-inspected product never gets reintroduced solely by quality.
  const after=await pending.pending(db,{listingPath:seo.listingPath,order:'priority'});
  assert.equal(after.products.some(x=>x.id==='7'),false);
  // A public product which becomes hidden cannot appear in any priority page.
  await db.query("UPDATE marketplace_listings SET moderation_status='hidden' WHERE id=15");
  priority=await pending.pending(db,{listingPath:seo.listingPath,order:'priority'});
  assert.equal(priority.products.some(x=>x.id==='15'),false);
  assert.equal(priority.products[0].id,'1');
  // The product records and users are unchanged by GET-only ordering.
  const original=await db.query('SELECT title,description,image_urls FROM marketplace_listings WHERE id=1');
  assert.equal(original.rows[0].title,'Taza personalizada 1');
  assert.equal(original.rows[0].image_urls.length,1);
 }finally{
  await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await db.end();
 }
});
