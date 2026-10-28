'use strict';
// Información orientativa para cada comerciante, derivada del estado real de su tienda.
// Nunca concede permisos, publica anuncios, envía emails ni solicita pagos.
const labels=Object.freeze({
 draft:'Borrador',pending:'Pendiente de revisión',
 approved:'Aprobada',suspended:'Suspendida'
});
function sellerProgress(row){
 const state=String(row?.status||'');
 const linked=Math.max(0,Number(row?.linked_count)||0);
 const available=Math.max(0,Number(row?.available_count)||0);
 const platform=String(row?.platform||'');
 const connected=Boolean(row?.connected);
 const syncing=Boolean(row?.sync_enabled);
 let next='';
 if(state==='draft')next='La solicitud todavía está en borrador. Solicita su revisión desde Administración.';
 else if(state==='pending')next='Estamos pendientes de verificar la titularidad de tu tienda. Todavía no se habilitan enlaces de compra.';
 else if(state==='suspended')next='La tienda está suspendida. Los enlaces externos de compra permanecen deshabilitados.';
 else if(state==='approved'&&linked===0)next=platform==='woocommerce'
  ?'La tienda está aprobada, pero todavía no tiene productos vinculados. La conexión e importación WooCommerce se gestiona actualmente desde Administración.'
  :'La tienda está aprobada, pero no tiene productos vinculados. La importación y revisión se gestionan actualmente desde Administración.';
 else if(state==='approved'&&available===0)next='Hay productos vinculados, pero ninguno con existencias aptas para compra directa. Revisa sus estados y su disponibilidad con Administración.';
 else next='Tu tienda dispone de productos vinculados y disponibles. Las ofertas se muestran cuando coinciden exactamente con la búsqueda.';
 if(state==='approved'&&platform==='woocommerce'&&connected&&!syncing&&linked>0)next+=' La sincronización automática está desactivada.';
 return {label:labels[state]||'Estado sin confirmar',linked,available,next};
}
module.exports={sellerProgress};
