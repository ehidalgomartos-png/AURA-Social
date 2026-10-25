'use strict';
// Estado de precios externos guardados. No implica que el importe siga en vigor.
// Solo last_checked_at tras una respuesta REAL del proveedor debe renovarse.
const HOUR=60*60*1000;
const DAY=24*HOUR;
const SEO_MAX_AGE=48*HOUR;
const OLD_MAX_AGE=7*DAY;
function freshness(lastCheckedAt,now=Date.now()){
 const checked=lastCheckedAt?Date.parse(lastCheckedAt):NaN;
 if(!Number.isFinite(checked)||checked>now||checked<0)
  return {code:'unknown',ageMs:null,checkedAt:null,needsRefresh:true,isStale:true};
 const ageMs=Math.max(0,now-checked);
 return {
  code:ageMs<DAY?'recent':ageMs<SEO_MAX_AGE?'refresh_due':ageMs<OLD_MAX_AGE?'old':'historical',
  ageMs,checkedAt:new Date(checked),needsRefresh:ageMs>=DAY,isStale:ageMs>=SEO_MAX_AGE
 };
}
function priceNotice(lastCheckedAt,providerStatus,now=Date.now()){
 const info=freshness(lastCheckedAt,now);
 const date=info.checkedAt?info.checkedAt.toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}):null;
 const pending=['queued','checking'].includes(providerStatus);
 if(info.code==='recent')return {level:'recent',text:pending?'Estamos comprobando nuevas ofertas. Puedes consultar los últimos precios guardados.':'Precios consultados el '+date+'. Confirma el importe final en la tienda.',date};
 if(info.code==='refresh_due')return {level:'due',text:pending?'Actualizando los precios del '+date+'. Mientras tanto se muestran las ofertas guardadas.':'Precios consultados el '+date+'. Está pendiente una nueva comprobación; pueden haber cambiado.',date};
 if(info.code==='old')return {level:'old',text:'Precios guardados del '+date+'. Pueden estar desactualizados; verifica precio y disponibilidad en la tienda.',date};
 if(info.code==='historical')return {level:'historical',text:'Consulta histórica del '+date+'. Los importes son orientativos y pueden haber cambiado.',date};
 return {level:'unknown',text:'No consta una comprobación reciente de estos precios. Comprueba el importe en la tienda.',date:null};
}
module.exports={HOUR,DAY,SEO_MAX_AGE,OLD_MAX_AGE,freshness,priceNotice};
