'use strict';
// V3.4.3.3 — Preselección CONSERVADORA de fotos a partir de metadatos.
// No procesa los píxeles: si el título o el origen no ofrecen garantías,
// no presenta la miniatura como fotografía del artículo buscado.
// Usa solo ofertas guardadas y URLs admitidas; sin HTTP, IA ni SerpApi.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');

const forbidden=/\b(?:funda|fundas|carcasa|carcasas|case|cases|cover|covers|protector|protectores|proteccion de pantalla|cristal templado|tempered glass|screen protector|cargador|chargers?|charging case|cable|cord|adaptador|adapter|soporte|holder|repuesto|repuestos|replacement|recambio|recambios|pantalla de recambio|digitalizador|lcd replacement|solo caja|caja vacia|caja original|empty box|box only|retail box|packaging only|embalaje|unboxing|dummy|maqueta|replica|expositor|manual de usuario|skin|pegatina|sticker|compatible con|designed for|for iphone|for samsung|para iphone|para samsung)\b/i;
const samsungModel=/\b(?:samsung|galaxy)\b.*\b(?:s[0-9]{1,2}|a[0-9]{1,2}|z[0-9]{1,2})\b/i;
const productContext=/\b(?:galaxy|smartphone|telefono|movil|phone|telefono inteligente)\b/i;
const imageHint=/\b(?:funda|fundas|carcasa|carcasas|case|cover|protector|templado|tempered|cargador|charger|cable|adaptador|repuesto|repuestos|recambio|replacement|dummy|replica|empty box|box only|box|caja|packaging|unboxing|sticker)\b/i;

function normalized(value){
 return quality.normalize(value);
}
function isAccessorySearch(query){
 return forbidden.test(normalized(query));
}
function validOfferPhoto(query,offer){
 if(!offer||typeof offer.title!=='string'||!provider.isSpecificModel(query))return null;
 if(!provider.titleMatches(query,offer.title))return null;
 if(!quality.isRepairSearch(query)&&quality.repairReason(offer))return null;

 const accessoryWanted=isAccessorySearch(query);
 const title=normalized(offer.title);
 if(!accessoryWanted&&forbidden.test(title))return null;

 // La búsqueda "Samsung S26" puede coincidir con resultados de fundas cuyo
 // anuncio solo contiene el modelo. Exigimos contexto adicional en el título.
 const q=normalized(query);
 if(!accessoryWanted&&samsungModel.test(q)&&!productContext.test(title))return null;

 const image=offer.internal
  ?(/^\/marketplace\/imagen\/[1-9]\d*\/0$/.test(String(offer.image||''))?offer.image:null)
  :provider.safeImage(offer.image);
 if(!image)return null;
 if(!accessoryWanted&&!offer.internal){
  try{
   const u=new URL(image);
   const mediaName=normalized(decodeURIComponent(u.pathname+' '+u.search));
   if(imageHint.test(mediaName))return null;
  }catch(_){return null;}
 }
 return image;
}
module.exports={validOfferPhoto};
