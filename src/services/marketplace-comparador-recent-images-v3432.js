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
module.exports={recentImage};
