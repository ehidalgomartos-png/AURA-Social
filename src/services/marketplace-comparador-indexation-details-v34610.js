'use strict';
// V3.4.6.10 — explicar exclusiones usando SOLO resultados ya guardados.
// No cambia indexación, cuotas ni ofertas originales; las sugerencias abren
// un formulario y jamás inician una nueva búsqueda por sí mismas.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const auto=require('./marketplace-comparador-auto-seo-v32138');
const {uniqueOffers}=require('./marketplace-comparador-offer-dedupe-v3446');
function inspect(page){
 const q=String(page?.query_text||'').trim();
 if(!q||q.length>100)return null;
 const norm=quality.normalize(q);
 const consoleType=/^(?:sony )?(?:playstation 5|ps5) pro(?: 2 tb)?$/.test(norm);
 const mobile=quality.isPhoneSearch(q)&&/\b(?:redmi|poco)\b/.test(norm)&&Boolean(auto.capacity(q));
 if(!consoleType&&!mobile)return null;
 const matched=uniqueOffers((Array.isArray(page?.external_results)?page.external_results:[])
  .filter(o=>o&&!o.internal&&!o.sponsored &&
   o.price_currency==='EUR'&&Number.isSafeInteger(o.price_cents)&&o.price_cents>0 &&
   typeof o.shop==='string'&&o.shop.trim()&&
   o.shop.toLowerCase().trim()!=='tienda no identificada'&&
   auto.clearCondition(o)&&!quality.repairReason(o)&&
   provider.titleMatches(q,o.title)&&provider.safeHttps(o.href)))
  .slice(0,40);
 const rentals=matched.filter(o=>quality.rentalReason(o));
 const rows=matched.filter(o=>!quality.rentalReason(o));
 if(consoleType){
  const shops=new Set(rows.map(o=>quality.normalize(o.shop)));
  const sorted=[...rows].sort((a,b)=>a.price_cents-b.price_cents);
  const cents=sorted.map(o=>o.price_cents);
  const info=quality.groupOffers(q,rows);
  return {kind:'price',
   offers:sorted.slice(0,6).map(o=>({shop:String(o.shop).slice(0,80),priceCents:o.price_cents})),
   total:rows.length,sellers:shops.size,excluded:info.review.filter(o=>/Precio extremo de consola/.test(o.quality_reason||'')).length,
   ratio:cents.length>=2?Math.round(100*Math.max(...cents)/Math.min(...cents))/100:null,
   rentalCount:rentals.length,
   rentals:rentals.slice(0,6).map(o=>({shop:String(o.shop).slice(0,80),priceCents:o.price_cents})),
   suggestions:[],note:'La diferencia máximo/mínimo utiliza solo precios de compra. Las cuotas de alquiler se muestran aparte y no forman parte del mínimo. Con menos de cuatro comercios no se descarta automáticamente un precio extremo. Comprueba en cada tienda el estado y las condiciones; los anuncios particulares pueden ser usados.'};
 }
 const buckets=[['4g','4G'],['5g','5G'],['unknown','Sin identificar']];
 const groups=new Map(buckets.map(([key])=>[key,{shops:new Set(),offers:0}]));
 for(const o of rows){
  const network=quality.normalize(o.title).match(/\b(?:4g|5g)\b/)?.[0]||'unknown';
  const bucket=groups.get(network);
  bucket.offers++;bucket.shops.add(quality.normalize(o.shop));
 }
 const explicit=/\b(?:4g|5g)\b/.test(norm);
 const suggestions=explicit?[]:['4g','5g']
  .filter(key=>groups.get(key).shops.size>=2)
  .map(key=>q+' '+key.toUpperCase());
 return {kind:'network',total:rows.length,
  breakdown:buckets.map(([key,label])=>({key,label,offers:groups.get(key).offers,sellers:groups.get(key).shops.size})),
  suggestions,
  note:'Se cuentan únicamente ofertas guardadas de la misma capacidad. Una oferta sin conectividad identificada no se convierte en 4G ni en 5G; si hay versiones incompatibles, la ficha sigue noindex.'};
}
module.exports={inspect};
