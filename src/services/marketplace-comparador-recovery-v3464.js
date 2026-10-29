'use strict';
// V3.4.6.4 — cola editorial de recuperación: solo instantáneas ya guardadas.
// No consulta proveedores ni publica, reintenta, aprueba o desbloquea páginas.
const seo=require('./marketplace-comparador-seo-v32132');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const provider=require('./marketplace-comparador-provider-v32133');
const failures=require('./marketplace-comparador-failures-v34572');
const budgetInfo=require('./marketplace-comparador-budget-info-v34574');
const MAX_AGE_MS=7*24*60*60*1000;
const ACTIONABLE=new Set(['revisar','precisar','caducada','sin-ofertas','incidencia']);
const PRIORITY={revisar:0,precisar:1,caducada:2,incidencia:3,'sin-ofertas':4,'en-curso':5,pausada:6,apta:7,bloqueada:8};
function inspect(page,quota=null,now=Date.now()){
 const offers=Array.isArray(page?.external_results)?page.external_results:[];
 const valid=quality.groupOffers(page?.query_text||'',offers.filter(o=>
  o && !o.internal && !o.sponsored && o.price_currency==='EUR' &&
  Number.isSafeInteger(o.price_cents) && o.price_cents>0 &&
  typeof o.shop==='string' && o.shop.trim() &&
  provider.titleMatches(page?.query_text,o.title) && provider.safeHttps(o.href))).main;
 const sellerCount=new Set(valid.map(o=>quality.normalize(o.shop))).size;
 const base={offerCount:valid.length,sellerCount,
  jobStatus:page?.job_status||null,providerStatus:page?.provider_status||null};
 const result=(category,label,action)=>({...base,category,label,action,
  actionable:ACTIONABLE.has(category)});
 if(page?.seo_blocked)return result('bloqueada','Bloqueada por administración',
  'La exclusión es intencionada. Revisa el bloqueo solo si hay motivos para retirarlo.');
 if(seo.indexEligible(page,offers,now))
  return result('apta','Cumple los requisitos SEO',
   'Comprueba la URL publicada y el sitemap en Search Console; Google decide si indexarla.');
 if(['queued','checking'].includes(page?.provider_status) &&
  ['queued','running'].includes(page?.job_status))
  return result('en-curso','Actualización en curso',
   'Ya existe un trabajo guardado en cola o ejecución. No envíes otra búsqueda ni recargues para repetirla.');
 const quotaDetails=budgetInfo.describe(quota);
 const code=String(page?.failure_code||'');
 const remotePause=new Set(['local_budget','provider_remote_quota','provider_invalid_key','provider_rate_limit']);
 if(page?.provider_status==='limit_reached' || remotePause.has(code) &&
  page?.provider_status==='unavailable' || quota && quotaDetails.paused)
  return result('pausada','Consultas externas pausadas',
   remotePause.has(code) && page?.provider_status==='unavailable'?
    failures.explain(code).action:
    quotaDetails.paused?quotaDetails.message:
     'Espera a que se renueve el presupuesto interno; no repitas consultas sin disponibilidad.');
 if(page?.provider_status==='unavailable')
  return result('incidencia','Error externo pendiente',
   code?failures.explain(code).action:
    'Consulta el diagnóstico de errores antes de decidir si merece la pena repetir manualmente.');
 if(['queued','checking'].includes(page?.provider_status))
  return result('en-curso','Estado pendiente de comprobar',
   'La página figura en preparación. Consulta el diagnóstico del trabajo; no lances búsquedas duplicadas.');
 const timestamp=Date.parse(page?.last_checked_at||'');
 const current=Number.isFinite(now)&&Number.isFinite(timestamp)&&timestamp<=now &&
  now-timestamp<MAX_AGE_MS;
 if(!current && offers.length)
  return result('caducada','Precios guardados caducados',
   'Revisa el modelo y decide si necesita una actualización. Solo una búsqueda enviada voluntariamente consumiría cuota.');
 if(!seo.discovery.classifyQuery(page?.query_text||''))
  return result('precisar','Búsqueda demasiado general',
   'Conviene especificar un modelo o una familia real de las ofertas guardadas antes de realizar otra consulta.');
 if(!valid.length)
  return result('sin-ofertas','Sin ofertas comparables',
   'Revisa los resultados existentes: podrían ser anuncios no comparables, accesorios o una búsqueda sin productos. No repitas automáticamente.');
 const discovery=seo.discovery.evaluate(seo.stableSnapshot(page,now),valid,now);
 return result('revisar','Revisión editorial de ofertas',
  discovery?.reason==='Ofertas con modelos, capacidades o colores diferentes'?
   'Separa variantes o capacidades reales; no mezcles modelos en una sola comparación.':
   discovery?.reason==='Precios incompatibles para una comparación fiable'?
    'Revisa accesorios, estados y precios extremos antes de solicitar indexación.':
   'Comprueba la coincidencia, las tiendas independientes, el estado y los enlaces directos existentes.');
}
function queue(pages,filter='todas',quota=null,now=Date.now()){
 const items=(Array.isArray(pages)?pages:[]).map((p,originalIndex)=>({
  page:p,originalIndex,...inspect(p,quota,now)
 }));
 const counts={todas:items.length,accionables:0,'en-curso':0,pausadas:0,aptas:0,bloqueadas:0};
 for(const i of items){
  if(i.actionable)counts.accionables++;
  if(i.category==='en-curso')counts['en-curso']++;
  if(i.category==='pausada')counts.pausadas++;
  if(i.category==='apta')counts.aptas++;
  if(i.category==='bloqueada')counts.bloqueadas++;
 }
 const chosen=Object.hasOwn(counts,filter)?filter:'todas';
 const view=items.filter(i=>chosen==='todas'||chosen==='accionables'&&i.actionable||
  chosen==='en-curso'&&i.category==='en-curso'||
  chosen==='pausadas'&&i.category==='pausada'||
  chosen==='aptas'&&i.category==='apta'||
  chosen==='bloqueadas'&&i.category==='bloqueada');
 return {selected:chosen,counts,rows:view.sort((a,b)=>
  (PRIORITY[a.category]??9)-(PRIORITY[b.category]??9) ||
  a.originalIndex-b.originalIndex)};
}
module.exports={inspect,queue};
