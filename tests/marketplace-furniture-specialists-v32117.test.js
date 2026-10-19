'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const specialists=require('../src/services/marketplace-furniture-specialists-v32117');
const furniture=require('../src/services/marketplace-furniture-family-v32114');
const seo=require('../src/marketplace-category-seo-v32112');
const marketplace=require('../src/routes/marketplace-seo-v3251');
const item=(category,title,details={})=>({
 id:117,title,category,details,kind:'product',deal:'sale',city:'Valencia',
 description:'Anuncio público del vendedor con fotografías, precio y detalles.',
 price_cents:25900,image_urls:[],status:'active',moderation_status:'published',
 seller_status:'active',seller_discoverable:true,
 seller_name:'Vendedor',seller_username:'publico',
 created_at:'2026-10-18T12:00:00.000Z',updated_at:'2026-10-18T12:00:00.000Z'
});
const rich={armarios:8,sofas:6,dormitorios:7,muebles_catalogo:28};
test('exactly three curated, distinct specialist URLs; they cannot create infinite doorway pages',()=>{
 assert.deepEqual(specialists.SPECS.map(x=>x.id),['armarios','sofas','dormitorios']);
 assert.equal(seo.LANDINGS.length,10);
 for(const spec of specialists.SPECS){
  const def=seo.bySlug(spec.slug);
  assert.equal(def.id,spec.id);
  assert.equal(def.path,'/marketplace/'+spec.slug);
  assert.ok(def.title.length<85);
  assert.ok(def.description.length>=110&&def.description.length<190);
  assert.match(def.title,/RedLibertad/);
  assert.doesNotMatch(def.description,/Wallapop|Milanuncios|CSV|WooCommerce|100% garantizado/i);
  assert.match(def.where,/l\.status|l\.kind='product'/);
  assert.match(seo.listingQuery(def,{page:2}),/LIMIT 25 OFFSET 24$/);
 }
 assert.equal(specialists.byId('__proto__'),null);
 assert.throws(()=>specialists.sqlPredicate({pattern:'.*'}),/unknown_furniture_specialist/);
 assert.throws(()=>specialists.sqlPredicate(specialists.byId('armarios'),'l; DROP TABLE users'),/invalid_sql_alias/);
});
test('specialists map WooCommerce category families and conservative generic-title fallback',()=>{
 const positive=[
  ['armarios',item('Armarios Puertas Batientes','Armario Turín 3 puertas')],
  ['armarios',item('Armarios Puertas Correderas','Armario roble')],
  ['armarios',item('Muebles','Armario blanco tres puertas')],
  ['sofas',item('Sofás 3 plazas','Sofá gris')],
  ['sofas',item('Chaiselongues','Chaiselongue modular')],
  ['sofas',item('Salones','Sofá cama beige')],
  ['dormitorios',item('Dormitorios','Dormitorio juvenil completo')],
  ['dormitorios',item('Camas abatibles','Cama abatible blanca')],
  ['dormitorios',item('Muebles','Canapé blanco')],
  ['armarios',item('Casa','Armario grande',{subcategory:'Armarios Puertas Batientes'})]
 ];
 for(const [id,row] of positive){
  assert.equal(specialists.matches(row,specialists.byId(id)),true,id+': '+row.category);
  assert.equal(furniture.isFurnitureListing(row),true,id);
 }
 for(const row of [
  item('Tazas','Armario de dibujo infantil'),
  item('Juguetes y juegos','Sofá de juguete'),
  item('Puertas Batientes','Armario sin montar'),
  item('Bisagras','Bisagra de armario'),
  item('Hogar','Lámpara de sobremesa'),
  {...item('Armarios Puertas Batientes','Armario'),deal:'buy'},
  {...item('Sofás','Sofá'),kind:'service',deal:'offer'}
 ]){
  assert.equal(specialists.SPECS.some(spec=>specialists.matches(row,spec)),false,row.category);
 }
});
test('qualification requires five real category ads AND five other furniture ads, avoiding a clone of the parent page',()=>{
 for(const spec of specialists.SPECS){
  const def=seo.bySlug(spec.id);
  assert.equal(seo.canIndex({[spec.id]:4,muebles_catalogo:40},def),false);
  assert.equal(seo.canIndex({[spec.id]:5,muebles_catalogo:9},def),false);
  assert.equal(seo.canIndex({[spec.id]:5,muebles_catalogo:10},def),true);
 }
 const thirtyTwoArmarios={armarios:32,muebles_catalogo:32};
 assert.equal(seo.canIndex(thirtyTwoArmarios,seo.bySlug('armarios')),false);
 assert.equal(seo.canIndex(thirtyTwoArmarios,seo.bySlug('muebles')),true);
 assert.doesNotMatch(seo.sitemapXml(thirtyTwoArmarios),/\/marketplace\/armarios<\/loc>/);
 assert.match(seo.sitemapXml(thirtyTwoArmarios),/\/marketplace\/muebles<\/loc>/);
 assert.equal(seo.furnitureNavigation(thirtyTwoArmarios),'');
 assert.equal(seo.canIndex({...thirtyTwoArmarios,muebles_catalogo:37},seo.bySlug('armarios')),true);
});
test('qualified specialist navigation links are contextual and never point to thin pages',()=>{
 const body=seo.furnitureNavigation({...rich,sofas:4},{current:'muebles'});
 assert.match(body,/Tipos de muebles/);
 assert.match(body,/href="\/marketplace\/armarios"/);
 assert.match(body,/href="\/marketplace\/dormitorios"/);
 assert.doesNotMatch(body,/href="\/marketplace\/sofas"/);
 const types=seo.furnitureNavigation(rich,{current:'armarios'});
 assert.doesNotMatch(types,/href="\/marketplace\/armarios"/);
 const general=seo.content(seo.bySlug('muebles'),{count:28,indexable:true,visibleCount:24,typeNav:body,cards:'<article>Real</article>'});
 assert.ok(general.indexOf('market-furniture-types-v32117')<general.indexOf('Anuncios disponibles'));
 assert.match(general,/Muebles para el hogar/);
 const specialist=seo.content(seo.bySlug('armarios'),{count:8,indexable:true,visibleCount:8,cards:'<article>Armario</article>',typeNav:types});
 assert.match(specialist,/href="\/marketplace\/muebles">Muebles<\/a>/);
 assert.match(specialist,/Armarios en venta/);
 assert.doesNotMatch(specialist,/CSV|WooCommerce/);
});
test('product breadcrumbs can prefer a qualified specific collection without mislabelling goods as second-hand',()=>{
 const row=item('Armarios Puertas Batientes','Armario Turin 3 Puertas 2 Cajones - Blanco',{condition:'new'});
 const defs=seo.candidateCategories(row);
 assert.deepEqual(defs.map(x=>x.slug),['armarios','muebles']);
 assert.equal(seo.qualifiedCategoryForListing(row,rich)?.slug,'armarios');
 assert.equal(seo.qualifiedCategoryForListing(row,{armarios:8,muebles_catalogo:10})?.slug,'muebles');
 assert.equal(seo.qualifiedCategoryForListing({...row,deal:'buy'},rich),null);
 const html=marketplace.listingHtml(row,[],seo.bySlug('armarios'));
 assert.match(html,/href="\/marketplace\/armarios"/);
 assert.doesNotMatch(html,/href="\/marketplace\/muebles-segunda-mano"/);
 const json=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
 assert.equal(json['@graph'][1].itemListElement[2].item,'https://redlibertad.com/marketplace/armarios');
 const categoryLd=seo.structuredData(seo.bySlug('armarios'),[row]);
 const bread=categoryLd['@graph'][1].itemListElement;
 assert.deepEqual(bread.map(x=>x.position),[1,2,3,4]);
 assert.equal(bread[2].item,'https://redlibertad.com/marketplace/muebles');
 assert.equal(bread[3].item,'https://redlibertad.com/marketplace/armarios');
});
test('used furniture still prioritizes the original used-only page when indexable',()=>{
 const sofa=item('Sofás','Sofá gris',{condition:'used'});
 assert.deepEqual(seo.candidateCategories(sofa).map(x=>x.slug),
  ['muebles-segunda-mano','sofas','muebles','segunda-mano']);
 const counts={...rich,muebles:5,segunda_mano:12,used_category_diversity:2};
 assert.equal(seo.qualifiedCategoryForListing(sofa,counts)?.slug,'muebles-segunda-mano');
 assert.equal(seo.qualifiedCategoryForListing({...sofa,details:{condition:'new'}},counts)?.slug,'sofas');
});
test('the same specialist SQL powers count, cards, sitemap and paginated pages',()=>{
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const furnitureCss=fs.readFileSync('public/marketplace-category-seo-v32112.css','utf8');
 for(const spec of specialists.SPECS){
  const sql=specialists.sqlPredicate(spec);
  assert.match(sql,/l\.kind='product'/);
  assert.match(sql,/l\.deal='sale'/);
  assert.match(sql,/l\.details->>'subcategory'/);
  assert.match(sql,/l\.title/);
  assert.match(sql,/l\.category/);
  assert.match(seo.countQuery(),new RegExp('AS '+spec.id+'(?:,| FROM)'));
  assert.match(seo.listingQuery(seo.bySlug(spec.id)),/l.status='active'/);
 }
 assert.match(source,/marketplaceCategorySeoV32112\.furnitureNavigation\(counts/);
 assert.match(source,/typeNav:/);
 assert.match(source,/structuredData\(categoryDef,listings,\{page\}\)/);
 assert.match(furnitureCss,/market-furniture-types-v32117/);
 assert.match(furnitureCss,/@media\(max-width:600px\)/);
 assert.match(furnitureCss,/:focus-visible/);
 assert.match(furnitureCss,/min-height:48px/);
 assert.doesNotMatch(source,/sk_live_|stripe\.checkout\(/);
});
