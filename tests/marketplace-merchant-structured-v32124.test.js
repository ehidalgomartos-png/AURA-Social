'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const merchant=require('../src/services/marketplace-merchant-structured-v32124');
const seo=require('../src/routes/marketplace-seo-v3251');
const audit=require('../src/services/marketplace-seo-audit-v32120');
const base={
 id:5,title:'Taza Roblox',description:'Taza de cerámica con diseño inspirado en un videojuego, para regalar a personas aficionadas.',
 price_cents:1599,kind:'product',deal:'sale',category:'Video Juegos',city:'España',
 details:{province:'España',saleScope:'national'},image_urls:['/uploads/taza-5.webp'],
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 seller_username:'tienda-mundo',seller_name:'Tienda Mundo',
 created_at:'2026-10-19T12:00:00.000Z',updated_at:'2026-10-19T13:00:00.000Z'
};
const clone=(v)=>JSON.parse(JSON.stringify(v));
const schema=row=>seo.entitySchema(row,'https://redlibertad.com'+seo.listingPath(row),seo.imagePaths(row));
function structuredFromHtml(html){
 const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
 assert.ok(match,'expected server-rendered JSON-LD');
 return JSON.parse(match[1]);
}
test('V3.2.124 public chat-only product names only actual public seller, not RedLibertad or a fictitious store',()=>{
 const row=clone(base);
 const before=clone(row);
 const data=schema(row);
 assert.deepEqual(data.offers.seller,{
  '@type':'Person',name:'Tienda Mundo',url:'https://redlibertad.com/perfil/tienda-mundo'
 });
 assert.equal(data.brand,undefined);
 assert.equal(data.gtin13,undefined);
 assert.equal(data.offers.itemCondition,undefined);
 assert.equal(data.offers.shippingDetails,undefined);
 assert.equal(data.offers.hasMerchantReturnPolicy,undefined);
 assert.equal(data.offers.seller['@type'],'Person');
 assert.deepEqual(row,before);
 const html=seo.listingHtml(row);
 assert.match(html,/Confirma con el vendedor las condiciones de entrega y devolución/);
 const ld=structuredFromHtml(html)['@graph'][0];
 assert.deepEqual(ld.offers.seller,data.offers.seller);
 assert.equal(ld.brand,undefined);
 assert.equal(ld.offers.shippingDetails,undefined);
 assert.equal(ld.offers.hasMerchantReturnPolicy,undefined);
 assert.doesNotMatch(html,/marca oficial de Roblox|envío gratis|devoluciones gratuitas/i);
});
test('V3.2.124 approved external checkout identifies its real external shop, not the platform',()=>{
 const row={
  ...base,
  store_status:'approved',purchase_enabled:true,
  professional_store_name:'Tienda de Tazas del Vendedor',
  store_url:'https://mundotaza.example/',
  external_product_url:'https://mundotaza.example/productos/taza-roblox/',
  external_stock_status:'in_stock',external_source:'manual'
 };
 const seller=merchant.sellerForOffer(row);
 assert.deepEqual(seller,{
  '@type':'Organization',name:'Tienda de Tazas del Vendedor',
  url:'https://mundotaza.example/'
 });
 assert.deepEqual(schema(row).offers.seller,seller);
 const html=seo.listingHtml(row);
 assert.match(html,/Compra en la tienda/);
 assert.match(html,/condiciones de envío y devolución de esa tienda/);
 assert.deepEqual(structuredFromHtml(html)['@graph'][0].offers.seller,seller);
 assert.doesNotMatch(html,/shippingDetails|hasMerchantReturnPolicy/);
});
test('a shop not approved for an external purchase or mismatched shop domain cannot impersonate merchant',()=>{
 const scenarios=[
  {store_status:'pending'},
  {purchase_enabled:false},
  {external_stock_status:'out_of_stock'},
  {external_product_url:'https://other-shop.example/mug'},
  {professional_store_name:''},
  {store_url:'http://unsecured.example/'}
 ];
 const approved={
  ...base,store_status:'approved',purchase_enabled:true,
  professional_store_name:'Other Brand Shop',
  store_url:'https://real-shop.example/',
  external_product_url:'https://real-shop.example/product',
  external_stock_status:'in_stock',external_source:'manual'
 };
 for(const changes of scenarios){
  const row={...approved,...changes};
  assert.notEqual(merchant.sellerForOffer(row)?.['@type'],'Organization',JSON.stringify(changes));
  assert.equal(merchant.sellerForOffer(row)?.['@type'],'Person',JSON.stringify(changes));
 }
 for(const changed of [
  {status:'paused'},{moderation_status:'hidden'},{seller_status:'suspended'},
  {seller_discoverable:false},{seller_username:'bad/email'},
  {seller_username:''},{deal:'buy'},{kind:'service'}
 ]){
  const row={...base,...changed};
  assert.equal(merchant.sellerForOffer(row),null,JSON.stringify(changed));
 }
});
test('V3.2.124 verified identifiers continue to be used, but names of game characters are not brands',()=>{
 const valid=clone(base);
 valid.details={brand:'Marca real indicada por el vendedor',gtin:'4006381333931',mpn:'T-05'};
 const data=schema(valid);
 assert.equal(data.brand.name,'Marca real indicada por el vendedor');
 assert.equal(data.gtin13,'4006381333931');
 assert.equal(data.mpn,'T-05');
 assert.equal(data.offers.seller.name,'Tienda Mundo');
 assert.equal(merchant.productSignals(base).hasBrand,false);
 assert.equal(merchant.productSignals(base).hasValidGtin,false);
 assert.equal(merchant.productSignals({...base,details:{gtin:'4006381333932'}}).hasValidGtin,false);
 assert.deepEqual(merchant.productSignals(valid),{hasBrand:true,hasValidGtin:true,hasMpn:true});
});
test('V3.2.124 aggregate only public sampled sale-product identifiers, never claim all products or a Google report',()=>{
 const rows=[
  base,
  {...base,id:6,details:{brand:'Marca declarada'}},
  {...base,id:7,details:{gtin:'4006381333931'}},
  {...base,id:8,details:{mpn:'MT-8'}},
  {...base,id:9,kind:'service',deal:'offer',details:{}},
  {...base,id:10,deal:'buy',details:{}}
 ];
 const report=merchant.merchantSample(rows);
 assert.equal(report.source,'recent_public_product_sale_sample');
 assert.equal(report.productsReviewed,4);
 assert.equal(report.withBrand,1);
 assert.equal(report.withValidGtin,1);
 assert.equal(report.withMpn,1);
 assert.equal(report.withoutAnyDeclaredBrandOrIdentifier,1);
 assert.equal(report.status,'informativo_no_bloqueante');
 assert.match(report.shipping,/No se publican costes/);
 assert.match(report.returns,/No se declara una política/);
 assert.match(report.identifiers,/No se infieren marcas ni GTIN/);
 assert.doesNotMatch(JSON.stringify(report),/googleIndexed|MerchantReady:true|seller_email|privateKey/);
 const large=merchant.merchantSample(Array.from({length:120},(_,i)=>({...base,id:100+i,details:{}})));
 assert.equal(large.productsReviewed,100);
 assert.equal(large.withoutAnyDeclaredBrandOrIdentifier,100);
});
test('V3.2.124 admin diagnosis reuses strict public-only SQL and has no new merchant write or Google API',()=>{
 for(const clause of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true"])
  assert.ok(audit.sampleSql.includes(clause),clause);
 const route=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=route.indexOf("router.get('/api/admin/marketplace/seo/auditoria'");
 const end=route.indexOf("router.get('/marketplace/mi-tienda'",start);
 assert.ok(start>0&&end>start);
 const privateRoute=route.slice(start,end);
 assert.match(privateRoute,/requireAdmin/);
 assert.match(privateRoute,/marketplaceMerchantV32124\.merchantSample\(sample\.rows\)/);
 assert.match(privateRoute,/Cache-Control','private,no-store'/);
 assert.match(privateRoute,/X-Robots-Tag','noindex,nofollow'/);
 const helper=fs.readFileSync('src/services/marketplace-merchant-structured-v32124.js','utf8');
 assert.doesNotMatch(helper,/INSERT INTO|UPDATE marketplace_listings|DELETE FROM|api\/indexing|index:inspect|sk_live_/);
});
test('V3.2.124 responsive private merchant guidance uses safe DOM and no external requests',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 assert.match(html,/id="auditMerchantSamples"/);
 assert.match(html,/id="auditMerchantGuidance"/);
 assert.match(html,/Avisos opcionales/);
 assert.match(html,/v=3\.2\.124/);
 assert.match(js,/renderMerchantAdvice\(data\.merchantStructuredAdvice\)/);
 assert.match(js,/data\.withoutAnyDeclaredBrandOrIdentifier/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(/);
 assert.doesNotMatch(js,/fetch\('https:\/\/.*merchant/i);
});
