'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=require('../src/routes/marketplace-v3250');
const seo=require('../src/routes/marketplace-seo-v3251');
const sample={
 id:2,title:'Taza del Grinch',description:'Taza del Grinch con una frase navideña. Un regalo para alguien especial. WhatsAppFacebookTwitter',
 kind:'product',deal:'sale',category:'Tazas',city:'Valencia',price_cents:1599,details:{province:'Valencia',subcategory:'Personalizadas'},
 image_urls:['/uploads/grinch.jpg'],status:'active',moderation_status:'published',
 seller_status:'active',seller_discoverable:true,seller_username:'hidalgoValencia',seller_name:'Hidalgo Valencia',
 created_at:'2026-10-14T09:00:00Z',updated_at:'2026-10-14T09:00:00Z'
};
test('V3.2.60 accepts optional province and subcategory without changing legacy listings',()=>{
 const fields={kind:'product',deal:'sale',title:'Sofá en Valencia',description:'Sofá de dos plazas, disponible en Valencia y en buen estado.',category:'Hogar y muebles',city:'Valencia',priceCents:30000,images:[]};
 assert.equal(api.listingInput.safeParse(fields).success,true);
 assert.equal(api.listingInput.safeParse({...fields,details:{province:'Valencia',subcategory:'Sofás'}}).success,true);
 assert.equal(api.listingUpdateInput.safeParse({...fields,details:{province:'Valencia',subcategory:'Sofás'},status:'active'}).success,true);
 assert.equal(api.listingInput.safeParse({...fields,details:{province:'a'.repeat(101)}}).success,false);
 assert.equal(api.listingInput.safeParse({...fields,details:{subcategory:'a'.repeat(66)}}).success,false);
});
test('Authenticated listing filters accept category and province as parameterized predicates',()=>{
 const code=read('src/routes/marketplace-v3250.js');
 assert.match(code,/const province=String\(req\.query\.province/);
 assert.match(code,/const category=String\(req\.query\.category/);
 assert.match(code,/COALESCE\(l\.details->>'province',''\) ILIKE/);
 assert.match(code,/clauses\.push\('l\.category=\$'\+args\.length\)/);
 assert.match(code,/u\.discoverable AS seller_discoverable/);
 assert.doesNotMatch(code,/DELETE FROM marketplace_listings WHERE id=\$1\s*RETURNING/);
});
test('Public listing displays province, real profile and WhatsApp/Facebook/copy links',()=>{
 const rendered=seo.listingHtml(sample);
 assert.match(rendered,/en Valencia/);
 assert.doesNotMatch(rendered,/Valencia · Valencia/);
 assert.match(seo.listingHtml({...sample,details:{...sample.details,province:'Castellón'}}),/Valencia · Castellón/);
 assert.match(rendered,/Tazas · Personalizadas/);
 assert.match(rendered,/href="\/perfil\/hidalgoValencia"/);
 assert.match(rendered,/api\.whatsapp\.com\/send\?text=/);
 assert.match(rendered,/facebook\.com\/sharer\/sharer\.php\?u=/);
 assert.match(rendered,/data-copy-url="https:\/\/redlibertad\.com\/marketplace\/p\/2\/taza-del-grinch"/);
 assert.match(rendered,/\/marketplace\?report=2/);
 assert.match(rendered,/15,99/);
 assert.match(rendered,/canonical/);
});
test('SEO cleans imported social share labels but never fabricates rating or commercial policies',()=>{
 const clean=seo.seoDescription(sample);
 assert.match(clean,/alguien especial\./);
 assert.doesNotMatch(clean,/WhatsAppFacebookTwitter/);
 const offer=seo.entitySchema(sample,'https://redlibertad.com/marketplace/p/2/taza-del-grinch',[]);
 assert.equal(offer['@type'],'Product');
 assert.equal(offer.offers.price,'15.99');
 assert.equal(offer.aggregateRating,undefined);
 assert.equal(offer.review,undefined);
 assert.equal(offer.brand,undefined);
 assert.equal(offer.offers.shippingDetails,undefined);
 assert.equal(offer.offers.hasMerchantReturnPolicy,undefined);
 assert.doesNotMatch(seo.listingHtml(sample).match(/<meta name="description" content="([^"]+)"/)?.[1]||'',/WhatsAppFacebookTwitter/);
});
test('Existing wanted ads are still demand rather than merchant offers',()=>{
 const wanted={...sample,deal:'buy'};
 const schema=seo.entitySchema(wanted,'https://redlibertad.com/marketplace/p/2/taza-del-grinch',[]);
 assert.equal(schema['@type'],'WebPage');
 assert.equal(schema.offers,undefined);
 assert.match(seo.listingHtml(wanted),/BUSCO COMPRAR/);
});
test('Mobile editor category suggestions, typed details persistence and Spanish reporting are wired',()=>{
 const html=read('public/marketplace.html'),js=read('public/marketplace-v3250.js');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(html,/name="province"/);
 assert.match(html,/name="subcategory"/);
 assert.match(html,/name="category" list="listingCategories"/);
 assert.match(html,/id="reportDialog"/);
 assert.match(html,/value="fraud">Posible estafa/);
 assert.match(js,/const payload=\{\.\.\.parsed\.data,images:\[\.\.\.state\.images\]\}/);
 assert.match(js,/f\('areaM2'\)\.value=item\.details\?\.areaM2/);
 assert.match(js,/f\('serviceMode'\)\.value=item\.details\?\.serviceMode/);
 assert.match(js,/const reportId=new URLSearchParams/);
 assert.match(js,/\/perfil\//);
 assert.match(js,/navigator\.share/);
 assert.match(js,/function submitReport\(event\)/);
 assert.match(js,/reason:String\(data\.get\('reason'\)/);
});
test('Public copy-link script restricts to our Marketplace URL',()=>{
 const src=read('public/marketplace-share-v3254.js');
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.match(src,/safePublicListingShareUrlV3272/);
 assert.match(src,/navigator\.clipboard/);
 assert.match(src,/window\.prompt/);
});
test('Version and frontend caches match V3.2.60',()=>{
 const html=read('public/marketplace.html');
 assert.equal(JSON.parse(read('package.json')).version,'3.2.77');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.77'/);
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.75/);
 assert.match(html,/marketplace-v3250\.css\?v=3\.2\.75/);
 const seoSource=read('src/routes/marketplace-seo-v3251.js');
 assert.match(seoSource,/marketplace-share-v3254\.js\?v=3\.2\.75/);
});
