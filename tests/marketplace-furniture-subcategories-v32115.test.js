'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const furniture=require('../src/services/marketplace-furniture-family-v32114');
const seo=require('../src/marketplace-category-seo-v32112');
const landing=require('../src/marketplace-landing-v32111');
const market=require('../src/routes/marketplace-seo-v3251');
const row=(category,details={})=>({
 id:115,kind:'product',deal:'sale',title:'Armario Turin 3 Puertas 2 Cajones - Blanco',
 description:'Armario nuevo de puertas batientes con espacio de almacenaje y cajones.',
 category,city:'Valencia',price_cents:23500,image_urls:[],details,
 seller_username:'publico',seller_name:'Vendedor público',
 seller_status:'active',seller_discoverable:true,status:'active',moderation_status:'published',
 created_at:'2026-10-19T08:00:00.000Z',updated_at:'2026-10-19T08:00:00.000Z'
});
test('screenshot: Armarios Puertas Batientes imported by CSV belongs to furniture family',()=>{
 const listing=row('Armarios Puertas Batientes',{condition:'new'});
 assert.equal(furniture.categoryMatches(listing.category),true);
 assert.equal(furniture.isFurnitureListing(listing),true);
 assert.equal(seo.candidateCategories(listing)[0].path,'/marketplace/muebles');
 assert.equal(seo.canIndex({muebles_catalogo:5},seo.bySlug('muebles')),true);
 assert.equal(seo.qualifiedCategoryForListing(listing,{muebles_catalogo:5})?.path,'/marketplace/muebles');
 assert.equal(seo.qualifiedCategoryForListing(listing,{muebles_catalogo:4}),null);
 assert.equal(listing.category,'Armarios Puertas Batientes');
});
test('real-world qualified furniture labels are matched with whole-word boundaries',()=>{
 for(const category of [
  'Armarios Puertas Batientes','ARMARIOS PUERTAS CORREDERAS','Armarios 2 Puertas',
  'Armarios 3 Puertas Blanco','Armarios con puertas','Armarios abatibles',
  'Sofás 3 plazas','Sofás Cama','Mesas Centro','Mesas de Comedor',
  'Camas abatibles','Muebles de Dormitorio','Muebles Salón'
 ]){
  assert.equal(furniture.categoryMatches(category),true,category);
  assert.equal(furniture.isFurnitureListing(row(category)),true,category);
 }
 for(const category of [
  'Armarios Puertasdecorativas','Armarios juguete muñecas',
  'Puertas Batientes','Puertas Correderas','Bisagras Puertas Batientes',
  'Accesorios Armarios','Tazas con dibujo de armario',
  'Juguetes y juegos','Armariospara juguetes',
  'Mesas dulces para eventos','Mesas de chuches'
 ]){
  assert.equal(furniture.categoryMatches(category),false,category);
  assert.equal(furniture.isFurnitureListing(row(category)),false,category);
 }
});
test('subcategory supports WooCommerce hierarchical labels; unrelated product categories remain outside',()=>{
 assert.equal(furniture.isFurnitureListing({...row('Casa'),details:{subcategory:'Armarios Puertas Batientes'}}),true);
 assert.equal(furniture.isFurnitureListing({...row('Tazas'),details:{subcategory:'Armarios Puertas Batientes'}}),true);
 // The source explicitly lists the furniture subcategory; no automatic category field rewrite.
 assert.equal(furniture.isFurnitureListing({...row('Tazas'),details:{}}),false);
 assert.equal(furniture.isFurnitureListing({...row('Armarios Puertas Batientes'),kind:'service',deal:'offer'}),false);
 assert.equal(furniture.isFurnitureListing({...row('Armarios Puertas Batientes'),deal:'buy'}),false);
});
test('new and unlabelled CSV armarios are furniture, but never become second-hand',()=>{
 const def=seo.bySlug('muebles');
 const second=seo.bySlug('muebles-segunda-mano');
 assert.match(def.title,/Muebles nuevos y de segunda mano/);
 assert.equal(seo.candidateCategories(row('Armarios Puertas Batientes',{condition:'new'})).includes(second),false);
 assert.equal(seo.candidateCategories(row('Armarios Puertas Batientes')).includes(second),false);
 assert.equal(seo.candidateCategories(row('Armarios Puertas Batientes',{condition:'used'})).includes(second),true);
 assert.equal(seo.qualifiedCategoryForListing(row('Armarios Puertas Batientes',{condition:'new'}),{muebles:10,muebles_catalogo:10})?.path,def.path);
});
test('existing public card points to useful family and page does not expose technical CSV copy',()=>{
 const html=landing.categories();
 assert.match(html,/href="\/marketplace\/muebles"/);
 const def=seo.bySlug('muebles');
 assert.doesNotMatch(def.intro,/CSV|WooCommerce|importad[oa]s/i);
 assert.match(def.intro,/armarios de puertas batientes/i);
 const catalog=seo.content(def,{count:7,indexable:true,cards:'<article>Armario Turin</article>'});
 assert.match(catalog,/7 anuncios públicos/);
 assert.match(catalog,/Armario Turin/);
 assert.doesNotMatch(catalog,/WooCommerce|CSV/i);
 const detail=market.listingHtml(row('Armarios Puertas Batientes',{condition:'new'}),[],def);
 assert.match(detail,/Explorar Muebles para el hogar: nuevos y de segunda mano/);
 assert.doesNotMatch(detail,/href="\/marketplace\/muebles-segunda-mano"/);
});
test('SQL and JS share a strict furniture category prefix allowlist without touching listings',()=>{
 const sql=furniture.sqlPredicate('l');
 assert.match(sql,/armarios puertas %/);
 assert.match(sql,/armarios 3 puertas/);
 assert.match(sql,/sofas 3 plazas/);
 assert.match(sql,/l\.category/);
 assert.match(sql,/l\.details->>'subcategory'/);
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE)\b/i);
 assert.match(seo.countQuery(),/armarios puertas %/);
 assert.match(seo.listingQuery(seo.bySlug('muebles')),/armarios puertas %/);
 assert.match(seo.bySlug('muebles-segunda-mano').where,/details->>'condition'='used'/);
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.match(source,/const indexable=eligibleFromCounts&&listings.length>=minOnPage/);
 assert.match(source,/marketplaceCategorySeoV32112\.sitemapXml/);
});
