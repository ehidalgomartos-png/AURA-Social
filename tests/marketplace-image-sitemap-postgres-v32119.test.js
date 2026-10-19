'use strict';
// All fixtures live in CI-local temporary tables; never access production.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const seo=require('../src/routes/marketplace-seo-v3251');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal PostgreSQL Marketplace sitemap integration test');
test('real public image sitemap query excludes private listings and serializes multiple validated pictures',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users (id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1191,'active',true),(1192,'active',false),(1193,'suspended',true)");
  await db.query(
   "CREATE TEMP TABLE marketplace_listings("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,"+
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const photos=[
   '/uploads/armario119-1.jpg',
   '/uploads/armario119-2.webp',
   '/uploads/armario119-3.png',
   '/uploads/armario119-3.png',
   'https://outside.example.com/private.jpg',
   '/uploads/armario119-4.jpg',
   '/uploads/armario119-5.jpg'
  ];
  async function insert(id,{status='active',moderation='published',seller=1191,media=photos,kind='product'}={}){
   await db.query(
    'INSERT INTO marketplace_listings (id,seller_id,title,kind,image_urls,status,moderation_status) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)',
    [id,seller,'Armario Turín '+id,kind,JSON.stringify(media),status,moderation]
   );
  }
  await insert(119);
  await insert(120,{media:['/uploads/sofa-120.png'],kind:'service'});
  await insert(121,{moderation:'hidden'});
  await insert(122,{seller:1192});
  await insert(123,{seller:1193});
  await insert(124,{status:'paused'});
  await insert(125,{status:'sold'});
  const typedSql='SELECT l.id,l.title,l.image_urls,l.updated_at'+seo.MARKETPLACE_XML_WHERE+
   ' ORDER BY l.created_at DESC,l.id DESC LIMIT $2 OFFSET $3';
  const productRows=(await db.query(typedSql,['product',2000,0])).rows;
  assert.deepEqual(productRows.map(r=>Number(r.id)),[119]);
  const xml=seo.sitemapListingEntry(productRows[0]);
  assert.equal((xml.match(/<image:image>/g)||[]).length,4);
  assert.match(xml,/\/marketplace\/imagen\/119\/0<\/image:loc>/);
  assert.match(xml,/\/marketplace\/imagen\/119\/1<\/image:loc>/);
  assert.match(xml,/\/marketplace\/imagen\/119\/2<\/image:loc>/);
  assert.match(xml,/\/marketplace\/imagen\/119\/5<\/image:loc>/);
  assert.doesNotMatch(xml,/\/imagen\/119\/3|\/imagen\/119\/4|\/imagen\/119\/6|outside\.example\.com|\/uploads\//);
  const serviceRows=(await db.query(typedSql,['service',2000,0])).rows;
  assert.equal(serviceRows.length,1);
  assert.equal(Number(serviceRows[0].id),120);
  assert.equal((seo.sitemapListingEntry(serviceRows[0]).match(/<image:image>/g)||[]).length,1);
  // These are the same privacy predicates used by the untyped sitemap route.
  const universal=(await db.query(
   "SELECT l.id,l.title,l.image_urls,l.updated_at FROM marketplace_listings l JOIN users u ON u.id=l.seller_id "+
   "WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true "+
   "ORDER BY l.created_at DESC,l.id DESC LIMIT $1 OFFSET $2",[2000,0])).rows;
  assert.deepEqual(universal.map(r=>Number(r.id)),[120,119]);
  assert.equal(universal.reduce((sum,row)=>sum+(seo.sitemapListingEntry(row).match(/<image:image>/g)||[]).length,0),5);
 }finally{await db.end();}
});
