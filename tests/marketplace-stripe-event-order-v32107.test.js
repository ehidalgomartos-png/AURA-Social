'use strict';
// V3.2.107 — guard equal-second terminal Stripe TEST deletions only.
// The companion PostgreSQL 18 test exercises the actual SQL conflict clause.
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
function event(id,type,status,created=1800000000){
 return {id,type,livemode:false,created,
  data:{object:{id:'sub_REALTEST1',customer:'cus_REALTEST1',livemode:false,status,
   metadata:{sandbox:'redlibertad_v3280',seller_id:'44',plan_code:'professional'},
   items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}}}};
}
function harness(){
 const statements=[],seen=new Set();let appliedChanges=0;
 const connect=async()=>({async query(sql,args=[]){
  statements.push({sql,args});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_events')){
   if(seen.has(args[0]))return {rowCount:0,rows:[]};
   seen.add(args[0]);return {rowCount:1,rows:[{}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   assert.deepEqual(args,['44','professional','cus_REALTEST1','sub_REALTEST1']);
   return {rowCount:1,rows:[{}]};
  }
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_subscriptions')){
   assert.match(sql,/last_event_created = EXCLUDED\.last_event_created/);
   assert.match(sql,/last_event_created < EXCLUDED\.last_event_created/);
   assert.match(sql,/\$10 = 'customer\.subscription\.deleted'/);
   assert.match(sql,/EXCLUDED\.stripe_status = 'canceled'/);
   assert.match(sql,/stripe_status <> 'canceled'/);
   assert.match(sql,/subscription_id = EXCLUDED\.subscription_id/);
   assert.match(sql,/customer_id = EXCLUDED\.customer_id/);
   assert.equal(args[0],'44');assert.equal(args[1],'professional');
   assert.equal(args[3],'sub_REALTEST1');
   assert.equal(args[9]==='customer.subscription.deleted'||args[9]==='customer.subscription.updated',true);
   appliedChanges++;return {rowCount:1,rows:[{seller_id:44}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_events'))
   return {rowCount:1,rows:[]};
  throw Error('Unexpected query '+sql.slice(0,80));
 },release(){}});
 return {connect,statements,seen,get appliedChanges(){return appliedChanges}};
}
test('webhook forwards exact signed event type to a SQL guard requiring deleted + canceled',async()=>{
 const h=harness();
 assert.deepEqual(await billing.recordTestEvent(event('evt_TERM','customer.subscription.deleted','canceled'),{env,connect:h.connect}),
  {ok:true,applied:true});
 const upsert=h.statements.find(x=>x.sql.startsWith('INSERT INTO marketplace_stripe_test_subscriptions'));
 assert.equal(upsert.args[4],'canceled');
 assert.equal(upsert.args[8],1800000000);
 assert.equal(upsert.args[9],'customer.subscription.deleted');
 assert.equal(h.appliedChanges,1);
 assert.deepEqual(await billing.recordTestEvent(event('evt_TERM','customer.subscription.deleted','canceled'),{env,connect:h.connect}),
  {ok:true,duplicate:true});
 assert.equal(h.appliedChanges,1);
});
test('non-terminal update cannot forge terminal tie-breaker',async()=>{
 const h=harness();
 assert.deepEqual(await billing.recordTestEvent(event('evt_NORMAL','customer.subscription.updated','past_due'),{env,connect:h.connect}),
  {ok:true,applied:true});
 const upsert=h.statements.find(x=>x.sql.startsWith('INSERT INTO marketplace_stripe_test_subscriptions'));
 assert.equal(upsert.args[9],'customer.subscription.updated');
 assert.equal(upsert.args[4],'past_due');
 assert.match(upsert.sql,/\$10 = 'customer\.subscription\.deleted'/);
});
test('the cancellation-order fix stays inside TEST, never activates commercial payments',()=>{
 const source=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 const fragment=source.slice(source.indexOf('async function recordTestEvent('),source.indexOf('module.exports='));
 assert.match(fragment,/ON CONFLICT\(seller_id\) DO UPDATE/);
 assert.match(fragment,/EXCLUDED\.stripe_status = 'canceled'/);
 assert.doesNotMatch(fragment,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_listings/);
 assert.equal(billing.config({}).readyForCheckout,false);
 const flags=billing.publicStatus(billing.config(env));
 assert.equal(flags.billingEnabled,false);
 assert.equal(flags.enrollmentEnabled,false);
 assert.equal(flags.entitlementsEnforced,false);
});
