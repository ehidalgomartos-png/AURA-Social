'use strict';
// V3.2.105. Internal administrative planning only. Neither this module nor its
// preview classifies a customer legally or collects identifiers or tax data.
const CASES=Object.freeze([
 Object.freeze({
  id:'individual_personal',label:'Particular · uso personal',
  customerType:'individual',purchasePurpose:'personal',
  questions:Object.freeze([
   'Confirmar residencia y territorio español de facturación.',
   'Determinar justificante o factura aplicable y datos mínimos del destinatario.',
   'Revisar información precontractual, desistimiento y renovación automática.'
  ])
 }),
 Object.freeze({
  id:'self_employed_personal',label:'Autónomo · uso personal',
  customerType:'self_employed',purchasePurpose:'personal',
  questions:Object.freeze([
   'No suponer que actuar como autónomo implica comprar para la actividad.',
   'Confirmar residencia y territorio español de facturación.',
   'Revisar tratamiento de consumidor y documento de facturación aplicable.'
  ])
 }),
 Object.freeze({
  id:'self_employed_business',label:'Autónomo · actividad profesional',
  customerType:'self_employed',purchasePurpose:'business',
  questions:Object.freeze([
   'Acreditar finalidad profesional declarada sin deducirla del tipo de cuenta.',
   'Revisar datos fiscales, NIF y domicilio necesarios para factura completa.',
   'Comprobar obligaciones sobre emisión, entrega y conservación de facturas.'
  ])
 }),
 Object.freeze({
  id:'company_business',label:'Empresa · actividad empresarial',
  customerType:'company',purchasePurpose:'business',
  questions:Object.freeze([
   'Revisar razón social, identificación fiscal y domicilio de facturación.',
   'Determinar documento de facturación y obligaciones de entrega y conservación.',
   'Validar capacidad de contratación y condiciones B2B aplicables.'
  ])
 })
]);
const TERRITORIES=Object.freeze([
 Object.freeze({
  id:'peninsula_balearic',label:'Península e Islas Baleares',
  scope:'spanish_vat_area',taxDecision:'pending_professional_review'
 }),
 Object.freeze({
  id:'canary',label:'Islas Canarias',
  scope:'outside_spanish_vat_area',taxDecision:'pending_professional_review'
 }),
 Object.freeze({
  id:'ceuta_melilla',label:'Ceuta y Melilla',
  scope:'outside_spanish_vat_area',taxDecision:'pending_professional_review'
 })
]);
const ITEMS=Object.freeze([
 Object.freeze({id:'issuer',label:'Identificar la entidad emisora y sus obligaciones de facturación'}),
 Object.freeze({id:'recipient',label:'Determinar los datos mínimos según finalidad de contratación y factura'}),
 Object.freeze({id:'territory',label:'Verificar territorio y localización fiscal antes de elegir el tratamiento impositivo'}),
 Object.freeze({id:'document',label:'Validar factura ordinaria, simplificada o rectificativa cuando proceda'}),
 Object.freeze({id:'retention',label:'Definir conservación, rectificaciones y acceso a facturas'}),
 Object.freeze({id:'consumer',label:'Revisar información y derechos de consumidores, incluidas renovaciones y bajas'}),
 Object.freeze({id:'provider',label:'Determinar si Stripe u otro proveedor emite documentos en nombre de RedLibertad'}),
 Object.freeze({id:'approval',label:'Obtener revisión fiscal y jurídica y aprobación comercial expresa antes de cobrar'})
]);
function preview(){
 return {
  adminOnly:true,previewOnly:true,
  countryCode:'ES',countryName:'España',
  customerTypes:['individual','self_employed','company'],
  cases:CASES.map(x=>({...x,questions:[...x.questions]})),
  territories:TERRITORIES.map(x=>({...x})),
  checklist:ITEMS.map(x=>({...x,approved:false})),
  // Unknown tax rate and invoicing obligations are not defaults.
  taxRatesConfigured:false,automaticTaxDecision:false,invoiceIssuerApproved:false,
  invoiceGenerationEnabled:false,personalDataCollectionEnabled:false,
  consentCollected:false,legalApproved:false,taxApproved:false,
  enrollmentEnabled:false,pricesPublished:false,billingEnabled:false,
  liveStripeEnabled:false,entitlementsEnforced:false,
  pilotProtected:true,productCheckoutExternal:true
 };
}
module.exports={CASES,TERRITORIES,ITEMS,preview};
