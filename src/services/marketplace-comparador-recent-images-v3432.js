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
function recentFallback(query){
 const normalized=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/\barmarios?\b/.test(normalized))return '/assets/comparador-armarios-generico-v3435.svg';
 if(/\b(?:iphone|smartphone|telefono|movil)\b/.test(normalized)||
   (/\b(?:samsung|galaxy)\b/.test(normalized)&&/\b(?:s|a|z)[0-9]{1,2}\b/.test(normalized)))
  return '/assets/comparador-movil-generico-v3435.svg';
 return '/assets/comparador-producto-v3432.svg';
}
module.exports={recentImage,recentFallback};
