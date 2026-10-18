'use strict';
// V3.2.96: all network, Stripe and database operations are simulated.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test'};
function subscriptionEvent(id,customer='cus_ABC123',sub='sub_ABC123'){
 return {id,type:'customer.subscription.created',livemode:false,created:1800000000,
  data:{object:{livemode:false,id:sub,customer,status:'active',
   metadata:{sandbox:'redlibertad_v3280',seller_id:'44',plan_code:'professional'},
   items:{data:[{price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}}}};
}
function checkoutEvent(id='evt_CHECKOUT'){
 return {id,type:'checkout.session.completed',livemode:false,created:1800000001,
  data:{object:{id:'cs_test_VALID',livemode:false,mode:'subscription',
   customer:'cus_ABC123',subscription:'sub_ABC123'}}};
}
function harness(initial='created'){
 const checkout={status:initial,customer_id:initial==='completed'?'cus_ABC123':null,
  subscription_id:initial==='completed'?'sub_ABC123':null};
 const events=new Map(),statements=[];let sub=null,pendingEventId=null,rollbacks=0;
 const connect=async()=>({async query(sql,args=[]){
  statements.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT')return {rowCount:0,rows:[]};
  if(sql==='ROLLBACK'){if(pendingEventId)events.delete(pendingEventId);pendingEventId=null;rollbacks++;return {rowCount:0,rows:[]};}
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_events')){
   if(events.has(args[0]))return {rowCount:0,rows:[]};
   events.set(args[0],false);pendingEventId=args[0];return {rowCount:1,rows:[{}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_checkouts')){
   if(args[0]!=='cs_test_VALID')return {rowCount:0,rows:[]};
   checkout.status='completed';checkout.customer_id=args[2];checkout.subscription_id=args[3];
   return {rowCount:1,rows:[{seller_id:44}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   let matches;
   if(sql.includes("status='completed'")){
    assert.deepEqual(args.slice(0,2),['44','professional']);
    matches=checkout.status==='completed'&&checkout.customer_id===args[2]&&checkout.subscription_id===args[3];
   }else matches=checkout.status==='created'||checkout.status==='expired';
   return {rowCount:matches?1:0,rows:matches?[{}]:[]};
  }
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_subscriptions')){
   sub={customer:args[2],subscription:args[3],status:args[4]};
   return {rowCount:1,rows:[{seller_id:44}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_events')){
   events.set(args[0],args[2]);return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected SQL '+sql.slice(0,90));
 },release(){}});
 return {checkout,events,statements,opts:{env,connect},get sub(){return sub;},get rollbacks(){return rollbacks;}};
}
test('subscription created before checkout requests Stripe retry without burning event id',async()=>{
 const h=harness();
 await assert.rejects(billing.recordTestEvent(subscriptionEvent('evt_EARLY'),h.opts),
  {message:'stripe_test_checkout_pending',status:503});
 assert.equal(h.sub,null);assert.equal(h.rollbacks,1);
 assert.equal(h.events.has('evt_EARLY'),false);
 assert.deepEqual(await billing.recordTestEvent(checkoutEvent(),h.opts),{ok:true,applied:true});
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_EARLY'),h.opts),{ok:true,applied:true});
 assert.deepEqual(h.sub,{customer:'cus_ABC123',subscription:'sub_ABC123',status:'active'});
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_EARLY'),h.opts),{ok:true,duplicate:true});
});
test('completed checkout with different customer or subscription cannot authorize state',async()=>{
 const h=harness('completed');
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_OTHER_CUST','cus_OTHER'),h.opts),{ok:true,applied:false});
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_OTHER_SUB','cus_ABC123','sub_OTHER'),h.opts),{ok:true,applied:false});
 assert.equal(h.sub,null);assert.equal(h.rollbacks,0);
});
test('missing checkout is audited but cannot authorize subscription',async()=>{
 const h=harness('absent');
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_UNKNOWN'),h.opts),{ok:true,applied:false});
 assert.equal(h.sub,null);assert.equal(h.events.get('evt_UNKNOWN'),false);
});
test('valid completed checkout allows matching TEST subscription only',async()=>{
 const h=harness('completed');
 assert.deepEqual(await billing.recordTestEvent(subscriptionEvent('evt_VALID'),h.opts),{ok:true,applied:true});
 assert.equal(h.sub.subscription,'sub_ABC123');
 const sql=h.statements.filter(x=>x.sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts'))[0].sql;
 assert.match(sql,/status='completed'/);assert.match(sql,/customer_id=\$3/);
 assert.match(sql,/subscription_id=\$4/);
});
test('retry logic and writes remain sandbox-only with no commercial entitlements',()=>{
 const src=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 const section=src.slice(src.indexOf('async function recordTestEvent('),src.indexOf('module.exports='));
 assert.doesNotMatch(section,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products|UPDATE marketplace_listings|sk_live_/);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
});
