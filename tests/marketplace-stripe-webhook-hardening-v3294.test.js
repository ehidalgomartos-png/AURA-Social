'use strict';
// V3.2.94 — functional guards for Stripe TEST webhook delivery races.
// This suite intentionally does not connect to Stripe or production DB.
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
function checkoutEvent(id,type,session='cs_test_ABC123'){
 return {id,type,livemode:false,created:1800000000,
  data:{object:{id:session,livemode:false,mode:'subscription',customer:'cus_TEST123',subscription:'sub_TEST123'}}};
}
function subscriptionEvent(id,created,sub='sub_TEST123',customer='cus_TEST123',status='active'){
 return {id,type:'customer.subscription.updated',livemode:false,created,
  data:{object:{id:sub,customer,livemode:false,status,current_period_end:2200000000,
   metadata:{sandbox:'redlibertad_v3280',seller_id:'44',plan_code:'professional'},
   items:{data:[{price:{id:env.STRIPE_TEST_PRICE_PROFESSIONAL}}]}}}};
}
function harness(){
 const db={sessions:new Map([['cs_test_ABC123',{seller_id:44,status:'created'}]]),
  subscription:null,events:new Map(),calls:[],released:0};
 const connect=async()=>({
  async query(sql,args=[]){
   db.calls.push({sql,args});
   const line=String(sql).trim();
   if(['BEGIN','COMMIT','ROLLBACK'].includes(line))return {rowCount:0,rows:[]};
   if(line.startsWith('INSERT INTO marketplace_stripe_test_events')){
    if(db.events.has(args[0]))return {rowCount:0,rows:[]};
    db.events.set(args[0],{type:args[1],applied:null});return {rowCount:1,rows:[{event_id:args[0]}]};
   }
   if(line.startsWith('UPDATE marketplace_stripe_test_checkouts')){
    assert.match(line,/status='created' OR \(\$2='completed' AND status='expired'\)/);
    const record=db.sessions.get(args[0]);if(!record)return {rowCount:0,rows:[]};
    if(record.status!=='created'&&!(args[1]==='completed'&&record.status==='expired'))
     return {rowCount:0,rows:[]};
    record.status=args[1];
    if(args[1]==='completed'){record.customer_id=args[2];record.subscription_id=args[3];}
    return {rowCount:1,rows:[{seller_id:record.seller_id}]};
   }
   if(line.startsWith('SELECT 1 FROM marketplace_stripe_test_checkouts')){
    const row=db.sessions.get('cs_test_ABC123');
    const match=line.includes("status='completed'")?
     row.status==='completed'&&row.seller_id===Number(args[0])&&
     args[1]==='professional'&&row.customer_id===args[2]&&row.subscription_id===args[3]:
     row.status!=='completed';
    return {rowCount:match?1:0,rows:match?[{'?column?':1}]:[]};
   }
   if(line.startsWith('INSERT INTO marketplace_stripe_test_subscriptions')){
    assert.match(line,/subscription_id = EXCLUDED.subscription_id/);
    assert.match(line,/customer_id = EXCLUDED.customer_id/);
    assert.match(line,/last_event_created < EXCLUDED.last_event_created/);
    const next={sellerId:args[0],plan:args[1],customer:args[2],
     subscription:args[3],status:args[4],lastEvent:args[8]};
    const prior=db.subscription;
    if(prior&&(prior.subscription!==next.subscription||prior.customer!==next.customer||
      prior.lastEvent>=next.lastEvent))return {rowCount:0,rows:[]};
    db.subscription=next;return {rowCount:1,rows:[{seller_id:args[0]}]};
   }
   if(line.startsWith('UPDATE marketplace_stripe_test_events')){
    const entry=db.events.get(args[0]);entry.applied=args[2];entry.sellerId=args[1];
    return {rowCount:1,rows:[]};
   }
   throw Error('Unexpected DB query: '+line.slice(0,180));
  },
  release(){db.released++;}
 });
 return {db,connect,opts:{env,connect}};
}
test('a late expired event cannot regress an already completed Stripe TEST checkout',async()=>{
 const h=harness();
 const completed=await billing.recordTestEvent(checkoutEvent('evt_DONE','checkout.session.completed'),h.opts);
 assert.deepEqual(completed,{ok:true,applied:true});
 const expired=await billing.recordTestEvent(checkoutEvent('evt_LATE','checkout.session.expired'),h.opts);
 assert.deepEqual(expired,{ok:true,applied:false});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'completed');
 assert.equal(h.db.events.get('evt_LATE').applied,false);
 assert.deepEqual(await billing.recordTestEvent(checkoutEvent('evt_LATE','checkout.session.expired'),h.opts),
  {ok:true,duplicate:true});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'completed');
 assert.equal(h.db.released,3);
});
test('a late completed webhook can supersede earlier expired delivery, once',async()=>{
 const h=harness();
 const expire=await billing.recordTestEvent(checkoutEvent('evt_EXPIRED','checkout.session.expired'),h.opts);
 assert.deepEqual(expire,{ok:true,applied:true});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'expired');
 const finish=await billing.recordTestEvent(checkoutEvent('evt_COMPLETED','checkout.session.completed'),h.opts);
 assert.deepEqual(finish,{ok:true,applied:true});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'completed');
 const repeat=await billing.recordTestEvent(checkoutEvent('evt_ANOTHER','checkout.session.completed'),h.opts);
 assert.deepEqual(repeat,{ok:true,applied:false});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'completed');
});
test('TEST subscription cannot silently change its Stripe subscription or customer ID',async()=>{
 const h=harness();
 assert.deepEqual(await billing.recordTestEvent(checkoutEvent('evt_SESSION','checkout.session.completed'),h.opts),{ok:true,applied:true});
 const first=await billing.recordTestEvent(subscriptionEvent('evt_INITIAL',1800000000),h.opts);
 assert.deepEqual(first,{ok:true,applied:true});
 assert.equal(h.db.subscription.subscription,'sub_TEST123');
 assert.equal(h.db.subscription.customer,'cus_TEST123');
 const impostor=await billing.recordTestEvent(subscriptionEvent('evt_DIFFSUB',1800000100,'sub_OTHER123'),h.opts);
 assert.deepEqual(impostor,{ok:true,applied:false});
 assert.equal(h.db.subscription.subscription,'sub_TEST123');
 const customerChange=await billing.recordTestEvent(subscriptionEvent('evt_DIFFCUST',1800000101,'sub_TEST123','cus_OTHER123'),h.opts);
 assert.deepEqual(customerChange,{ok:true,applied:false});
 assert.equal(h.db.subscription.customer,'cus_TEST123');
 // A newer event for the same subscription/customer is still allowed.
 const valid=await billing.recordTestEvent(subscriptionEvent('evt_NEWER',1800000200,'sub_TEST123','cus_TEST123','past_due'),h.opts);
 assert.deepEqual(valid,{ok:true,applied:true});
 assert.equal(h.db.subscription.status,'past_due');
 assert.equal(h.db.subscription.lastEvent,1800000200);
 const delayed=await billing.recordTestEvent(subscriptionEvent('evt_DELAYED',1800000100),h.opts);
 assert.deepEqual(delayed,{ok:true,applied:false});
 assert.equal(h.db.subscription.status,'past_due');
 assert.equal(h.db.released,6);
});
test('unknown sessions and mismatched Stripe price cannot mutate a TEST checkout or subscription',async()=>{
 const h=harness();
 const unknown=await billing.recordTestEvent(checkoutEvent('evt_UNKNOWN','checkout.session.completed','cs_test_NOTCREATED'),h.opts);
 assert.deepEqual(unknown,{ok:true,applied:false});
 assert.equal(h.db.sessions.get('cs_test_ABC123').status,'created');
 const invalid=subscriptionEvent('evt_WRONGPRICE',1800000000);
 invalid.data.object.items.data[0].price.id='price_wrong_private';
 assert.deepEqual(await billing.recordTestEvent(invalid,h.opts),{ok:true,applied:false});
 assert.equal(h.db.subscription,null);
 const live=subscriptionEvent('evt_LIVE',1800000000);
 live.livemode=true;
 await assert.rejects(billing.recordTestEvent(live,h.opts),{message:'live_event_rejected'});
 assert.equal(h.db.released,2);
});
test('only sandbox tables change; no LIVE keys, seller entitlements or WooCommerce are touched',()=>{
 const source=fs.readFileSync('src/services/marketplace-stripe-test-v3280.js','utf8');
 assert.match(source,/WHERE session_id=\$1[\s\S]*status='created' OR/);
 assert.match(source,/subscription_id = EXCLUDED.subscription_id/);
 assert.match(source,/customer_id = EXCLUDED.customer_id/);
 assert.match(source,/live_event_rejected/);
 assert.match(source,/last_event_created < EXCLUDED.last_event_created/);
 const extracted=source.slice(source.indexOf('async function recordTestEvent('),source.indexOf('module.exports='));
 assert.doesNotMatch(extracted,/INSERT INTO marketplace_seller_subscriptions|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products|UPDATE marketplace_listings|stripeRequest\(|sk_live_/);
 assert.equal(billing.config({}).readyForCheckout,false);
 assert.equal(billing.config({...env,STRIPE_TEST_SECRET_KEY:'sk_live_BROKEN'}).readyForCheckout,false);
 assert.equal(billing.publicStatus(billing.config(env)).billingEnabled,false);
 assert.equal(billing.publicStatus(billing.config(env)).entitlementsEnforced,false);
});
