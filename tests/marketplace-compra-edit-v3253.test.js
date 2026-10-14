'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=require('../src/routes/marketplace-v3250');
const seo=require('../src/routes/marketplace-seo-v3251');
const form={kind:'product',deal:'sale',title:'Taza Flork Romeo Santos',description:'Una taza en buen estado que quiero anunciar con todos sus datos.',category:'Tazas',city:'Valencia',priceCents:1599,images:[],details:{}};
const sample={id:19,...form,price_cents:1599,image_urls:[],status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,seller_username:'ejemplo',seller_name:'Persona',created_at:'2026-10-14T10:00:00Z',updated_at:'2026-10-14T10:00:00Z'};
test('Editing works on Zod v3 without attempting to extend a refined schema',()=>{
 const edited=api.listingUpdateInput.safeParse({...form,title:'Taza Flork editada',status:'active'});
 assert.equal(edited.success,true,JSON.stringify(edited.error?.flatten()));
 assert.equal(edited.data.title,'Taza Flork editada');
 assert.equal(edited.data.status,'active');
 assert.equal(api.listingInput.safeParse(form).success,true);
 assert.equal(api.listingUpdateInput.safeParse({...form,status:'wrong'}).success,false);
 assert.equal(api.listingUpdateInput.safeParse({...form,unknownField:'unwanted',status:'active'}).success,false);
});
test('Venta and Compra wanted listings support products and property while services remain offers',()=>{
 for(const kind of ['product','property']){
  for(const deal of ['sale','buy']){
   assert.equal(api.listingInput.safeParse({...form,kind,deal}).success,true,kind+' '+deal);
   assert.equal(api.listingUpdateInput.safeParse({...form,kind,deal,status:'active'}).success,true,kind+' '+deal+' edit');
  }
 }
 assert.equal(api.listingInput.safeParse({...form,kind:'property',deal:'rent'}).success,true);
 assert.equal(api.listingInput.safeParse({...form,kind:'service',deal:'offer'}).success,true);
 assert.equal(api.listingInput.safeParse({...form,kind:'service',deal:'buy'}).success,false);
 assert.equal(api.listingInput.safeParse({...form,kind:'product',deal:'rent'}).success,false);
 assert.equal(api.listingInput.safeParse({...form,kind:'product',deal:'offer'}).success,false);
});
test('Existing PostgreSQL schema gets an idempotent buy deal constraint upgrade',()=>{
 const ddl=api.DDL.join('\n');
 assert.match(ddl,/CHECK\s*\(deal IN \('sale','rent','offer','buy'\)\)/);
 assert.match(ddl,/DROP CONSTRAINT IF EXISTS marketplace_listings_deal_check/);
 assert.match(ddl,/ADD CONSTRAINT marketplace_listings_deal_check/);
 assert.match(ddl,/NOT EXISTS/);
 assert.doesNotMatch(ddl,/TRUNCATE|DELETE FROM marketplace_listings/i);
});
test('Wanted products are indexed as user demand rather than false merchant offers',()=>{
 const sale=seo.entitySchema({...sample,kind:'product',deal:'sale'},'https://redlibertad.com/marketplace/p/19/taza',[]);
 const buy=seo.entitySchema({...sample,kind:'product',deal:'buy'},'https://redlibertad.com/marketplace/p/19/taza',[]);
 assert.equal(sale['@type'],'Product');
 assert.equal(sale.offers.price,'15.99');
 assert.equal(buy['@type'],'WebPage');
 assert.equal(buy.about['@type'],'Product');
 assert.equal(buy.offers,undefined);
 const page=seo.listingHtml({...sample,kind:'product',deal:'buy'});
 assert.match(page,/BUSCO COMPRAR/);
 assert.match(page,/Presupuesto máximo:/);
 assert.match(page,/Persona que busca/);
 assert.match(page,/Busco comprar: Taza Flork/);
});
test('Buyer listings have real filters and budget labels on mobile and in public browsing',()=>{
 const js=read('public/marketplace-v3250.js'),html=read('public/marketplace.html');
 const seoSource=read('src/routes/marketplace-seo-v3251.js');
 const apiSource=read('src/routes/marketplace-v3250.js');
 assert.match(html,/data-deal="buy"/);
 assert.match(html,/value="buy">Compra \/ Busco/);
 assert.match(html,/id="listingPriceHint"/);
 assert.match(js,/Presupuesto máximo: /);
 assert.match(js,/deal:state\.deal/);
 assert.match(js,/const allowed=kind==='property'\?\['sale','rent','buy'\]/);
 assert.match(apiSource,/const deal=DEALS\.includes\(req\.query\.deal\)/);
 assert.match(apiSource,/clauses\.push\('l\.deal=\$'\+args\.length\)/);
 assert.match(seoSource,/operacion=buy/);
 assert.match(seoSource,/l\.deal=\$1/);
});
test('Release metadata matches V3.2.58',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.58');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.58'/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.58/);
});
