'use strict';
// V3.2.103: customer audiences are an ADMIN planning decision, never billing authorization.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const policy=require('../src/services/marketplace-commercial-audience-v32103');
const launch=require('../src/services/marketplace-launch-readiness-v3289');

test('Professional and Plus privately include individuals, sole traders, and companies',()=>{
 const result=policy.preview();
 assert.equal(result.adminOnly,true);
 assert.equal(result.previewOnly,true);
 assert.equal(result.decision,'all_eligible_account_types');
 assert.equal(result.sameProposedPlansForAll,true);
 assert.deepEqual(result.customerTypes.map(x=>x.code),['individual','self_employed','company']);
 assert.equal(result.customerTypes.every(x=>x.canConsiderPlans===true),true);
 assert.deepEqual(result.intendedBillingContexts.map(x=>x.code),['personal','business']);
});
test('acting as a consumer is not assumed from individual or freelancer registration',()=>{
 const result=policy.preview();
 assert.equal(result.contextMustBeDeclaredAtFutureCheckout,true);
 assert.equal(result.consumerStatusNotInferredFromAccountType,true);
 assert.equal(result.geographicTaxRulesUnresolved,true);
 assert.equal(result.customerTypeReviewPending,true);
 assert.equal(result.legalAndTaxReviews.length,6);
 assert.equal(result.legalAndTaxReviews.every(x=>x.approved===false),true);
});
test('all release and payment switches remain disabled',()=>{
 const result=policy.preview();
 for(const flag of ['publicEnrollmentEnabled','pricesPublished','billingEnabled','liveStripeEnabled',
  'consentRecorded','entitlementsEnforced'])assert.equal(result[flag],false,flag);
 assert.equal(result.pilotProtected,true);
 assert.equal(result.externalProductCheckout,true);
});
test('launch readiness includes the decision without granting permission even if other drafts are complete',()=>{
 const cards=launch.CODES.map(code=>({code,storeLimit:code==='professional'?1:3,
  productLimit:null,bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  issues:[],policy:{mode:'unlimited_proposal'},capacity:{status:'proposed'}}));
 const drafts=launch.CODES.map(code=>({code,reviewState:'internal_review',revision:2,
  priceDisclosure:'Texto redactado para revisión, no aprobado.',
  taxes:'Texto redactado para revisión, no aprobado.',
  renewals:'Texto redactado para revisión, no aprobado.',
  cancellations:'Texto redactado para revisión, no aprobado.',
  privacy:'Texto redactado para revisión, no aprobado.',
  consent:'Texto redactado para revisión, no aprobado.'}));
 const commercial={drafts:launch.CODES.map(code=>({code,proposedMonthlyCents:code==='professional'?990:2490})),
  reviews:launch.reviewTopics.map(code=>({code,status:'reviewed'}))};
 const result=launch.build({cards},{drafts},commercial);
 assert.equal(result.summary.outstanding,0);
 assert.equal(result.audience.sameProposedPlansForAll,true);
 assert.equal(result.audience.customerTypes.length,3);
 assert.equal(result.summary.needsFinalApprovals,true);
 for(const key of ['releaseAuthorized','productionReady','legalApproval','taxApproval',
  'publicEnrollmentEnabled','pricesPublished','billingEnabled','liveStripeEnabled',
  'consentRecorded','entitlementsEnforced'])assert.equal(result[key],false,key);
});
test('private mobile-first preview renders only pending reviews and has no checkout actions',()=>{
 const html=fs.readFileSync('src/views/marketplace-launch-readiness-v3289.html','utf8');
 const ui=fs.readFileSync('public/marketplace-launch-readiness-v3289.js','utf8');
 const backend=fs.readFileSync('src/services/marketplace-commercial-audience-v32103.js','utf8');
 const routes=fs.readFileSync('src/routes/marketplace-subscription-commercial-v3281.js','utf8');
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/id="audiencePreview"/);
 assert.match(html,/marketplace-launch-readiness-v3289.js\?v=3\.2\.103/);
 assert.match(html,/Contratar \(no disponible\)/);
 assert.match(ui,/audience\.customerTypes/);
 assert.match(ui,/audience\.legalAndTaxReviews/);
 assert.match(ui,/audience\?\.billingEnabled!==false/);
 assert.match(routes,/router\.use\(requireAdmin\)/);
 assert.match(backend,/consumerStatusNotInferredFromAccountType:true/);
 for(const word of ['stripeRequest(', 'checkout.sessions','UPDATE marketplace_', 'INSERT INTO ',
  'process.env.STRIPE_TEST_SECRET_KEY'])
  assert.equal(backend.includes(word),false,word);
});
