'use strict';
// V3.2.99 — pre-LIVE release gate. No credentials, payments, network or DB writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const billing=require('../src/services/marketplace-stripe-test-v3280');
const subscriptions=require('../src/services/marketplace-subscriptions-v3278');
const launch=require('../src/services/marketplace-launch-readiness-v3289');
const contracts=require('../src/services/marketplace-contract-drafts-v3288');

function source(p){return fs.readFileSync(path.join(__dirname,'..',p),'utf8');}
const testEnv={
 APP_ORIGIN:'https://redlibertad.com',STRIPE_TEST_BILLING_ENABLED:'true',
 STRIPE_TEST_SECRET_KEY:'sk_test_1234567890abcdef',
 STRIPE_TEST_WEBHOOK_SECRET:'whsec_1234567890abcdef',
 STRIPE_TEST_PRICE_PROFESSIONAL:'price_1234567890test',
 STRIPE_TEST_PRICE_PROFESSIONAL_PLUS:'price_abcdef9876543210'
};
test('live Stripe secret never enables the Stripe TEST laboratory',()=>{
 assert.equal(billing.config(testEnv).readyForCheckout,true);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_SECRET_KEY:'sk_live_not_permitted_here'}).readyForCheckout,false);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_BILLING_ENABLED:'false'}).readyForCheckout,false);
 assert.equal(billing.config({...testEnv,STRIPE_TEST_WEBHOOK_SECRET:''}).readyForCheckout,false);
 const flags=billing.publicStatus(billing.config(testEnv));
 assert.equal(flags.sandboxOnly,true);
 for(const flag of ['billingEnabled','enrollmentEnabled','entitlementsEnforced'])assert.equal(flags[flag],false,flag);
});
test('commercial plans start unpublished, unapproved and unavailable',()=>{
 const ddl=subscriptions.DDL.join('\n');
 assert.match(ddl,/\('professional','Profesional',NULL,'draft',false/);
 assert.match(ddl,/\('professional_plus','Profesional Plus',NULL,'draft',false/);
 const view=subscriptions.planView({code:'professional',name:'Profesional',monthly_price_cents:null,currency:'EUR',
  pricing_state:'draft',available:false,store_limit:1,product_limit:null});
 assert.equal(view.monthlyPriceCents,null);
 assert.equal(view.available,false);
 assert.equal(view.pricingState,'draft');
});
test('grandfathered approved seller store remains a free pilot',()=>{
 const account=subscriptions.effectiveAccount(null,[{status:'approved',name:'MundoTaza'}]);
 assert.equal(account.status,'pilot');
 assert.equal(account.grandfathered,true);
 assert.equal(account.periodEndsAt,null);
 assert.equal(subscriptions.effectiveAccount(null,[]).status,'free');
});
test('even fully drafted and reviewed internal plans cannot authorize commercial release',()=>{
 const plans=launch.CODES.map(code=>({
  code,storeLimit:code==='professional'?1:3,productLimit:null,
  bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  issues:[],capacity:{status:'proposed'},policy:{mode:'unlimited_proposal'}
 }));
 const drafts=launch.CODES.map(code=>({
  code,reviewState:'internal_review',revision:2,
  priceDisclosure:'Texto completo redactado y revisado internamente.',
  taxes:'Texto completo redactado y revisado internamente.',
  renewals:'Texto completo redactado y revisado internamente.',
  cancellations:'Texto completo redactado y revisado internamente.',
  privacy:'Texto completo redactado y revisado internamente.',
  consent:'Texto completo redactado y revisado internamente.'
 }));
 const commercial={drafts:launch.CODES.map(code=>({code,proposedMonthlyCents:code==='professional'?990:2490})),
  reviews:launch.reviewTopics.map(code=>({code,status:'reviewed'}))};
 const result=launch.build({cards:plans},{drafts},commercial);
 assert.equal(result.summary.outstanding,0);
 for(const flag of ['releaseAuthorized','productionReady','legalApproval','taxApproval','publicEnrollmentEnabled',
  'pricesPublished','billingEnabled','liveStripeEnabled','consentRecorded','entitlementsEnforced'])
  assert.equal(result[flag],false,flag);
 assert.equal(result.pilotProtected,true);
 assert.equal(result.externalProductCheckout,true);
 assert.equal(result.summary.needsFinalApprovals,true);
});
test('contract preview remains a demonstration without legally binding consent',()=>{
 const flags=contracts.state();
 assert.equal(flags.previewOnly,true);
 assert.equal(flags.publiclyAvailable,false);
 assert.equal(flags.consentCollected,false);
 assert.equal(flags.legallyApproved,false);
 assert.equal(flags.billingEnabled,false);
 const html=source('src/views/marketplace-contract-preview-v3287.html');
 assert.match(html,/no se guardará mi consentimiento/);
 assert.match(html,/No se ha generado ninguna suscripción, cargo, factura ni aceptación/);
 assert.match(html,/viewport-fit=cover/);
});
test('only admin may access TEST Checkout and its routes remain separate from seller read-only APIs',()=>{
 const route=source('src/routes/marketplace-stripe-test-v3280.js');
 const seller=source('src/routes/marketplace-subscriptions-v3278.js');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/router\.post\('\/checkout',limiter,checkOrigin/);
 assert.match(route,/router\.post\('\/sync',limiter,checkOrigin/);
 assert.match(route,/router\.post\('\/portal',limiter,checkOrigin/);
 for(const endpoint of ['plans','mine','contract-preview'])assert.ok(seller.includes("router.get('/"+endpoint+"'"));
 assert.doesNotMatch(seller,/router\.(?:post|put|patch|delete)\('/);
 const stripe=source('src/services/marketplace-stripe-test-v3280.js');
 assert.match(stripe,/live_event_rejected/);
 assert.match(stripe,/stripe_test_checkout_not_verified/);
 assert.doesNotMatch(stripe,/UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores/);
});
