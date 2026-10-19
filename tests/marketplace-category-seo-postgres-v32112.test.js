'use strict';
// Integration runs exclusively against CI localhost PostgreSQL 18; never production.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const seo=require('../src/marketplace-category-seo-v32112');
const url=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(url).hostname;}catch(_){return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing non-localhost PostgreSQL for category SEO integration test');
test('SQL-backed category pages and sitemap never expose hidden, non-public or wrong-condition listings',async()=>{
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000});
 await client.connect();
 try{
  // TEMP tables shadow unrelated persistent CI test fixtures on this one client.
  await client.query("CREATE TEMP TABLE users (id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)");
  await client.query(
   "CREATE TEMP TABLE marketplace_listings ("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,"+
   "title TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,price_cents BIGINT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await client.query("INSERT INTO users(id,status,discoverable) VALUES (1121,'active',true),(1122,'active',false),(1123,'suspended',true)");
  const insert=async(id,kind,deal,category,condition,status='active',moderation='published',sellerId=1121)=>{
   await client.query(
    "INSERT INTO marketplace_listings(id,seller_id,kind,deal,title,category,city,price_cents,details,status,moderation_status) "+
    "VALUES($1,$2,$3,$4,$5,$6,'Valencia',1000,$7::jsonb,$8,$9)",
    [id,sellerId,kind,deal,'Anuncio real '+id,category,JSON.stringify(condition?{condition}:{}),status,moderation]
   );
  };
  for(let id=1;id<=5;id++)await insert(id,'product','sale','Hogar y muebles','used');
  await insert(6,'product','sale','Hogar y muebles','used','active','hidden');
  await insert(7,'product','sale','Hogar y muebles','used','active','published',1122);
  await insert(8,'product','sale','Hogar y muebles','new');
  await insert(9,'product','buy','Hogar y muebles','used');
  await insert(10,'product','sale','Hogar y muebles','used','sold');
  await insert(11,'service','offer','Profesionales',null);
  await insert(12,'service','offer','Profesionales',null);
  await insert(13,'property','sale','Pisos',null);
  await insert(14,'product','sale','Hogar y muebles','used','active','published',1123);
  await insert(15,'product','sale','Móviles y telefonía','used');
  const counts=(await client.query(seo.countQuery())).rows[0];
  assert.equal(Number(counts.segunda_mano),6);
  assert.equal(Number(counts.used_category_diversity),2);
  assert.equal(Number(counts.muebles),5);
  assert.equal(Number(counts.moviles),1);
  assert.equal(Number(counts.vehiculos),0);
  assert.equal(Number(counts.servicios),2);
  assert.equal(Number(counts.inmuebles),1);
  const furniture=seo.bySlug('muebles-segunda-mano');
  assert.equal(seo.canIndex(counts,furniture),true);
  const visible=(await client.query(seo.listingQuery(furniture))).rows;
  assert.equal(visible.length,5);
  assert.deepEqual(visible.map(r=>Number(r.id)).sort((a,b)=>a-b),[1,2,3,4,5]);
  assert.equal(visible.every(r=>r.details.condition==='used'),true);
  const xml=seo.sitemapXml(counts);
  assert.match(xml,/\/marketplace\/segunda-mano<\/loc>/);
  assert.match(xml,/\/marketplace\/muebles-segunda-mano<\/loc>/);
  assert.doesNotMatch(xml,/\/marketplace\/servicios<\/loc>|\/marketplace\/inmuebles<\/loc>|\/marketplace\/moviles-segunda-mano<\/loc>/);
  await client.query("UPDATE marketplace_listings SET status='paused' WHERE id=5");
  const less=(await client.query(seo.countQuery())).rows[0];
  assert.equal(Number(less.muebles),4);
  assert.equal(seo.canIndex(less,furniture),false);
  assert.doesNotMatch(seo.sitemapXml(less),/\/marketplace\/muebles-segunda-mano<\/loc>/);
  assert.match(seo.sitemapXml(less),/\/marketplace\/segunda-mano<\/loc>/);
 }finally{await client.end();}
});
