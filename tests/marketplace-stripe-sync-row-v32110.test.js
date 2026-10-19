'use strict';
// V3.2.110: concurrent manual TEST syncs must compare the same row snapshot.
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
const stripe=(status)=>({
 id:'sub_SYNC110',livemode:false,customer:'cus_SYNC110',status,
 metadata:{sandbox:'redlibertad_v3280',seller_id:'110',plan_code:'professional'},
 items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}
});
function harness({written=true}={}){
 const queries=[];
 const query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT plan_code,customer_id,subscription_id,last_event_created')){
   assert.match(sql,/xmin::text AS row_version/);
   return {rowCount:1,rows:[{plan_code:'professional',customer_id:'cus_SYNC110',
    subscription_id:'sub_SYNC110',last_event_created:'1800000000',row_version:'901'}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts'))
   return {rowCount:1,rows:[{}]};
  if(sql.startsWith('UPDATE marketplace_stripe_test_subscriptions')){
   assert.match(sql,/last_event_created=\$9 AND xmin::text=\$10/);
   assert.equal(args[8],'1800000000');
   assert.equal(args[9],'901');
   return written?{rowCount:1,rows:[{stripe_status:'past_due'}]}:{rowCount:0,rows:[]};
  }
  throw Error('Unexpected SQL: '+sql);
 };
 return {queries,query};
}
test('TEST sync compare-and-swap includes PostgreSQL row identity without changing event time',async()=>{
 const h=harness();
 const result=await billing.reconcileTestSubscription({sellerId:110,env,query:h.query,
  fetcher:async()=>({ok:true,json:async()=>stripe('past_due')})});
 assert.equal(result.sandboxOnly,true);
 assert.equal(result.subscription.stripe_status,'past_due');
 assert.equal(h.queries.filter(c=>c.sql.startsWith('UPDATE ')).length,1);
});
test('row conflict returns HTTP 409 rather than overwriting a newer manual sync',async()=>{
 const h=harness({written:false});
 await assert.rejects(billing.reconcileTestSubscription({sellerId:110,env,query:h.query,
  fetcher:async()=>({ok:true,json:async()=>stripe('active')})}),
 {message:'stripe_test_sync_conflict',status:409});
});
test('guard remains TEST-only and leaves production entitlements disabled',()=>{
 const source=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 const sync=source.slice(source.indexOf('async function reconcileTestSubscription('),
  source.indexOf('async function recordTestEvent('));
 assert.match(sync,/xmin::text AS row_version/);
 assert.match(sync,/xmin::text=\$10/);
 assert.doesNotMatch(sync,/marketplace_seller_subscriptions|marketplace_professional_stores|sk_live_/);
 const publicState=billing.publicStatus(billing.config(env));
 assert.equal(publicState.billingEnabled,false);
 assert.equal(publicState.enrollmentEnabled,false);
 assert.equal(publicState.entitlementsEnforced,false);
});
