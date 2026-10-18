'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={
 APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'
};
function mockLock(locked=true){
 const calls=[];let releases=0;
 const connect=async()=>({async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('pg_try_advisory_xact_lock')){
   assert.match(sql,/hashtextextended/);
   assert.match(sql,/redlibertad_stripe_test_checkout/);
   assert.deepEqual(args,[44]);
   return {rowCount:1,rows:[{locked}]};
  }
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT subscription_id'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts'))
   return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_checkouts'))
   return {rowCount:1,rows:[{session_id:'cs_test_VALID108'}]};
  throw Error('Unexpected SQL '+sql.slice(0,100));
 },release(){releases++;}});
 return {connect,calls,get releases(){return releases}};
}
test('concurrent checkout lock rejects before calling Stripe TEST, rolls back and releases client',async()=>{
 const h=mockLock(false);let outbound=0;
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional',env,connect:h.connect,
  request:async()=>{outbound++;throw Error('outbound forbidden');}}),
  {message:'stripe_test_checkout_in_progress',status:409});
 assert.equal(outbound,0);
 assert.deepEqual(h.calls.map(x=>x.sql==='BEGIN'||x.sql==='ROLLBACK'?x.sql:'LOCK'),
  ['BEGIN','LOCK','ROLLBACK']);
 assert.equal(h.releases,1);
});
test('valid checkout locks before any status checks or Stripe request and commits before responding',async()=>{
 const h=mockLock(true),seen=[];
 const result=await billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:h.connect,
  request:async(path,form,params)=>{
   seen.push({path,form,params});
   assert.equal(h.calls[0].sql,'BEGIN');
   assert.match(h.calls[1].sql,/pg_try_advisory_xact_lock/);
   return {livemode:false,id:'cs_test_VALID108',url:'https://checkout.stripe.com/c/pay/cs_test_VALID108'};
  }});
 assert.equal(result.ok,true);
 assert.equal(result.url,'https://checkout.stripe.com/c/pay/cs_test_VALID108');
 assert.equal(seen.length,1);
 assert.equal(seen[0].form['line_items[0][price]'],env.STRIPE_TEST_PRICE_PROFESSIONAL_PLUS);
 assert.match(seen[0].params.key,/^sk_test_/);
 assert.equal(h.calls.at(-1).sql,'COMMIT');
 assert.equal(h.releases,1);
});
test('failed remote Stripe TEST response rolls transaction back; no pending local session remains',async()=>{
 const h=mockLock(true);
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional',env,connect:h.connect,
  request:async()=>{throw Error('simulated_test_network_down');}}),/simulated_test_network_down/);
 assert.equal(h.calls.filter(c=>c.sql.includes('INSERT INTO marketplace_stripe_test_checkouts')).length,0);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
 assert.equal(h.releases,1);
});
test('unrecorded checkout cannot be returned as success to the admin',async()=>{
 const h=mockLock(true),original=h.connect;
 const connect=async()=>{
  const client=await original(),query=client.query.bind(client);
  client.query=async(sql,args)=>{
   if(sql.startsWith('INSERT INTO marketplace_stripe_test_checkouts'))return {rowCount:0,rows:[]};
   return query(sql,args);
  };
  return client;
 };
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional',env,connect,
  request:async()=>({livemode:false,id:'cs_test_VALID108',
   url:'https://checkout.stripe.com/c/pay/cs_test_VALID108'})}),
 {message:'stripe_test_checkout_not_recorded',status:409});
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
 assert.equal(h.releases,1);
});
test('malformed seller ID is rejected before DB access and LIVE remains off',async()=>{
 let used=false;
 await assert.rejects(billing.createTestCheckout({sellerId:'0',planCode:'professional',env,
  connect:async()=>{used=true;throw Error('must not open');}}),
  {message:'invalid_seller_id',status:400});
 assert.equal(used,false);
 for(const key of ['billingEnabled','enrollmentEnabled','entitlementsEnforced'])
  assert.equal(billing.publicStatus(billing.config(env))[key],false);
});
test('frontend retains chosen configured plan when TEST laboratory state refreshes',()=>{
 const src=fs.readFileSync('public/marketplace-stripe-test-v3280.js','utf8');
 assert.match(src,/const select=\$\('testPlan'\),previous=select\.value/);
 assert.match(src,/p\.configured&&p\.code===previous/);
 assert.match(src,/if\(retained\|\|first\)select\.value=\(retained\|\|first\)\.code/);
 assert.match(src,/Stripe TEST/);
 assert.doesNotMatch(src,/sk_live_|STRIPE_LIVE/);
});
