'use strict';
// V3.4.6.5 — auditoría local de elegibilidad, presencia prevista en sitemap y tareas de GSC.
// Misma consulta de candidatos utilizada por el endpoint XML; no consulta Google,
// no envía URLs, no modifica la base y no acredita indexación real.
const seo=require('./marketplace-comparador-seo-v32132');
const SITEMAP_CANDIDATES_SQL=
 "SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at "+
 "FROM marketplace_compare_pages WHERE seo_blocked=false AND provider_status IN ('ok','queued','checking') "+
 "AND last_checked_at>now()-interval '7 days' AND jsonb_array_length(external_results)>=2 "+
 "ORDER BY updated_at DESC LIMIT 2000";
const SAMPLE_SQL=
 "SELECT id,slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at "+
 "FROM marketplace_compare_pages ORDER BY created_at DESC LIMIT 80";
const SITEMAP_LIMIT=2000;
function safeSlug(s){return typeof s==='string'&&/^[a-z0-9-]{4,120}$/.test(s);}
function reason(page,now=Date.now()){
 if(page?.seo_blocked)return 'Bloqueada expresamente por administración';
 if(page?.provider_status==='limit_reached')return 'Cuota de consultas agotada; no afirmar que exista una respuesta reciente';
 if(page?.provider_status==='unavailable')return 'Última consulta externa fallida; revisar diagnóstico';
 if(!['ok','queued','checking'].includes(page?.provider_status))
  return 'No consta una respuesta válida del proveedor';
 const timestamp=Date.parse(page?.last_checked_at||'');
 if(!Number.isFinite(timestamp)||!Number.isFinite(now)||timestamp>now||now-timestamp>=seo.STABLE_MS)
  return 'Precios caducados o fecha sin validar';
 const offers=Array.isArray(page?.external_results)?page.external_results:[];
 if(offers.length<2)return 'Menos de dos resultados guardados';
 const snapshot=seo.stableSnapshot(page,now);
 const automatic=seo.auto.eligibleOffers(snapshot,offers,now);
 const discovered=seo.discovery.evaluate(snapshot,offers,now);
 return discovered.reason||automatic.reason||'No cumple todavía las reglas de calidad SEO';
}
function audit(candidates,latest,now=Date.now()){
 const source=(Array.isArray(candidates)?candidates:[]).filter(p=>safeSlug(p?.slug));
 const included=new Set(source.filter(p=>seo.indexEligible(p,p.external_results,now)).map(p=>p.slug));
 const recent=Array.isArray(latest)?latest:[];
 const rows=recent.map(p=>{
  const valid=safeSlug(p?.slug);
  const eligible=valid&&seo.indexEligible(p,p.external_results,now);
  const inSitemap=eligible&&included.has(p.slug);
  const capped=source.length>=SITEMAP_LIMIT;
  const state=inSitemap?'en-sitemap':eligible?'revisar-sitemap':'noindex';
  const detail=inSitemap?
   'La URL pasa el filtro actual del generador XML. Google aún puede no haberla indexado.':
   eligible?
    (capped?'Cumple las reglas SEO, pero no está en la selección limitada a 2000 candidatos.':'Cumple las reglas SEO, pero no aparece entre los candidatos del sitemap. Revisar el filtro y los datos.') :
    reason(p,now);
  return {page:p,eligible:Boolean(eligible),inSitemap:Boolean(inSitemap),
   state,detail,canonical:valid?seo.ORIGIN+'/comparar/'+p.slug:null,
   lastmod:seo.sitemapLastmod(p,now)};
 });
 const counts={sample:rows.length,'en-sitemap':rows.filter(p=>p.inSitemap).length,
  noindex:rows.filter(p=>p.state==='noindex').length,
  'revisar-sitemap':rows.filter(p=>p.state==='revisar-sitemap').length};
 const selectedTotal=included.size;
 return {rows,counts,candidateCount:source.length,sitemapExpected:selectedTotal,
  truncated:source.length>=SITEMAP_LIMIT,
  note:'Presencia prevista calculada con el mismo filtro de datos guardados que el sitemap. No es una lectura HTTP del XML publicado ni una consulta de Google.'};
}
function filter(report,requested='todas'){
 const states=['todas','en-sitemap','noindex','revisar-sitemap'];
 const chosen=states.includes(requested)?requested:'todas';
 return {selected:chosen,rows:report.rows.filter(r=>chosen==='todas'||r.state===chosen)};
}
module.exports={SITEMAP_CANDIDATES_SQL,SAMPLE_SQL,SITEMAP_LIMIT,reason,audit,filter,safeSlug};
