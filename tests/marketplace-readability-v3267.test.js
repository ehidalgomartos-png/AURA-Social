'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {readableDescription,descriptionParts}=require('../src/services/marketplace-description-v3267');
const seo=require('../src/routes/marketplace-seo-v3251');
const {csvRecords,parseProduct}=require('../src/services/marketplace-woocommerce-csv-v3260');
const read=p=>fs.readFileSync(p,'utf8');
const fixture={
 id:50,title:'Armario escobero blanco',description:'Armario escobero con baldas y puertas, pensado para ordenar utensilios del hogar.',
 category:'Hogar y muebles',kind:'product',deal:'sale',city:'Valencia',price_cents:23500,
 image_urls:['/uploads/wardrobe-test.webp'],details:{province:'Valencia',saleScope:'national'},
 seller_username:'muebles',seller_name:'Muebles',status:'active',moderation_status:'published',
 seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-15T10:00:00.000Z',updated_at:'2026-10-15T10:00:00.000Z'
};
test('legacy escaped WooCommerce newlines render as actual lines without changing stored text',()=>{
 const raw='Primera línea\\nSegunda línea\\r\\nTercera línea';
 assert.equal(readableDescription(raw),'Primera línea\nSegunda línea\nTercera línea');
 assert.ok(raw.includes('\\n'));
 const html=seo.listingHtml({...fixture,description:raw});
 assert.match(html,/Primera línea\nSegunda línea\nTercera línea/);
 assert.doesNotMatch(html,/Primera línea\\nSegunda línea/);
 assert.match(html,/market-seo-description/);
});
test('very long descriptions remain complete in semantic expandable text, safely escaped',()=>{
 const long=('Mueble funcional para ordenar herramientas y ropa. ').repeat(26).trim();
 const {preview,more}=descriptionParts(long);
 assert.ok(more.length>0);
 assert.equal(preview+' '+more,long);
 const html=seo.listingHtml({...fixture,description:long+'<script>alert(1)</script>'});
 assert.match(html,/<details class="market-description-expand">/);
 assert.match(html,/Leer descripción completa/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/rel="canonical"/);
 assert.match(html,/application\/ld\+json/);
});
test('related listings keep links, prices and legible inline badge layout',()=>{
 const html=seo.listingHtml(fixture,[{...fixture,id:51,title:'Armario auxiliar',price_cents:19900}]);
 assert.match(html,/class="cards market-public-grid"/);
 assert.match(html,/class="market-card-labels"/);
 assert.match(html,/marketplace\/p\/51\/armario-auxiliar/);
 assert.match(html,/199,00/);
 assert.match(html,/Consultar al vendedor/);
});
test('WooCommerce parses escaped newlines on future CSV uploads, without changing national sale metadata',()=>{
 const csv='ID,Type,SKU,Name,Published,Description,Regular price,Images\n'+
  '18,simple,armario-18,Armario auxiliar blanco,1,"Producto auxiliar\\nIncluye dos puertas\\nIdeal para el hogar",235,https://example.org/armario.jpg';
 const parsed=parseProduct(csvRecords(csv)[0],{city:'Valencia',province:'Valencia',saleScope:'national'});
 assert.equal(parsed.state,'pending');
 assert.equal(parsed.listing.description,'Producto auxiliar Incluye dos puertas Ideal para el hogar');
 assert.equal(parsed.listing.details.saleScope,'national');
 assert.equal(parsed.listing.priceCents,23500);
});
test('mobile catalogue has more legible labels without cropping furniture images',()=>{
 const css=read('public/marketplace-seo-v3251.css'),source=read('src/routes/marketplace-seo-v3251.js');
 assert.match(css,/\.market-public-grid \.market-card-labels\{display:flex/);
 assert.match(css,/\.market-public-grid \.cardbody h2\{font-size:15px/);
 assert.match(css,/\.market-public-grid \.thumb img\{[^}]*object-fit:contain/);
 assert.match(css,/\.market-related \.cards\.market-public-grid/);
 assert.match(css,/\.market-description-expand>summary\{[^}]*min-height:44px/);
 assert.match(source,/bodyClass:'market-public-catalog'/);
});
test('private detail, version, cache and health are consistent',()=>{
 assert.match(read('public/marketplace-v3250.js'),/marketDescriptionHtmlV3267\(item.description\)/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.67/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.67/);
 assert.match(read('server.js'),/APP_VERSION='3\.2\.67'/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.67');
});

