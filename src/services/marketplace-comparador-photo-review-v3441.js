'use strict';
// Selección humana de una foto YA presente en una oferta guardada.
// No permite añadir URLs arbitrarias ni subir imágenes; no realiza consultas externas.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const keys=require('./marketplace-comparador-link-diagnostics-v32146');

function candidates(page){
 const query=page?.query_text;
 if(!provider.isSpecificModel(query||''))return [];
 const rows=(Array.isArray(page?.external_results)?page.external_results:[]).filter(o=>
  o&&!o.internal&&provider.titleMatches(query,o.title)&&!quality.accessoryReason(o));
 return quality.groupOffers(query,rows).main.filter(o=>Boolean(provider.safeImage(o.image)))
  .slice(0,40).map(o=>({key:keys.keyFor(o),image:provider.safeImage(o.image),
   title:String(o.title).slice(0,200),shop:String(o.shop||'Vendedor').slice(0,100)}));
}
function selected(page,record,offers){
 if(!record||!record.offer_key||!record.image_url)return null;
 const allowed=candidates({...page,external_results:offers});
 const match=allowed.find(o=>o.key===record.offer_key&&o.image===record.image_url);
 return match?{image:match.image,title:match.title,reviewed:true}:null;
}
module.exports={candidates,selected};
