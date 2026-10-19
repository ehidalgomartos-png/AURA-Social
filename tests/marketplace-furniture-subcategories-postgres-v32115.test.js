'use strict';
// PostgreSQL 18 regression: inspect only ephemeral CI tables on localhost.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const seo=require('../src/marketplace-category-seo-v32112');
const family=require('../src/services/marketplace-furniture-family-v32114');
const url=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(url).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing non-local furniture-category PostgreSQL integration test');
test('CSV Armarios Puertas Batientes: matching SQL and JS yields populated SEO category',async()=>{
 const db=new Client({connectionString:url,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1151,'active',true),(1152,'active',false),(1153,'suspended',true)");
  await db.query("CREATE TEMP TABLE marketplace_listings (id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,price_cents BIGINT NOT NULL,image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL,moderation_status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const insert=async(id,category,title,details={},options={})=>db.query(
   "INSERT INTO marketplace_listings(id,seller_id,kind,deal,title,category,city,price_cents,details,status,moderation_status) VALUES($1,$2,$3,$4,$5,$6,'Valencia',23500,$7::jsonb,$8,$9)",
   [id,options.seller||1151,options.kind||'product',options.deal||'sale',title,category,JSON.stringify(details),options.status||'active',options.moderation||'published']
  );
  for(let i=1;i<=5;i++)await insert(i,'Armarios Puertas Batientes','Armario Turin '+i+' Puertas 2 Cajones - Blanco',i===2?{condition:'new'}:{});
  await insert(6,'Armarios Puertas Correderas','Armario de roble correderas');
  await insert(7,'Puertas Batientes','Bisagras y puertas para muebles');
  await insert(8,'Tazas','Taza decorada con armario');
  await insert(9,'Armarios Puertas Batientes','Armario oculto',{}, {moderation:'hidden'});
  await insert(10,'Armarios Puertas Batientes','Armario de vendedor privado',{}, {seller:1152});
  await insert(11,'Armarios Puertas Batientes','Armario vendido',{}, {status:'sold'});
  await insert(12,'Armarios Puertas Batientes','Busco armario',{}, {deal:'buy'});
  await insert(13,'Armarios Puertas Batientes','Armario de vendedor suspendido',{}, {seller:1153});
  const counts=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(counts.muebles_catalogo),6);
  assert.equal(Number(counts.muebles),0);
  assert.equal(seo.canIndex(counts,seo.bySlug('muebles')),true);
  assert.equal(seo.canIndex(counts,seo.bySlug('muebles-segunda-mano')),false);
  const rows=(await db.query(seo.listingQuery(seo.bySlug('muebles')))).rows;
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(x=>Number(x.id)).sort((a,b)=>a-b),[1,2,3,4,5,6]);
  for(const listing of rows){
   assert.equal(family.isFurnitureListing(listing),true,listing.category);
   assert.equal(seo.qualifiedCategoryForListing(listing,counts)?.path,'/marketplace/muebles');
  }
  assert.ok(rows.some(x=>x.details.condition===undefined));
  assert.ok(rows.some(x=>x.details.condition==='new'));
  assert.match(seo.sitemapXml(counts),/\/marketplace\/muebles<\/loc>/);
  assert.doesNotMatch(seo.sitemapXml(counts),/\/marketplace\/muebles-segunda-mano<\/loc>/);
  await db.query("UPDATE marketplace_listings SET status='paused' WHERE id IN (1,2)");
  const fewer=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(fewer.muebles_catalogo),4);
  assert.equal(seo.canIndex(fewer,seo.bySlug('muebles')),false);
  assert.doesNotMatch(seo.sitemapXml(fewer),/\/marketplace\/muebles<\/loc>/);
 }finally{await db.end();}
});
