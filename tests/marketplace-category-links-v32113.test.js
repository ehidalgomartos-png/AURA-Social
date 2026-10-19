'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const categories=require('../src/marketplace-category-seo-v32112');
const marketplace=require('../src/routes/marketplace-seo-v3251');
const row={
 id:113,title:'Sofá usado en Valencia',description:'Sofá usado, fotografiado en Valencia, disponible para consulta directa con su vendedor.',
 kind:'product',deal:'sale',category:'Hogar y muebles',city:'Valencia',
 price_cents:8900,details:{condition:'used'},image_urls:[],
 seller_username:'publico',seller_name:'Vendedor público',
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-15T08:00:00.000Z',updated_at:'2026-10-15T08:00:00.000Z'
};
const furniture=categories.bySlug('muebles-segunda-mano');
function schemaFrom(html){
 const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
 assert.ok(match,'listing must include server-rendered JSON-LD');
 return JSON.parse(match[1]);
}
test('qualified detailed category outranks general used category and requires five public ads',()=>{
 const counts={muebles:5,segunda_mano:18,used_category_diversity:3};
 assert.deepEqual(categories.candidateCategories(row),[furniture,categories.bySlug('sofas'),categories.bySlug('muebles'),categories.bySlug('segunda-mano')]);
 assert.equal(categories.qualifiedCategoryForListing(row,counts),furniture);
 assert.equal(categories.qualifiedCategoryForListing(row,{...counts,muebles:4}),categories.bySlug('segunda-mano'));
 assert.equal(categories.qualifiedCategoryForListing(row,{...counts,muebles:4,segunda_mano:4}),null);
 assert.equal(categories.qualifiedCategoryForListing(row,{...counts,muebles:4,used_category_diversity:1}),null);
});
test('new WooCommerce goods, wanted ads and other types cannot link to second-hand collections',()=>{
 for(const mutation of [
  {details:{condition:'new'}},{details:{}},{deal:'buy'},{kind:'service',deal:'sale'}
 ]){
  const candidate={...row,...mutation};
  assert.equal(categories.qualifiedCategoryForListing(candidate,{muebles:100,segunda_mano:200,used_category_diversity:10}),null);
 }
 const newShop={...row,title:'Taza nueva',details:{condition:'new'}};
 assert.doesNotMatch(marketplace.listingHtml(newShop,[],furniture),/market-qualified-category-v32113/);
 assert.doesNotMatch(marketplace.listingHtml(newShop,[],furniture),/marketplace\/muebles-segunda-mano/);
});
test('specialist link candidates respect seller-supplied category, offer/sale status and locality',()=>{
 const counts={moviles:5,vehiculos:5,servicios:6,inmuebles:5};
 assert.equal(categories.qualifiedCategoryForListing({...row,category:'Móviles y telefonía'},counts)?.id,'moviles');
 assert.equal(categories.qualifiedCategoryForListing({...row,category:'Vehículos'},counts)?.id,'vehiculos');
 assert.equal(categories.qualifiedCategoryForListing({...row,kind:'service',deal:'offer'},counts)?.id,'servicios');
 assert.equal(categories.qualifiedCategoryForListing({...row,kind:'property',deal:'rent'},counts)?.id,'inmuebles');
 assert.equal(categories.qualifiedCategoryForListing({...row,kind:'property',deal:'buy'},counts),null);
 assert.equal(categories.qualifiedCategoryForListing({...row,kind:'service',deal:'buy'},counts),null);
 assert.equal(categories.qualifiedCategoryForListing({...row,kind:'product',deal:'sale',details:{condition:'new'}},counts),null);
});
test('public listing displays one safe qualified category backlink with matching breadcrumb JSON-LD',()=>{
 const html=marketplace.listingHtml(row,[],furniture);
 const matches=[...html.matchAll(/href="\/marketplace\/muebles-segunda-mano"/g)];
 assert.equal(matches.length,2); // breadcrumb plus one visible related-category link
 assert.match(html,/aria-label="Anuncios de la misma categoría"/);
 assert.match(html,/Explorar Muebles de segunda mano/);
 const crumbs=schemaFrom(html)['@graph'][1].itemListElement;
 assert.equal(crumbs.length,4);
 assert.deepEqual(crumbs.map(x=>x.position),[1,2,3,4]);
 assert.equal(crumbs[2].item,'https://redlibertad.com/marketplace/muebles-segunda-mano');
 assert.equal(crumbs[3].item,'https://redlibertad.com/marketplace/p/113/sofa-usado-en-valencia');
 assert.match(html,/Ver más anuncios de Hogar y muebles/); // old filter access preserved
});
test('thin-category or uncategorized listing preserves established 3-part breadcrumb and filtered links',()=>{
 const html=marketplace.listingHtml(row,[]);
 assert.doesNotMatch(html,/market-qualified-category-v32113/);
 const crumbs=schemaFrom(html)['@graph'][1].itemListElement;
 assert.equal(crumbs.length,3);
 assert.equal(crumbs[2].item,'https://redlibertad.com/marketplace/p/113/sofa-usado-en-valencia');
 assert.match(html,/href="\/marketplace\/explorar\?tipo=product&amp;categoria=Hogar%20y%20muebles"/);
});
test('server applies gate to real public listings, avoids new database writes and fails open if optional count fails',()=>{
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=src.indexOf("router.get('/marketplace/p/:id/:slug?'");
 const end=src.indexOf("router.get('/marketplace/imagen/:id/:index'");
 const fragment=src.slice(start,end);
 assert.match(fragment,/if\(!eligible\(row\)\)return unavailable/);
 assert.match(fragment,/marketplaceCategorySeoV32112\.candidateCategories\(row\)\.length/);
 assert.match(fragment,/marketplaceCategorySeoV32112\.countQuery\(\)/);
 assert.match(fragment,/marketplaceCategorySeoV32112\.qualifiedCategoryForListing\(row,categories\.rows\[0\]\|\|\{\}\)/);
 assert.match(fragment,/catch\(categoryError\)/);
 assert.match(fragment,/listingHtml\(row,related\.rows,qualifiedCategory\)/);
 assert.doesNotMatch(fragment,/INSERT INTO |UPDATE marketplace_listings|DELETE FROM marketplace_listings/);
 assert.match(src,/marketplace-category-links-v32113\.css\?v=3\.2\.113/);
});
test('mobile link has visible focus, full-width tap target and no intrusive fixed bar',()=>{
 const css=fs.readFileSync('public/marketplace-category-links-v32113.css','utf8');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed/);
 assert.doesNotMatch(css,/overflow:hidden/);
});
