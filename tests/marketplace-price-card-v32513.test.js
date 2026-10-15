'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
const seo=require('../src/routes/marketplace-seo-v3251');

const sample={
  id:34,
  title:'Taza Flork Canción «Lokita Por Mí»',
  description:'Una taza real de colección con detalles e imagen para el anuncio público.',
  category:'Tazas',city:'España',kind:'product',deal:'sale',
  price_cents:1599,
  image_urls:['/uploads/1730-product-photo.jpg'],
  details:{condition:'new'},
  created_at:'2026-10-14T09:00:00.000Z',updated_at:'2026-10-14T09:00:00.000Z',
  seller_username:'testvendedor',seller_name:'Vendedor',
  status:'active',moderation_status:'published',
  seller_status:'active',seller_discoverable:true
};

test('Public product page converts price cents to Spanish EUR',()=>{
  const html=seo.listingHtml(sample);
  assert.match(html,/15,99(?:&nbsp;|\u00a0|\s)*€/);
  assert.doesNotMatch(html,/1599,00(?:&nbsp;|\u00a0|\s)*€/);
  assert.doesNotMatch(html,/1\.599,00(?:&nbsp;|\u00a0|\s)*€/);
});

test('Product structured Offer price remains 15.99 EUR, matching visible page',()=>{
  const url='https://redlibertad.com'+seo.listingPath(sample);
  const structured=seo.entitySchema(sample,url,seo.imagePaths(sample));
  assert.equal(structured.offers.price,'15.99');
  assert.equal(structured.offers.priceCurrency,'EUR');
  assert.equal(structured['@type'],'Product');
  const html=seo.listingHtml({...sample,price_cents:0});
  assert.match(html,/0,00(?:&nbsp;|\u00a0|\s)*€/);
});

test('No product image can overlap card titles or actions',()=>{
 const css=read('public/marketplace-v3250.css');
 assert.match(css,/\.thumb\{[^}]*overflow:hidden/);
 assert.match(css,/\.thumb img\{[^}]*object-fit:contain/);
 assert.match(css,/\.thumb img\{[^}]*min-height:0/);
 assert.match(css,/\.cardbody\{[^}]*padding:/);
});

test('Marketplace uses a single, full-width product card on narrow phones',()=>{
 const css=read('public/marketplace-v3250.css');
 assert.match(css,/@media\(max-width:600px\)\{\.cards\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:600px\)[\s\S]*?\.thumb\{height:255px\}/);
});

test('CSS versioning updates both member cards and Google indexable public pages',()=>{
 const member=read('public/marketplace.html');
 const seoCode=read('src/routes/marketplace-seo-v3251.js');
 assert.match(member,/marketplace-v3250\.css\?v=3\.2\.65/);
 assert.match(seoCode,/marketplace-v3250\.css\?v=3\.2\.65/);
 assert.match(seoCode,/marketplace-seo-v3251\.css\?v=3\.2\.63\.2/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.65');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.65'/);
});
