'use strict';
// V3.2.102 — canceled TEST → new verified TEST subscription, no real database or Stripe.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'};
const connection=query=>async()=>({
 async query(sql,args=[]){
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.includes('pg_try_advisory_xact_lock'))return {rowCount:1,rows:[{locked:true}]};
  return query(sql,args);
 },
 release(){}
});
const old={plan_code:'professional',subscription_id:'sub_OLD123',customer_id:'cus_OLD123',
 stripe_status:'canceled',last_event_created:1800000000};
function checkoutHarness({prior=old,verified=true,pending=false}={}){
 const sql=[],archived=[],stripe=[];
 const query=async(line,args=[])=>{
  sql.push({line,args});
  if(line.startsWith('SELECT subscription_id,stripe_status,plan_code,customer_id'))
   return {rowCount:prior?1:0,rows:prior?[prior]:[]};
  if(line.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')&&line.includes("status='completed'")){
   assert.deepEqual(args,[44,'professional','cus_OLD123','sub_OLD123']);
   return {rowCount:verified?1:0,rows:verified?[{}]:[]};
  }
  if(line.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts'))
   return {rowCount:pending?1:0,rows:pending?[{}]:[]};
  if(line.startsWith('INSERT INTO marketplace_stripe_test_subscription_history')){
   assert.match(line,/stripe_status='canceled'/);
   assert.match(line,/ON CONFLICT\(seller_id,subscription_id\) DO NOTHING/);
   archived.push({...prior});return {rowCount:1,rows:[]};
  }
  if(line.startsWith('INSERT INTO marketplace_stripe_test_checkouts'))
   return {rowCount:1,rows:[]};
  throw Error('Unexpected query: '+line.slice(0,100));
 };
 const request=async(endpoint,form)=>{
  stripe.push({endpoint,form});
  return {livemode:false,id:'cs_test_PLUSNEW',url:'https://checkout.stripe.com/c/pay/cs_test_PLUSNEW'};
 };
 return {query,request,sql,archived,stripe};
}
test('terminally canceled and verified Professional can start Professional Plus TEST only',async()=>{
 const h=checkoutHarness();
 const v=await billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:connection(h.query),request:h.request});
 assert.equal(v.sandboxOnly,true);
 assert.equal(v.url,'https://checkout.stripe.com/c/pay/cs_test_PLUSNEW');
 assert.equal(h.archived.length,1);
 assert.equal(h.archived[0].subscription_id,'sub_OLD123');
 assert.equal(h.stripe.length,1);
 assert.equal(h.stripe[0].form['line_items[0][price]'],env.STRIPE_TEST_PRICE_PROFESSIONAL_PLUS);
 assert.equal(h.stripe[0].form['subscription_data[metadata][plan_code]'],'professional_plus');
 assert.equal(h.stripe[0].form.mode,'subscription');
 assert.equal(h.stripe[0].form['managed_payments[enabled]'],'false');
 assert.equal(h.sql.some(x=>x.line.includes('marketplace_seller_subscriptions')),false);
});
test('active, past_due, and pending cancellation cannot start a second TEST checkout',async()=>{
 for(const status of ['active','past_due','trialing','unpaid','incomplete']){
  const h=checkoutHarness({prior:{...old,stripe_status:status}});
  await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:connection(h.query),request:h.request}),
   {message:'test_subscription_exists_use_portal',status:409});
  assert.equal(h.archived.length,0);assert.equal(h.stripe.length,0);
 }
});
test('unverified canceled previous identity is rejected without archiving or contacting Stripe',async()=>{
 const h=checkoutHarness({verified:false});
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:connection(h.query),request:h.request}),
  {message:'stripe_test_checkout_not_verified',status:409});
 assert.equal(h.archived.length,0);assert.equal(h.stripe.length,0);
});
test('unexpired pending checkout cannot be bypassed by creating a second TEST session',async()=>{
 const h=checkoutHarness({pending:true});
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:connection(h.query),request:h.request}),
  {message:'stripe_test_checkout_pending',status:409});
 assert.equal(h.archived.length,0);assert.equal(h.stripe.length,0);
});
test('an entirely new admin can still create a first TEST subscription',async()=>{
 const h=checkoutHarness({prior:null});
 const result=await billing.createTestCheckout({sellerId:44,planCode:'professional_plus',env,connect:connection(h.query),request:h.request});
 assert.equal(result.ok,true);assert.equal(h.archived.length,0);
});
function evt(id,type,plan,sub,customer,created,status='active'){
 return {id,type,livemode:false,created,data:{object:{
  id:sub,livemode:false,customer,status,
  metadata:{sandbox:'redlibertad_v3280',seller_id:'44',plan_code:plan},
  items:{data:[{quantity:1,price:{id:env[plan==='professional_plus'?'STRIPE_TEST_PRICE_PROFESSIONAL_PLUS':'STRIPE_TEST_PRICE_PROFESSIONAL']}}]}
 }}};
}
function webhookHarness(){
 const checkouts=[
  {seller:44,plan:'professional',subscription:'sub_OLD123',customer:'cus_OLD123',created:100,status:'completed'},
  {seller:44,plan:'professional_plus',subscription:'sub_PLUS456',customer:'cus_PLUS456',created:200,status:'completed'}
 ];
 let sub={seller:44,plan:'professional',subscription:'sub_OLD123',customer:'cus_OLD123',
  status:'canceled',lastEvent:1800000100};
 const events=new Map(),calls=[];
 const connect=async()=>({async query(sql,args=[]){
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_events')){
   if(events.has(args[0]))return {rowCount:0,rows:[]};
   events.set(args[0],false);return {rowCount:1,rows:[{}]};
  }
  if(sql.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
   const match=checkouts.some(x=>x.seller===Number(args[0])&&x.plan===args[1]&&
    x.customer===args[2]&&x.subscription===args[3]&&x.status==='completed');
   return {rowCount:match?1:0,rows:match?[{}]:[]};
  }
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_subscriptions')){
   assert.match(sql,/stripe_status <> 'canceled'/);
   assert.match(sql,/marketplace_stripe_test_subscriptions.stripe_status = 'canceled'/);
   assert.match(sql,/newer.status='completed'/);
   assert.match(sql,/newer.created_at > COALESCE/);
   assert.match(sql,/last_event_created <= EXCLUDED.last_event_created/);
   const next={seller:Number(args[0]),plan:args[1],customer:args[2],subscription:args[3],
    status:args[4],lastEvent:args[8]};
   const same=sub.subscription===next.subscription&&sub.customer===next.customer;
   const newer=checkouts.find(x=>x.subscription===next.subscription&&x.customer===next.customer);
   const older=checkouts.find(x=>x.subscription===sub.subscription&&x.customer===sub.customer);
   const allowed=(same&&sub.status!=='canceled'&&sub.lastEvent<next.lastEvent)||
    (!same&&sub.status==='canceled'&&sub.subscription!==next.subscription&&
     sub.lastEvent<=next.lastEvent&&newer&&(!older||newer.created>older.created));
   if(!allowed)return {rowCount:0,rows:[]};
   sub=next;return {rowCount:1,rows:[{seller_id:44}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_events')){
   events.set(args[0],args[2]);return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected webhook query: '+sql.slice(0,110));
 },release(){}});
 return {opts:{env,connect},get sub(){return sub;},events,calls,checkouts};
}
test('new verified Plus checkout replaces canceled Professional but not the historical events',async()=>{
 const h=webhookHarness();
 const add=await billing.recordTestEvent(evt('evt_PLUSNEW','customer.subscription.created',
  'professional_plus','sub_PLUS456','cus_PLUS456',1800000200),h.opts);
 assert.deepEqual(add,{ok:true,applied:true});
 assert.equal(h.sub.plan,'professional_plus');
 assert.equal(h.sub.subscription,'sub_PLUS456');
 assert.equal(h.sub.status,'active');
 const oldLate=await billing.recordTestEvent(evt('evt_OLDLATE','customer.subscription.updated',
  'professional','sub_OLD123','cus_OLD123',1800000500,'active'),h.opts);
 assert.deepEqual(oldLate,{ok:true,applied:false});
 assert.equal(h.sub.subscription,'sub_PLUS456');
 assert.equal(h.events.get('evt_OLDLATE'),false);
});
test('late webhook cannot revive canceled subscription while awaiting a new completed Checkout',async()=>{
 const h=webhookHarness();
 const late=await billing.recordTestEvent(evt('evt_LATEACTIVE','customer.subscription.updated',
  'professional','sub_OLD123','cus_OLD123',1800000200,'active'),h.opts);
 assert.deepEqual(late,{ok:true,applied:false});
 assert.equal(h.sub.status,'canceled');
});
test('once Plus is canceled, a replay of the older Professional cannot replace it',async()=>{
 const h=webhookHarness();
 assert.deepEqual(await billing.recordTestEvent(evt('evt_NEW','customer.subscription.created',
  'professional_plus','sub_PLUS456','cus_PLUS456',1800000200),h.opts),{ok:true,applied:true});
 assert.deepEqual(await billing.recordTestEvent(evt('evt_PLUSCANCEL','customer.subscription.deleted',
  'professional_plus','sub_PLUS456','cus_PLUS456',1800000300,'canceled'),h.opts),{ok:true,applied:true});
 assert.deepEqual(await billing.recordTestEvent(evt('evt_OLDREPLAY','customer.subscription.updated',
  'professional','sub_OLD123','cus_OLD123',1800000400,'active'),h.opts),{ok:true,applied:false});
 assert.equal(h.sub.subscription,'sub_PLUS456');assert.equal(h.sub.status,'canceled');
});
test('the isolated archive, client and server remain TEST-only',()=>{
 const ddl=billing.DDL.join('\n');
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS marketplace_stripe_test_subscription_history/);
 assert.match(ddl,/PRIMARY KEY\(seller_id,subscription_id\)/);
 const js=fs.readFileSync('public/marketplace-stripe-test-v3280.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-stripe-test-v3280.html','utf8');
 assert.match(js,/stripe_status==='canceled'/);
 assert.match(js,/data.history/);
 assert.match(js,/Nueva simulación Stripe TEST/);
 assert.match(html,/id="archives"/);
 assert.match(html,/marketplace-stripe-test-v3280.js\?v=3\.2\.\d+/);
 const routes=fs.readFileSync('src/routes/marketplace-stripe-test-v3280.js','utf8');
 assert.match(routes,/FROM marketplace_stripe_test_subscription_history/);
 assert.match(routes,/router.use\(requireAdmin\)/);
 const module=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 assert.doesNotMatch(module,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores/);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
 assert.equal(billing.publicStatus(billing.config(env)).billingEnabled,false);
});