'use strict';
// Fotografías de comparaciones guardadas: sin nuevas búsquedas ni coste externo.
const {validOfferPhoto}=require('./marketplace-comparador-image-confidence-v3433');
function recentImage(query,offers){
 const candidates=(Array.isArray(offers)?offers:[])
  .filter(o=>Boolean(validOfferPhoto(query,o)));
 const rank=o=>(
  /\b(?:nuevo|precintado|new|reacondicionado|refurbished)\b/i.test(String(o.condition||'')+' '+String(o.title||''))?3:0
 )+(o.sponsored?0:2);
 const best=candidates.sort((a,b)=>rank(b)-rank(a))[0];
 return best?validOfferPhoto(query,best):null;
}
// V3.4.5.9: fallback vectorial local, identificable como ilustración, nunca
// como fotografía del SKU ni como una prueba de que el producto está en stock.
const CATEGORY_FALLBACKS=Object.freeze({
 portatil:'/assets/comparador-ilustracion-portatil-v3459.svg',
 auriculares:'/assets/comparador-ilustracion-auriculares-v3459.svg',
 aspirador:'/assets/comparador-ilustracion-aspirador-v3459.svg',
 cafetera:'/assets/comparador-ilustracion-cafetera-v3459.svg',
 freidora:'/assets/comparador-ilustracion-freidora-v3459.svg',
 clima:'/assets/comparador-ilustracion-clima-v3459.svg',
 zapatillas:'/assets/comparador-ilustracion-zapatillas-v3459.svg',
 chaqueta:'/assets/comparador-ilustracion-chaqueta-v3459.svg',
 reloj:'/assets/comparador-ilustracion-reloj-v3459.svg',
 television:'/assets/comparador-ilustracion-television-v3459.svg',
 muebles:'/assets/comparador-ilustracion-muebles-v3459.svg',
 movil:'/assets/comparador-movil-generico-v3435.svg',
 armario:'/assets/comparador-armarios-generico-v3435.svg',
 general:'/assets/comparador-producto-v3432.svg'
});
const RULES=[
 ['auriculares',/\b(?:auriculares?|airpods|earbuds|cascos?|headphones)\b/],
 ['reloj',/\b(?:smartwatch|reloj(?:es)?(?: inteligentes?)?|galaxy watch|apple watch)\b/],
 ['clima',/\b(?:aire acondicionado|climatizadores?|ventiladores?)\b/],
 ['portatil',/\b(?:portatiles?|portatil|laptops?|macbook|notebooks?|rog strix)\b/],
 ['aspirador',/\b(?:aspirador(?:a|es|as)?|roborock|roomba|robot aspirador)\b/],
 ['cafetera',/\b(?:cafeteras?|delonghi|nespresso)\b/],
 ['freidora',/\b(?:freidoras?|airfryer|air fryer|cecofry)\b/],
 ['zapatillas',/\b(?:zapatillas?|sneakers?|skechers)\b/],
 ['chaqueta',/\b(?:chaquetas?|abrigos?|anoraks?|cazadoras?)\b/],
 ['television',/\b(?:televisor(?:es)?|television(?:es)?|smart tv|oled tv)\b/],
 ['armario',/\b(?:armarios?|roperos?)\b/],
 ['movil',/\b(?:iphone|smartphone|telefonos?|moviles?)\b|\b(?:samsung|galaxy)\s+(?:s|a|z)\s?\d{1,2}\b/],
 ['muebles',/\b(?:mesas?|sillas?|sofas?|sofa|comodas?|escritorios?|muebles?|aparadores?)\b/]
];
function fallbackCategory(query){
 const normalized=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 return RULES.find(([,pattern])=>pattern.test(normalized))?.[0]||'general';
}
function recentFallback(query){
 return CATEGORY_FALLBACKS[fallbackCategory(query)];
}
module.exports={recentImage,recentFallback,fallbackCategory,CATEGORY_FALLBACKS};
