'use strict';
// V3.4.4.6 — Deduplicación conservadora, solo en memoria.
// No fusionar ofertas de vendedores, URLs, estados, capacidades o anuncios distintos.
const quality=require('./marketplace-comparador-offer-quality-v3419');
function normalizedUrl(raw){
 try{
  const url=new URL(String(raw||''));
  if(url.protocol!=='https:'||url.username||url.password)return null;
  url.hash='';
  if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,'')||'/';
  return url.href;
 }catch(_){return null;}
}
function offerIdentity(offer){
 if(!offer||!Number.isSafeInteger(offer.price_cents)||offer.price_cents<=0)return null;
 const state=quality.normalize(offer.condition);
 if(offer.internal){
  const id=String(offer.listing_id||'');
  if(!/^[1-9]\d*$/.test(id))return null;
  // Un mismo anuncio con dos precios o enlaces no se fusiona a ciegas.
  return JSON.stringify(['local',id,offer.price_cents,state,String(offer.href||'')]);
 }
 const href=normalizedUrl(offer.href);
 const shop=quality.normalize(offer.shop),title=quality.normalize(offer.title);
 if(!href||!shop||!title)return null;
 // El ID externo puede identificar variantes diferentes que comparten la URL de categoría.
 return JSON.stringify(['external',shop,title,offer.price_cents,state,href,
  String(offer.product_id||''),String(offer.page_token||''),Boolean(offer.sponsored)]);
}
function priority(o){
 return (o?.manual_link?8:0)+(o?.resolved_href?4:0)+(o?.image?1:0);
}
function uniqueOffers(offers){
 const out=[],positions=new Map();
 for(const offer of Array.isArray(offers)?offers:[]){
  const key=offerIdentity(offer);
  if(!key){out.push(offer);continue;}
  const found=positions.get(key);
  if(found===undefined){
   positions.set(key,out.length);
   out.push(offer);
  }else if(priority(offer)>priority(out[found])){
   // Mantener el enlace revisado manualmente y la posición original en la lista.
   out[found]=offer;
  }
 }
 return out;
}
module.exports={normalizedUrl,offerIdentity,uniqueOffers};
