'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const family=require('../src/services/marketplace-furniture-family-v32114');
const seo=require('../src/marketplace-category-seo-v32112');
const landing=require('../src/marketplace-landing-v32111');
const market=require('../src/routes/marketplace-seo-v3251');
const {listingInput}=require('../src/routes/marketplace-v3250');
const {csvRecords,parseProduct}=require('../src/services/marketplace-woocommerce-csv-v3260');
const sample=(category,title='Armario de cuatro puertas')=>({
 id:114,kind:'product',deal:'sale',title,category,city:'Valencia',description:'Mueble en buen estado con datos reales de tamaño, entrega y precio.',
 price_cents:19900,image_urls:[],details:{},seller_username:'publico',seller_name:'Vendedor',
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-14T08:00:00.000Z',updated_at:'2026-10-15T08:00:00.000Z'
});
test('common actual WooCommerce CSV root categories recognize furniture without requiring used state',()=>{
 for(const cat of ['Muebles','Hogar y muebles','SOFÁS','Sofas','Salones','Dormitorios','Camas','Canapés',
  'Armarios','Mesas','Sillas','Sillones','Cómodas','Muebles de salón','Mobiliario','Muebles TV']){
  assert.equal(family.isFurnitureListing(sample(cat)),true,cat);
 }
 assert.equal(family.isFurnitureListing(sample('Casa','Mueble auxiliar de salón')),true);
 assert.equal(family.isFurnitureListing(sample('Hogar','Sofá chaise longue')),true);
 assert.equal(family.isFurnitureListing(sample('Decoración','Armario auxiliar de madera')),true);
 assert.equal(family.isFurnitureListing({...sample('Casa','Producto 123'),details:{subcategory:'Sofás'}}),true);
});
test('avoid classifying unrelated categories by incidental product title or description',()=>{
 for(const item of [
  sample('Tazas','Sofá pequeño decorativo'),
  sample('Juguetes y juegos','Armario para muñecas'),
  sample('Hogar','Lampara de sobremesa'),
  sample('Tecnología','Mueble de ordenador'),
  {...sample('Armarios'),kind:'service',deal:'offer'},
  {...sample('Muebles'),deal:'buy'}
 ])assert.equal(family.isFurnitureListing(item),false,item.title);
 assert.equal(family.isFurnitureListing(sample('Otros','Sofá cama moderno')),true);
});
test('WooCommerce nested categories are preserved for future imports without rewriting the parent',()=>{
 const csv=[
  'ID,Type,SKU,Name,Published,In stock?,Description,Regular price,Categories,Images',
  '114,simple,MUEB-114,"Armario cuatro puertas",1,1,"Armario robusto para dormitorio; revisar medidas y acabados.",229,"Casa > Muebles > Armarios","https://shop.example.com/armario.jpg"'
 ].join('\n');
 const value=parseProduct(csvRecords(csv)[0],{city:'Valencia',province:'Valencia',saleScope:'national'});
 assert.equal(value.state,'pending');
 assert.equal(value.listing.category,'Casa'); // original parent from export unchanged
 assert.equal(value.listing.details.subcategory,'Armarios');
 assert.equal(value.listing.details.condition,undefined); // unknown is never "used"
 assert.equal(family.isFurnitureListing(value.listing),true);
 assert.equal(listingInput.safeParse(value.listing).success,true);
});
test('older CSV imports are recognized without reimport, reclassification writes or condition fabrication',()=>{
 const old={...sample('Salones','Sofá moderno de tres plazas'),details:{saleScope:'national'}};
 const general=seo.bySlug('muebles'),used=seo.bySlug('muebles-segunda-mano');
 assert.ok(general && used);
 assert.equal(general.path,'/marketplace/muebles');
 assert.match(general.title,/Muebles nuevos y de segunda mano/);
 assert.doesNotMatch(general.where,/details->>'condition'='used'/);
 assert.match(used.where,/details->>'condition'='used'/);
 assert.deepEqual(seo.candidateCategories(old),[general]);
 assert.equal(seo.qualifiedCategoryForListing(old,{muebles_catalogo:6})?.path,general.path);
 assert.equal(seo.qualifiedCategoryForListing(old,{muebles_catalogo:4}),null);
 assert.equal(old.details.condition,undefined);
});
test('marked used furniture remains eligible for used-only pages but new or unknown remains general',()=>{
 const used={...sample('Sofás'),details:{condition:'used'}};
 const fresh={...sample('Sofás'),details:{condition:'new'}};
 const counts={muebles_catalogo:7,muebles:5,segunda_mano:6,used_category_diversity:2};
 assert.deepEqual(seo.candidateCategories(used).map(x=>x.slug),['muebles-segunda-mano','muebles','segunda-mano']);
 assert.equal(seo.qualifiedCategoryForListing(used,counts)?.id,'muebles');
 assert.equal(seo.qualifiedCategoryForListing(used,{...counts,muebles:4})?.id,'muebles_catalogo');
 assert.deepEqual(seo.candidateCategories(fresh).map(x=>x.slug),['muebles']);
 assert.equal(seo.qualifiedCategoryForListing(fresh,counts)?.id,'muebles_catalogo');
 assert.equal(seo.qualifiedCategoryForListing(sample('Sofás'),counts)?.id,'muebles_catalogo');
});
test('homepage furniture shortcut reaches the real furniture family rather than exact WooCommerce category query',()=>{
 const html=landing.categories();
 assert.match(html,/href="\/marketplace\/muebles"/);
 assert.doesNotMatch(html,/href="\/marketplace\/explorar\?tipo=product&amp;categoria=Hogar\+y\+muebles"/);
 assert.match(html,/Muebles y hogar/);
});
test('new furniture detail gets accurate category backlink and JSON-LD breadcrumb but not second hand',()=>{
 const row={...sample('Sofás','Sofá modelo Valencia'),details:{}};
 const def=seo.bySlug('muebles');
 const html=market.listingHtml(row,[],def);
 assert.match(html,/href="\/marketplace\/muebles"/);
 assert.match(html,/Explorar Muebles para el hogar: nuevos y de segunda mano/);
 assert.doesNotMatch(html,/href="\/marketplace\/muebles-segunda-mano"/);
 const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
 assert.ok(match);
 const ld=JSON.parse(match[1])['@graph'][1].itemListElement;
 assert.equal(ld[2].item,'https://redlibertad.com/marketplace/muebles');
 assert.equal(ld[3].item,'https://redlibertad.com/marketplace/p/114/sofa-modelo-valencia');
});
test('only an inventory-rich catalogue is indexable and sitemap-eligible, not a search-doorway',()=>{
 const def=seo.bySlug('muebles');
 assert.equal(seo.canIndex({muebles_catalogo:4},def),false);
 assert.equal(seo.canIndex({muebles_catalogo:5},def),true);
 assert.doesNotMatch(seo.sitemapXml({muebles_catalogo:4}),/\/marketplace\/muebles<\/loc>/);
 assert.match(seo.sitemapXml({muebles_catalogo:5}),/\/marketplace\/muebles<\/loc>/);
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.match(source,/const indexable=eligibleFromCounts&&listings.length>=minOnPage/);
 assert.match(source,/robots:indexable\?'index,follow,max-image-preview:large':'noindex,follow'/);
 assert.match(source,/router.get\('\/sitemap-marketplace-categorias.xml'/);
});
test('SQL furniture rules are allowlisted, read-only and shared by count/listing routes',()=>{
 const sql=family.sqlPredicate('l');
 assert.match(sql,/l\.kind='product'/);
 assert.match(sql,/l\.deal='sale'/);
 assert.match(sql,/l\.details->>'subcategory'/);
 assert.match(sql,/l\.title/);
 assert.match(sql,/l\.category/);
 assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|marketplace_seller_subscriptions|sk_live_/);
 assert.throws(()=>family.sqlPredicate('l; DROP TABLE users'),/invalid_sql_alias/);
 assert.match(seo.countQuery(),/muebles_catalogo/);
 assert.match(seo.listingQuery(seo.bySlug('muebles')),/ORDER BY l.created_at DESC,l.id DESC LIMIT 25 OFFSET 0/);
});
