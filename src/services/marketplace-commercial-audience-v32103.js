'use strict';
// V3.2.103 — admin-only, read-only planning policy. Not public eligibility,
// not an approved legal classification, and never a checkout or Stripe gate.
const CUSTOMER_TYPES=Object.freeze([
 Object.freeze({code:'individual',label:'Particular',canConsiderPlans:true}),
 Object.freeze({code:'self_employed',label:'Autónomo',canConsiderPlans:true}),
 Object.freeze({code:'company',label:'Empresa',canConsiderPlans:true})
]);
const BILLING_CONTEXTS=Object.freeze([
 Object.freeze({code:'personal',label:'Contratación para uso personal'}),
 Object.freeze({code:'business',label:'Contratación para actividad profesional o empresarial'})
]);
// Spain includes all Spanish territories; it is not synonymous with IVA peninsular.
const GEOGRAPHIC_POLICY=Object.freeze({
 launchCountryCode:'ES',launchCountryName:'España',
 initiallyEligibleBillingCountryCodes:Object.freeze(['ES']),
 outsideSpainAtLaunch:false,
 // Planned future payment form: accept a verified billing/residence country;
 // this file never inspects IP addresses or implements payment restrictions.
 countryToConfirmAtFutureCheckout:true,
 ipGeolocationIsNotEligibilityProof:true,
 appliesToPaidSubscriptionsOnly:true,
 doesNotRestrictMarketplaceBrowse:true,
 doesNotRestrictExternalSellerCheckout:true,
 taxationReviewed:false,
 noUniversalVatRate:true,
 taxTerritories:Object.freeze([
  Object.freeze({id:'peninsula_balearic',label:'Península e Islas Baleares',vatCategory:'spanish_vat_scope',rateApproved:false}),
  Object.freeze({id:'canary',label:'Islas Canarias',vatCategory:'special_review',rateApproved:false}),
  Object.freeze({id:'ceuta_melilla',label:'Ceuta y Melilla',vatCategory:'special_review',rateApproved:false})
 ])
});
const OPEN_REVIEWS=Object.freeze([
 Object.freeze({id:'consumer_rights',label:'Información precontractual, desistimiento y derechos del consumidor'}),
 Object.freeze({id:'tax_residence',label:'Residencia fiscal, localización del servicio e impuestos aplicables'}),
 Object.freeze({id:'invoicing',label:'Facturas y datos fiscales según tipo de destinatario'}),
 Object.freeze({id:'privacy',label:'Tratamiento y conservación de los datos de facturación'}),
 Object.freeze({id:'terms',label:'Condiciones finales, renovaciones y cancelaciones'}),
 Object.freeze({id:'explicit_consent',label:'Consentimiento expreso y prueba de aceptación antes del pago'})
]);
function preview(){
 return {
  adminOnly:true,previewOnly:true,decision:'all_eligible_account_types',
  sameProposedPlansForAll:true,
  geography:{...GEOGRAPHIC_POLICY,initiallyEligibleBillingCountryCodes:[...GEOGRAPHIC_POLICY.initiallyEligibleBillingCountryCodes],taxTerritories:GEOGRAPHIC_POLICY.taxTerritories.map(t=>({...t}))},
  customerTypes:CUSTOMER_TYPES.map(item=>({...item})),
  intendedBillingContexts:BILLING_CONTEXTS.map(item=>({...item})),
  contextMustBeDeclaredAtFutureCheckout:true,
  // An autónomo buying for personal purposes can still be a consumer.
  consumerStatusNotInferredFromAccountType:true,
  geographicTaxRulesUnresolved:true,
  legalAndTaxReviews:OPEN_REVIEWS.map(item=>({...item,approved:false})),
  customerTypeDecisionRecorded:true,
  customerTypeReviewPending:true,
  publicEnrollmentEnabled:false,pricesPublished:false,billingEnabled:false,
  liveStripeEnabled:false,consentRecorded:false,entitlementsEnforced:false,
  pilotProtected:true,externalProductCheckout:true
 };
}
module.exports={CUSTOMER_TYPES,BILLING_CONTEXTS,OPEN_REVIEWS,GEOGRAPHIC_POLICY,preview};
