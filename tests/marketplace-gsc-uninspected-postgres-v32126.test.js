'use strict';
// Real PostgreSQL 18, isolated and disposable schema in localhost CI only.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const service=require('../src/services/marketplace-gsc-uninspected-v32126');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal GSC uninspected PostgreSQL test');

test('V3.2.126 real PG18 exposes only active public sale products lacking recent saved inspections, including page/search',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 const schema='gsc_pending_ci_v32126';
 try{
  await db.query('CREATE SCHEMA '+schema);
  await db.query('SET search_path TO '+schema);
  await db.query('CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(100,'active',true),(101,'active',false),(102,'suspended',true)");
  await db.query("CREATE TABLE marketplace_listings(id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL REFERENCES users(id),title TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Tazas',kind TEXT NOT NULL DEFAULT 'product',deal TEXT NOT NULL DEFAULT 'sale',status TEXT NOT NULL DEFAULT 'active',moderation_status TEXT NOT NULL DEFAULT 'published',updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const add=(id,title,changes={})=>db.query(
   'INSERT INTO marketplace_listings(id,seller_id,title,category,kind,deal,status,moderation_status,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+($9::int * interval \'1 minute\'))',
   [id,changes.seller??100,title,changes.category??'Tazas',changes.kind??'product',
    changes.deal??'sale',changes.status??'active',changes.moderation??'published',changes.shift??0]
  );
  await followup.ensureSchema(db);
  for(let id=1;id<=45;id++)await add(id,'Taza '+id,{shift:id});
  await add(46,'Anuncio de vendedor privado',{seller:101,shift:46});
  await add(47,'Anuncio de vendedor suspendido',{seller:102,shift:47});
  await add(48,'Anuncio privado oculto',{moderation:'hidden',shift:48});
  await add(49,'Anuncio pausado',{status:'paused',shift:49});
  await add(50,'Busco taza',{deal:'buy',shift:50});
  await add(51,'Servicio de reparación',{kind:'service',deal:'offer',shift:51});
  await add(52,'Taza Robot',{shift:52});
  await add(53,'Taza%_literal',{shift:53});
  // Current manual inspection is evidence of RedLibertad having inspected
  // the product; this says NOTHING about Google indexing the product.
  await db.query(followup.INSERT_SQL,['45','unknown','NEUTRAL','Google does not recognize URL',null]);
  // Old inspections are outside the retention window and count as PENDING AGAIN.
  await db.query("INSERT INTO "+followup.TABLE+
   "(listing_id,status_code,verdict,coverage_state,checked_at) VALUES (44,'indexed','PASS','Indexed',now()-interval '91 days')");
  const first=await service.pending(db,{page:1,search:'',listingPath:seo.listingPath});
  assert.equal(first.source,'public_products_without_recent_saved_manual_inspection');
  assert.equal(first.totalPublicSaleProducts,47);
  assert.equal(first.withoutRecentInspection,46);
  assert.equal(first.inspectedInWindow,1);
  assert.equal(first.products.length,20);
  assert.equal(first.products[0].id,'53');
  assert.equal(first.hasNext,true);
  assert.equal(first.hasPrevious,false);
  assert.equal(first.products.some(p=>p.id==='45'),false);
  assert.equal(first.products.some(p=>Number(p.id)>=46&&Number(p.id)<=51),false);
  assert.match(first.note,/NO significa que Google desconozca la URL/);
  const second=await service.pending(db,{page:2,search:'',listingPath:seo.listingPath});
  assert.equal(second.products.length,20);
  assert.equal(second.hasPrevious,true);
  assert.equal(second.hasNext,true);
  const third=await service.pending(db,{page:3,search:'',listingPath:seo.listingPath});
  assert.equal(third.products.length,6);
  assert.equal(third.hasNext,false);
  // 44 is recent in descending updated_at order and belongs on page 1;
  // the final page contains the oldest remaining public entries.
  assert.ok(first.products.some(p=>p.id==='44'));
  assert.ok(third.products.some(p=>p.id==='1'));
  assert.ok(!third.products.some(p=>p.id==='45'));
  assert.equal(new Set([...first.products,...second.products,...third.products].map(x=>x.id)).size,46);
  const literal=await service.pending(db,{page:1,search:'%_',listingPath:seo.listingPath});
  assert.equal(literal.totalPublicSaleProducts,1);
  assert.equal(literal.products.length,1);
  assert.equal(literal.products[0].id,'53');
  const robot=await service.pending(db,{page:1,search:'Robot',listingPath:seo.listingPath});
  assert.equal(robot.products.length,1);
  assert.equal(robot.products[0].id,'52');
  // A formerly valid and non-inspected product that is hidden must be gone.
  await db.query("UPDATE marketplace_listings SET moderation_status='hidden' WHERE id=53");
  const now=await service.pending(db,{page:1,search:'',listingPath:seo.listingPath});
  assert.equal(now.totalPublicSaleProducts,46);
  assert.equal(now.withoutRecentInspection,45);
  assert.ok(now.products.every(item=>item.id!=='53'));
  // No product or seller content has been mutated by reading the backlog.
  const check=await db.query('SELECT title,kind,deal FROM marketplace_listings WHERE id=52');
  assert.equal(check.rows[0].title,'Taza Robot');
 }finally{
  await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await db.end();
 }
});
