'use strict';
// V3.2.109: manual Stripe TEST reconciliation must never overwrite a webhook.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={
 APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test'
};
const stripe=(status='active')=>({
 id:'sub_SYNC109',livemode:false,customer:'cus_SYNC109',status,
 metadata:{sandbox:'redlibertad_v3280',seller_id:'109',plan_code:'professional'},
 items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}
});
function harness({version='1800000000',saved=true}={}){
 const calls=[];let lookups=0;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT plan_code,customer_id,subscription_id,last_event_created')){
   assert.deepEqual(args,[109]);
   return {rowCount:1,rows:[{plan_code:'professional',customer_id:'cus_SYNC109',
    subscription_id:'sub_SYNC109',last_event_created:version}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   assert.deepEqual(args,[109,'professional','cus_SYNC109','sub_SYNC109']);
   return {rowCount:1,rows:[{}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_subscriptions')){
   assert.match(sql,/AND last_event_created=\$9/);
   assert.match(sql,/stripe_status <> 'canceled' OR \$2='canceled'/);
   assert.equal(args[8],version);
   return saved?{rowCount:1,rows:[{stripe_status:'active'}]}:{rowCount:0,rows:[]};
  }
  throw Error('unexpected SQL '+sql);
 };
 const fetcher=async()=>{lookups++;return {ok:true,json:async()=>stripe()};};
 return {calls,query,fetcher,get lookups(){return lookups;}};
}
test('TEST sync uses the event version observed before remote lookup and leaves webhook fields unchanged',async()=>{
 const h=harness();
 const result=await billing.reconcileTestSubscription({sellerId:109,env,query:h.query,fetcher:h.fetcher});
 assert.equal(result.sandboxOnly,true);
 assert.equal(result.subscription.stripe_status,'active');
 assert.equal(h.lookups,1);
 assert.equal(h.calls.filter(x=>x.sql.startsWith('UPDATE ')).length,1);
});
test('conflicting webhook version produces HTTP 409 without a successful TEST update',async()=>{
 const h=harness({saved:false});
 await assert.rejects(billing.reconcileTestSubscription({sellerId:109,env,query:h.query,fetcher:h.fetcher}),
  {message:'stripe_test_sync_conflict',status:409});
 assert.equal(h.lookups,1);
});
test('invalid Stripe identity rejects before any write, LIVE billing stays disabled',async()=>{
 const h=harness();
 await assert.rejects(billing.reconcileTestSubscription({sellerId:109,env,query:h.query,
  fetcher:async()=>({ok:true,json:async()=>({...stripe(),customer:'cus_WRONG109'})})}),
  {message:'stripe_test_subscription_mismatch',status:409});
 assert.equal(h.calls.some(x=>x.sql.startsWith('UPDATE ')),false);
 assert.equal(billing.publicStatus(billing.config(env)).billingEnabled,false);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
});
test('sync guard is isolated to Stripe TEST, and mobile UI explains retry without writes',()=>{
 const source=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 const ui=fs.readFileSync('public/marketplace-stripe-test-v3280.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-stripe-test-v3280.html','utf8');
 const sync=source.slice(source.indexOf('async function reconcileTestSubscription('),source.indexOf('async function recordTestEvent('));
 assert.match(sync,/AND last_event_created=\$9/);
 assert.match(sync,/stripe_test_sync_conflict/);
 assert.doesNotMatch(sync,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products|UPDATE marketplace_listings|sk_live_/);
 assert.match(ui,/stripe_test_sync_conflict/);
 assert.match(ui,/no se han sobrescrito los cambios/);
 assert.match(html,/marketplace-stripe-test-v3280\.js\?v=3\.2\.109/);
});
