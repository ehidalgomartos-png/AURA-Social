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
// V3.4.5.7 — Acción orientativa, siempre sujeta a revisión y sin mutaciones.
function merchantNextAction(row){
 const state=String(row?.status||'');
 const platform=String(row?.platform||'');
 const linked=Math.max(0,Number(row?.linked_count)||0);
 const available=Math.max(0,Number(row?.available_count)||0);
 // Las rutas de destino solo admiten el identificador numérico de una tienda.
 const id=String(row?.id??'');
 const safeId=/^[1-9]\d{0,15}$/.test(id)?id:null;
 const link=(suffix,label)=>safeId?{mode:'link',href:'/comparar/comercios/'+suffix+'/'+safeId,label}:null;
 if(state==='pending'&&row?.verification_token)
  return {key:'verify',title:'Verifica la titularidad de tu tienda',
   description:'Publica el código de verificación en una página visible de tu dominio. La aprobación la realizará Administración después de comprobarlo.',
   control:safeId?{mode:'link',href:'#verificacion-'+safeId,label:'Ver instrucciones y código'}:null};
 if(state==='pending')return {key:'code',title:'Solicita tu código de verificación',
  description:'Necesitamos comprobar la titularidad del dominio antes de revisar tu solicitud. El código no aprueba la tienda automáticamente.',
  control:safeId?{mode:'form',label:'Obtener código de verificación'}:null};
 if(state==='draft')return {key:'draft',title:'Solicita la revisión de tu tienda',
  description:'El borrador todavía necesita revisión administrativa. Consulta las instrucciones del programa y solicita ayuda para completar el alta.',
  control:{mode:'link',href:'/comparar/comercios',label:'Ver cómo funciona el alta'}};
 if(state==='suspended')return {key:'suspended',title:'Consulta la suspensión con Administración',
  description:'La tienda está suspendida. No es posible reactivarla desde este panel ni activar compras automáticamente.',
  control:null};
 if(state!=='approved')return {key:'unknown',title:'Comprueba el estado de tu solicitud',
  description:'No podemos confirmar el estado actual de la tienda. Consulta los requisitos antes de continuar.',
  control:{mode:'link',href:'/comparar/comercios',label:'Ver requisitos'}};
 if(row?.purchase_enabled===false)return {key:'purchase',title:'Revisa la compra externa',
  description:'La tienda está aprobada, pero las compras externas aún no están habilitadas. Revisa la situación con Administración; preparar productos no activa las compras.',
  control:linked?link('productos','Ver diagnóstico de productos'):link('catalogo','Revisar catálogo')};
 if(linked===0)return {key:'catalog',title:'Prepara tus primeros productos',
  description:platform==='woocommerce'
   ?'Comprueba tu conexión WooCommerce o previsualiza un CSV. Prepararlo no publica ni aprueba productos por sí solo.'
   :'Previsualiza un CSV compatible y revisa los productos antes de solicitar su incorporación.',
  control:link('catalogo','Preparar catálogo')};
 if(available===0)return {key:'products',title:'Revisa los productos sin ofertas aptas',
  description:'Tienes productos vinculados, pero ninguno cumple actualmente los requisitos de disponibilidad y publicación.',
  control:link('productos','Revisar mis productos')};
 return {key:'ready',title:'Consulta la actividad de tu tienda',
  description:'Hay productos aptos según los datos guardados. Solo se mostrarán cuando coincidan con una búsqueda; esto no garantiza ventas.',
  control:link('estadisticas','Ver estadísticas de mi tienda')};
}

module.exports={sellerProgress,merchantNextAction};
