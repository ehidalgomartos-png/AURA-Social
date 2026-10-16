'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {storeProductLink,validExternalProductLink,externalStoreLinkForListing}=require('../src/services/marketplace-external-store-v3276');
const {listingInput}=require('../src/routes/marketplace-v3250');
const seo=require('../src/routes/marketplace-seo-v3251');
const {csvRecords,parseProduct}=require('../src/services/marketplace-woocommerce-csv-v3260');
const read=p=>fs.readFileSync(p,'utf8');
const url='https://www.mundotaza.com/producto/taza-halloween/';
const listing={
 id:77,title:'Taza Halloween original',description:'Taza de cerámica original, un regalo especial para Halloween y ocasiones divertidas.',
 category:'Tazas',kind:'product',deal:'sale',city:'Valencia',price_cents:1599,
 image_urls:['/uploads/imagen.webp'],status:'active',moderation_status:'published',
 seller_status:'active',seller_discoverable:true,seller_name:'Mundotaza',seller_username:'mundotaza',
 seller_website_url:'https://mundotaza.com/',details:{externalProductUrl:url,condition:'new'},
 created_at:'2026-10-16T09:00:00Z',updated_at:'2026-10-16T09:00:00Z'
};
const post={kind:'product',deal:'sale',title:listing.title,description:listing.description,
 category:'Tazas',city:'Valencia',priceCents:1599,images:['/uploads/imagen.webp'],
 details:{externalProductUrl:url}};
test('HTTPS store URL must match seller website, allowing www but not lookalikes',()=>{
 assert.equal(storeProductLink(url,'https://mundotaza.com/'),url);
 assert.equal(storeProductLink(url,'https://www.mundotaza.com/about'),url);
 assert.equal(storeProductLink('https://shop.mundotaza.com/p/a','https://shop.mundotaza.com/'),'https://shop.mundotaza.com/p/a');
 for(const wrong of [
  'https://mundotaza.com.evil.test/p/foo',
  'https://othermerchant.com/product/a',
  'https://evil.test/?redirect=mundotaza.com',
  'http://mundotaza.com/product/a',
  'https://user:pass@mundotaza.com/product/a',
  'https://mundotaza.com:444/product/a',
  'https://mundotaza.com',
  'https://127.0.0.1/product/a',
  'javascript:alert(1)'
 ])assert.equal(storeProductLink(wrong,'https://mundotaza.com'),null,wrong);
 assert.equal(storeProductLink(url,'https://mundotaza.com.evil.test'),null);
 assert.equal(storeProductLink(url,''),null);
});
test('external links cannot be added to wanted, service or property listings',()=>{
 assert.equal(listingInput.safeParse(post).success,true);
 assert.equal(listingInput.safeParse({...post,deal:'buy'}).success,false);
 assert.equal(listingInput.safeParse({...post,kind:'service',deal:'offer'}).success,false);
 assert.equal(listingInput.safeParse({...post,details:{externalProductUrl:'javascript:alert(1)'}}).success,false);
 assert.equal(validExternalProductLink(url),true);
});
test('public product shows clearly external checkout plus existing chat and share without changing canonical',()=>{
 const html=seo.listingHtml(listing);
 assert.match(html,/Comprar en la tienda externa/);
 assert.match(html,/mundotaza.com/);
 assert.match(html,/rel="noopener noreferrer nofollow ugc sponsored"/);
 assert.match(html,/target="_blank"/);
 assert.match(html,/Consultar al vendedor/);
 assert.match(html,/Compartir desde el móvil/);
 assert.match(html,/Publicar en RedLibertad/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/marketplace\/p\/77\//);
 assert.match(html,/RedLibertad no procesa pagos/);
});
test('mismatched, incomplete, hidden or old listings do not show outbound purchase link',()=>{
 for(const row of [
 {...listing,seller_website_url:'https://fake.example.com'},
 {...listing,details:{}},
 {...listing,deal:'buy'},
 {...listing,status:'paused'},
 {...listing,moderation_status:'hidden'},
 {...listing,seller_discoverable:false},
 {...listing,seller_status:'suspended'}
 ]){
  assert.equal(externalStoreLinkForListing(row),null);
  if(row.status==='active'&&row.moderation_status==='published'&&row.seller_status==='active')
   assert.doesNotMatch(seo.listingHtml(row),/Comprar en la tienda externa/);
 }
});
test('WooCommerce CSV preserves explicit Product URL, and never fabricates URLs when absent',()=>{
 const csv='ID,Type,Name,Description,Regular price,Published,In stock?,Images,Categories,Product URL\n'+
 '277,simple,Taza Halloween original,"Taza con diseño de Halloween para amantes de las tazas y regalos.",15.99,1,1,https://example.com/a.jpg,Tazas,'+url+'\n';
 const opts={city:'Valencia'};
 const parsed=parseProduct(csvRecords(csv)[0],opts);
 assert.equal(parsed.error,'');
 assert.equal(parsed.listing.details.externalProductUrl,url);
 const csvNoUrl=csv.replace(/,Product URL/,'').replace(','+url+'\n','\n');
 const plain=parseProduct(csvRecords(csvNoUrl)[0],opts);
 assert.equal(plain.error,'');
 assert.equal(Object.hasOwn(plain.listing.details,'externalProductUrl'),false);
});
test('CSV rejects invalid external store before publishing, verifies ownership at preview and commit',()=>{
 const csv=read('src/services/marketplace-woocommerce-csv-v3260.js');
 const importer=read('src/routes/marketplace-import-v3260.js');
 assert.match(csv,/Producto.*CSV|WooCommerce/);
 assert.match(importer,/storeProductLink\(external,seller\.rows\[0\]\?\.website_url\)/);
 assert.match(importer,/storeProductLink\(v\.details\.externalProductUrl,owner\.rows\[0\]\?\.website_url\)/);
 assert.match(importer,/item\.state='invalid'/);
});
test('server checks logged-in seller domain on both create and edit, never frontend only',()=>{
 const source=read('src/routes/marketplace-v3250.js');
 assert.match(source,/sellerStoreLinkAllowedV3276/);
 assert.equal((source.match(/if\(!await sellerStoreLinkAllowedV3276/g)||[]).length,2);
 assert.match(source,/SELECT website_url FROM users WHERE id=\$1/);
 assert.match(source,/external_store_url_mismatch/);
});
test('mobile product editor, SEO CTA and Merchant no-auto-feed are deliberately separate',()=>{
 const form=read('public/marketplace.html');
 const browser=read('public/marketplace-v3250.js');
 const css=read('public/marketplace-seo-v3251.css');
 const merchant=read('src/services/marketplace-google-v3264.js');
 assert.match(form,/name="externalProductUrl"/);
 assert.match(browser,/extra\.externalProductUrl=external/);
 assert.match(browser,/f\('externalProductUrl'\)/);
 assert.match(css,/market-external-buy-v3276/);
 assert.match(merchant,/merchantReady:false/);
 assert.match(read('docs/marketplace-profesional-v3275-plan.md'),/sin|Sin cobros|Sin cobros reales/i);
});
test('release number, script cache keys and test command are aligned',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.76');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.76'/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.76/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.76/);
});
