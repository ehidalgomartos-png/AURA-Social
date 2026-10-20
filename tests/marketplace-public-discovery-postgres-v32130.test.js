'use strict';
// V3.2.130 real PostgreSQL 18; isolated, disposable schema on localhost CI only.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const service=require('../src/services/marketplace-public-discovery-v32130');
const audit=require('../src/services/marketplace-seo-audit-v32120');
const seo=require('../src/routes/marketplace-seo-v3251');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal marketplace public discovery PostgreSQL test');

test('V3.2.130 PG18 related links exclude private ads and wrong sale/buy operation, while duplicate warnings use only actual public sample',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 const schema='marketplace_public_discovery_ci_v32130';
 try{
  await db.query('CREATE SCHEMA '+schema);
  await db.query('SET search_path TO '+schema);
  await db.query('CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(100,'active',true),(101,'active',false),(102,'suspended',true)");
  await db.query(
   "CREATE TABLE marketplace_listings(id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL REFERENCES users(id),title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'product',deal TEXT NOT NULL DEFAULT 'sale',price_cents BIGINT NOT NULL DEFAULT 1200,image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'active',moderation_status TEXT NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const insert=async(id,title,{category='Video Juegos',city='Valencia',kind='product',deal='sale',
   seller=100,status='active',moderation='published',hours=6}={})=>
   db.query("INSERT INTO marketplace_listings(id,seller_id,title,description,category,city,kind,deal,status,moderation_status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()-($11::integer*interval '1 hour'),now()-($11::integer*interval '1 hour'))",
   [id,seller,title,'Descripción original completa del producto y sus características.',
    category,city,kind,deal,status,moderation,hours]);
  await insert(5,'Taza Roblox');
  await insert(6,'Taza Roblox',{city:'Madrid',hours:2});
  await insert(7,'Taza azul',{category:'Tazas',hours:4});
  await insert(8,'Busco Taza Roblox',{deal:'buy',hours:0});
  await insert(9,'Taza privada pausada',{status:'paused',hours:0});
  await insert(10,'Taza oculta',{moderation:'hidden',hours:0});
  await insert(11,'Taza usuario privado',{seller:101,hours:0});
  await insert(12,'Taza usuario suspendido',{seller:102,hours:0});
  await insert(13,'Servicio profesional',{kind:'service',deal:'offer',hours:0});
  await insert(14,'Taza Nintendo',{city:'Almería',hours:1});
  await insert(15,'Taza viaje',{category:'Tazas',hours:3});
  await insert(16,'Busco Taza videojuego',{deal:'buy',hours:1});
  const related=await db.query(service.PUBLIC_RELATED_SQL,service.relatedArgs({
   id:5,kind:'product',deal:'sale',category:'Video Juegos',city:'Valencia'
  }));
  assert.deepEqual(related.rows.map(row=>String(row.id)),['14','6','15','7']);
  assert.ok(related.rows.every(row=>row.kind==='product'&&row.deal==='sale'));
  assert.ok(related.rows.every(row=>row.id!==5));
  assert.equal(related.rows.some(row=>['8','9','10','11','12','13','16'].includes(String(row.id))),false);
  const wanted=await db.query(service.PUBLIC_RELATED_SQL,service.relatedArgs({
   id:8,kind:'product',deal:'buy',category:'Video Juegos',city:'Valencia'
  }));
  assert.deepEqual(wanted.rows.map(x=>String(x.id)),['16']);
  const sample=(await db.query(audit.sampleSql)).rows;
  assert.equal(sample.some(row=>[9,10,11,12].includes(Number(row.id))),false);
  const duplicates=service.duplicateTitleCandidates(sample,{listingPath:seo.listingPath});
  assert.equal(duplicates.sampleSize,8);
  assert.equal(duplicates.groupCount,1);
  assert.equal(duplicates.groups[0].title,'Taza Roblox');
  assert.equal(duplicates.groups[0].count,2);
  assert.deepEqual(duplicates.groups[0].items.map(x=>x.id).sort(),['5','6']);
  assert.doesNotMatch(JSON.stringify(duplicates),/Taza oculta|Taza usuario privado|Taza usuario suspendido|Taza privada pausada/);
  // Make one formerly public duplicate private, its title must vanish.
  await db.query("UPDATE marketplace_listings SET moderation_status='hidden' WHERE id=6");
  const after=service.duplicateTitleCandidates((await db.query(audit.sampleSql)).rows,{listingPath:seo.listingPath});
  assert.equal(after.groupCount,0);
  const afterRelated=await db.query(service.PUBLIC_RELATED_SQL,service.relatedArgs({
   id:5,kind:'product',deal:'sale',category:'Video Juegos',city:'Valencia'
  }));
  assert.equal(afterRelated.rows.some(x=>Number(x.id)===6),false);
  // No code in these READ-ONLY operations edited listings or product fields.
  const stored=await db.query("SELECT title,category,image_urls,price_cents FROM marketplace_listings WHERE id=5");
  assert.equal(stored.rows[0].title,'Taza Roblox');
  assert.equal(stored.rows[0].category,'Video Juegos');
  assert.equal(stored.rows[0].price_cents,'1200');
 }finally{
  await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await db.end();
 }
});
