'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {listingInput,listingUpdateInput}=require('../src/routes/marketplace-v3250');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('public/marketplace.html');
const js=read('public/marketplace-v3250.js');
const css=read('public/marketplace-v3250.css');
const source=read('src/routes/marketplace-seo-v3251.js');
const sample={
 kind:'product',deal:'sale',title:'Taza personalizada',description:'Taza de cerámica personalizable en perfecto estado.',
 category:'Tazas',city:'Valencia',priceCents:1599,images:[],details:{}
};
const listing={
 id:33,title:'Taza personalizada',description:sample.description,kind:'product',
 deal:'sale',category:'Tazas',city:'Valencia',price_cents:1599,
 image_urls:[],details:{condition:'new'},created_at:new Date().toISOString(),
 updated_at:new Date().toISOString(),seller_name:'Persona vendedora',seller_username:'ventas'
};
test('V3.2.59 cache bust, syntax, version and regression script',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.59');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.59'"));
 assert.ok(html.includes('marketplace-v3250.js?v=3.2.59'));
 assert.ok(source.includes('marketplace-seo-v3251.css?v=3.2.59'));
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.ok(read('.github/workflows/validate-js.yml').includes('test:marketplace-growth'));
});
test('Mobile quick create has four preset categories and continues to respect auth',()=>{
 for(const spec of [
  ['product','sale'],['product','buy'],['service','offer'],['property','sale']
 ]){
  assert.ok(html.includes('data-start-kind="'+spec[0]+'" data-start-deal="'+spec[1]+'"'));
 }
 assert.ok(js.includes("if(!state.authenticated){updateMarketplaceAuth('guest');return;}"));
 assert.ok(js.includes('openEditor(null,{kind:b.dataset.startKind,deal:b.dataset.startDeal})'));
 assert.ok(html.includes('id="listingStatusField"'));
 assert.ok(js.includes("$('#listingStatusField').classList.toggle('hidden',!item)"));
 assert.ok(css.includes('@media(max-width:780px)'));
});
test('Product metadata and existing plain listings remain valid',()=>{
 assert.equal(listingInput.safeParse(sample).success,true);
 assert.equal(listingInput.safeParse({...sample,details:{condition:'used'}}).success,true);
 assert.equal(listingInput.safeParse({...sample,details:{condition:'bad'}}).success,false);
 assert.equal(listingUpdateInput.safeParse({...sample,status:'active'}).success,true);
});
test('Service metadata must use allowed enum and bounded area',()=>{
 const service={...sample,kind:'service',deal:'offer',details:{serviceMode:'both',serviceArea:'Valencia y alrededores'}};
 assert.equal(listingInput.safeParse(service).success,true);
 assert.equal(listingInput.safeParse({...service,details:{serviceMode:'unverified'}}).success,false);
 assert.equal(listingInput.safeParse({...service,details:{serviceArea:'X'.repeat(101)}}).success,false);
 const htmlOutput=seo.listingHtml({...listing,kind:'service',deal:'offer',details:service.details});
 assert.ok(htmlOutput.includes('Modalidad'));
 assert.ok(htmlOutput.includes('Presencial y a distancia'));
 assert.ok(htmlOutput.includes('Valencia y alrededores'));
 assert.ok(htmlOutput.includes('schema.org/'));
});
test('Property metadata stores positive area, bounded rooms and optional type',()=>{
 const property={...sample,kind:'property',deal:'rent',details:{areaM2:85,rooms:3,subtype:'Piso'}};
 assert.equal(listingInput.safeParse(property).success,true);
 assert.equal(listingInput.safeParse({...property,details:{areaM2:0}}).success,false);
 assert.equal(listingInput.safeParse({...property,details:{rooms:101}}).success,false);
 const htmlOutput=seo.listingHtml({...listing,kind:'property',deal:'rent',details:property.details});
 assert.ok(htmlOutput.includes('Superficie'));
 assert.ok(htmlOutput.includes('85 m²'));
 assert.ok(htmlOutput.includes('Habitaciones'));
 assert.ok(htmlOutput.includes('Piso'));
 assert.ok(htmlOutput.includes('QuantitativeValue'));
});
test('New listings badge is based on actual creation date and old ads are not labelled new',()=>{
 assert.ok(js.includes('const RECENT_MS=7*24*60*60*1000'));
 assert.ok(js.includes('now>=ms&&now-ms<=RECENT_MS'));
 assert.ok(source.includes('now>=created&&now-created<=RECENT_MS'));
 assert.ok(source.includes('l.image_urls,l.created_at FROM marketplace_listings'));
 assert.ok(seo.listingHtml(listing).includes('NUEVO'));
 assert.ok(!seo.listingHtml({...listing,created_at:'2020-01-01T12:00:00.000Z'}).includes('NUEVO'));
});
test('Post-save share appears only for publicly shareable ads',()=>{
 assert.ok(html.includes('id="publishSuccess"'));
 assert.ok(js.includes("saved.status==='active'&&saved.moderation_status==='published'&&saved.seller_discoverable===true"));
 assert.ok(js.includes('https://api.whatsapp.com/send?text='));
 assert.ok(js.includes('https://www.facebook.com/sharer/sharer.php?u='));
 assert.ok(js.includes("data-copy-published"));
 assert.ok(js.includes('navigator.clipboard.writeText'));
});
test('Kind changes never retain outdated optional metadata',()=>{
 assert.ok(js.includes('const payload={...parsed.data,images:[...state.images]}'));
 assert.ok(js.includes("if(kind==='service')"));
 assert.ok(js.includes("if(kind==='property')"));
 assert.ok(js.includes("if(kind==='product'"));
 assert.ok(js.includes('extra.areaM2=Number(area)'));
});
