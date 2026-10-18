'use strict';
// CI-only PostgreSQL integration: ephemeral localhost DB; never production.
const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={
 APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'
};
const url=process.env.STRIPE_REENROLL_CI_DATABASE_URL||'';
const host=(()=>{try{return new URL(url).hostname;}catch(_){return '';}})();
if(host!=='127.0.0.1')throw Error('Refusing non-localhost PostgreSQL for integration test');
function event(id,type,plan,sub,customer,created,status='active'){
 return {id,type,livemode:false,created,
  data:{object:{id:sub,livemode:false,customer,status,
   metadata:{sandbox:'redlibertad_v3280',seller_id:'44',plan_code:plan},
   current_period_end:1900000000,
   items:{data:[{quantity:1,price:{id:env[plan==='professional_plus'
    ?'STRIPE_TEST_PRICE_PROFESSIONAL_PLUS':'STRIPE_TEST_PRICE_PROFESSIONAL']}}]}
  }}};
}
test('PostgreSQL preserves canceled TEST history and rejects stale or resurrecting webhooks',async()=>{
 const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:5000});
 const query=pool.query.bind(pool),connect=()=>pool.connect();
 try{
  await query('CREATE TABLE users(id BIGINT PRIMARY KEY)');
  await query('INSERT INTO users(id) VALUES(44)');
  for(const ddl of billing.DDL)await query(ddl);
  await query("INSERT INTO marketplace_stripe_test_checkouts (seller_id,plan_code,session_id,status,customer_id,subscription_id,created_at) VALUES(44,'professional','cs_test_OLD123','completed','cus_OLD123','sub_OLD123',now()-interval '2 days')");
  await query("INSERT INTO marketplace_stripe_test_subscriptions (seller_id,plan_code,customer_id,subscription_id,stripe_status,last_event_created) VALUES(44,'professional','cus_OLD123','sub_OLD123','canceled',1800000000)");
  let outbound=0;
  const checkout=await billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect,
   request:async(path,form)=>{
    outbound++;
    assert.equal(path,'/v1/checkout/sessions');
    assert.equal(form['line_items[0][price]'],env.STRIPE_TEST_PRICE_PROFESSIONAL_PLUS);
    return {livemode:false,id:'cs_test_PLUS456',url:'https://checkout.stripe.com/c/pay/cs_test_PLUS456'};
   }});
  assert.equal(outbound,1);
  assert.equal(checkout.sandboxOnly,true);
  const archived=await query('SELECT plan_code,subscription_id,stripe_status FROM marketplace_stripe_test_subscription_history WHERE seller_id=44');
  assert.equal(archived.rowCount,1);
  assert.deepEqual(archived.rows[0],{plan_code:'professional',subscription_id:'sub_OLD123',stripe_status:'canceled'});
  const completed={id:'evt_PLUSSESSION',type:'checkout.session.completed',livemode:false,created:1800000001,
   data:{object:{id:'cs_test_PLUS456',livemode:false,mode:'subscription',subscription:'sub_PLUS456',customer:'cus_PLUS456'}}};
  assert.deepEqual(await billing.recordTestEvent(completed,{env,connect}),{ok:true,applied:true});
  assert.deepEqual(await billing.recordTestEvent(event('evt_PLUSCREATED','customer.subscription.created',
   'professional_plus','sub_PLUS456','cus_PLUS456',1800000002),{env,connect}),{ok:true,applied:true});
  let current=await query('SELECT plan_code,customer_id,subscription_id,stripe_status FROM marketplace_stripe_test_subscriptions WHERE seller_id=44');
  assert.deepEqual(current.rows[0],{plan_code:'professional_plus',customer_id:'cus_PLUS456',subscription_id:'sub_PLUS456',stripe_status:'active'});
  assert.deepEqual(await billing.recordTestEvent(event('evt_OLDLATE','customer.subscription.updated',
   'professional','sub_OLD123','cus_OLD123',1800000008),{env,connect}),{ok:true,applied:false});
  // Stripe events created in one second have the same integer timestamp.
  // A non-terminal update must NOT take precedence at equal timestamp.
  assert.deepEqual(await billing.recordTestEvent(event('evt_SAMESECOND_UPDATE','customer.subscription.updated',
   'professional_plus','sub_PLUS456','cus_PLUS456',1800000002,'past_due'),{env,connect}),{ok:true,applied:false});
  let beforeCancel=await query('SELECT stripe_status FROM marketplace_stripe_test_subscriptions WHERE seller_id=44');
  assert.equal(beforeCancel.rows[0].stripe_status,'active');
  // Terminal cancellation in the SAME second must still be applied.
  assert.deepEqual(await billing.recordTestEvent(event('evt_PLUSCANCELED','customer.subscription.deleted',
   'professional_plus','sub_PLUS456','cus_PLUS456',1800000002,'canceled'),{env,connect}),{ok:true,applied:true});
  // Even a newer delayed non-terminal event must never resurrect cancellation.
  assert.deepEqual(await billing.recordTestEvent(event('evt_PLUSRESURRECT','customer.subscription.updated',
   'professional_plus','sub_PLUS456','cus_PLUS456',1800000020,'active'),{env,connect}),{ok:true,applied:false});
  assert.deepEqual(await billing.recordTestEvent(event('evt_OLDREPLAY','customer.subscription.updated',
   'professional','sub_OLD123','cus_OLD123',1800000030),{env,connect}),{ok:true,applied:false});
  current=await query('SELECT plan_code,subscription_id,stripe_status FROM marketplace_stripe_test_subscriptions WHERE seller_id=44');
  assert.deepEqual(current.rows[0],{plan_code:'professional_plus',subscription_id:'sub_PLUS456',stripe_status:'canceled'});
  const archiveAfter=await query('SELECT subscription_id FROM marketplace_stripe_test_subscription_history WHERE seller_id=44');
  assert.deepEqual(archiveAfter.rows,[{subscription_id:'sub_OLD123'}]);
  const events=await query('SELECT event_id,applied FROM marketplace_stripe_test_events ORDER BY event_id');
  assert.equal(events.rowCount,7);
  assert.equal(events.rows.find(x=>x.event_id==='evt_OLDLATE').applied,false);
  assert.equal(events.rows.find(x=>x.event_id==='evt_OLDREPLAY').applied,false);
  assert.equal(events.rows.find(x=>x.event_id==='evt_SAMESECOND_UPDATE').applied,false);
  assert.equal(events.rows.find(x=>x.event_id==='evt_PLUSCANCELED').applied,true);
  assert.equal(events.rows.find(x=>x.event_id==='evt_PLUSRESURRECT').applied,false);
 }finally{await pool.end();}
});