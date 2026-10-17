'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const jwt=require('jsonwebtoken');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const adminRouter=require('../src/routes/marketplace-stripe-test-v3280').router;
const hookRouter=require('../src/routes/marketplace-stripe-test-webhook-v3280').router;
const seo=require('../src/routes/marketplace-seo-v3251').router;
const testEnv={
 APP_ORIGIN:'https://redlibertad.com',
 STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'
};
const event=(type,object={})=>({id:'evt_1234567890',type,livemode:false,created:1800000000,data:{object}});
const sign=(ev,secret=testEnv.STRIPE_TEST_WEBHOOK_SECRET,seconds=1800000000)=>{
 const body=Buffer.from(JSON.stringify(ev));
 const v1=crypto.createHmac('sha256',secret).update(String(seconds)+'.').update(body).digest('hex');
 return {body,header:'t='+seconds+',v1='+v1};
};

test('sandbox is off by default and rejects live secret keys and mismatched price setup',()=>{
 const c=billing.config({});
 assert.equal(c.readyForCheckout,false);
 assert.equal(billing.publicStatus(c).billingEnabled,false);
 assert.equal(billing.publicStatus(c).entitlementsEnforced,false);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_BILLING_ENABLED:'false'}).readyForCheckout,false);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_SECRET_KEY:'sk_live_1234567890abcde'}).readyForCheckout,false);
 assert.equal(billing.config({...testEnv,APP_ORIGIN:'http://redlibertad.com'}).readyForCheckout,false);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_WEBHOOK_SECRET:''}).readyForCheckout,false);
 assert.equal(billing.config(testEnv).readyForCheckout,true);
 assert.throws(()=>billing.validatePlan('particular',billing.config(testEnv)),{message:'invalid_test_plan'});
 assert.throws(()=>billing.validatePlan('professional_plus',billing.config({...testEnv,STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:''})),{message:'sandbox_not_configured'});
});
test('Stripe REST helper sends fixed test endpoints with form encoding and rejects live',async()=>{
 let requested;
 const fetcher=async(url,params)=>{requested={url,params};return {ok:true,json:async()=>({id:'cs_test_abcdef'})};};
 await billing.stripeRequest('/v1/checkout/sessions',{mode:'subscription','line_items[0][price]':'price_123'},{key:testEnv.STRIPE_TEST_SECRET_KEY,fetcher,idempotencyKey:'key1'});
 assert.equal(requested.url,'https://api.stripe.com/v1/checkout/sessions');
 assert.match(requested.params.body.toString(),/mode=subscription/);
 assert.equal(requested.params.headers['Idempotency-Key'],'key1');
 assert.equal(requested.params.redirect,'error');
 await assert.rejects(billing.stripeRequest('/v1/payouts',{},{key:testEnv.STRIPE_TEST_SECRET_KEY,fetcher}),{message:'stripe_endpoint_blocked'});
 await assert.rejects(billing.stripeRequest('/v1/checkout/sessions',{},{key:'sk_live_NEVER',fetcher}),{message:'live_keys_forbidden'});
 assert.equal(billing.validStripeUrl('https://attacker.example/checkout','checkout'),false);
 assert.equal(billing.validStripeUrl('http://checkout.stripe.com/s','checkout'),false);
 assert.equal(billing.validStripeUrl('https://checkout.stripe.com/c/pay/example','checkout'),true);
 assert.equal(billing.validStripeUrl('https://billing.stripe.com/p/session/abc','portal'),true);
});
test('checkout uses only approved server-side TEST price and creates no real subscription',async()=>{
 const calls=[];
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT subscription_id'))return {rowCount:0,rows:[]};
  return {rowCount:1,rows:[]};
 };
 let request;
 const checkout=await billing.createTestCheckout({sellerId:44,planCode:'professional',env:testEnv,query,
  request:async(endpoint,form,headers)=>{request={endpoint,form,headers};return {
   livemode:false,id:'cs_test_1234567890',url:'https://checkout.stripe.com/c/pay/cs_test_1234567890'
  };}});
 assert.equal(checkout.sandboxOnly,true);
 assert.equal(request.endpoint,'/v1/checkout/sessions');
 assert.equal(request.form['line_items[0][price]'],testEnv.STRIPE_TEST_PRICE_PROFESSIONAL);
 assert.equal(request.form['subscription_data[metadata][seller_id]'],'44');
 assert.equal(request.form['subscription_data[metadata][sandbox]'],'redlibertad_v3280');
 assert.equal(request.form.mode,'subscription');
 assert.equal(request.form['managed_payments[enabled]'],'false');
 assert.equal(new URLSearchParams(request.form).get('managed_payments[enabled]'),'false');
 assert.match(request.headers.key,/^sk_test_/);
 assert.ok(calls.some(x=>x.sql.includes('INSERT INTO marketplace_stripe_test_checkouts')));
 assert.equal(calls.some(x=>x.sql.includes('marketplace_seller_subscriptions')),false);
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional',env:testEnv,
  query:async()=>({rowCount:1,rows:[{subscription_id:'sub_123'}]}),request:async()=>{throw Error('must not call');}
 }),{message:'test_subscription_exists_use_portal'});
 await assert.rejects(billing.createTestCheckout({sellerId:44,planCode:'professional',env:testEnv,
  query,request:async()=>({livemode:true,id:'cs_test_1',url:'https://checkout.stripe.com/c/pay/example'})
 }),{message:'invalid_stripe_test_session'});
});
test('portal can only use the authenticated admin TEST customer, not caller selected customer',async()=>{
 let payload;
 const data=await billing.createTestPortal({sellerId:15,env:testEnv,
  query:async(sql,args)=>{assert.deepEqual(args,[15]);return {rowCount:1,rows:[{customer_id:'cus_testAdmin123'}]};},
  request:async(path,form)=>{payload={path,form};return {url:'https://billing.stripe.com/p/session/test'};}});
 assert.equal(data.ok,true);assert.equal(data.sandboxOnly,true);
 assert.equal(payload.path,'/v1/billing_portal/sessions');
 assert.equal(payload.form.customer,'cus_testAdmin123');
 await assert.rejects(billing.createTestPortal({sellerId:22,env:testEnv,
  query:async()=>({rowCount:0,rows:[]})}),{message:'test_customer_not_found'});
});
test('raw-body signature verification rejects tampering, replay outside tolerance and live events',()=>{
 const {body,header}=sign(event('checkout.session.completed',{id:'cs_test_ABC',livemode:false}));
 const now=1800000000*1000;
 assert.equal(billing.webhookEvent(body,header,testEnv.STRIPE_TEST_WEBHOOK_SECRET,now).type,'checkout.session.completed');
 assert.throws(()=>billing.webhookEvent(Buffer.concat([body,Buffer.from(' ')]),header,testEnv.STRIPE_TEST_WEBHOOK_SECRET,now),{message:'invalid_webhook_signature'});
 assert.throws(()=>billing.webhookEvent(body,header,testEnv.STRIPE_TEST_WEBHOOK_SECRET,now+400000),{message:'webhook_timestamp_out_of_range'});
 assert.throws(()=>billing.webhookEvent(body,'t=1800000000,v1='+'0'.repeat(64),testEnv.STRIPE_TEST_WEBHOOK_SECRET,now),{message:'invalid_webhook_signature'});
 const live=sign({...event('checkout.session.completed',{livemode:true}),livemode:true});
 assert.throws(()=>billing.webhookEvent(live.body,live.header,testEnv.STRIPE_TEST_WEBHOOK_SECRET,now),{message:'live_event_rejected'});
});
test('only matching sandbox subscriptions and configured prices can be matched',()=>{
 const stripeObj={
  id:'sub_ABC123',customer:'cus_ABC123',status:'active',
  metadata:{sandbox:'redlibertad_v3280',seller_id:'55',plan_code:'professional'},
  items:{data:[{price:{id:testEnv.STRIPE_TEST_PRICE_PROFESSIONAL}}]},
  current_period_end:1800001234,cancel_at_period_end:true
 };
 const ok=billing.subscriptionInfo(stripeObj,billing.config(testEnv));
 assert.equal(ok.sellerId,'55');assert.equal(ok.cancelAtPeriodEnd,true);
 assert.equal(ok.periodEnd.toISOString(),new Date(1800001234000).toISOString());
 assert.equal(billing.subscriptionInfo({...stripeObj,metadata:{seller_id:'55'}},billing.config(testEnv)),null);
 assert.equal(billing.subscriptionInfo({...stripeObj,items:{data:[{price:{id:'price_live_abc'}}]}},billing.config(testEnv)),null);
});
test('events are idempotent, auditable and isolated; webhook cannot update the professional seller state',async()=>{
 const calls=[];const seen=new Set();
 const connect=async()=>({query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('INSERT INTO marketplace_stripe_test_events')){
   if(seen.has(args[0]))return {rowCount:0,rows:[]};
   seen.add(args[0]);return {rowCount:1,rows:[{event_id:args[0]}]};
  }
  if(sql.includes('UPDATE marketplace_stripe_test_checkouts'))return {rowCount:1,rows:[{seller_id:44}]};
  return {rowCount:1,rows:[]};
 },release:()=>{calls.push({sql:'RELEASE'});}});
 const e=event('checkout.session.completed',{id:'cs_test_ABC123',livemode:false,subscription:'sub_ABC123',customer:'cus_ABC123'});
 const opts={env:testEnv,connect};
 assert.deepEqual(await billing.recordTestEvent(e,opts),{ok:true,applied:true});
 assert.deepEqual(await billing.recordTestEvent(e,opts),{ok:true,duplicate:true});
 assert.equal(calls.filter(c=>c.sql==='COMMIT').length,2);
 assert.equal(calls.some(c=>/INSERT INTO marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products|UPDATE marketplace_listings/i.test(c.sql)),false);
});
test('signed webhook route is isolated, raw before JSON, admin routes deny unauthorized access',async()=>{
 const orig=db.query,prior=process.env.JWT_SECRET;
 process.env.JWT_SECRET='stripe-test-sandbox-token';
 db.query=async(sql,args=[])=>{
  if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:Number(args[0]),username:'user',is_admin:Number(args[0])===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use('/api/marketplace/stripe-test/webhook',hookRouter);
 app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions/admin/stripe-test',adminRouter);app.use(seo);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const headers=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 try{
  assert.equal((await fetch(base+'/marketplace/suscripciones/laboratorio')).status,401);
  assert.equal((await fetch(base+'/marketplace/suscripciones/laboratorio',{headers:headers(2)})).status,403);
  const page=await fetch(base+'/marketplace/suscripciones/laboratorio',{headers:headers(1)});
  assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);
  assert.equal((await fetch(base+'/api/marketplace/subscriptions/admin/stripe-test/status')).status,401);
  assert.equal((await fetch(base+'/api/marketplace/subscriptions/admin/stripe-test/status',{headers:headers(2)})).status,403);
  const status=await fetch(base+'/api/marketplace/subscriptions/admin/stripe-test/status',{headers:headers(1)});
  assert.equal(status.status,200);const data=await status.json();
  assert.equal(data.sandboxConfigured,false);assert.equal(data.billingEnabled,false);
  assert.equal((await fetch(base+'/api/marketplace/subscriptions/admin/stripe-test/checkout',{
   method:'POST',headers:{...headers(1),'Content-Type':'application/json',Origin:base},
   body:JSON.stringify({planCode:'professional'})})).status,503);
  assert.equal((await fetch(base+'/api/marketplace/stripe-test/webhook',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event('checkout.session.completed'))})).status,503);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=orig;
  if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;
 }
});
test('wiring and mobile interface cannot accidentally enable live billing',()=>{
 const server=fs.readFileSync('server.js','utf8'),routes=fs.readFileSync('src/routes/marketplace-subscriptions-v3278.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-stripe-test-v3280.html','utf8');
 const ui=fs.readFileSync('public/marketplace-stripe-test-v3280.js','utf8');
 assert.ok(server.indexOf("app.use('/api/marketplace/stripe-test/webhook'")<server.indexOf("app.use(express.json("));
 assert.match(routes,/router\.use\('\/admin\/stripe-test'/);
 assert.match(html,/noindex,nofollow/);assert.match(html,/viewport-fit=cover/);
 assert.match(ui,/window\.confirm/);assert.match(ui,/credentials:'same-origin'/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new (require('node:vm').Script)(ui));
 const sql=billing.DDL.join('\n');
 assert.match(sql,/marketplace_stripe_test_subscriptions/);
 assert.doesNotMatch(sql,/ALTER TABLE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|DROP TABLE|TRUNCATE/i);
});
