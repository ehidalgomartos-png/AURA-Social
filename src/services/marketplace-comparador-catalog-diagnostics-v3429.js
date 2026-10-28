'use strict';
// Diagnostic only: never edits stock/prices, fires paid searches or enables checkout.
const {purchaseLink}=require('./marketplace-professional-v3276');
function diagnoseProduct(row,now=Date.now()){
 const linked={kind:row.kind,deal:row.deal,status:row.listing_status,
  moderation_status:row.moderation_status,store_status:row.store_status,
  purchase_enabled:row.purchase_enabled,external_stock_status:row.stock_status,
  external_source:row.source,external_checked_at:row.last_checked_at,
  store_url:row.store_url,external_product_url:row.product_url};
 const link=purchaseLink(linked);
 if(link)return {state:'ready',label:'Disponible para mostrar',reason:'El anuncio y su vínculo directo cumplen las condiciones actuales.'};
 if(row.store_status!=='approved'||row.purchase_enabled!==true)return {state:'review',label:'Tienda pendiente o deshabilitada',reason:'La tienda necesita aprobación o no tiene compras externas habilitadas.'};
 if(row.kind!=='product'||row.deal!=='sale'||row.listing_status!=='active'||row.moderation_status!=='published')
  return {state:'review',label:'Anuncio no publicado',reason:'El anuncio debe ser un producto de venta activo y publicado.'};
 if(row.stock_status==='out_of_stock')return {state:'stock',label:'Sin existencias',reason:'El producto está agotado en el catálogo.'};
 if(row.stock_status!=='in_stock')return {state:'stock',label:'Stock sin confirmar',reason:'Confirma las existencias antes de enlazar la compra.'};
 const checked=Date.parse(row.last_checked_at||'');
 if(row.source==='api'&&(!Number.isFinite(checked)||checked>now||now-checked>=48*3600000))
  return {state:'sync',label:'Sincronización atrasada',reason:'Necesita una actualización reciente del catálogo WooCommerce.'};
 return {state:'link',label:'Enlace de tienda no válido',reason:'Comprueba que el producto esté enlazado por HTTPS al dominio aprobado.'};
}
function summary(items){
 const statuses=(Array.isArray(items)?items:[]).map(x=>diagnoseProduct(x));
 return {total:statuses.length,ready:statuses.filter(x=>x.state==='ready').length,
  needsReview:statuses.filter(x=>x.state==='review').length,
  stock:statuses.filter(x=>x.state==='stock').length,
  sync:statuses.filter(x=>x.state==='sync').length,
  invalidLink:statuses.filter(x=>x.state==='link').length};
}
module.exports={diagnoseProduct,summary};
