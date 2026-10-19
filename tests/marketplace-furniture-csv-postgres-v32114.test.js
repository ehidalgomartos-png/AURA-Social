'use strict';
// Dedicated real PostgreSQL 18 quality gate, restricted to GitHub CI localhost.
// No production DB, seller account, WooCommerce site or existing import is touched.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const categorySeo=require('../src/marketplace-category-seo-v32112');
const furniture=require('../src/services/marketplace-furniture-family-v32114');
const databaseUrl=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const hostname=(()=>{try{return new URL(databaseUrl).hostname;}catch{return '';}})();
if(hostname!=='127.0.0.1')throw Error('Refusing non-local PostgreSQL furniture SEO test');
test('legacy CSV furniture labels and nested categories are recognized without misclassifying other products',async()=>{
 const db=new Client({connectionString:databaseUrl,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users (id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1141,'active',true),(1142,'active',false),(1143,'suspended',true)");
  await db.query(
   "CREATE TEMP TABLE marketplace_listings ("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,"+
   "title TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,price_cents BIGINT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const add=(id,category,title,details={},opts={})=>db.query(
   "INSERT INTO marketplace_listings(id,seller_id,kind,deal,title,category,city,price_cents,details,status,moderation_status) "+
   "VALUES($1,$2,$3,$4,$5,$6,'Valencia',35000,$7::jsonb,$8,$9)",
   [id,opts.sellerId||1141,opts.kind||'product',opts.deal||'sale',title,category,
    JSON.stringify(details),opts.status||'active',opts.moderation||'published']
  );
  await add(1,'Sofás','Sofá tres plazas');
  await add(2,'Salones','Mueble de salón con vitrinas',{condition:'new'});
  await add(3,'Dormitorios','Dormitorio con cabecero y armario');
  await add(4,'Casa','Producto de dormitorio',{subcategory:'Armarios'});
  await add(5,'Otros','Mesa comedor madera');
  await add(6,'Muebles','Armario de cuatro puertas',{condition:'used'});
  await add(7,'Tazas','Sofá decorativo para taza'); // negative: incorrect category
  await add(8,'Casa','Lámpara de sobremesa'); // negative: generic, unrelated title
  await add(9,'Sofás','Sofá oculto',{}, {moderation:'hidden'});
  await add(10,'Sofás','Sofá vendedor privado',{}, {sellerId:1142});
  await add(11,'Sofás','Sofá vendido',{}, {status:'sold'});
  await add(12,'Sofás','Busco sofá',{}, {deal:'buy'});
  await add(13,'Juguetes y juegos','Armario de muñecas'); // negative: explicit unrelated category
  await add(14,'Hogar','Sofá chaise longue');
  await add(15,'Sofás','Sofá vendedor suspendido',{}, {sellerId:1143});
  const counts=(await db.query(categorySeo.countQuery())).rows[0];
  assert.equal(Number(counts.muebles_catalogo),7);
  assert.equal(Number(counts.muebles),1);
  assert.equal(Number(counts.segunda_mano),1);
  const catalog=categorySeo.bySlug('muebles');
  const result=await db.query(categorySeo.listingQuery(catalog));
  assert.equal(result.rowCount,7);
  assert.deepEqual(result.rows.map(x=>Number(x.id)).sort((a,b)=>a-b),[1,2,3,4,5,6,14]);
  assert.ok(result.rows.every(x=>furniture.isFurnitureListing(x)));
  assert.ok(result.rows.some(x=>x.details.condition===undefined));
  assert.equal(categorySeo.canIndex(counts,catalog),true);
  assert.equal(categorySeo.canIndex(counts,categorySeo.bySlug('muebles-segunda-mano')),false);
  const xml=categorySeo.sitemapXml(counts);
  assert.match(xml,/\/marketplace\/muebles<\/loc>/);
  assert.doesNotMatch(xml,/\/marketplace\/muebles-segunda-mano<\/loc>/);
  const legacy=(await db.query('SELECT title,category,details FROM marketplace_listings WHERE id=1')).rows[0];
  assert.equal(legacy.category,'Sofás');
  assert.equal(legacy.details.condition,undefined);
  const newGoods=(await db.query('SELECT kind,deal,title,category,details FROM marketplace_listings WHERE id=2')).rows[0];
  assert.equal(categorySeo.qualifiedCategoryForListing(newGoods,counts)?.path,'/marketplace/muebles');
  assert.doesNotMatch(JSON.stringify(newGoods),/"condition":"used"/);
  await db.query("UPDATE marketplace_listings SET status='paused' WHERE id IN (1,2,3)");
  const reduced=(await db.query(categorySeo.countQuery())).rows[0];
  assert.equal(Number(reduced.muebles_catalogo),4);
  assert.equal(categorySeo.canIndex(reduced,catalog),false);
  assert.doesNotMatch(categorySeo.sitemapXml(reduced),/\/marketplace\/muebles<\/loc>/);
 }finally{await db.end();}
});
