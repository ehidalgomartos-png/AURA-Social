'use strict';
// V3.2.95 — TEST-only checkout identity, no live network or production database.
const test=require('node:test');
const assert=require('node:assert/strict');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const env={APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test'};
function event(id,type,overrides={}){
 return {id,type,livemode:false,created:1800000000,data:{object:{
  id:'cs_test_ABC123',livemode:false,mode:'subscription',
  customer:'cus_TEST123',subscription:'sub_TEST123',...overrides}}};
}
function harness(){
 const row={seller_id:44,status:'created',customer_id:null,subscription_id:null};
 const events=new Map();const statements=[];
 const connect=async()=>({async query(sql,args=[]){
  statements.push(sql);
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_events')){
   if(events.has(args[0]))return {rowCount:0,rows:[]};
   events.set(args[0],false);return {rowCount:1,rows:[{event_id:args[0]}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_checkouts')){
   assert.match(sql,/customer_id=CASE WHEN \$2='completed'/);
   assert.match(sql,/subscription_id=CASE WHEN \$2='completed'/);
   assert.match(sql,/customer_id IS NULL OR customer_id=\$3/);
   assert.match(sql,/subscription_id IS NULL OR subscription_id=\$4/);
   if(args[0]!=='cs_test_ABC123')return {rowCount:0,rows:[]};
   const completed=args[1]==='completed';
   if(row.status!=='created'&&!(completed&&row.status==='expired'))return {rowCount:0,rows:[]};
   if(completed&&((row.customer_id&&row.customer_id!==args[2])||
     (row.subscription_id&&row.subscription_id!==args[3])))return {rowCount:0,rows:[]};
   row.status=args[1];
   if(completed){row.customer_id=args[2];row.subscription_id=args[3];}
   return {rowCount:1,rows:[{seller_id:44}]};
  }
  if(sql.startsWith('UPDATE marketplace_stripe_test_events')){
   events.set(args[0],args[2]);return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected query: '+sql.slice(0,100));
 },release(){}});
 return {row,events,statements,opts:{env,connect}};
}
test('expired checkout does not attach identifiers, even if event carries them',async()=>{
 const h=harness();
 assert.deepEqual(await billing.recordTestEvent(event('evt_EXP','checkout.session.expired'),h.opts),{ok:true,applied:true});
 assert.equal(h.row.status,'expired');assert.equal(h.row.customer_id,null);assert.equal(h.row.subscription_id,null);
 assert.deepEqual(await billing.recordTestEvent(event('evt_DONE','checkout.session.completed'),h.opts),{ok:true,applied:true});
 assert.equal(h.row.status,'completed');assert.equal(h.row.customer_id,'cus_TEST123');assert.equal(h.row.subscription_id,'sub_TEST123');
});
test('missing or malformed IDs and non-subscription mode cannot complete checkout',async()=>{
 const h=harness();
 for(const [i,fields] of [{customer:null},{subscription:null},{customer:'bad'},{subscription:'bad'},{mode:'payment'}].entries()){
  const response=await billing.recordTestEvent(event('evt_BAD'+i,'checkout.session.completed',fields),h.opts);
  assert.deepEqual(response,{ok:true,applied:false});
 }
 assert.equal(h.row.status,'created');assert.equal(h.row.customer_id,null);
 assert.equal(h.events.size,5);
});
test('completion never replaces an already attached customer/subscription pair',async()=>{
 const h=harness();
 h.row.status='expired';h.row.customer_id='cus_ORIGINAL';h.row.subscription_id='sub_ORIGINAL';
 assert.deepEqual(await billing.recordTestEvent(event('evt_CHANGE','checkout.session.completed'),h.opts),{ok:true,applied:false});
 assert.deepEqual([h.row.status,h.row.customer_id,h.row.subscription_id],['expired','cus_ORIGINAL','sub_ORIGINAL']);
});
test('no commercial tables or live operations are touched in checkout event write',()=>{
 const src=require('node:fs').readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 const section=src.slice(src.indexOf('async function recordTestEvent('),src.indexOf('module.exports='));
 assert.doesNotMatch(section,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|sk_live_/);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
});
