'use strict';
// V3.4.3.9 — clasifica el destino real de una oferta, sin consultar redes.
// No altera ni orden ni precio ni criterios SEO. Solo información de navegación.
const provider=require('./marketplace-comparador-provider-v32133');
function isDirectStore(offer){
 // Un anuncio local con compra externa aprobada SÍ es acceso directo.
 // Los anuncios locales sin tienda vinculada siguen siendo enlaces internos.
 if(!offer || (offer.internal && offer.partner_store!==true))return false;
 const link=offer.partner_store?
  {href:offer.href,destination:'store'}:provider.resolveOfferLink(offer);
 if(link?.destination!=='store')return false;
 // Aplicar validación de URL también a ofertas de comercios integrados.
 const checked=provider.directMerchantUrl(link.href);
 return Boolean(checked&&!provider.isGoogleHost(new URL(checked).hostname));
}
function summary(offers){
 const rows=Array.isArray(offers)?offers:[];
 const direct=rows.filter(isDirectStore).length;
 return {direct,other:rows.length-direct,total:rows.length};
}
module.exports={isDirectStore,summary};
