'use strict';
// V3.2.97: Portal and manual TEST sync must require a completed local Checkout.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test'};
const row={plan_code:'professional',customer_id:'cus_MATCH',subscription_id:'sub_MATCH'};
function queryHarness(verified){
 const calls=[];
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT plan_code,customer_id,subscription_id'))
   return {rowCount:1,rows:[row]};
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   assert.match(sql,/status='completed'/);
   assert.deepEqual(args,[88,'professional','cus_MATCH','sub_MATCH']);
   return {rowCount:verified?1:0,rows:verified?[{}]:[]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_subscriptions'))
   return {rowCount:1,rows:[{stripe_status:'active'}]};
  throw Error('unexpected query: '+sql);
 };
 return {query,calls};
}
const stripeObj={id:'sub_MATCH',livemode:false,customer:'cus_MATCH',status:'active',
 metadata:{sandbox:'redlibertad_v3280',seller_id:'88',plan_code:'professional'},
 items:{data:[{price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}};
test('missing completed checkout blocks manual TEST reconciliation before UPDATE',async()=>{
 const h=queryHarness(false);
 let lookups=0;
 await assert.rejects(billing.reconcileTestSubscription({sellerId:88,env,query:h.query,
  fetcher:async()=>{lookups++;return {ok:true,json:async()=>stripeObj};}}),
  {message:'stripe_test_checkout_not_verified',status:409});
 assert.equal(lookups,1);
 assert.equal(h.calls.some(x=>x.sql.startsWith('UPDATE ')),false);
});
test('verified completed checkout allows manual TEST reconciliation',async()=>{
 const h=queryHarness(true);
 const result=await billing.reconcileTestSubscription({sellerId:88,env,query:h.query,
  fetcher:async()=>({ok:true,json:async()=>stripeObj})});
 assert.equal(result.sandboxOnly,true);assert.equal(result.subscription.stripe_status,'active');
 assert.equal(h.calls.some(x=>x.sql.startsWith('UPDATE marketplace_stripe_test_subscriptions')),true);
});
test('missing completed Checkout prevents opening the Stripe TEST portal',async()=>{
 const h=queryHarness(false);let requested=false;
 await assert.rejects(billing.createTestPortal({sellerId:88,env,query:h.query,
  request:async()=>{requested=true;throw Error('should not reach Stripe');}}),
  {message:'stripe_test_checkout_not_verified',status:409});
 assert.equal(requested,false);
});
test('verified local Checkout permits official Stripe TEST billing portal',async()=>{
 const h=queryHarness(true);
 let sent=null;
 const res=await billing.createTestPortal({sellerId:88,env,query:h.query,
  request:async(path,form)=>{sent={path,form};return {url:'https://billing.stripe.com/p/session/allowed'};}});
 assert.equal(res.sandboxOnly,true);
 assert.equal(sent.path,'/v1/billing_portal/sessions');
 assert.equal(sent.form.customer,'cus_MATCH');
});
test('legacy nonverified TEST state can never unlock real subscription entitlements',()=>{
 const src=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 assert.match(src,/stripe_test_checkout_not_verified/);
 assert.equal(billing.config({...env,STRIPE_TEST_SECRET_KEY:'sk_live_FORBIDDEN'}).readyForCheckout,false);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
 assert.doesNotMatch(src,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores/);
});
