'use strict';
// Seguimiento interno de tiendas, solo sobre registros existentes. No autoaprobación
// ni envío de correos, pagos, comisiones, altas de suscripción o uso de SerpApi.
function assess(rows,now=Date.now()){
 const items=(Array.isArray(rows)?rows:[]).map(row=>{
  const pending=row.status==='pending';
  const products=Math.max(0,Number(row.product_count)||0);
  const empty=row.status==='approved'&&products===0;
  const sync=Boolean(row.sync_enabled);
  const last=Date.parse(row.last_sync_at||'');
  const syncStale=row.status==='approved'&&sync&&(!Number.isFinite(last)||now-last>7*60*60*1000);
  const syncError=row.status==='approved'&&sync&&Boolean(row.last_error);
  return {...row,products,pending,empty,syncStale,syncError,needsAttention:pending||empty||syncStale||syncError};
 });
 return {items,summary:{
  total:items.length,pending:items.filter(x=>x.pending).length,
  approved:items.filter(x=>x.status==='approved').length,
  noProducts:items.filter(x=>x.empty).length,
  syncReview:items.filter(x=>x.syncStale||x.syncError).length
 }};
}
module.exports={assess};
