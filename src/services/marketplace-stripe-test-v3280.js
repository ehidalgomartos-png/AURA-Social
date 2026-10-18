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
 'ALTER TABLE marketplace_stripe_test_subscriptions ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ',
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
  // Stripe may enable Managed Payments by default on new accounts; opt out on
  // this TEST session only, keeping the merchant's global settings unchanged.
  'managed_payments[enabled]':'false',
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
// Shared safeguard for admin TEST Portal and manual Stripe reconciliation.
// Older sandbox rows are not trusted until linked to a completed local Checkout.
async function hasVerifiedTestCheckout({sellerId,planCode,customerId,subscriptionId,query=db.query}){
 const result=await query(
  `SELECT 1 FROM marketplace_stripe_test_checkouts
   WHERE seller_id=$1 AND plan_code=$2 AND status='completed'
     AND customer_id=$3 AND subscription_id=$4 LIMIT 1`,
  [sellerId,planCode,customerId,subscriptionId]);
 return result.rowCount>0;
}
async function createTestPortal({sellerId,env=process.env,query=db.query,request=stripeRequest}){
 const c=config(env);
 if(!c.readyForCheckout)throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 const result=await query(
  'SELECT plan_code,customer_id,subscription_id FROM marketplace_stripe_test_subscriptions WHERE seller_id=$1',[sellerId]);
 if(!result.rowCount||!/^cus_[A-Za-z0-9_]+$/.test(result.rows[0].customer_id||'')||
  !/^sub_[A-Za-z0-9_]+$/.test(result.rows[0].subscription_id||''))
  throw Object.assign(new Error('test_customer_not_found'),{status:404});
 const record=result.rows[0];
 if(!await hasVerifiedTestCheckout({sellerId,planCode:record.plan_code,
  customerId:record.customer_id,subscriptionId:record.subscription_id,query}))
  throw Object.assign(new Error('stripe_test_checkout_not_verified'),{status:409});
 const portal=await request('/v1/billing_portal/sessions',{
  customer:record.customer_id,return_url:c.origin+'/marketplace/suscripciones'
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
 const cancelSeconds=Number(obj.cancel_at||0);
 const cancelAt=Number.isSafeInteger(cancelSeconds)&&cancelSeconds>0?new Date(cancelSeconds*1000):null;
 const upcomingCancel=cancelAt!==null&&cancelSeconds*1000>Date.now()&&!['canceled','incomplete_expired'].includes(obj.status);
 return {sellerId,planCode,customerId:obj.customer,subscriptionId:obj.id,
  status:String(obj.status||'unknown').slice(0,40),periodEnd:Number.isSafeInteger(period)&&period>0?new Date(period*1000):null,
  cancelAt,cancelAtPeriodEnd:obj.cancel_at_period_end===true||upcomingCancel};
}
// On-demand read-through of the canonical current Stripe TEST state. This repairs
// webhook arrival-order races without replaying, deleting or fabricating events.
async function fetchCurrentTestSubscription(subscriptionId,{env=process.env,fetcher=fetch}={}){
 const c=config(env);
 if(!c.readyForCheckout)throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 if(!/^sub_[A-Za-z0-9_]+$/.test(String(subscriptionId||'')))
  throw Object.assign(new Error('invalid_test_subscription_id'),{status:400});
 const response=await fetcher('https://api.stripe.com/v1/subscriptions/'+subscriptionId,{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
  headers:{Authorization:'Bearer '+c.key}
 });
 if(!response.ok)throw Object.assign(new Error('stripe_test_lookup_failed'),{status:502});
 let obj;
 try{obj=await response.json();}catch(_){throw Object.assign(new Error('invalid_stripe_test_response'),{status:502});}
 if(!obj||obj.livemode!==false||obj.id!==subscriptionId)
  throw Object.assign(new Error('invalid_stripe_test_response'),{status:502});
 return obj;
}
async function reconcileTestSubscription({sellerId,env=process.env,query=db.query,fetcher=fetch}){
 const c=config(env);
 if(!c.readyForCheckout)throw Object.assign(new Error('sandbox_not_configured'),{status:503});
 if(!/^[1-9]\d{0,15}$/.test(String(sellerId||'')))
  throw Object.assign(new Error('invalid_seller_id'),{status:400});
 const existing=await query(
  'SELECT plan_code,customer_id,subscription_id FROM marketplace_stripe_test_subscriptions WHERE seller_id=$1',
  [sellerId]);
 if(!existing.rowCount)throw Object.assign(new Error('test_subscription_not_found'),{status:404});
 const record=existing.rows[0];
 const live=await fetchCurrentTestSubscription(record.subscription_id,{env,fetcher});
 const info=subscriptionInfo(live,c);
 if(!info||String(info.sellerId)!==String(sellerId)||info.subscriptionId!==record.subscription_id||
  info.customerId!==record.customer_id||info.planCode!==record.plan_code)
  throw Object.assign(new Error('stripe_test_subscription_mismatch'),{status:409});
 if(!await hasVerifiedTestCheckout({sellerId,planCode:record.plan_code,
  customerId:record.customer_id,subscriptionId:record.subscription_id,query}))
  throw Object.assign(new Error('stripe_test_checkout_not_verified'),{status:409});
 const saved=await query(
  `UPDATE marketplace_stripe_test_subscriptions SET
    stripe_status=$2,period_ends_at=$3,cancel_at_period_end=$4,cancel_at=$5,updated_at=now()
    WHERE seller_id=$1 AND subscription_id=$6 AND customer_id=$7 AND plan_code=$8
    RETURNING plan_code,stripe_status,period_ends_at,cancel_at_period_end,cancel_at,updated_at`,
  [sellerId,info.status,info.periodEnd,info.cancelAtPeriodEnd,info.cancelAt,
   info.subscriptionId,info.customerId,info.planCode]);
 if(!saved.rowCount)throw Object.assign(new Error('stripe_test_subscription_mismatch'),{status:409});
 return {ok:true,sandboxOnly:true,subscription:saved.rows[0]};
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
   // V3.2.95: only a genuine TEST subscription-mode completion can attach
   // the Stripe customer/subscription pair. Expiration must never write IDs.
   const completed=event.type==='checkout.session.completed';
   const validCompletion=object.mode==='subscription'&&
    typeof object.customer==='string'&&/^cus_[A-Za-z0-9_]+$/.test(object.customer)&&
    typeof object.subscription==='string'&&/^sub_[A-Za-z0-9_]+$/.test(object.subscription);
   // Bind solely by the Checkout session created by this server; never trust
   // client_reference_id or unverified metadata supplied in an event.
   if(/^cs_test_[A-Za-z0-9_]+$/.test(object.id||'')&&object.livemode===false&&
    (!completed||validCompletion)){
    const r=await client.query(
     `UPDATE marketplace_stripe_test_checkouts SET
      status=$2,
      customer_id=CASE WHEN $2='completed' THEN $3 ELSE customer_id END,
      subscription_id=CASE WHEN $2='completed' THEN $4 ELSE subscription_id END,
      updated_at=now()
      -- A late expiry cannot downgrade a completion; valid completion can
      -- supersede expiry. Existing attached IDs may never be replaced.
      WHERE session_id=$1
        AND (status='created' OR ($2='completed' AND status='expired'))
        AND ($2='expired' OR
          ((customer_id IS NULL OR customer_id=$3)
           AND (subscription_id IS NULL OR subscription_id=$4)))
      RETURNING seller_id`,
     [object.id,completed?'completed':'expired',
      completed?object.customer:null,completed?object.subscription:null]);
    if(r.rowCount){sellerId=r.rows[0].seller_id;applied=true;}
   }
  }else if(event.type.startsWith('customer.subscription.')){
   const info=subscriptionInfo(object,c);
   if(info){
    const matches=await client.query(
     `SELECT 1 FROM marketplace_stripe_test_checkouts
      WHERE seller_id=$1 AND plan_code=$2 AND status='completed'
        AND customer_id=$3 AND subscription_id=$4 LIMIT 1`,
     [info.sellerId,info.planCode,info.customerId,info.subscriptionId]);
    if(!matches.rowCount){
     // Allow Stripe retries when subscription events arrive before Checkout.
     const pending=await client.query(
      `SELECT 1 FROM marketplace_stripe_test_checkouts
       WHERE seller_id=$1 AND plan_code=$2 AND status IN ('created','expired')
         AND customer_id IS NULL AND subscription_id IS NULL LIMIT 1`,
      [info.sellerId,info.planCode]);
     if(pending.rowCount)
      throw Object.assign(new Error('stripe_test_checkout_pending'),{status:503});
    }
    if(matches.rowCount){
     const timestamp=Number(event.created||0);
     if(Number.isSafeInteger(timestamp)&&timestamp>0){
      const result=await client.query(
       `INSERT INTO marketplace_stripe_test_subscriptions
        (seller_id,plan_code,customer_id,subscription_id,stripe_status,period_ends_at,cancel_at_period_end,cancel_at,last_event_created)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(seller_id) DO UPDATE SET
         plan_code=EXCLUDED.plan_code,customer_id=EXCLUDED.customer_id,
         subscription_id=EXCLUDED.subscription_id,stripe_status=EXCLUDED.stripe_status,
         period_ends_at=EXCLUDED.period_ends_at,cancel_at_period_end=EXCLUDED.cancel_at_period_end,
         cancel_at=EXCLUDED.cancel_at,last_event_created=EXCLUDED.last_event_created,updated_at=now()
        -- Do not silently replace an already attached Stripe TEST subscription
        -- or customer with another pair for the same seller. New subscriptions
        -- require a separate, explicit sandbox reconciliation workflow.
        WHERE marketplace_stripe_test_subscriptions.subscription_id = EXCLUDED.subscription_id
          AND marketplace_stripe_test_subscriptions.customer_id = EXCLUDED.customer_id
          AND marketplace_stripe_test_subscriptions.last_event_created < EXCLUDED.last_event_created
        RETURNING seller_id`,
       [info.sellerId,info.planCode,info.customerId,info.subscriptionId,
        info.status,info.periodEnd,info.cancelAtPeriodEnd,info.cancelAt,timestamp]);
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
 validStripeUrl,createTestCheckout,createTestPortal,subscriptionInfo,recordTestEvent,
 fetchCurrentTestSubscription,reconcileTestSubscription,hasVerifiedTestCheckout,ALLOWED_EVENTS};
