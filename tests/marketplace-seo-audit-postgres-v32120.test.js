'use strict';
// Real PostgreSQL 18 regression, using TEMP tables and a localhost-only CI DB.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const audit=require('../src/services/marketplace-seo-audit-v32120');
const category=require('../src/marketplace-category-seo-v32112');
const connectionString=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(connectionString).hostname;}catch{return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing nonlocal Marketplace SEO audit PostgreSQL test');
test('audit reads public marketplace rows only, reports accurate counts and never exposes hidden seller listings',async()=>{
 const db=new Client({connectionString,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('CREATE TEMP TABLE users(id BIGINT PRIMARY KEY,status TEXT NOT NULL,discoverable BOOLEAN NOT NULL)');
  await db.query("INSERT INTO users(id,status,discoverable) VALUES(1201,'active',true),(1202,'active',false),(1203,'suspended',true)");
  await db.query(
   "CREATE TEMP TABLE marketplace_listings ("+
   "id BIGINT PRIMARY KEY,seller_id BIGINT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,"+
   "kind TEXT NOT NULL,deal TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,"+
   "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,details JSONB NOT NULL DEFAULT '{}'::jsonb,"+
   "status TEXT NOT NULL,moderation_status TEXT NOT NULL,"+
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const description='Armario con medidas detalladas, estado contrastable, materiales, localización, entrega y fotografías explicativas para el comprador.';
  const add=(id,title,options={})=>db.query(
   "INSERT INTO marketplace_listings(id,seller_id,title,description,kind,deal,category,city,image_urls,details,status,moderation_status) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7,'Valencia',$8::jsonb,$9::jsonb,$10,$11)",
   [id,options.seller||1201,title,options.description??description,
    options.kind||'product',options.deal||'sale',options.category||'Armarios Puertas Batientes',
    JSON.stringify(options.images||[]),JSON.stringify(options.details||{}),
    options.status||'active',options.moderation||'published']
  );
  await add(1,'Sofá',{description:'Breve',images:[]});
  await add(2,'Armario de tres puertas',{images:['/uploads/armario-a.webp','/uploads/armario-b.jpg'],details:{condition:'new'}});
  await add(3,'Montaje',{kind:'service',deal:'offer',category:'Reformas y mantenimiento',description:'Servicio',images:[]});
  await add(4,'Piso céntrico en Valencia',{kind:'property',deal:'rent',category:'Pisos',images:['/uploads/piso.jpg']});
  await add(5,'Anuncio privado nunca publicable',{seller:1202,images:[]});
  await add(6,'Anuncio oculto nunca publicable',{moderation:'hidden'});
  await add(7,'Anuncio de vendedor suspendido',{seller:1203});
  await add(8,'Anuncio pausado no indexable',{status:'paused'});
  const metrics=(await db.query(audit.metricsSql)).rows[0];
  assert.deepEqual({
   total:Number(metrics.public_total),products:Number(metrics.products),
   services:Number(metrics.services),properties:Number(metrics.properties),
   title:Number(metrics.short_titles),description:Number(metrics.short_descriptions),
   image:Number(metrics.without_images),condition:Number(metrics.condition_unset)
  },{total:4,products:2,services:1,properties:1,title:2,description:2,image:2,condition:1});
  const rows=(await db.query(audit.sampleSql)).rows;
  assert.deepEqual(rows.map(x=>Number(x.id)).sort((a,b)=>a-b),[1,2,3,4]);
  assert.ok(rows.every(x=>!String(x.title).includes('nunca publicable')));
  const categoryCounts=(await db.query(category.countQuery())).rows[0];
  assert.equal(Number(categoryCounts.muebles_catalogo),2);
  const report=audit.report({
   metrics,rows,categoryCounts,
   categories:category.LANDINGS,isCategoryIndexable:category.canIndex,
   listingPath:row=>'/marketplace/p/'+row.id+'/'+row.title.toLowerCase().replace(/\s+/g,'-')
  });
  assert.equal(report.totals.publicListings,4);
  assert.equal(report.informational.find(x=>x.id==='condition_unset').count,1);
  assert.equal(report.checks.some(x=>x.id==='condition_unset'),false);
  assert.ok(report.examples.every(x=>!x.issues.includes('estado_no_indicado')));
  assert.ok(report.examples.some(x=>x.id==='1'&&x.issues.includes('sin_fotos_publicas')));
  assert.ok(report.examples.some(x=>x.id==='3'&&x.kind==='service'));
  assert.deepEqual(report.examples.map(x=>x.id),['3','1']);
  assert.ok(report.examples.every(x=>x.reviewGroup==='fotos'));
  assert.match(report.reviewNote,/No es una clasificación de Google/);
  assert.ok(report.categories.every(x=>!x.indexable));
  assert.equal(report.readOnly,true);
  assert.doesNotMatch(JSON.stringify(report),/Anuncio privado nunca publicable|Anuncio oculto nunca publicable|Anuncio de vendedor suspendido/);
 }finally{await db.end();}
});
