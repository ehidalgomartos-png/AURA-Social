'use strict';
// SEO de páginas de comparación: producto único y ofertas externas solo tras validación humana.
// El JSON-LD es informativo: los resultados enriquecidos dependen de Google.
const ORIGIN='https://redlibertad.com';
const FRESH_MS=48*60*60*1000;
// V3.4.5.3.1: breve margen SEO, sin convertir precios antiguos en ofertas actuales.
const STABLE_MS=7*24*60*60*1000;
const provider=require('./marketplace-comparador-provider-v32133');
const auto=require('./marketplace-comparador-auto-seo-v32138');
const discovery=require('./marketplace-comparador-index-discovery-v3458');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const {uniqueOffers}=require('./marketplace-comparador-offer-dedupe-v3446');
function externalOffers(offers){
 return (Array.isArray(offers)?offers:[]).filter(o=>o && !o.internal && !o.sponsored && typeof o.shop==='string' && o.shop.trim() && Number.isSafeInteger(o.price_cents) && o.price_cents>0 && o.price_cents<1e10);
}
function matchingOffers(page,offers){
 const matching=(Array.isArray(offers)?offers:[]).filter(o=>o&&provider.titleMatches(page?.query_text,o.title)&&!quality.repairReason(o));
 return uniqueOffers(quality.groupOffers(page?.query_text,matching).main);
}
// Una actualización en cola no invalida los resultados reales del último éxito.
// El backend solo establece last_checked_at cuando guarda una respuesta correcta.
// Fallos, límites de cuota y fichas sin datos conservan sus exclusiones actuales.
function stableSnapshot(page,now=Date.now()){
 if(!page||!['queued','checking'].includes(page.provider_status))return page;
 const last=Date.parse(page.last_checked_at||'');
 if(!Number.isFinite(now)||!Number.isFinite(last)||last>now||
  now-last>=STABLE_MS||!Array.isArray(page.external_results)||
  page.external_results.length<2)return page;
 return {...page,provider_status:'ok'};
}
function indexEligible(page,offers,now=Date.now()){
 if(!page || page.seo_blocked===true || quality.isRepairSearch(page.query_text))return false;
 const snapshot=stableSnapshot(page,now);
 const matching=matchingOffers(page,offers);
 if(auto.eligibleOffers(snapshot,matching,now).eligible)return true;
 // Segunda vía: precios reales de familias y modelos específicos, sin exigir
 // una capacidad de almacenamiento a categorías que no la tienen.
 if(discovery.evaluate(snapshot,matching,now).eligible)return true;
 // Una ficha exacta, ya verificada por su contenido, puede conservar indexación
 // hasta siete días cuando falla una actualización. No sustituye una verificación real.
 const last=Date.parse(page.last_checked_at||'');
 const age=now-last;
 const stable=snapshot.provider_status==='ok' && Number.isFinite(last) &&
  Number.isFinite(now) && age>=FRESH_MS && age<STABLE_MS;
 if(stable && auto.eligibleOffers(snapshot,matching,last+FRESH_MS-1).eligible)return true;
 if(page.index_approved!==true || snapshot.provider_status!=='ok')return false;
 // Una búsqueda genérica («iphone») puede mezclar dispositivos distintos.
 if(!provider.isSpecificModel(page.query_text))return false;
 if(String(page.editorial_summary||'').trim().length<80)return false;
 if(!Number.isFinite(last)||!Number.isFinite(now)||now<last||now-last>=STABLE_MS)return false;
 const ext=externalOffers(matching);
 return ext.length>=2 && new Set(ext.map(o=>o.shop.toLowerCase().trim())).size>=2;
}
function structuredData(page,offers,approved,canonical){
 const snapshot=stableSnapshot(page);
 const url=ORIGIN+canonical;
 const graph=[
  {'@type':'WebSite','@id':ORIGIN+'/#website',url:ORIGIN+'/',name:'RedLibertad',inLanguage:'es-ES'},
  {'@type':'WebPage','@id':url+'#webpage',url,name:page?'Comparar '+page.query_text+' | RedLibertad':'Comparador de precios | RedLibertad',
   description:page?.editorial_summary||auto.autoSummary(snapshot,auto.eligibleOffers(snapshot,offers))||discovery.summary(snapshot,discovery.evaluate(snapshot,matchingOffers(page,offers)))||'Busca productos y compara precios en tiendas y anuncios de España.',inLanguage:'es-ES',isPartOf:{'@id':ORIGIN+'/#website'},breadcrumb:{'@id':url+'#breadcrumb'}},
  {'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
   {'@type':'ListItem',position:1,name:'RedLibertad',item:ORIGIN+'/'},
   {'@type':'ListItem',position:2,name:'Comparador',item:ORIGIN+'/comparar'}
  ]}
 ];
 if(page){
  graph[2].itemListElement.push({'@type':'ListItem',position:3,name:page.query_text,item:url});
  const evaluation=auto.eligibleOffers(snapshot,matchingOffers(page,offers));
  if(approved && evaluation.eligible){
   graph[1].mainEntity={'@id':url+'#product'};
   const cents=evaluation.offers.map(o=>o.price_cents);
   graph.push({'@type':'Product','@id':url+'#product',name:page.query_text,url,
    description:auto.autoSummary(page,evaluation),
    offers:{'@type':'AggregateOffer',priceCurrency:'EUR',lowPrice:(Math.min(...cents)/100).toFixed(2),
     highPrice:(Math.max(...cents)/100).toFixed(2),offerCount:evaluation.offers.length}});
  }
 }
 return {'@context':'https://schema.org','@graph':graph};
}
// V3.4.4.26: sitemapLastmod evita fechas inválidas o futuras sin inventar cambios.
function sitemapLastmod(page,now=Date.now()){
 const stamps=[page?.updated_at,page?.last_checked_at].map(value=>value?Date.parse(value):NaN)
  .filter(value=>Number.isFinite(value)&&value>=0&&value<=now);
 return stamps.length?new Date(Math.max(...stamps)).toISOString():null;
}
function jsonLd(data){
 return JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')
  .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
const APPROVED_SQL= "query_text ~ '[0-9]' AND btrim(query_text) LIKE '% %' AND index_approved=true AND provider_status='ok' AND last_checked_at>now()-interval '7 days' AND length(trim(editorial_summary))>=80 AND (SELECT COUNT(*) FROM jsonb_array_elements(external_results) AS o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2 AND (SELECT COUNT(DISTINCT lower(trim(o->>'shop'))) FROM jsonb_array_elements(external_results) AS o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2";
module.exports={ORIGIN,FRESH_MS,STABLE_MS,stableSnapshot,indexEligible,structuredData,jsonLd,sitemapLastmod,APPROVED_SQL,externalOffers,auto,discovery};
