'use strict';
// PostgreSQL 18: the same public-only SQL must serve all specialist pages.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const seo=require('../src/marketplace-category-seo-v32112');
const specialist=require('../src/services/marketplace-furniture-specialists-v32117');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal furniture SEO PostgreSQL test');
test('three genuine furniture specialties are distinct, publicly visible and never doorway duplicates',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1171,'active',true),(1172,'active',false),(1173,'suspended',true)");
  await db.query(
   "CREATE TEMP TABLE marketplace_listings("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,kind TEXT NOT NULL,deal TEXT NOT NULL,"+
   "title TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,price_cents BIGINT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const add=(id,category,title,options={})=>db.query(
   "INSERT INTO marketplace_listings(id,seller_id,kind,deal,title,category,city,price_cents,details,status,moderation_status) "+
   "VALUES($1,$2,$3,$4,$5,$6,'Valencia',29500,$7::jsonb,$8,$9)",
   [id,options.seller||1171,options.kind||'product',options.deal||'sale',title,category,
    JSON.stringify(options.details||{condition:'new'}),options.status||'active',options.moderation||'published']);
  for(let i=1;i<=5;i++){
   await add(i,'Armarios Puertas Batientes','Armario Turin '+i+' puertas');
   await add(10+i,'Sofás 3 plazas','Sofá tejido '+i);
   await add(20+i,'Dormitorios','Dormitorio juvenil '+i);
   await add(30+i,'Mesas de Comedor','Mesa comedor '+i);
  }
  await add(50,'Tazas','Sofá dibujado en una taza');
  await add(51,'Juguetes y juegos','Armario muñecas');
  await add(52,'Armarios Puertas Batientes','Armario oculto',{moderation:'hidden'});
  await add(53,'Sofás 3 plazas','Sofá privado',{seller:1172});
  await add(54,'Dormitorios','Dormitorio suspendido',{seller:1173});
  await add(55,'Sofás 3 plazas','Busco sofá',{deal:'buy'});
  await add(56,'Dormitorios','Dormitorio vendido',{status:'sold'});
  const counts=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(counts.muebles_catalogo),20);
  for(const spec of specialist.SPECS){
   const def=seo.bySlug(spec.slug);
   assert.equal(Number(counts[spec.id]),5,spec.id);
   assert.equal(seo.canIndex(counts,def),true,spec.id);
   const rows=(await db.query(seo.listingQuery(def))).rows;
   assert.equal(rows.length,5,spec.id);
   assert.ok(rows.every(row=>specialist.matches(row,spec)),spec.id);
   assert.ok(rows.every(row=>seo.qualifiedCategoryForListing(row,counts)?.path===def.path),spec.id);
   const data=seo.structuredData(def,rows);
   assert.equal(data['@graph'][2].itemListElement.length,5);
   assert.equal(data['@graph'][1].itemListElement[2].item,'https://redlibertad.com/marketplace/muebles');
   assert.equal(data['@graph'][1].itemListElement[3].item,'https://redlibertad.com'+def.path);
   assert.match(seo.sitemapXml(counts),new RegExp('/marketplace/'+spec.slug+'</loc>'));
  }
  assert.ok(seo.furnitureNavigation(counts).includes('/marketplace/armarios'));
  assert.ok(seo.furnitureNavigation(counts).includes('/marketplace/sofas'));
  assert.ok(seo.furnitureNavigation(counts).includes('/marketplace/dormitorios'));

  // If no other furniture remains, the specialist pages would duplicate the
  // entire parent collection; neither index them nor link to them.
  await db.query("UPDATE marketplace_listings SET status='paused' WHERE id>=11 AND id<=35");
  const dominated=(await db.query(seo.countQuery())).rows[0];
  assert.equal(Number(dominated.muebles_catalogo),5);
  assert.equal(Number(dominated.armarios),5);
  assert.equal(seo.canIndex(dominated,seo.bySlug('armarios')),false);
  assert.equal(seo.canIndex(dominated,seo.bySlug('muebles')),true);
  assert.doesNotMatch(seo.sitemapXml(dominated),/\/marketplace\/armarios<\/loc>/);
  assert.match(seo.sitemapXml(dominated),/\/marketplace\/muebles<\/loc>/);
  assert.equal(seo.furnitureNavigation(dominated),'');
 }finally{await db.end();}
});
