'use strict';
// Imágenes de comparaciones recientes: datos guardados, sin llamadas externas.
// Nunca reutilizar una fotografía de un producto averiado o de otro modelo.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
function recentImage(query,offers){
 const candidates=(Array.isArray(offers)?offers:[]).filter(o=>
  o&&typeof o.title==='string'&&provider.titleMatches(query,o.title)&&
  !quality.repairReason(o)&&provider.safeImage(o.image)
 );
 const rank=o=>(
  /\b(?:nuevo|precintado|new|reacondicionado|refurbished)\b/i.test(String(o.condition||'')+' '+String(o.title||''))?3:0
 )+(o.sponsored?0:2);
 const best=candidates.sort((a,b)=>rank(b)-rank(a))[0];
 return best?provider.safeImage(best.image):null;
}
module.exports={recentImage};
