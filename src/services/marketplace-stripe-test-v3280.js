'use strict';
// V3.2.80: Stripe TEST-MODE billing laboratory. Never modifies marketplace_seller_subscriptions,
// marketplace_professional_stores, listings or WooCommerce. No live keys accepted.
const crypto=require('node:crypto');
const db=require('../db');

const PLANS=['professional','professional_plus'];
const ALLOWED_EVENTS=new Set([
 'checkout.session.completed','checkout.session.expired',
 'customer.subscription.created','customer.subscription.updated',
 'customer.subscription.deleted','invoice.paid','invoice.payment_failed'
]);
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_stripe_test_checkouts (
   id BIGSERIAL PRIMARY KEY,
   seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   plan_code TEXT NOT NULL CHECK(plan_code IN ('professional','professional_plus')),
   session_id TEXT NOT NULL UNIQUE,
   customer_id TEXT,
   subscription_id TEXT,
   status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','completed','expired')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 'CREATE INDEX IF NOT EXISTS idx_stripe_test_checkout_seller ON marketplace_stripe_test_checkouts(seller_id,created_at DESC)',
 `CREATE TABLE IF NOT EXISTS marketplace_stripe_test_subscriptions (
   seller_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
   plan_code TEXT NOT NULL CHECK(plan_code IN ('professional','professional_plus')),
   customer_id TEXT NOT NULL,
   subscription_id TEXT NOT NULL UNIQUE,
   stripe_status TEXT NOT NULL,
   period_ends_at TIMESTAMPTZ,
   cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
   last_event_created BIGINT NOT NULL DEFAULT 0,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 `CREATE TABLE IF NOT EXISTS marketplace_stripe_test_events (
   event_id TEXT PRIMARY KEY,
   event_type TEXT NOT NULL,
   seller_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
   applied BOOLEAN NOT NULL DEFAULT false,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 'CREATE INDEX IF NOT EXISTS idx_stripe_test_events_seller ON marketplace_stripe_test_events(seller_id,created_at DESC)'
];
let ready=null;
function ensureSchema(){
 if(!ready)ready=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(e=>{ready=null;throw e;});
 return ready;
}
function config(env=process.env){
 const origin=String(env.APP_ORIGIN||'https://redlibertad.com').replace(/\/+$/,'');
 const key=String(env.STRIPE_TEST_SECRET_KEY||'');
 const webhook=String(env.STRIPE_TEST_WEBHOOK_SECRET||'');
 const prices={
  professional:String(env.STRIPE_TEST_PRICE_PROFESSIONAL||''),
  professional_plus:String(env.STRIPE_TEST_PRICE_PROFESSIONAL_PLUS||'')
 };
 const enabled=env.STRIPE_TEST_BILLING_ENABLED==='true';
 let trustedOrigin=false;
 try{const u=new URL(origin);trustedOrigin=(u.protocol==='https:'||u.hostname==='localhost'||u.hostname==='127.0.0.1')&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch(_){}
 const keyReady=/^sk_test_[A-Za-z0-9_]{10,}$/.test(key)&&!key.startsWith('sk_live_');
 const webhookReady=/^whsec_[A-Za-z0-9_]{10,}$/.test(webhook);
 const readyForCheckout=enabled&&trustedOrigin&&keyReady&&webhookReady;
 return {enabled,readyForCheckout,origin:trustedOrigin?origin:'',key:keyReady?key:'',webhookSecret:webhookReady?webhook:'',
  prices:Object.fromEntries(Object.entries(prices).map(([p,v])=>[p,/^price_[A-Za-z0-9_]{6,}$/.test(v)?v:'']))};
}
function publicStatus(c=config()){
 return {ok:true,sandboxOnly:true,billingEnabled:false,enrollmentEnabled:false,entitlementsEnforced:false,
  sandboxConfigured:c.readyForCheckout,plans:PLANS.map(code=>({code,configured:!!c.prices[code]}))};
}
function validatePlan(plan,c=config()){
 if(!PLANS.includes(plan))throw Object.assign(new Error('invalid_test_plan'),{status:400});
 if(!c.readyForCheckout||!c.prices[plan])throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 return c.prices[plan];
}
function webhookEvent(raw,signature,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||raw.length>262144||raw.length===0)throw Object.assign(new Error('invalid_webhook_body'),{status:400});
 if(!/^whsec_[A-Za-z0-9_]{10,}$/.test(String(secret||'')))throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 const header=String(signature||'');const chunks=header.split(',').map(x=>x.trim());
 const ts=chunks.find(x=>/^t=\d{10,}$/.test(x));
 const values=chunks.filter(x=>/^v1=[a-f0-9]{64}$/i.test(x)).map(x=>x.slice(3));
 if(!ts||!values.length)throw Object.assign(new Error('invalid_webhook_signature'),{status:400});
 const seconds=Number(ts.slice(2));
 if(!Number.isSafeInteger(seconds)||Math.abs(now/1000-seconds)>300)throw Object.assign(new Error('webhook_timestamp_out_of_range'),{status:400});
 const calculated=crypto.createHmac('sha256',secret).update(String(seconds)+'.').update(raw).digest();
 if(!values.some(v=>crypto.timingSafeEqual(calculated,Buffer.from(v,'hex'))))
  throw Object.assign(new Error('invalid_webhook_signature'),{status:400});
 let event;
 try{event=JSON.parse(raw.toString('utf8'));}catch(_){throw Object.assign(new Error('invalid_webhook_body'),{status:400});}
 if(!event||typeof event!=='object'||!/^evt_[A-Za-z0-9_]+$/.test(event.id||'')||typeof event.type!=='string')
  throw Object.assign(new Error('invalid_webhook_event'),{status:400});
 // Even if a webhook secret is accidentally misconfigured, live events cannot enter sandbox.
 if(event.livemode!==false||event.data?.object?.livemode===true)
  throw Object.assign(new Error('live_event_rejected'),{status:403});
 return event;
}
async function stripeRequest(endpoint,form,{key,fetcher=fetch,idempotencyKey}){
 if(!/^sk_test_/.test(key))throw Object.assign(new Error('live_keys_forbidden'),{status:503});
 if(!/^\/v1\/(?:checkout\/sessions|billing_portal\/sessions)$/.test(endpoint))
  throw Object.assign(new Error('stripe_endpoint_blocked'),{status:400});
 const body=new URLSearchParams();
 for(const [name,value] of Object.entries(form))if(value!==null&&value!==undefined)body.set(name,String(value));
 const result=await fetcher('https://api.stripe.com'+endpoint,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded',
   ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body
 });
 let data={};try{data=await result.json();}catch(_){}
 if(!result.ok)throw Object.assign(new Error('stripe_test_request_failed'),{status:502});
 return data;
}
function validStripeUrl(value,kind){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&
   (kind==='checkout'?url.hostname==='checkout.stripe.com':url.hostname==='billing.stripe.com');
 }catch(_){return false;}
}
async function createTestCheckout({sellerId,planCode,env=process.env,query=db.query,request=stripeRequest}){
 const c=config(env),price=validatePlan(planCode,c);
 const existing=await query('SELECT subscription_id FROM marketplace_stripe_test_subscriptions WHERE seller_id=$1',[sellerId]);
 if(existing.rowCount)throw Object.assign(new Error('test_subscription_exists_use_portal'),{status:409});
 const checkout=await request('/v1/checkout/sessions',{
  mode:'subscription',
  'line_items[0][price]':price,'line_items[0][quantity]':'1',
  'client_reference_id':String(sellerId),
  'metadata[sandbox]':'redlibertad_v3280','metadata[seller_id]':String(sellerId),
  'metadata[plan_code]':planCode,
  'subscription_data[metadata][sandbox]':'redlibertad_v3280',
  'subscription_data[metadata][seller_id]':String(sellerId),
  'subscription_data[metadata][plan_code]':planCode,
  success_url:c.origin+'/marketplace/suscripciones?stripe_test=ok',
  cancel_url:c.origin+'/marketplace/suscripciones?stripe_test=cancel',
  'billing_address_collection':'required',
  locale:'es'
 },{key:c.key,idempotencyKey:crypto.randomUUID()});
 if(checkout.livemode!==false||!/^cs_test_[A-Za-z0-9_]+$/.test(checkout.id||'')||
   !validStripeUrl(checkout.url,'checkout'))
  throw Object.assign(new Error('invalid_stripe_test_session'),{status:502});
 await query('INSERT INTO marketplace_stripe_test_checkouts(seller_id,plan_code,session_id) VALUES($1,$2,$3) ON CONFLICT(session_id) DO NOTHING',
  [sellerId,planCode,checkout.id]);
 return {ok:true,sandboxOnly:true,url:checkout.url};
}
async function createTestPortal({sellerId,env=process.env,query=db.query,request=stripeRequest}){
 const c=config(env);
 if(!c.readyForCheckout)throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 const result=await query('SELECT customer_id FROM marketplace_stripe_test_subscriptions WHERE seller_id=$1',[sellerId]);
 if(!result.rowCount||!/^cus_[A-Za-z0-9_]+$/.test(result.rows[0].customer_id||''))
  throw Object.assign(new Error('test_customer_not_found'),{status:404});
 const portal=await request('/v1/billing_portal/sessions',{
  customer:result.rows[0].customer_id,return_url:c.origin+'/marketplace/suscripciones'
 },{key:c.key,idempotencyKey:crypto.randomUUID()});
 if(!validStripeUrl(portal.url,'portal'))throw Object.assign(new Error('invalid_stripe_test_portal'),{status:502});
 return {ok:true,sandboxOnly:true,url:portal.url};
}
function subscriptionInfo(obj,c){
 if(!obj||!/^(sub_)[A-Za-z0-9_]+$/.test(obj.id||'')||!/^cus_[A-Za-z0-9_]+$/.test(obj.customer||''))return null;
 const {seller_id:sellerId,plan_code:planCode,sandbox}=obj.metadata||{};
 if(sandbox!=='redlibertad_v3280'||!/^[1-9]\d{0,15}$/.test(String(sellerId||''))||!PLANS.includes(planCode))return null;
 const price=obj.items?.data?.[0]?.price?.id;
 if(!c.prices[planCode]||price!==c.prices[planCode])return null;
 const period=Number(obj.current_period_end||obj.items?.data?.[0]?.current_period_end||0);
 return {sellerId,planCode,customerId:obj.customer,subscriptionId:obj.id,
  status:String(obj.status||'unknown').slice(0,40),periodEnd:Number.isSafeInteger(period)&&period>0?new Date(period*1000):null,
  cancelAtPeriodEnd:obj.cancel_at_period_end===true};
}
async function recordTestEvent(event,{env=process.env,connect=()=>db.pool.connect()}={}){
 if(!event||event.livemode!==false||event.data?.object?.livemode===true)
  throw Object.assign(new Error('live_event_rejected'),{status:403});
 const c=config(env);
 if(!c.readyForCheckout)throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 if(!ALLOWED_EVENTS.has(event.type))return {ok:true,ignored:true};
 const object=event.data?.object||{};
 const client=await connect();let transaction=false;
 try{
  await client.query('BEGIN');transaction=true;
  const dedupe=await client.query('INSERT INTO marketplace_stripe_test_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',[event.id,event.type]);
  if(!dedupe.rowCount){await client.query('COMMIT');transaction=false;return {ok:true,duplicate:true};}
  let sellerId=null,applied=false;
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.expired'){
   // Never use arbitrary client metadata to attach a completed checkout.
   if(/^cs_test_[A-Za-z0-9_]+$/.test(object.id||'')&&object.livemode===false){
    const r=await client.query(
     `UPDATE marketplace_stripe_test_checkouts SET
      status=$2,customer_id=COALESCE($3,customer_id),subscription_id=COALESCE($4,subscription_id),
      updated_at=now()
      WHERE session_id=$1 RETURNING seller_id`,
     [object.id,event.type.endsWith('expired')?'expired':'completed',
      typeof object.customer==='string'?object.customer:null,
      typeof object.subscription==='string'?object.subscription:null]);
    if(r.rowCount){sellerId=r.rows[0].seller_id;applied=true;}
   }
  }else if(event.type.startsWith('customer.subscription.')){
   const info=subscriptionInfo(object,c);
   if(info){
    const matches=await client.query('SELECT 1 FROM marketplace_stripe_test_checkouts WHERE seller_id=$1 AND plan_code=$2 LIMIT 1',[info.sellerId,info.planCode]);
    if(matches.rowCount){
     const timestamp=Number(event.created||0);
     if(Number.isSafeInteger(timestamp)&&timestamp>0){
      const result=await client.query(
       `INSERT INTO marketplace_stripe_test_subscriptions
        (seller_id,plan_code,customer_id,subscription_id,stripe_status,period_ends_at,cancel_at_period_end,last_event_created)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(seller_id) DO UPDATE SET
         plan_code=EXCLUDED.plan_code,customer_id=EXCLUDED.customer_id,
         subscription_id=EXCLUDED.subscription_id,stripe_status=EXCLUDED.stripe_status,
         period_ends_at=EXCLUDED.period_ends_at,cancel_at_period_end=EXCLUDED.cancel_at_period_end,
         last_event_created=EXCLUDED.last_event_created,updated_at=now()
        WHERE marketplace_stripe_test_subscriptions.last_event_created < EXCLUDED.last_event_created
        RETURNING seller_id`,
       [info.sellerId,info.planCode,info.customerId,info.subscriptionId,
        info.status,info.periodEnd,info.cancelAtPeriodEnd,timestamp]);
      if(result.rowCount){sellerId=info.sellerId;applied=true;}
     }
    }
   }
  }
  await client.query('UPDATE marketplace_stripe_test_events SET seller_id=$2,applied=$3 WHERE event_id=$1',[event.id,sellerId,applied]);
  await client.query('COMMIT');transaction=false;
  return {ok:true,applied};
 }catch(error){
  if(transaction)try{await client.query('ROLLBACK');}catch(_){}
  throw error;
 }finally{client.release();}
}
module.exports={DDL,ensureSchema,config,publicStatus,validatePlan,webhookEvent,stripeRequest,
 validStripeUrl,createTestCheckout,createTestPortal,subscriptionInfo,recordTestEvent,ALLOWED_EVENTS};
