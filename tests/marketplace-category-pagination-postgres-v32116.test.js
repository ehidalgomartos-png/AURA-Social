'use strict';
// Real PostgreSQL 18 on CI localhost only. No production, seller or WooCommerce writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const seo=require('../src/marketplace-category-seo-v32112');
const dbUrl=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(dbUrl).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing non-local PostgreSQL 18 category pagination test');
test('32 public CSV armarios paginate as 24+8 with no duplication or hidden/private leaks',async()=>{
 const db=new Client({connectionString:dbUrl,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1161,'active',true),(1162,'active',false),(1163,'suspended',true)");
  await db.query(
   "CREATE TEMP TABLE marketplace_listings("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,"+
   "title TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,price_cents BIGINT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,"+
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const add=(id,status='active',moderation='published',sellerId=1161)=>
   db.query(
    "INSERT INTO marketplace_listings(id,seller_id,kind,deal,title,category,city,price_cents,details,status,moderation_status) "+
    "VALUES($1,$2,'product','sale',$3,'Armarios Puertas Batientes','Valencia',23500,$4::jsonb,$5,$6)",
    [id,sellerId,'Armario Turin '+id+' Puertas',JSON.stringify({condition:'new'}),status,moderation]
   );
  for(let id=1;id<=32;id++)await add(id);
  await add(33,'active','hidden');
  await add(34,'active','published',1162);
  await add(35,'active','published',1163);
  await add(36,'sold');
  const def=seo.bySlug('muebles');
  const counts=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(counts.muebles_catalogo),32);
  assert.equal(seo.canIndex(counts,def),true);
  const first=(await db.query(seo.listingQuery(def,{page:1}))).rows;
  const second=(await db.query(seo.listingQuery(def,{page:2}))).rows;
  const phantom=(await db.query(seo.listingQuery(def,{page:3}))).rows;
  assert.equal(first.length,25); // overfetch one item, do not duplicate it on page 1
  assert.equal(second.length,8);
  assert.equal(phantom.length,0);
  const firstShown=first.slice(0,24),secondShown=second.slice(0,24);
  const firstIds=firstShown.map(row=>Number(row.id));
  const secondIds=secondShown.map(row=>Number(row.id));
  assert.deepEqual(firstIds,Array.from({length:24},(_,i)=>32-i));
  assert.deepEqual(secondIds,[8,7,6,5,4,3,2,1]);
  assert.equal(new Set([...firstIds,...secondIds]).size,32);
  assert.equal(firstShown.some(row=>row.id>32),false);
  assert.equal(first.every(row=>row.category==='Armarios Puertas Batientes'),true);
  assert.equal(second.every(row=>row.details.condition==='new'),true);
  const json1=seo.structuredData(def,firstShown,{page:1})['@graph'][2].itemListElement;
  const json2=seo.structuredData(def,secondShown,{page:2})['@graph'][2].itemListElement;
  assert.equal(json1.length,24);
  assert.equal(json2.length,8);
  assert.equal(json1[0].position,1);
  assert.equal(json2[0].position,25);
  assert.equal(json2[7].position,32);
  assert.match(seo.sitemapXml(counts),/\/marketplace\/muebles<\/loc>/);
  assert.doesNotMatch(seo.sitemapXml(counts),/pagina=2/);
  const firstHtml=seo.content(def,{count:32,cards:'<article>First</article>',
   indexable:true,page:1,visibleCount:24,hasNext:first.length>24});
  const nextHtml=seo.content(def,{count:32,cards:'<article>Last</article>',
   indexable:true,page:2,visibleCount:8,hasNext:second.length>24});
  assert.match(firstHtml,/Mostrando 1–24 de 32/);
  assert.match(firstHtml,/href="\/marketplace\/muebles\?pagina=2"/);
  assert.match(nextHtml,/Mostrando 25–32 de 32/);
  assert.match(nextHtml,/href="\/marketplace\/muebles"/);
  await db.query("UPDATE marketplace_listings SET status='paused' WHERE id BETWEEN 6 AND 32");
  const reduced=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(reduced.muebles_catalogo),5);
  const later=(await db.query(seo.listingQuery(def,{page:2}))).rows;
  assert.equal(later.length,0); // route returns 404 for page 2 after inventory shrinks
 }finally{await db.end();}
});
