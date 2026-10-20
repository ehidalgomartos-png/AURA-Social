'use strict';
// Real PostgreSQL 18 regression; temporary tables and local CI DB only.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal GSC followup PostgreSQL test');

const report=(code,coverageState)=>({
 source:'google_search_console_url_inspection',
 verdict:code==='indexed'?'PASS':'NEUTRAL',
 coverageState,
 robotsTxtState:'ALLOWED',pageFetchState:'SUCCESSFUL'
});
test('V3.2.125 real PG18 history stores only explicit successful inspections and never displays now-hidden/private listings',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1201,'active',true),(1202,'active',false),(1203,'suspended',true)");
  await db.query("CREATE TEMP TABLE marketplace_listings(id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,status TEXT NOT NULL,moderation_status TEXT NOT NULL)");
  const add=(id,title,seller=1201,status='active',moderation='published',kind='product',deal='sale')=>
   db.query('INSERT INTO marketplace_listings(id,seller_id,title,kind,deal,status,moderation_status) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,seller,title,kind,deal,status,moderation]);
  await add(5,'Taza Roblox');
  await add(6,'Armario Turín');
  await add(7,'Taza vendedor privado',1202);
  await add(8,'Taza ocultada',1201,'active','hidden');
  await add(9,'Taza pausada',1201,'paused');
  await add(10,'Taza de vendedor suspendido',1203);
  await add(11,'Servicio de informática',1201,'active','published','service','offer');
  // A temporary mirror shadows the runtime table, avoiding permanent test writes.
  await db.query(followup.DDL[0].replace('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS'));
  await followup.ensureSchema(db);
  const discovered=report('discovered','Discovered - currently not indexed');
  const indexed=report('indexed','Submitted and indexed');
  const crawled=report('crawled','Crawled - currently not indexed');
  await followup.save(db,{listingId:'5',inspection:discovered});
  await followup.save(db,{listingId:'5',inspection:indexed});
  await followup.save(db,{listingId:'6',inspection:crawled});
  // Simulate an ad whose inspection was saved while visible but became hidden.
  for(const id of [7,8,9,10,11]){
   await db.query(followup.INSERT_SQL,[String(id),'indexed','PASS','Indexed',null]);
  }
  let history=await followup.history(db,{listingPath:seo.listingPath});
  assert.equal(history.products.length,2);
  assert.equal(history.counts.indexed,1);
  assert.equal(history.counts.crawled,1);
  assert.deepEqual(history.products.map(x=>x.id).sort(),['5','6']);
  const mug=history.products.find(x=>x.id==='5');
  assert.equal(mug.status,'indexed');
  assert.equal(mug.previousStatus,'discovered');
  assert.equal(mug.changed,true);
  assert.equal(mug.path,'/marketplace/p/5/taza-roblox');
  assert.equal(history.products.some(x=>/privado|ocultada|pausada|suspendido/i.test(x.title)),false);
  // Change product visibility AFTER inspections: no stale private history exposure.
  await db.query("UPDATE marketplace_listings SET moderation_status='hidden' WHERE id=5");
  history=await followup.history(db,{listingPath:seo.listingPath});
  assert.deepEqual(history.products.map(x=>x.id),['6']);
  assert.equal(history.counts.indexed,0);
  await db.query("UPDATE marketplace_listings SET moderation_status='published' WHERE id=5");
  // Same listing cannot grow unbounded: keep eight newest observations.
  for(let i=0;i<10;i++)await followup.save(db,{listingId:'5',inspection:indexed});
  const count=await db.query('SELECT count(*)::integer AS n FROM '+followup.TABLE+' WHERE listing_id=5');
  assert.equal(Number(count.rows[0].n),8);
  // Inspecting saved history must never call Google or update listing content.
  const original=await db.query('SELECT title FROM marketplace_listings WHERE id=5');
  assert.equal(original.rows[0].title,'Taza Roblox');
  const recordCount=await db.query('SELECT count(*)::integer AS n FROM '+followup.TABLE);
  assert.ok(Number(recordCount.rows[0].n)>=8);
  assert.doesNotMatch(JSON.stringify(history),/OAuth|access_token|PRIVATE KEY|tienda privado/i);
 }finally{await db.end();}
});
