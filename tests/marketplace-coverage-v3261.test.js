'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {nationalSale,originLocation,coverageLabel,publicLocation}=require('../src/services/marketplace-coverage-v3261');
const {entitySchema,listingHtml}=require('../src/routes/marketplace-seo-v3251');
const {listingInput}=require('../src/routes/marketplace-v3250');
const {csvRecords,parseProduct,importOptions}=require('../src/services/marketplace-woocommerce-csv-v3260');

const base={id:5,kind:'product',deal:'sale',title:'Taza Roblox',description:'Taza personalizada disponible para regalar a amigos y familiares.',category:'Tazas',city:'España',price_cents:1599,image_urls:['/uploads/market-import-photo.jpg'],details:{province:'España'},status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,seller_username:'mundotaza',seller_name:'MundoTaza',created_at:'2026-10-15T08:00:00.000Z',updated_at:'2026-10-15T08:00:00.000Z'};
test('Legacy España España means nationwide sale; physical origin is unknown',()=>{
 assert.equal(nationalSale(base),true);
 assert.equal(originLocation(base),'');
 assert.equal(publicLocation(base),'Venta disponible en toda España');
 const html=listingHtml(base,[]);
 assert.match(html,/Ámbito de venta/);
 assert.match(html,/Venta disponible en toda España/);
 assert.doesNotMatch(html,/Origen:<\/strong> Valencia/);
});
test('Valencia origin and nationwide sale are distinct; duplicate city/province hidden',()=>{
 const row={...base,city:'Valencia',details:{province:'Valencia',saleScope:'national'}};
 assert.equal(nationalSale(row),true);
 assert.equal(originLocation(row),'Valencia');
 assert.equal(publicLocation(row),'Valencia · Venta disponible en toda España');
 assert.equal(coverageLabel(row),'Venta disponible en toda España');
 const html=listingHtml(row,[]);
 assert.match(html,/Origen:<\/strong> Valencia/);
 assert.match(html,/Ámbito de venta:<\/strong> Venta disponible en toda España/);
 const product=entitySchema(row,'https://redlibertad.com/marketplace/p/5/taza-roblox',[]);
 assert.deepEqual(product.offers.areaServed,{'@type':'Country',name:'España'});
 assert.equal(product.offers.price,'15.99');
 assert.equal(product['@type'],'Product');
});
test('Do not imply nationwide sales for non-products, buys or local-only products',()=>{
 const nonNational={...base,kind:'property',details:{province:'España'}};
 assert.equal(nationalSale(nonNational),false);
 assert.equal(nationalSale({...base,deal:'buy'}),false);
 assert.equal(nationalSale({...base,details:{province:'España',saleScope:'local'}}),false);
 const nationalOffer=entitySchema({...base,details:{province:'España',saleScope:'national'}},'https://redlibertad.com/example',[]);
 assert.equal(nationalOffer.offers.priceCurrency,'EUR');
 assert.equal(nationalOffer.offers.areaServed.name,'España');
 const nonOffer=entitySchema({...base,city:'Valencia',details:{province:'Valencia'}},'https://redlibertad.com/example',[]);
 assert.equal(nonOffer.offers.areaServed,undefined);
});
test('Seller can select national sale scope in hand-created listing and WooCommerce import',()=>{
 const row={kind:'product',deal:'sale',title:'Taza Roblox',description:'Taza personalizada para regalar en cualquier ocasión.',category:'Tazas',city:'Valencia',priceCents:1599,images:[],details:{province:'Valencia',saleScope:'national'}};
 assert.equal(listingInput.safeParse(row).success,true);
 assert.equal(listingInput.safeParse({...row,kind:'service',deal:'offer'}).success,false);
 assert.equal(importOptions.safeParse({city:'Valencia',province:'Valencia',saleScope:'national'}).success,true);
 const csv='ID,Type,SKU,Name,Published,Description,Regular price,Images\n101,simple,CUP-1,Taza personalizada,1,Taza de cerámica para regalos y celebraciones.,15.99,https://shop.example.com/taza.jpg';
 const imported=parseProduct(csvRecords(csv)[0],{city:'Valencia',province:'Valencia',saleScope:'national'});
 assert.equal(imported.listing.details.saleScope,'national');
 assert.equal(imported.listing.city,'Valencia');
 assert.equal(imported.state,'pending');
});
test('Forms, independent coverage and browser syntax are present',()=>{
 const html=fs.readFileSync('public/marketplace.html','utf8');
 const importHtml=fs.readFileSync('public/marketplace-import-v3260.html','utf8');
 const js=fs.readFileSync('public/marketplace-v3250.js','utf8');
 assert.match(html,/name="saleScope"/);
 assert.match(importHtml,/id="importSaleScope"/);
 assert.match(js,/marketNational\(item\)/);
 assert.match(js,/extra\.saleScope=scope/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('public/marketplace-import-v3260.js','utf8')));
});
