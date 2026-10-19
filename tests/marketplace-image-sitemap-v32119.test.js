'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sitemap=require('../src/routes/marketplace-seo-v3251');
const origin='https://redlibertad.com';
const sample={
 id:119,title:'Armario 3 puertas en Valencia',
 kind:'product',deal:'sale',category:'Armarios Puertas Batientes',
 status:'active',moderation_status:'published',seller_status:'active',
 seller_discoverable:true,
 image_urls:[
  '/uploads/armario-119-a.webp','/uploads/armario-119-b.jpg',
  '/uploads/armario-119-c.png','/uploads/armario-119-d.jpeg',
  '/uploads/armario-119-e.webp','/uploads/armario-119-f.webp',
  '/uploads/armario-119-g.webp'
 ],
 updated_at:'2026-10-19T12:05:00.000Z'
};
test('one listing includes all six publicly served photos with exactly one canonical product URL',()=>{
 const images=sitemap.sitemapImagePaths(sample);
 assert.equal(images.length,6);
 assert.deepEqual(images,Array.from({length:6},(_,i)=>origin+'/marketplace/imagen/119/'+i));
 const xml=sitemap.sitemapListingEntry(sample);
 assert.match(xml,/<loc>https:\/\/redlibertad.com\/marketplace\/p\/119\/armario-3-puertas-en-valencia<\/loc>/);
 assert.match(xml,/<lastmod>2026-10-19T12:05:00.000Z<\/lastmod>/);
 assert.equal((xml.match(/<image:image>/g)||[]).length,6);
 assert.equal((xml.match(/<url>/g)||[]).length,1);
 assert.doesNotMatch(xml,/\/uploads\/|\/imagen\/119\/6|external\.com/);
});
test('invalid, external and repeated photos never enter the sitemap; maintain original image indices',()=>{
 const row={...sample,id:120,image_urls:[
  'https://shop.example.com/secret.jpg','/uploads/armario-A.webp',
  '/uploads/armario-A.webp','/uploads/armario-B.png',
  '/uploads/../private.jpg','/uploads/armario-C.jpg',
  '/uploads/armario-D.jpg'
 ]};
 assert.deepEqual(sitemap.sitemapImagePaths(row),[
  origin+'/marketplace/imagen/120/1',
  origin+'/marketplace/imagen/120/3',
  origin+'/marketplace/imagen/120/5'
 ]);
 const xml=sitemap.sitemapListingEntry(row);
 assert.equal((xml.match(/<image:image>/g)||[]).length,3);
 assert.doesNotMatch(xml,/shop\.example|secret|private|\/imagen\/120\/0|\/imagen\/120\/2|\/imagen\/120\/4|\/imagen\/120\/6/);
});
test('zero photos or invalid input stays valid XML with URL and updated date',()=>{
 for(const media of [null,[],['https://other.example.org/invalid.jpg'],['/uploads/../bad.webp']]){
  const row={...sample,id:121,image_urls:media};
  assert.equal(sitemap.sitemapImagePaths(row).length,0);
  const xml=sitemap.sitemapListingEntry(row);
  assert.match(xml,/^<url><loc>https:\/\/redlibertad\.com\/marketplace\/p\/121\//);
  assert.doesNotMatch(xml,/<image:image>/);
 }
});
test('XML escapes special characters in product titles without exposing markup',()=>{
 const row={...sample,title:'Mesa & silla <img> "rosa"'};
 const xml=sitemap.sitemapListingEntry(row);
 assert.match(xml,/\/marketplace\/p\/119\/mesa-silla-img-rosa/);
 assert.doesNotMatch(xml,/<script>|<img>/);
 assert.equal((xml.match(/<image:image>/g)||[]).length,6);
});
test('private and inactive listings must remain outside both sitemap queries and image proxy',()=>{
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const typed=src.slice(src.indexOf('const MARKETPLACE_XML_WHERE='),src.indexOf("router.get('/sitemap-marketplace-:page.xml'"));
 const universal=src.slice(src.indexOf("router.get('/sitemap-marketplace-:page.xml'"),src.indexOf('module.exports='));
 for(const code of [typed,universal]){
  assert.match(code,/l\.status='active'/);
  assert.match(code,/l\.moderation_status='published'/);
  assert.match(code,/u\.status='active'/);
  assert.match(code,/u\.discoverable=true/);
  assert.match(code,/\.map\(sitemapListingEntry\)/);
 }
 const images=src.slice(src.indexOf("router.get('/marketplace/imagen/:id/:index'"),src.indexOf('function listingCard(row)'));
 assert.match(images,/if\(!eligible\(row\)\)return res\.sendStatus\(404\)/);
 assert.match(images,/if\(!validImage\(url\)\)return res\.sendStatus\(404\)/);
 assert.match(images,/res\.sendFile\(filename/);
 assert.doesNotMatch(src,/\/uploads\/\$\{/);
 assert.match(src,/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
});
test('sitemap images agree with the HTML and product structured data, not external WooCommerce URLs',()=>{
 const row={...sample,title:'Armario publicable',image_urls:sample.image_urls.slice(0,4),details:{condition:'new'},price_cents:23500,description:'Armario cuatro puertas de venta pública.',city:'Valencia',
  seller_name:'Vendedor público',seller_username:'publico',created_at:'2026-10-19T10:00:00.000Z'};
 const html=sitemap.listingHtml(row);
 const xml=sitemap.sitemapListingEntry(row);
 const schema=sitemap.entitySchema(row,origin+sitemap.listingPath(row),sitemap.imagePaths(row));
 for(let index=0;index<4;index++){
  const url=origin+'/marketplace/imagen/119/'+index;
  assert.ok(schema.image.includes(url));
  assert.ok(html.includes(url));
  assert.ok(xml.includes(url));
 }
 assert.equal((xml.match(/<image:image>/g)||[]).length,4);
 assert.doesNotMatch(xml,/sk_live_|buy\.example/);
});
