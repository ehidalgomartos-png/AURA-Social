'use strict';
// SEO de páginas de comparación: producto único y ofertas externas solo tras validación humana.
// El JSON-LD es informativo: los resultados enriquecidos dependen de Google.
const ORIGIN='https://redlibertad.com';
const FRESH_MS=48*60*60*1000;
const provider=require('./marketplace-comparador-provider-v32133');
const auto=require('./marketplace-comparador-auto-seo-v32138');
const quality=require('./marketplace-comparador-offer-quality-v3419');
function externalOffers(offers){
 return (Array.isArray(offers)?offers:[]).filter(o=>o && !o.internal && !o.sponsored && typeof o.shop==='string' && o.shop.trim() && Number.isSafeInteger(o.price_cents) && o.price_cents>0 && o.price_cents<1e10);
}
function matchingOffers(page,offers){
 return (Array.isArray(offers)?offers:[]).filter(o=>o&&provider.titleMatches(page?.query_text,o.title)&&!quality.repairReason(o));
}
function indexEligible(page,offers,now=Date.now()){
 if(!page || page.seo_blocked===true || quality.isRepairSearch(page.query_text))return false;
 const matching=matchingOffers(page,offers);
 if(auto.eligibleOffers(page,matching,now).eligible)return true;
 if(page.index_approved!==true || page.provider_status!=='ok')return false;
 // Una búsqueda genérica («iphone») puede mezclar dispositivos distintos.
 if(!provider.isSpecificModel(page.query_text))return false;
 if(String(page.editorial_summary||'').trim().length<80)return false;
 const last=Date.parse(page.last_checked_at||'');
 if(!Number.isFinite(last)||now<last||now-last>=FRESH_MS)return false;
 const ext=externalOffers(matching);
 return ext.length>=2 && new Set(ext.map(o=>o.shop.toLowerCase().trim())).size>=2;
}
function structuredData(page,offers,approved,canonical){
 const url=ORIGIN+canonical;
 const graph=[
  {'@type':'WebSite','@id':ORIGIN+'/#website',url:ORIGIN+'/',name:'RedLibertad',inLanguage:'es-ES'},
  {'@type':'WebPage','@id':url+'#webpage',url,name:page?'Comparar '+page.query_text+' | RedLibertad':'Comparador de precios | RedLibertad',
   description:page?.editorial_summary||auto.autoSummary(page,auto.eligibleOffers(page,offers))||'Busca productos y compara precios en tiendas y anuncios de España.',inLanguage:'es-ES',isPartOf:{'@id':ORIGIN+'/#website'}},
  {'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
   {'@type':'ListItem',position:1,name:'RedLibertad',item:ORIGIN+'/'},
   {'@type':'ListItem',position:2,name:'Comparador',item:ORIGIN+'/comparar'}
  ]}
 ];
 if(page){
  graph[2].itemListElement.push({'@type':'ListItem',position:3,name:page.query_text,item:url});
  const evaluation=auto.eligibleOffers(page,matchingOffers(page,offers));
  if(approved && evaluation.eligible){
   const cents=evaluation.offers.map(o=>o.price_cents);
   graph.push({'@type':'Product','@id':url+'#product',name:page.query_text,url,
    description:auto.autoSummary(page,evaluation),
    offers:{'@type':'AggregateOffer',priceCurrency:'EUR',lowPrice:(Math.min(...cents)/100).toFixed(2),
     highPrice:(Math.max(...cents)/100).toFixed(2),offerCount:evaluation.offers.length}});
  }
 }
 return {'@context':'https://schema.org','@graph':graph};
}
function jsonLd(data){
 return JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')
  .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
const APPROVED_SQL= "query_text ~ '[0-9]' AND btrim(query_text) LIKE '% %' AND index_approved=true AND provider_status='ok' AND last_checked_at>now()-interval '48 hours' AND length(trim(editorial_summary))>=80 AND (SELECT COUNT(*) FROM jsonb_array_elements(external_results) AS o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2 AND (SELECT COUNT(DISTINCT lower(trim(o->>'shop'))) FROM jsonb_array_elements(external_results) AS o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2";
module.exports={ORIGIN,indexEligible,structuredData,jsonLd,APPROVED_SQL,externalOffers,auto};
