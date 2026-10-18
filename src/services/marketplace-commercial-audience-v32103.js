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
module.exports={CUSTOMER_TYPES,BILLING_CONTEXTS,OPEN_REVIEWS,preview};
