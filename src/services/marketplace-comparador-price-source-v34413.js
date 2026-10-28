'use strict';
// V3.4.4.13 — Origen de precios que puede constatarse sin inventar verificaciones.
// La fecha de la consulta externa ya se presenta en offer-price-date.
function sourceLabel(offer,priceInfo){
 if(offer?.internal===true)
  return offer.partner_store===true?
   'Precio publicado en RedLibertad · tienda vinculada':
   'Precio publicado en RedLibertad';
 if(offer?.sponsored===true)return 'Publicidad · precio orientativo';
 // Sin fecha acreditada no podemos afirmar que se trate de una consulta anterior.
 if(!priceInfo?.date)return 'Oferta externa · fecha sin confirmar';
 if(priceInfo?.isStale===true)return 'Oferta externa · precio anterior';
 return 'Oferta externa · precio orientativo';
}
module.exports={sourceLabel};
