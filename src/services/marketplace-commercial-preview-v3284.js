'use strict';
// V3.2.84: isolated, read-only commercial capability simulation.
// This module does not authorize sellers, grant entitlements, or gate existing endpoints.
const PLANS=Object.freeze(['professional','professional_plus','pilot']);
const ACTIONS=Object.freeze([
 {code:'single_product',label:'Publicar un producto'},
 {code:'bulk_import',label:'Importar productos en lote/CSV'},
 {code:'woo_auto_sync',label:'Sincronización automática WooCommerce'},
 {code:'connect_store',label:'Conectar otra tienda externa'},
 {code:'external_purchase',label:'Comprar en la tienda del vendedor'}
]);
const STATUSES=Object.freeze(['proposed_allowed','proposed_denied','to_define']);
class PreviewError extends Error {
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function normalize(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype||
  Object.keys(body).sort().join(',')!=='action,planCode,productCount,requestCount,storeCount')
  throw new PreviewError('invalid_preview_payload');
 if(!PLANS.includes(body.planCode))throw new PreviewError('unknown_preview_plan');
 if(!ACTIONS.some(x=>x.code===body.action))throw new PreviewError('unknown_preview_action');
 if(!integer(body.storeCount,0,100000)||!integer(body.productCount,0,100000000)||
  !integer(body.requestCount,1,10000))throw new PreviewError('invalid_preview_counts');
 if((body.action==='single_product'||body.action==='connect_store'||body.action==='external_purchase')&&body.requestCount!==1)
  throw new PreviewError('individual_action_requires_one');
 return {
  planCode:body.planCode,action:body.action,
  storeCount:body.storeCount,productCount:body.productCount,requestCount:body.requestCount
 };
}
function compute(body,rows,policyRows=[]){
 const scenario=normalize(body);
 if(!Array.isArray(rows))throw new PreviewError('missing_plan_proposals',503);
 const {planCode,action,storeCount,productCount,requestCount}=scenario;
 const pilot=planCode==='pilot';
 const plan=pilot?null:rows.find(x=>x.code===planCode);
 if(!pilot&&!plan)throw new PreviewError('plan_proposal_not_found',503);
 // Do not label a store or a product as "approved": existing moderation,
 // ownership, stock and WooCommerce checks always remain independent.
 let status='proposed_allowed',reason='';
 const notes=['Esta es una simulación administrativa: no aplica restricciones ni concede permisos reales.'];
 const cap=pilot?null:plan.productLimit;
 const productPolicy=policyRows.find(x=>x.code===planCode)?.mode||'undecided';
 const capacityNote=()=>{
  if(cap!==null)return;
  if(productPolicy==='unlimited_proposal')
   notes.push('Se ha propuesto no limitar los productos; es una decisión interna sin aprobar.');
  else notes.push('El límite total de productos está pendiente de definir.');
 };
 if(pilot){
  reason='Piloto existente sin límites comerciales ni cuotas; conserva su funcionamiento actual.';
 }else if(action==='single_product'){
  reason='El plan contempla el alta manual de productos uno a uno.';
  if(integer(cap,1,1000000)&&productCount+1>cap){
   status='proposed_denied';reason='Se superaría el límite propuesto de productos para este plan.';
  }else if(cap===null)capacityNote();
 }else if(action==='bulk_import'){
  if(!plan.bulkImport){
   status='proposed_denied';reason='La importación CSV o por lotes se reserva a Profesional Plus.';
  }else{
   reason='La importación por lotes está prevista para esta modalidad.';
   if(integer(cap,1,1000000)&&productCount+requestCount>cap){
    status='proposed_denied';reason='El lote superaría el máximo de productos propuesto.';
   }else if(cap===null)capacityNote();
  }
 }else if(action==='woo_auto_sync'){
  if(!plan.wooSync){
   status='proposed_denied';reason='La sincronización automática del catálogo se reserva a Profesional Plus.';
  }else{
   reason='La sincronización automática se contempla como característica de este plan.';
   // requestCount is a hypothetical batch size, not an instruction to contact WooCommerce.
   if(integer(cap,1,1000000)&&productCount+requestCount>cap){
    status='proposed_denied';reason='La sincronización propuesta superaría el máximo de productos.';
   }else if(cap===null)capacityNote();
  }
 }else if(action==='connect_store'){
  reason='Se podría conectar otra tienda dentro del límite propuesto.';
  if(plan.storeLimit===null){
   status='to_define';reason='Todavía no se ha definido cuántas tiendas permitiría este plan.';
  }else if(storeCount+1>plan.storeLimit){
   status='proposed_denied';reason='Se superaría el número de tiendas permitido en la propuesta.';
  }
 }else if(action==='external_purchase'){
  reason='La compra se completa siempre fuera de RedLibertad, en la tienda del vendedor.';
 }
 if(action==='external_purchase')notes.push('La aprobación de la tienda, disponibilidad del producto y seguridad del enlace siguen verificándose por separado.');
 if(action==='connect_store')notes.push('Registrar o aprobar una tienda sigue sujeto a la autorización administrativa existente.');
 return {ok:true,previewOnly:true,limitsEnforced:false,billingEnabled:false,
  commercialSubscriptionEnabled:false,pilotProtected:true,
  scenario,status,reason,notes,plan:{
   code:planCode,storeLimit:plan?.storeLimit??null,productLimit:plan?.productLimit??null,
   bulkImport:pilot?true:plan.bulkImport===true,
   wooSync:pilot?true:plan.wooSync===true,
   externalCheckout:true
  }};
}
module.exports={PLANS,ACTIONS,STATUSES,PreviewError,normalize,compute};
