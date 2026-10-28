'use strict';
// V3.4.2.1: reuse approved Marketplace/WooCommerce catalogues, no SerpApi requests.
// Never promote a suspended store, unpublished listing or unknown/outdated API stock.
const {purchaseLink}=require('./marketplace-professional-v3276');
function enrichLocalOffers(listings,approvedLinks){
 const byListing=new Map((Array.isArray(approvedLinks)?approvedLinks:[]).map(x=>[String(x.listing_id),x]));
 return (Array.isArray(listings)?listings:[]).map(r=>{
  const partner=byListing.get(String(r.id));
  const direct=partner?purchaseLink({
   kind:'product',deal:'sale',status:'active',moderation_status:'published',
   store_status:partner.store_status,purchase_enabled:partner.purchase_enabled,
   external_stock_status:partner.stock_status,external_source:partner.source,
   external_checked_at:partner.last_checked_at,store_url:partner.store_url,
   external_product_url:partner.product_url
  }):null;
  const photo=Array.isArray(r.image_urls)&&r.image_urls.length?'/marketplace/imagen/'+r.id+'/0':null;
  const standard='/marketplace/p/'+r.id+'/'+String(r.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,75);
  return {
   title:r.title,shop:direct?String(partner.store_name||'Tienda aprobada'):'RedLibertad · '+(r.display_name||r.username),
   price_cents:Number(r.price_cents),price_currency:'EUR',
   href:direct||standard,
   condition:r.details?.condition==='new'?'Nuevo':r.details?.condition==='used'?'Usado':'No indicado',
   image:photo,internal:true,listing_id:r.id,partner_store:Boolean(direct),partner_store_id:direct?partner.store_id:null
  };
 });
}
module.exports={enrichLocalOffers};
