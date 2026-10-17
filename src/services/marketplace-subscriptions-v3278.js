'use strict';
// V3.2.78 — subscription groundwork ONLY. No charging, plan enforcement or vendor migrations.
const db=require('../db');

const DDL=[
  `CREATE TABLE IF NOT EXISTS marketplace_subscription_plans (
    code TEXT PRIMARY KEY CHECK (code IN ('particular','professional','professional_plus')),
    name VARCHAR(80) NOT NULL,
    monthly_price_cents INTEGER CHECK(monthly_price_cents>=0),
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    pricing_state TEXT NOT NULL DEFAULT 'draft' CHECK(pricing_state IN ('draft','approved')),
    available BOOLEAN NOT NULL DEFAULT false,
    store_limit INTEGER CHECK(store_limit>0),
    product_limit INTEGER CHECK(product_limit>0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `INSERT INTO marketplace_subscription_plans
     (code,name,monthly_price_cents,pricing_state,available,store_limit,product_limit,sort_order)
     VALUES
     ('particular','Particular',0,'approved',true,NULL,NULL,0),
     ('professional','Profesional',NULL,'draft',false,1,NULL,10),
     ('professional_plus','Profesional Plus',NULL,'draft',false,3,NULL,20)
     ON CONFLICT (code) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS marketplace_seller_subscriptions (
     seller_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     plan_code TEXT NOT NULL REFERENCES marketplace_subscription_plans(code),
     status TEXT NOT NULL CHECK(status IN ('pilot','trialing','active','past_due','canceled','expired')),
     period_starts_at TIMESTAMPTZ,
     period_ends_at TIMESTAMPTZ,
     cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
     billing_provider TEXT CHECK (billing_provider IN ('stripe')),
     billing_customer_ref TEXT,
     billing_subscription_ref TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK (period_ends_at IS NULL OR period_starts_at IS NULL OR period_ends_at>=period_starts_at)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_status ON marketplace_seller_subscriptions(status)',
  `CREATE TABLE IF NOT EXISTS marketplace_subscription_audit (
    id BIGSERIAL PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_marketplace_subscription_audit_seller ON marketplace_subscription_audit(seller_id,created_at DESC)'
];
let ready=null;
function ensureSubscriptionSchema(){
 if(!ready)ready=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(error=>{ready=null;throw error;});
 return ready;
}
function effectiveAccount(subscription,stores){
 // Existing approved stores are grandfathered into an uncapped, non-billed pilot.
 // This is DISPLAY ONLY: existing purchase/sync paths never read these flags.
 const pilot=Array.isArray(stores)&&stores.some(s=>s.status==='approved');
 if(subscription)return {
  planCode:subscription.plan_code,
  status:subscription.status,
  periodStartsAt:subscription.period_starts_at,
  periodEndsAt:subscription.period_ends_at,
  cancelAtPeriodEnd:subscription.cancel_at_period_end===true,
  grandfathered:false
 };
 return {planCode:pilot?'professional':'particular',
  status:pilot?'pilot':'free',
  periodStartsAt:null,periodEndsAt:null,cancelAtPeriodEnd:false,grandfathered:pilot};
}
function planView(row){
 return {
  code:row.code,name:row.name,monthlyPriceCents:row.monthly_price_cents,
  currency:row.currency,pricingState:row.pricing_state,
  available:row.available===true,storeLimit:row.store_limit,productLimit:row.product_limit
 };
}
module.exports={DDL,ensureSubscriptionSchema,effectiveAccount,planView};
