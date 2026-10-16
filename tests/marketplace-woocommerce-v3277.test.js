'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const wc=require('../src/services/marketplace-woocommerce-v3277');

test('encrypts WooCommerce read credentials with AES-GCM and rejects wrong key and changes',()=>{
 const previous=process.env.MARKETPLACE_WC_ENCRYPTION_KEY;
 try{
  const first=crypto.randomBytes(32).toString('base64');
  process.env.MARKETPLACE_WC_ENCRYPTION_KEY=first;
  const encrypted=wc.encryptCredentials('ck_'+'a'.repeat(40),'cs_'+'b'.repeat(40));
  assert.ok(encrypted.startsWith('v1.'));
  assert.doesNotMatch(encrypted,/ck_|cs_|a{15}|b{15}/);
  assert.deepEqual(wc.decryptCredentials(encrypted),{key:'ck_'+'a'.repeat(40),secret:'cs_'+'b'.repeat(40)});
  assert.notEqual(encrypted,wc.encryptCredentials('ck_'+'a'.repeat(40),'cs_'+'b'.repeat(40)));
  process.env.MARKETPLACE_WC_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  assert.throws(()=>wc.decryptCredentials(encrypted),/woocommerce_credentials_unavailable/);
  delete process.env.MARKETPLACE_WC_ENCRYPTION_KEY;
  assert.throws(()=>wc.encryptCredentials('ck_'+'a'.repeat(40),'cs_'+'b'.repeat(40)),/woocommerce_key_not_configured/);
 }finally{
  if(previous===undefined)delete process.env.MARKETPLACE_WC_ENCRYPTION_KEY;
  else process.env.MARKETPLACE_WC_ENCRYPTION_KEY=previous;
 }
});
function sample(overrides={}){
 return {id:107,name:'Taza con diseño personalizado',description:'Una taza de cerámica personalizada con acabado de gran calidad.',
  type:'simple',status:'publish',catalog_visibility:'visible',price:'15.95',stock_status:'instock',stock_quantity:7,
  permalink:'https://mundotaza.com/producto/taza-disenada/',sku:'TAZA107',
  categories:[{name:'Tazas'}],images:[{src:'https://mundotaza.com/wp-content/uploads/taza.jpg'}],...overrides};
}
test('maps WooCommerce product factually with permalink stock category and price',()=>{
 const p=wc.normalizeProduct('https://mundotaza.com/',sample());
 assert.equal(p.state,'ready');
 assert.equal(p.productUrl,'https://mundotaza.com/producto/taza-disenada/');
 assert.equal(p.priceCents,1595);
 assert.equal(p.stock,'in_stock');
 assert.equal(p.quantity,7);
 assert.equal(p.category,'Tazas');
 assert.equal(p.images.length,1);
 const out=wc.normalizeProduct('https://mundotaza.com/',sample({stock_status:'outofstock',stock_quantity:0}));
 assert.equal(out.stock,'out_of_stock');
 assert.equal(out.state,'ready');
});
test('refuses external destinations, drafts, variable products, missing facts, and private image URLs',()=>{
 assert.equal(wc.normalizeProduct('https://mundotaza.com/',sample({permalink:'https://evil.example/product/107'})).state,'invalid');
 assert.equal(wc.normalizeProduct('https://mundotaza.com/',sample({status:'draft'})).state,'skipped');
 assert.equal(wc.normalizeProduct('https://mundotaza.com/',sample({type:'variable'})).state,'skipped');
 assert.equal(wc.normalizeProduct('https://mundotaza.com/',sample({price:''})).state,'invalid');
 assert.equal(wc.normalizeProduct('https://mundotaza.com/',sample({images:[{src:'https://127.0.0.1/private.jpg'}]})).state,'invalid');
});
test('HTTPS client rejects private IPv4 before sending credentials',async()=>{
 let requestCount=0;
 await assert.rejects(wc.requestWoo('https://mundotaza.com/',{key:'ck_abc',secret:'cs_def'},wc.apiPath(),{
  lookup:async()=>[{address:'127.0.0.1',family:4}],
  https:{request(){requestCount++;throw Error('must not request');}}
 }),/woocommerce_private_address/);
 assert.equal(requestCount,0);
 assert.throws(()=>wc.apiPath(null,0),/invalid_page/);
 assert.throws(()=>wc.apiPath(-1),/invalid_product_id/);
});
test('professional Woo routes are mounted behind admin auth, do not return credentials or expose checkout',()=>{
 const root=fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8');
 const api=fs.readFileSync('src/routes/marketplace-woocommerce-v3277.js','utf8');
 const sync=fs.readFileSync('src/services/marketplace-woocommerce-sync-v3277.js','utf8');
 assert.ok(root.indexOf('router.use(requireAdmin)')<root.indexOf("router.use('/woocommerce'"));
 assert.match(api,/billingEnabled:false/);
 assert.match(api,/merchantFeedEnabled:false/);
 assert.match(api,/encryptCredentials/);
 assert.match(sync,/source='api'/);
 assert.doesNotMatch(sync,/DELETE FROM marketplace_listings/);
 assert.match(fs.readFileSync('server.js','utf8'),/startWooCommerceSyncScheduler\(\)/);
});
