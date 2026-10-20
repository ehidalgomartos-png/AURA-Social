'use strict';
// V3.2.124 — provenance-gated merchant structured data.
// No Merchant feeds, speculative product brand, global return policy,
// shipping fees, delivery dates or new/used guesses.
const {validGtin}=require('./marketplace-google-v3264');
const {purchaseLink,normalizeStoreUrl}=require('./marketplace-professional-v3276');
const ORIGIN='https://redlibertad.com';
const MAX_SAMPLE=100;
const USERNAME=/^[a-z0-9][a-z0-9._-]{0,63}$/i;

function simpleName(input,max=120){
 if(typeof input!=='string')return null;
 const value=input.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim();
 return value&&value.length<=max?value:null;
}
function sellerForOffer(row){
 if(row?.kind!=='product'||row?.deal!=='sale'||row?.status!=='active'||
  row?.moderation_status!=='published'||row?.seller_status!=='active'||
  row?.seller_discoverable!==true)return null;
 // A verified external-buy link can only refer to a store approved for this
 // listing. Do not claim the Marketplace is itself the merchant.
 const shopUrl=purchaseLink(row);
 const shopName=simpleName(row.professional_store_name);
 const origin=shopUrl&&normalizeStoreUrl(row.store_url);
 if(shopUrl&&origin&&shopName)
  return {'@type':'Organization',name:shopName,url:origin};
 // For chat-only ads, the PUBLIC seller profile is the only known identity.
 // Do not turn a creator's alias into a brand or a verified legal company.
 const username=String(row.seller_username||'');
 if(!USERNAME.test(username))return null;
 const publicName=simpleName(row.seller_name)||username;
 return {'@type':'Person',name:publicName,url:ORIGIN+'/perfil/'+encodeURIComponent(username)};
}

function productSignals(row){
 const d=row?.details&&typeof row.details==='object'&&!Array.isArray(row.details)?row.details:{};
 const brand=simpleName(d.brand,80);
 const gtin=validGtin(d.gtin);
 const mpn=simpleName(d.mpn,70);
 return {hasBrand:Boolean(brand),hasValidGtin:Boolean(gtin),hasMpn:Boolean(mpn)};
}
function merchantSample(rows=[]){
 const sample=Array.isArray(rows)?rows.slice(0,MAX_SAMPLE):[];
 const productSales=sample.filter(row=>row?.kind==='product'&&row?.deal==='sale');
 const tallies={withBrand:0,withValidGtin:0,withMpn:0,withoutAnyDeclaredBrandOrIdentifier:0};
 for(const row of productSales){
  const v=productSignals(row);
  if(v.hasBrand)tallies.withBrand++;
  if(v.hasValidGtin)tallies.withValidGtin++;
  if(v.hasMpn)tallies.withMpn++;
  if(!v.hasBrand&&!v.hasValidGtin&&!v.hasMpn)tallies.withoutAnyDeclaredBrandOrIdentifier++;
 }
 return {
  source:'recent_public_product_sale_sample',productsReviewed:productSales.length,
  sampleLimit:MAX_SAMPLE,...tallies,
  status:'informativo_no_bloqueante',
  note:'Son recuentos solo de productos en venta dentro de una muestra de hasta 100 anuncios públicos recientes. No equivalen a un informe de Google ni a la totalidad del catálogo.',
  shipping:'No se publican costes, destinos o plazos de entrega no verificados para cada vendedor.',
  returns:'No se declara una política de devoluciones común: cada vendedor debe confirmar sus condiciones reales antes de publicarlas.',
  identifiers:'No se infieren marcas ni GTIN del título, del diseño de una taza o de su procedencia de WooCommerce.'
 };
}
module.exports={ORIGIN,MAX_SAMPLE,USERNAME,simpleName,sellerForOffer,productSignals,merchantSample};
