'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const features=require('../src/services/marketplace-commercial-plans-v3282');
const root=path.join(__dirname,'..');
const serviceSql=features.DDL.join('\n');

test('Professional is manual-only in seeded and existing draft rows; Plus retains the bulk proposal',()=>{
 assert.match(serviceSql,/VALUES \('professional',1,NULL,false,false,true\),\('professional_plus',3,NULL,true,true,true\)/);
 assert.match(serviceSql,/UPDATE marketplace_subscription_commercial_features/);
 assert.match(serviceSql,/WHERE plan_code='professional' AND \(woo_sync IS DISTINCT FROM false OR bulk_import IS DISTINCT FROM false\)/);
 assert.doesNotMatch(serviceSql,/UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_subscription_plans|UPDATE marketplace_listings|UPDATE marketplace_woocommerce_connections|UPDATE marketplace_external_products/i);
 const pro=features.normalize('professional',{storeLimit:1,productLimit:null,wooSync:false,bulkImport:false,externalCheckout:true});
 assert.equal(pro.wooSync,false);assert.equal(pro.bulkImport,false);
 const plus=features.normalize('professional_plus',{storeLimit:3,productLimit:5000,wooSync:true,bulkImport:true,externalCheckout:true});
 assert.equal(plus.bulkImport,true);assert.equal(plus.wooSync,true);
});
test('Professional cannot secretly enable bulk upload or auto-sync, including via API payload',()=>{
 const base={storeLimit:1,productLimit:null,wooSync:false,bulkImport:false,externalCheckout:true};
 for(const patch of [{bulkImport:true},{wooSync:true},{bulkImport:true,wooSync:true}]){
  assert.throws(()=>features.normalize('professional',{...base,...patch}),{code:'basic_plan_individual_only'});
 }
 assert.throws(()=>features.normalize('professional_plus',{...base,bulkImport:true}),{code:'bulk_import_requires_sync'});
 assert.throws(()=>features.normalize('professional_plus',{...base,externalCheckout:false}),{code:'external_checkout_required'});
});
test('read-only draft view describes individual entry without enabling any production restrictions',async()=>{
 const rows=[
  {plan_code:'professional',proposed_store_limit:1,proposed_product_limit:null,woo_sync:false,bulk_import:false,external_checkout:true},
  {plan_code:'professional_plus',proposed_store_limit:3,proposed_product_limit:null,woo_sync:true,bulk_import:true,external_checkout:true}
 ];
 const result=await features.list(async sql=>{
  assert.match(sql,/FROM marketplace_subscription_commercial_features/);
  return {rows};
 });
 assert.equal(result.proposalOnly,true);
 assert.equal(result.pricesPublished,false);
 assert.equal(result.enrollmentEnabled,false);
 assert.equal(result.entitlementsEnforced,false);
 assert.deepEqual(result.plans.map(p=>p.singleProductEntry),[true,true]);
 assert.deepEqual(result.plans.map(p=>p.bulkImport),[false,true]);
 assert.deepEqual(result.plans.map(p=>p.wooSync),[false,true]);
});
test('comparison spells out no batches in cheaper plan, Plus has batches, preserves external checkout',()=>{
 const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'public/marketplace-commercial-features-v3282.js'),'utf8');
 assert.match(html,/Profesional: los productos se publican uno a uno, sin importación masiva/);
 assert.match(html,/v=3\.2\.83/);
 assert.match(ui,/No; solo de uno en uno/);
 assert.match(ui,/Sin CSV, cargas masivas ni sincronización automática/);
 assert.match(ui,/woo.disabled=basic/);
 assert.match(ui,/bulk.disabled=basic/);
 assert.match(ui,/Compra del producto','Siempre en la tienda del vendedor/);
 assert.match(ui,/externalCheckout:true/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.doesNotMatch(ui,/sk_live_|checkout\.stripe|StripeConnect/);
 assert.doesNotThrow(()=>new(require('node:vm').Script)(ui));
});
