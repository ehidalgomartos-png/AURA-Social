'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const seo=require('../src/routes/marketplace-seo-v3251');
const fixture={
  id:25,title:'Sofá chaiselongue en Valencia',description:'Sofá usado en buen estado y disponible para recoger en Valencia.',
  kind:'product',deal:'sale',category:'Muebles',city:'Valencia',price_cents:18000,
  details:{condition:'used'},image_urls:['/uploads/1730-example-11.jpg'],seller_username:'publico',
  seller_name:'Vendedor',status:'active',moderation_status:'published',
  seller_status:'active',seller_discoverable:true,
  created_at:'2026-10-13T10:00:00.000Z',updated_at:'2026-10-14T10:00:00.000Z'
};
test('Marketplace public URLs are stable, descriptive and independent of session',()=>{
 assert.equal(seo.listingPath(fixture),'/marketplace/p/25/sofa-chaiselongue-en-valencia');
 assert.equal(seo.slugify('Ático céntrico!!!'),'atico-centrico');
 assert.equal(seo.listingPath({...fixture,title:'<script>alert(1)</script>'}),'/marketplace/p/25/script-alert-1-script');
});
test('only active published ads from active discoverable sellers are indexable',()=>{
 assert.equal(seo.eligible(fixture),true);
 for(const override of [
  {status:'sold'},{status:'paused'},{status:'reserved'},
  {moderation_status:'hidden'},{seller_status:'suspended'},{seller_discoverable:false}
 ])assert.equal(seo.eligible({...fixture,...override}),false);
 const source=read('src/routes/marketplace-seo-v3251.js');
 assert.match(source,/router\.get\('\/marketplace\/p\/:id\/:slug\?'/);
 assert.match(source,/if\(!eligible\(row\)\)return unavailable/);
 assert.match(source,/res\.status\(gone\?410:404\)/);
});
test('Product structured data is factual and safe, with EUR price and condition',()=>{
 const item=seo.entitySchema(fixture,'https://redlibertad.com'+seo.listingPath(fixture),seo.imagePaths(fixture));
 assert.equal(item['@type'],'Product');
 assert.equal(item.offers.price,'180.00');
 assert.equal(item.offers.priceCurrency,'EUR');
 assert.equal(item.offers.itemCondition,'https://schema.org/UsedCondition');
 assert.equal(item.offers.availability,'https://schema.org/InStock');
 assert.equal(item.aggregateRating,undefined);
 assert.match(item.image[0],/\/marketplace\/imagen\/25\/0$/);
});
test('Service and property use their own schema rather than mislabeling Product',()=>{
 const service=seo.entitySchema({...fixture,kind:'service',deal:'offer'},'https://redlibertad.com/p',[]);
 const property=seo.entitySchema({...fixture,kind:'property',deal:'rent',details:{areaM2:75,rooms:2}},'https://redlibertad.com/p',[]);
 assert.equal(service['@type'],'Service');
 assert.equal(property['@type'],'RealEstateListing');
 assert.equal(property.about.floorSize.value,75);
 assert.equal(property.offers.priceCurrency,'EUR');
});
test('SSR escapes untrusted listing content in HTML and JSON-LD',()=>{
 const injected={...fixture,title:'<script>alert("x")</script>',description:'<img src=x onerror=alert(1)>'};
 const html=seo.listingHtml(injected);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<h1><script>/);
 assert.doesNotMatch(html,/<script>alert/);
 const raw=seo.jsonLd({name:'</script><script>alert(1)</script>'});
 assert.doesNotMatch(raw,/<script>/);
 const obj=JSON.parse(raw);
 assert.equal(obj.name,'</script><script>alert(1)</script>');
});
test('crawler routes, XML sitemap and internal discovery are wired',()=>{
 const source=read('src/routes/marketplace-seo-v3251.js');
 const server=read('server.js');
 const app=read('public/marketplace.html');
 const homepage=read('public/index.html');
 const market=read('public/marketplace-v3250.js');
 assert.match(server,/app\.use\(marketplaceSeoV3251\.router\)/);
 assert.match(server,/sitemap-marketplace\.xml/);
 assert.match(server,/Allow: \/marketplace\//);
 assert.match(server,/Disallow: \/uploads\//);
 assert.match(source,/\/sitemap-marketplace-:page\.xml/);
 assert.match(source,/image:image/);
 assert.match(source,/\/marketplace\/imagen\/:id\/:index/);
 assert.match(homepage,/href="\/marketplace\/explorar"/);
 assert.match(app,/href="\/marketplace\/explorar"/);
 assert.match(market,/market-seo-link/);
 assert.match(market,/\$\$\('\[data-kind\]'\)\.forEach/);
 assert.match(market,/contactName/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.66');
});

test('Public Marketplace mobile operation filters never clip the last link',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 const source=read('src/routes/marketplace-seo-v3251.js');
 assert.match(css,/@media\(max-width:600px\)\{\s*\.market-deals a\{/);
 assert.match(css,/\.market-deals a\{[^}]*min-width:0;[^}]*width:100%;[^}]*white-space:normal;[^}]*text-align:center;[^}]*\}/s);
 assert.match(css,/@media\(max-width:360px\)\{[^}]*\.market-deals a:last-child\{grid-column:1\/-1\}/s);
 assert.match(source,/marketplace-seo-v3251\.css\?v=3\.2\.66/);
 assert.match(source,/Compra · Busco/);
});
