'use strict';
// V3.2.110: CI-only PostgreSQL 18 TEST sync/sync race, never remote database.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={
 APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test'
};
const url=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(url).hostname;}catch(_){return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing non-localhost PostgreSQL integration test');
function stripe(status){
 return {
  id:'sub_SYNC210',livemode:false,customer:'cus_SYNC210',status,
  metadata:{sandbox:'redlibertad_v3280',seller_id:'210',plan_code:'professional'},
  items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}
 };
}
test('two manual Stripe TEST syncs cannot overwrite fresher snapshot with unchanged event version',async()=>{
 const pool=new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000});
 const query=pool.query.bind(pool);
 try{
  await query('CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY)');
  await query('INSERT INTO users(id) VALUES(210) ON CONFLICT DO NOTHING');
  for(const ddl of billing.DDL)await query(ddl);
  await query(
   "INSERT INTO marketplace_stripe_test_checkouts (seller_id,plan_code,session_id,status,customer_id,subscription_id) VALUES(210,'professional','cs_test_SYNC210','completed','cus_SYNC210','sub_SYNC210')");
  await query(
   "INSERT INTO marketplace_stripe_test_subscriptions (seller_id,plan_code,customer_id,subscription_id,stripe_status,last_event_created) VALUES(210,'professional','cus_SYNC210','sub_SYNC210','active',1800000000)");
  let releaseFirst;
  const firstBlocked=new Promise(resolve=>{releaseFirst=resolve;});
  let signalFirst;
  const firstStarted=new Promise(resolve=>{signalFirst=resolve;});
  const first=billing.reconcileTestSubscription({sellerId:210,env,query,
   fetcher:async()=>{signalFirst();await firstBlocked;return {ok:true,json:async()=>stripe('active')};}});
  await firstStarted;
  try{
   const second=await billing.reconcileTestSubscription({sellerId:210,env,query,
    fetcher:async()=>({ok:true,json:async()=>stripe('past_due')})});
   assert.equal(second.subscription.stripe_status,'past_due');
  }finally{releaseFirst();}
  await assert.rejects(first,{message:'stripe_test_sync_conflict',status:409});
  const state=await query(
   'SELECT stripe_status,last_event_created FROM marketplace_stripe_test_subscriptions WHERE seller_id=210');
  assert.equal(state.rows[0].stripe_status,'past_due');
  assert.equal(String(state.rows[0].last_event_created),'1800000000');
 }finally{await pool.end();}
});
