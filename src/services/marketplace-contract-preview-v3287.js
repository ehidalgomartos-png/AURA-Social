'use strict';
// V3.2.87. Read-only seller-facing illustration of potential contracting.
// No private admin drafts, Stripe keys, payment URLs, seller entitlements or consent writes.
const {effectiveAccount}=require('./marketplace-subscriptions-v3278');
const catalog=Object.freeze([
 Object.freeze({
  code:'professional',name:'Profesional',proposedStoreLimit:1,
  benefits:Object.freeze([
   'Publicación de productos uno a uno',
   'Catálogo sin límite comercial de productos (propuesta)',
   'Una tienda externa (propuesta)',
   'Compras y pagos siempre en la web del vendedor'
  ]),
  canImportBulk:false,wooAutoSync:false
 }),
 Object.freeze({
  code:'professional_plus',name:'Profesional Plus',proposedStoreLimit:3,
  benefits:Object.freeze([
   'Publicación individual y por lotes CSV',
   'Sincronización automática WooCommerce (propuesta)',
   'Catálogo sin límite comercial de productos (propuesta)',
   'Hasta tres tiendas externas (propuesta)',
   'Compras y pagos siempre en la web del vendedor'
  ]),
  canImportBulk:true,wooAutoSync:true
 })
]);
const steps=Object.freeze([
 'Consultar los planes y sus condiciones definitivas cuando se aprueben.',
 'Verificar importe final, IVA aplicable, fecha y periodicidad de renovación.',
 'Aceptar expresamente los términos comerciales y las condiciones de cancelación antes del pago.',
 'Formalizar una suscripción mediante Stripe Billing, solo si algún día se activa la contratación.',
 'Consultar facturas y gestionar renovaciones y cancelaciones desde el panel correspondiente.'
]);
function preview(account){
 const pilot=account?.grandfathered===true||account?.status==='pilot';
 return {
  ok:true,previewOnly:true,checkoutEnabled:false,
  billingEnabled:false,liveStripeEnabled:false,enrollmentEnabled:false,
  entitlementsEnforced:false,consentRecorded:false,pricesPublished:false,
  productCheckoutExternal:true,
  account:{status:account?.status||'free',pilotProtected:pilot},
  plans:catalog.map(plan=>({
   code:plan.code,name:plan.name,proposedStoreLimit:plan.proposedStoreLimit,
   productLimitProposal:null,unlimitedProductsProposal:true,
   manualOneByOne:true,bulkImportProposal:plan.canImportBulk,
   wooSyncProposal:plan.wooAutoSync,
   benefits:[...plan.benefits],
   price:{approved:false,amountCents:null,currency:'EUR',label:'Precio definitivo pendiente'},
   selectableForPreview:true,contractable:false
  })),
  steps:[...steps],
  policies:{
   renewal:'Periodicidad y avisos por concretar antes del lanzamiento.',
   taxes:'IVA y facturación sujetos a revisión fiscal.',
   cancellation:'Cancelación, fecha efectiva, posibles reembolsos y gracia pendientes de aprobación.',
   terms:'Aún no existen condiciones comerciales definitivas para aceptar.',
   privacy:'Revisión de comunicaciones y datos de facturación pendiente.'
  },
  pilotNotice:pilot
   ?'Tu tienda aprobada mantiene su piloto sin cuota ni vencimiento. Esta simulación no cambia tu situación.'
   :'Esta simulación no crea una cuenta profesional ni cambia el estado de tu Marketplace.',
  disclaimer:'Esto es una simulación sin validez contractual. No se recoge consentimiento legal, no se guardan datos de pago ni se crean suscripciones.'
 };
}
module.exports={catalog,steps,preview};
