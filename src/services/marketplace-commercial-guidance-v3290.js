'use strict';
// V3.2.90: internal-only drafting assistance; NEVER an approved price, offer or legal terms.
// Served solely through the existing requireAdmin commercial router.
const CODE_PRICE=Object.freeze({professional:990,professional_plus:2490});
const MARKER='PLANTILLA INTERNA V3.2.90';
function suggest(code){
 if(!Object.prototype.hasOwnProperty.call(CODE_PRICE,code))return null;
 const name=code==='professional'?'Profesional':'Profesional Plus';
 const price=CODE_PRICE[code];
 const common=MARKER+' — PENDIENTE DE REVISIÓN. ';
 return {
  code,planName:name,proposedMonthlyCents:price,currency:'EUR',
  suggestedOnly:true,approved:false,published:false,contractable:false,
  terms:{
   priceDisclosure:common+'Modalidad '+name+'. Cuota mensual orientativa de '+(price/100).toFixed(2)+' EUR. Validar importe final, periodicidad, fecha de inicio y si el precio incluye los impuestos que correspondan. No es una oferta.',
   taxes:common+'Confirmar con asesoría fiscal el IVA aplicable según el territorio, las obligaciones de facturación, los datos fiscales requeridos y la forma de descargar facturas antes de publicar una oferta.',
   renewals:common+'Concretar la duración del periodo, el momento de renovación, los avisos previos, el cambio de modalidad y el tratamiento de un intento de cobro fallido antes de aceptar suscripciones.',
   cancellations:common+'Redactar y revisar las instrucciones de baja, fecha efectiva, derechos legales aplicables, posibles reembolsos y periodo de gracia antes de ofrecer un servicio de pago.',
   privacy:common+'Revisar y documentar datos de facturación tratados, finalidad, base jurídica, conservación, proveedor de pagos y comunicaciones necesarias, con los responsables de privacidad.',
   consent:common+'Definir qué documentos definitivos se mostrarán antes del cobro y cómo solicitar y registrar una aceptación expresa con versión y fecha. Este borrador NO recoge consentimiento.'
  },
  note:'Esta guía no guarda ni aprueba nada. Si se inserta en un borrador, debe editarse y retirarse la marca de plantilla antes de solicitar revisión interna. La aprobación fiscal y legal posterior es independiente.'
 };
}
function guide(){
 return {ok:true,adminOnly:true,privateSuggestion:true,pricesApproved:false,
  termsApproved:false,consentRecorded:false,liveStripeEnabled:false,
  billingEnabled:false,enrollmentEnabled:false,pilotProtected:true,
  proposals:[suggest('professional'),suggest('professional_plus')]};
}
module.exports={CODE_PRICE,MARKER,suggest,guide};
