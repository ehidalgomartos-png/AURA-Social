'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const audience=require('../src/services/marketplace-commercial-audience-v32103');
const launch=require('../src/services/marketplace-launch-readiness-v3289');
test('Spain is the sole INITIAL paid-plan launch country without excluding Spanish territories',()=>{
 const x=audience.preview(),g=x.geography;
 assert.equal(g.launchCountryCode,'ES');
 assert.deepEqual(g.initiallyEligibleBillingCountryCodes,['ES']);
 assert.equal(g.outsideSpainAtLaunch,false);
 assert.deepEqual(g.taxTerritories.map(y=>y.id),['peninsula_balearic','canary','ceuta_melilla']);
 assert.equal(g.taxTerritories.every(y=>y.rateApproved===false),true);
 assert.equal(x.customerTypes.length,3);
 assert.equal(x.sameProposedPlansForAll,true);
});
test('future checkout country evidence must be verified; no IP geofence or universal IVA',()=>{
 const g=audience.preview().geography;
 assert.equal(g.countryToConfirmAtFutureCheckout,true);
 assert.equal(g.ipGeolocationIsNotEligibilityProof,true);
 assert.equal(g.taxationReviewed,false);
 assert.equal(g.noUniversalVatRate,true);
 assert.equal(g.taxTerritories.find(t=>t.id==='canary').vatCategory,'special_review');
 assert.equal(g.taxTerritories.find(t=>t.id==='ceuta_melilla').vatCategory,'special_review');
});
test('scope is only future paid subscriptions; Marketplace and external sellers unaffected',()=>{
 const x=audience.preview(),g=x.geography;
 assert.equal(g.appliesToPaidSubscriptionsOnly,true);
 assert.equal(g.doesNotRestrictMarketplaceBrowse,true);
 assert.equal(g.doesNotRestrictExternalSellerCheckout,true);
 for(const name of ['publicEnrollmentEnabled','pricesPublished','billingEnabled','liveStripeEnabled',
  'consentRecorded','entitlementsEnforced'])assert.equal(x[name],false,name);
 assert.equal(x.pilotProtected,true);
 assert.equal(x.externalProductCheckout,true);
});
test('new geographic policy is read-only admin preparation, not checkout enforcement',()=>{
 const service=fs.readFileSync('src/services/marketplace-commercial-audience-v32103.js','utf8');
 const page=fs.readFileSync('src/views/marketplace-launch-readiness-v3289.html','utf8');
 const client=fs.readFileSync('public/marketplace-launch-readiness-v3289.js','utf8');
 const router=fs.readFileSync('src/routes/marketplace-subscription-commercial-v3281.js','utf8');
 assert.match(router,/router\.use\(requireAdmin\)/);
 assert.match(page,/id="countryScopePreview"/);
 assert.match(page,/viewport-fit=cover/);
 assert.match(page,/marketplace-launch-readiness-v3289.js\?v=3\.2\.104/);
 assert.match(page,/Contratar \(no disponible\)/);
 assert.match(client,/audience\.geography/);
 assert.match(client,/doesNotRestrictMarketplaceBrowse!==true/);
 assert.match(service,/countryToConfirmAtFutureCheckout:true/);
 for(const forbidden of ['INSERT INTO','UPDATE marketplace_','DELETE FROM','stripeRequest(', 'checkout.sessions','GEOIP_COUNTRY'])
  assert.equal(service.includes(forbidden),false);
});
test('the launch-readiness service always includes restricted-but-unapproved ES planning',()=>{
 const cards=launch.CODES.map(code=>({code,storeLimit:code==='professional'?1:3,productLimit:null,
  bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  issues:[],capacity:{status:'proposed'},policy:{mode:'unlimited_proposal'}}));
 const docs=launch.CODES.map(code=>({code,reviewState:'internal_review',revision:2,
  priceDisclosure:'Borrador fiscal pendiente de revisión especializada.',
  taxes:'Borrador fiscal pendiente de revisión especializada.',
  renewals:'Borrador fiscal pendiente de revisión especializada.',
  cancellations:'Borrador fiscal pendiente de revisión especializada.',
  privacy:'Borrador fiscal pendiente de revisión especializada.',
  consent:'Borrador fiscal pendiente de revisión especializada.'}));
 const study={drafts:launch.CODES.map(code=>({code,proposedMonthlyCents:code==='professional'?990:2490})),
  reviews:launch.reviewTopics.map(code=>({code,status:'reviewed'}))};
 const x=launch.build({cards},{drafts:docs},study);
 assert.equal(x.audience.geography.launchCountryCode,'ES');
 assert.equal(x.audience.geography.taxationReviewed,false);
 assert.equal(x.summary.outstanding,0);
 assert.equal(x.summary.needsFinalApprovals,true);
 for(const field of ['releaseAuthorized','productionReady','taxApproval','legalApproval','pricesPublished',
  'billingEnabled','liveStripeEnabled','publicEnrollmentEnabled','consentRecorded','entitlementsEnforced'])
  assert.equal(x[field],false);
});
