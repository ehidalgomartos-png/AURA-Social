'use strict';
// V3.4.4.27: diagnóstico privado, de solo lectura y basado exclusivamente en resultados guardados.
const quality=require('./marketplace-comparador-offer-quality-v3419');
const provider=require('./marketplace-comparador-provider-v32133');
const seo=require('./marketplace-comparador-seo-v32132');
const priceFreshness=require('./marketplace-comparador-price-freshness-v32148');
const {uniqueOffers}=require('./marketplace-comparador-offer-dedupe-v3446');

function assessPage(page,now=Date.now()){
 const raw=Array.isArray(page?.external_results)?page.external_results:[];
 const external=raw.filter(o=>o&&!o.internal&&!o.sponsored);
 const grouped=quality.groupOffers(page?.query_text,external);
 const comparable=uniqueOffers(grouped.main);
 const direct=comparable.filter(o=>provider.resolveOfferLink(o)?.destination==='store').length;
 const age=priceFreshness.freshness(page?.last_checked_at,now);
 const issues=[];
 const pending=['queued','checking'].includes(page?.provider_status);
 if(['unavailable','limit_reached'].includes(page?.provider_status))
  issues.push('La última consulta no terminó correctamente');
 if(external.length&&age.isStale)
  issues.push(age.code==='unknown'?'No consta una fecha válida de consulta':'Precios externos de más de 48 horas');
 if(external.length&&grouped.review.length)
  issues.push(grouped.review.length+' ofertas requieren revisión de calidad');
 if(external.length&&grouped.repair.length)
  issues.push(grouped.repair.length+' ofertas averiadas se muestran por separado');
 if(external.length&&grouped.accessories.length)
  issues.push(grouped.accessories.length+' accesorios se muestran por separado');
 if(external.length&&!comparable.length)
  issues.push('No quedan ofertas comparables tras los filtros de calidad');
 if(comparable.length&&!direct)
  issues.push('Ninguna oferta comparable tiene enlace directo de tienda');
 if(!external.length&&!pending)
  issues.push('No hay ofertas externas guardadas');
 const seoEligible=seo.indexEligible(page,raw,now);
 return {
  slug:String(page?.slug||''),
  title:String(page?.query_text||''),
  id:String(page?.id||''),
  status:String(page?.provider_status||'unknown'),
  total:external.length,comparable:comparable.length,direct,
  excluded:grouped.review.length+grouped.repair.length+grouped.accessories.length,
  age:age.code,seoEligible,
  issues,attention:issues.length>0
 };
}
function summarize(rows,now=Date.now()){
 const items=(Array.isArray(rows)?rows:[]).map(p=>assessPage(p,now));
 return {items,counts:{
  reviewed:items.length,attention:items.filter(i=>i.attention).length,
  noIssues:items.filter(i=>!i.attention).length,
  stale:items.filter(i=>i.total>0&&['old','historical','unknown'].includes(i.age)).length,
  direct:items.filter(i=>i.direct>0).length,
  indexEligible:items.filter(i=>i.seoEligible).length
 }};
}
module.exports={assessPage,summarize};
