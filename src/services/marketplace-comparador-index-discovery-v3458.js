'use strict';
// V3.4.5.8 — páginas de comparación útiles, no necesariamente teléfonos con 256GB.
// Se evalúan ofertas REALES y guardadas, sin IA, APIs extra ni aprobación masiva.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const auto=require('./marketplace-comparador-auto-seo-v32138');
const {uniqueOffers}=require('./marketplace-comparador-offer-dedupe-v3446');
const MAX_AGE_MS=7*24*60*60*1000;
const IGNORE=new Set(['de','del','el','la','las','los','para','con','en','y','un','una','por']);
function modelEvidence(q){
 const words=auto.normalize(q).split(' ').filter(Boolean);
 const withoutCapacity=auto.normalize(q).replace(/\b(64|128|256|512|1024)\s*(gb|g|tb)\b/g,' ');
 const rest=withoutCapacity.split(' ').filter(Boolean);
 return rest.some(w=>/\d/.test(w) && (/[a-z]/.test(w)&&!^(?:5g|4g|wifi6|wifi7)$/.test(w)||
  /^\d{2,4}$/.test(w)&&rest.length>=2));
}
function classifyQuery(query){
 const norm=auto.normalize(query);
 const words=norm.split(' ').filter(w=>w.length>=2&&!IGNORE.has(w));
 if(words.length<2)return null;
 if(modelEvidence(query))return 'exact';
 // Una familia concreta (p. ej. «portátil ASUS ROG Strix Gaming») puede
 // compararse como FAMILIA, sin decir que todas las ofertas son el mismo SKU.
 if(words.length>=4&&!quality.isPhoneSearch(query))return 'family';
 return null;
}
function evaluate(page,offers,now=Date.now()){
 const no=(reason)=>({eligible:false,reason,offers:[]});
 if(!page||page.seo_blocked===true)return no('Bloqueada por administración');
 if(page.provider_status!=='ok')return no('La consulta de precios no terminó correctamente');
 if(quality.isRepairSearch(page.query_text))return no('Consulta de artículos averiados');
 const last=Date.parse(page.last_checked_at||'');
 if(!Number.isFinite(last)||!Number.isFinite(now)||now<last||now-last>=MAX_AGE_MS)
  return no('Ofertas demasiado antiguas o sin fecha');
 const kind=classifyQuery(page.query_text);
 if(!kind)return no('Consulta demasiado genérica para indexarse');
 // Un teléfono con varias capacidades distintas no es un único producto.
 if(quality.isPhoneSearch(page.query_text)&&!auto.capacity(page.query_text))
  return no('Especifica la capacidad del teléfono para evitar mezclar variantes');
 const selected=uniqueOffers(quality.groupOffers(page.query_text,(Array.isArray(offers)?offers:[])
  .filter(o=>o&&!o.internal&&!o.sponsored&&
   o.price_currency==='EUR'&&Number.isSafeInteger(o.price_cents)&&
   o.price_cents>0&&o.price_cents<=100000000&&
   typeof o.shop==='string'&&o.shop.trim()&&
   o.shop.toLowerCase().trim()!=='tienda no identificada'&&
   auto.clearCondition(o)&&!quality.repairReason(o)&&
   provider.titleMatches(page.query_text,o.title)&&
   provider.resolveOfferLink(o)?.href)).main);
 const min=kind==='exact'?2:3;
 if(selected.length<min)return no('Faltan ofertas independientes con precio real');
 const sellers=new Set(selected.map(o=>auto.normalize(o.shop)));
 if(sellers.size<min)return no('Faltan comercios diferentes');
 if(kind==='exact'){
  const qFamily=auto.family(page.query_text),qCapacity=auto.capacity(page.query_text),
   qColor=auto.color(page.query_text);
  const actualCap=new Set(selected.map(o=>auto.capacity(o.title)||'sin-indicar'));
  const actualColors=new Set(selected.map(o=>auto.color(o.title)||'sin-indicar'));
  if(selected.some(o=>auto.family(o.title)!==qFamily||
    (qCapacity&&auto.capacity(o.title)!==qCapacity)||
    (qColor&&auto.color(o.title)!==qColor))||
    (!qCapacity&&actualCap.size>1)||(!qColor&&actualColors.size>1))
   return no('Ofertas con modelos, capacidades o colores diferentes');
 }
 // No indexar páginas con rango incoherente, potencialmente accesorios o modelos erróneos.
 const values=selected.map(o=>o.price_cents),low=Math.min(...values),high=Math.max(...values);
 if(high/low>(kind==='exact'?2.5:4))
  return no('Precios incompatibles para una comparación fiable');
 return {eligible:true,reason:kind==='family'?'Comparación válida de una familia de productos':
  'Comparación válida de un modelo identificado',kind,offers:selected,
  sellerCount:sellers.size,lowPriceCents:low,highPriceCents:high,updatedAt:last};
}
function summary(page,evaluation,now=Date.now()){
 if(!evaluation?.eligible)return null;
 const eur=c=>(c/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 const older=now-evaluation.updatedAt>=48*60*60*1000;
 const first=evaluation.kind==='family'?
  'Ofertas guardadas de la familia '+page.query_text+' en ':
  'Ofertas guardadas de '+page.query_text+' en ';
 return first+evaluation.sellerCount+' tiendas, entre '+eur(evaluation.lowPriceCents)+' y '+
  eur(evaluation.highPriceCents)+'. '+(evaluation.kind==='family'?
   'Pueden corresponder a distintas versiones: compara el modelo exacto. ':'')+
  (older?'Son precios históricos, no necesariamente vigentes. ':'')+
  'Comprueba el estado, el envío y el precio final con cada vendedor.';
}
module.exports={MAX_AGE_MS,modelEvidence,classifyQuery,evaluate,summary};
