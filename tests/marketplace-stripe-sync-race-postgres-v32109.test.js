'use strict';
// CI-only PostgreSQL 18 integration. Refuses all non-local databases.
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
if(host!=='127.0.0.1')throw Error('Refusing non-localhost PostgreSQL for integration test');
const stripe=(seller,status='active')=>({
 id:'sub_SYNC'+seller,livemode:false,customer:'cus_SYNC'+seller,status,
 metadata:{sandbox:'redlibertad_v3280',seller_id:String(seller),plan_code:'professional'},
 items:{data:[{quantity:1,price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}
});
test('real PostgreSQL CAS protects TEST cancellation from a webhook arriving during manual sync',async()=>{
 const pool=new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000});
 const query=pool.query.bind(pool),connect=()=>pool.connect();
 try{
  await query('CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY)');
  await query('INSERT INTO users(id) VALUES(109),(110) ON CONFLICT DO NOTHING');
  for(const ddl of billing.DDL)await query(ddl);
  for(const id of [109,110]){
   await query(
    "INSERT INTO marketplace_stripe_test_checkouts (seller_id,plan_code,session_id,status,customer_id,subscription_id) VALUES($1,'professional',$2,'completed',$3,$4)",
    [id,'cs_test_SYNC'+id,'cus_SYNC'+id,'sub_SYNC'+id]);
   await query(
    "INSERT INTO marketplace_stripe_test_subscriptions (seller_id,plan_code,customer_id,subscription_id,stripe_status,last_event_created) VALUES($1,'professional',$2,$3,'active',1800000000)",
    [id,'cus_SYNC'+id,'sub_SYNC'+id]);
  }
  let webhookCalls=0;
  await assert.rejects(
   billing.reconcileTestSubscription({sellerId:109,env,query,
    fetcher:async()=>{
     webhookCalls++;
     const event={id:'evt_SYNC109_CANCELED',type:'customer.subscription.deleted',
      livemode:false,created:1800000001,data:{object:stripe(109,'canceled')}};
     assert.deepEqual(await billing.recordTestEvent(event,{env,connect}),{ok:true,applied:true});
     return {ok:true,json:async()=>stripe(109,'active')};
    }}),
   {message:'stripe_test_sync_conflict',status:409}
  );
  assert.equal(webhookCalls,1);
  let state=await query('SELECT stripe_status,last_event_created FROM marketplace_stripe_test_subscriptions WHERE seller_id=109');
  assert.equal(state.rows[0].stripe_status,'canceled');
  assert.equal(String(state.rows[0].last_event_created),'1800000001');
  // Even without a concurrent webhook, an already canceled row cannot be revived.
  await assert.rejects(billing.reconcileTestSubscription({sellerId:109,env,query,
   fetcher:async()=>({ok:true,json:async()=>stripe(109,'active')})}),
   {message:'stripe_test_sync_conflict',status:409});
  state=await query('SELECT stripe_status FROM marketplace_stripe_test_subscriptions WHERE seller_id=109');
  assert.equal(state.rows[0].stripe_status,'canceled');
  // A stable identity and unchanged version may still sync legitimately.
  const success=await billing.reconcileTestSubscription({sellerId:110,env,query,
   fetcher:async()=>({ok:true,json:async()=>stripe(110,'past_due')})});
  assert.equal(success.sandboxOnly,true);
  assert.equal(success.subscription.stripe_status,'past_due');
  state=await query('SELECT stripe_status,last_event_created FROM marketplace_stripe_test_subscriptions WHERE seller_id=110');
  assert.equal(state.rows[0].stripe_status,'past_due');
  assert.equal(String(state.rows[0].last_event_created),'1800000000');
 }finally{await pool.end();}
});
