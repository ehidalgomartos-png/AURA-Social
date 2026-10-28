'use strict';
// V3.2.138 — SEO automático conservador de fichas de comparación.
// No crea contenido ficticio, no altera cuotas de búsqueda ni usa IA de relleno.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const FRESH_MS=48*60*60*1000;
const MIN_MERCHANTS=3;
const MODEL_MARKERS=['pro','max','ultra','plus','mini','lite','fe','se','air','edge','fold','flip'];
const COLORS=[
 ['negro',/\b(negro|black|midnight|medianoche|grafito|graphite)\b/],
 ['blanco',/\b(blanco|white|blanc)\b/],
 ['azul',/\b(azul|blue|bleu)\b/],
 ['verde',/\b(verde|green)\b/],
 ['rojo',/\b(rojo|red)\b/],
 ['rosa',/\b(rosa|pink)\b/],
 ['violeta',/\b(violeta|morado|purple|lavender)\b/],
 ['gris',/\b(gris|grey|gray|silver|plata)\b/],
 ['dorado',/\b(dorado|gold)\b/]
];
const USED=/\b(used|usado|usada|segunda mano|reacondicionado|reacondicionada|refurbished|renewed|preowned|pre owned|open box|como nuevo)\b/;
const CAPACITY=/\b(64|128|256|512|1024)\s*(gb|g|tb)\b/;
function normalize(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function capacity(v){
 const text=normalize(v),m=CAPACITY.exec(text);
 if(!m)return null;
 return String((Number(m[1])*(m[2]==='tb'?1024:1)))+'gb';
}
function color(v){
 const text=normalize(v);
 for(const [name,re] of COLORS)if(re.test(text))return name;
 return null;
}
function family(v){const words=new Set(normalize(v).split(' '));return MODEL_MARKERS.filter(w=>words.has(w)).join('|');}
function clearCondition(o){
 return !USED.test(normalize(o.title)+' '+normalize(o.condition)) &&
 ['','Nuevo','No indicado','Consultar estado'].includes(String(o.condition||''));
}
function validMerchant(o){
 if(!o||o.internal||o.sponsored||o.price_currency!=='EUR'||!Number.isSafeInteger(o.price_cents)||o.price_cents<=0||o.price_cents>100000000)return false;
 if(!String(o.shop||'').trim()||!clearCondition(o))return false;
 // Solo enlaces de tienda presentes en los resultados guardados, no enlaces
 // añadidos al mostrar la página desde otra tabla: sitemap y HTML deben coincidir.
 const link=provider.resolveOfferLink({...o,resolved_href:null});
 return link?.destination==='store' && Boolean(link?.href);
}
function exactVariant(q,offers){
 const raw=normalize(q),wantedCapacity=capacity(q);
 if(!wantedCapacity)return false;
 const words=raw.split(' ');
 const withoutCapacity=raw.replace(/\b(64|128|256|512|1024)\s*(gb|g|tb)\b/g,' ');
 if(words.length<3||!/[0-9]/.test(withoutCapacity))return false;
 const variantFamily=family(q);
 const wantedColor=color(q);
 const seenColors=new Set();
 const significant=words.filter(w=>w.length>=2&&!['gb','g','tb','5g','4g','de','con','dual','sim'].includes(w));
 if(significant.length<2)return false;
 for(const o of offers){
  if(!o||!o.title||!validMerchant(o))return false;
  const normalized=normalize(o.title);
  const parts=new Set(normalized.split(' '));
  if(!significant.every(t=>parts.has(t)||(!isNaN(Number(t)) && normalized.includes(t))))return false;
  if(capacity(o.title)!==wantedCapacity)return false;
  if(family(o.title)!==variantFamily)return false;
  const currentColor=color(o.title);
  if(wantedColor && currentColor!==wantedColor)return false;
  seenColors.add(currentColor||'unknown');
 }
 return seenColors.size===1; // No mezclar colores en AggregateOffer.
}
function eligibleOffers(page,offers,now=Date.now()){
 if(!page||page.seo_blocked===true)return {eligible:false,reason:'Bloqueada por administración',offers:[]};
 // Búsquedas explícitas de aparatos para piezas no son productos ordinarios indexables.
 if(quality.isRepairSearch(page.query_text))return {eligible:false,reason:'Consulta de artículos averiados',offers:[]};
 if(page.provider_status!=='ok')return {eligible:false,reason:'Esperando precios actualizados',offers:[]};
 const last=Date.parse(page.last_checked_at||'');
 if(!Number.isFinite(last)||last>now||now-last>=FRESH_MS)return {eligible:false,reason:'Precios sin actualizar',offers:[]};
 if(!capacity(page.query_text))return {eligible:false,reason:'Falta capacidad o variante exacta',offers:[]};
 // Reusar el mismo filtro que la ficha y el sitemap, aunque el llamador aporte resultados sin depurar.
 const safe=quality.groupOffers(page.query_text,offers).main;
 const external=safe.filter(o=>o&&!o.internal&&!o.sponsored&&!quality.repairReason(o));
 if(external.length<MIN_MERCHANTS)return {eligible:false,reason:'Menos de tres ofertas independientes',offers:[]};
 if(!exactVariant(page.query_text,external))return {eligible:false,reason:'Modelos, estados o variantes mezclados, o enlaces sin tienda directa',offers:[]};
 const sellers=new Set(external.map(o=>normalize(o.shop)));
 if(sellers.size<MIN_MERCHANTS)return {eligible:false,reason:'Menos de tres tiendas diferentes',offers:[]};
 const values=external.map(o=>o.price_cents),min=Math.min(...values),max=Math.max(...values);
 if(max/min>2.3)return {eligible:false,reason:'Precios demasiado dispersos para una comparación fiable',offers:[]};
 return {eligible:true,reason:'Comparación automática válida',offers:external,
  sellerCount:sellers.size,lowPriceCents:min,highPriceCents:max,updatedAt:last};
}
function autoSummary(page,evaluation){
 if(!evaluation.eligible)return null;
 const money=c=>(c/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 const count=evaluation.sellerCount;
 return 'Precios comparados de '+page.query_text+' en '+count+' tiendas, desde '+money(evaluation.lowPriceCents)+
  ' hasta '+money(evaluation.highPriceCents)+'. Consulta las ofertas y comprueba estado, envío y precio final en cada tienda.';
}
// Consultas ligeras para sitemap y portada: el criterio final es SIEMPRE el mismo JS de la URL.
const CANDIDATE_SQL="provider_status='ok' AND seo_blocked=false AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=3";
module.exports={FRESH_MS,MIN_MERCHANTS,normalize,capacity,color,family,clearCondition,validMerchant,exactVariant,eligibleOffers,autoSummary,CANDIDATE_SQL};
