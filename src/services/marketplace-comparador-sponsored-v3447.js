'use strict';
// V3.4.4.7 — No confundir promociones de Google Shopping con comparaciones independientes.
// Solo las ofertas explícitamente marcadas como patrocinadas se separan.
// Conserva los objetos y el orden original; sin consultar fuentes externas.
function splitPaidOffers(offers){
 const ordinary=[],sponsored=[];
 for(const offer of Array.isArray(offers)?offers:[]){
  if(offer?.sponsored===true)sponsored.push(offer);
  else ordinary.push(offer);
 }
 return {ordinary,sponsored};
}
module.exports={splitPaidOffers};
