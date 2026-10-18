'use strict';
// V3.2.98: Stripe TEST plan integrity; no external services or database required.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');

const env={
 APP_ORIGIN:'https://redlibertad.com',
 STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'
};
const config=billing.config(env);
function subscription(overrides={}){
 return {id:'sub_VALID123',customer:'cus_VALID123',livemode:false,status:'active',
  metadata:{sandbox:'redlibertad_v3280',seller_id:'88',plan_code:'professional'},
  items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL,livemode:false},
   current_period_end:1900000000}],has_more:false},
  ...overrides};
}
test('single configured Stripe TEST recurring price with one unit is accepted',()=>{
 const result=billing.subscriptionInfo(subscription(),config);
 assert.equal(result.sellerId,'88');
 assert.equal(result.planCode,'professional');
 assert.equal(result.subscriptionId,'sub_VALID123');
 assert.equal(result.status,'active');
});
test('additional Stripe price item or hidden pagination invalidates a TEST subscription',()=>{
 const correct=subscription().items.data[0];
 const extra={quantity:1,price:{id:'price_UNEXPECTED222'}};
 assert.equal(billing.subscriptionInfo(subscription({items:{data:[correct,extra],has_more:false}}),config),null);
 assert.equal(billing.subscriptionInfo(subscription({items:{data:[correct],has_more:true}}),config),null);
 assert.equal(billing.subscriptionInfo(subscription({items:{data:[],has_more:false}}),config),null);
});
test('wrong item quantity or live price cannot be represented as approved TEST plan',()=>{
 const original=subscription().items.data[0];
 for(const quantity of [0,2,-1,'1',null]){
  assert.equal(billing.subscriptionInfo(subscription({items:{data:[{...original,quantity}]}}),config),null);
 }
 assert.equal(billing.subscriptionInfo(subscription({items:{data:[{...original,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL,livemode:true}}]}}),config),null);
 assert.equal(billing.subscriptionInfo(subscription({items:{data:[{...original,price:{id:'price_DIFFERENT'}}]}}),config),null);
});
test('reconciliation verifies completed local Checkout BEFORE remote Stripe lookup',async()=>{
 const calls=[];let remote=false;
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT plan_code,customer_id,subscription_id')){
   return {rowCount:1,rows:[{plan_code:'professional',customer_id:'cus_VALID123',subscription_id:'sub_VALID123'}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   assert.match(sql,/status='completed'/);
   assert.deepEqual(args,[88,'professional','cus_VALID123','sub_VALID123']);
   return {rowCount:0,rows:[]};
  }
  throw Error('Unexpected query');
 };
 await assert.rejects(billing.reconcileTestSubscription({sellerId:88,env,query,
  fetcher:async()=>{remote=true;throw Error('should not call Stripe');}}),
  {message:'stripe_test_checkout_not_verified',status:409});
 assert.equal(remote,false);
 assert.equal(calls.length,2);
});
test('verified Checkout still rejects multi-item Stripe state without any UPDATE',async()=>{
 let wrote=false;
 const query=async(sql)=>{
  if(sql.startsWith('SELECT plan_code,customer_id,subscription_id')){
   return {rowCount:1,rows:[{plan_code:'professional',customer_id:'cus_VALID123',subscription_id:'sub_VALID123'}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts'))return {rowCount:1,rows:[{}]};
  if(sql.startsWith('UPDATE ')){wrote=true;throw Error('should not update');}
  throw Error('Unexpected query');
 };
 const original=subscription();
 await assert.rejects(billing.reconcileTestSubscription({sellerId:88,env,query,
  fetcher:async()=>({ok:true,json:async()=>subscription({
   items:{data:[original.items.data[0],{quantity:1,price:{id:'price_EXTRA'}}]}})})}),
  {message:'stripe_test_subscription_mismatch',status:409});
 assert.equal(wrote,false);
});
test('Stripe TEST safety remains isolated from real entitlements, WooCommerce and paid enrollment',()=>{
 const source=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 assert.doesNotMatch(source,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products/);
 assert.equal(billing.publicStatus(config).billingEnabled,false);
 assert.equal(billing.publicStatus(config).entitlementsEnforced,false);
 assert.equal(billing.config({...env,STRIPE_TEST_SECRET_KEY:'sk_live_INVALID'}).readyForCheckout,false);
});
