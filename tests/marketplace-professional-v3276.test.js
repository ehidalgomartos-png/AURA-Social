'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const service=require('../src/services/marketplace-professional-v3276');
const {normalizeStoreUrl,normalizeProductUrl,purchaseLink}=service;
test('only HTTPS legitimate store origins',()=>{
 assert.equal(normalizeStoreUrl('https://tienda.ejemplo.es/'),'https://tienda.ejemplo.es/');
 for(const bad of ['http://tienda.es/','https://localhost/','https://127.0.0.1/','https://192.168.1.1/','https://tienda.es/otro','https://usuario:password@tienda.es/','https://tienda.es/?x=1','javascript:alert(1)'])assert.equal(normalizeStoreUrl(bad),null,bad);
});
test('external product URLs must remain on the registered store host',()=>{
 assert.equal(normalizeProductUrl('https://tienda.es/','https://tienda.es/p/7'),'https://tienda.es/p/7');
 assert.equal(normalizeProductUrl('https://tienda.es/','https://www.tienda.es/p/7'),'https://www.tienda.es/p/7');
 for(const bad of ['https://tienda.es.evil.com/p','https://evil.com/p','https://tienda.es@evil.com/p','http://tienda.es/p'])assert.equal(normalizeProductUrl('https://tienda.es/',bad),null,bad);
});
test('purchase link fails closed until both store and product are eligible',()=>{
 const good={kind:'product',deal:'sale',status:'active',moderation_status:'published',store_status:'approved',purchase_enabled:true,external_stock_status:'in_stock',store_url:'https://tienda.es/',external_product_url:'https://tienda.es/p/2'};
 assert.equal(purchaseLink(good),'https://tienda.es/p/2');
 for(const [field,value] of [['kind','service'],['deal','buy'],['status','paused'],['moderation_status','hidden'],['store_status','pending'],['purchase_enabled',false],['external_stock_status','unknown'],['external_product_url','https://not-tienda.es/p/2']])assert.equal(purchaseLink({...good,[field]:value}),null,field);
});
test('professional routes retain authentication from parent marketplace router',()=>{
 const root=fs.readFileSync(require.resolve('../src/routes/marketplace-v3250'),'utf8');
 assert.ok(root.indexOf('router.use(requireAuth)')<root.indexOf("router.use('/professional'"));
});
test('no billing or merchant feed by default',()=>{
 const routes=fs.readFileSync(require.resolve('../src/routes/marketplace-professional-v3276'),'utf8');
 assert.match(routes,/billingEnabled:false,merchantFeedEnabled:false,syncEnabled:false/);
});
