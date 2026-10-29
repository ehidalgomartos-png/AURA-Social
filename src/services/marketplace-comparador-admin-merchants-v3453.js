'use strict';
// V3.4.5.3 — métricas conservadoras sobre una muestra de comercios guardados.
// Ninguna operación modifica la aprobación, los pagos o la publicación.
const VALID_STATUS=new Set(['draft','pending','approved','suspended']);
const NON_NEGATIVE=value=>{
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>0?n:0;
};
function assess(store){
 const status=String(store?.status||'unknown').toLowerCase();
 const platform=String(store?.platform||'other');
 const total=NON_NEGATIVE(store?.linked_count);
 const available=NON_NEGATIVE(store?.available_count);
 const stale=NON_NEGATIVE(store?.stale_api_count);
 const noStock=NON_NEGATIVE(store?.no_stock_count);
 const connected=store?.connected===true;
 const syncing=store?.sync_enabled===true;
 const purchasing=store?.purchase_enabled===true;
 const reasons=[];
 if(!VALID_STATUS.has(status))reasons.push('Estado de revisión desconocido');
 if(status==='pending')reasons.push('Solicitud pendiente de revisión');
 if(status==='draft')reasons.push('Solicitud todavía en borrador');
 if(status==='suspended')reasons.push('Tienda suspendida');
 if(status==='approved'&&!purchasing)reasons.push('Compra externa no habilitada');
 if(status==='approved'&&!total)reasons.push('Sin productos vinculados');
 if(stale)reasons.push(stale+' productos API con sincronización antigua');
 if(noStock)reasons.push(noStock+' productos declarados sin existencias');
 if(status==='approved'&&total&&!available)
  reasons.push('Ningún producto cumple los requisitos actuales de compra externa');
 if(platform==='woocommerce'&&connected&&!syncing)
  reasons.push('Conexión WooCommerce sin sincronización automática');
 return {id:String(store?.id||''),name:String(store?.name||'Sin nombre'),
  username:String(store?.username||''),status,platform,
  linked:total,available,stale,noStock,connected,syncing,purchasing,
  reasons,attention:reasons.length>0};
}
function summarize(rows){
 const items=(Array.isArray(rows)?rows:[]).map(assess);
 return {items,counts:{
  sampled:items.length,pending:items.filter(x=>x.status==='pending').length,
  approved:items.filter(x=>x.status==='approved').length,
  suspended:items.filter(x=>x.status==='suspended').length,
  attention:items.filter(x=>x.attention).length,
  stale:items.filter(x=>x.stale>0).length
 }};
}
module.exports={assess,summarize,safeCount:NON_NEGATIVE};
