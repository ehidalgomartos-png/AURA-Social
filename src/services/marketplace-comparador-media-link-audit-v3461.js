'use strict';
// V3.4.6.1 — inventario accionable de imágenes y destinos a partir de ofertas
// YA GUARDADAS. No usa APIs ni acepta enlaces externos no verificados.
const provider=require('./marketplace-comparador-provider-v32133');
const {validOfferPhoto}=require('./marketplace-comparador-image-confidence-v3433');
const review=require('./marketplace-comparador-photo-review-v3441');
function summary(page){
 const offers=(Array.isArray(page?.external_results)?page.external_results:[]).filter(o=>o&&!o.internal&&
  provider.titleMatches(page.query_text,o.title));
 const photos=offers.filter(o=>Boolean(validOfferPhoto(page.query_text,o)));
 const candidates=review.candidates(page);
 const direct=offers.filter(o=>provider.resolveOfferLink(o)?.destination==='store');
 const vendorCount=new Set(offers.map(o=>String(o.shop||'').trim().toLowerCase()).filter(Boolean)).size;
 const noPhoto=photos.length===0, noDirect=direct.length===0;
 return {
  total:offers.length,photoCount:photos.length,candidateCount:candidates.length,
  directCount:direct.length,vendorCount,noPhoto,noDirect,
  photoAction:noPhoto?candidates.length>0?
   'Hay fotografías candidatas para revisar. Confirma visualmente que no sean accesorios ni otros modelos.':
   'No existe una fotografía verificada para esta búsqueda. La ilustración de categoría seguirá visible hasta comprobar una foto auténtica.':
   'Ya hay fotografías de ofertas que superan el filtro conservador; revisa si representan correctamente este modelo.',
  linkAction:noDirect?
   'Los enlaces guardados no llevan directamente a un producto de la tienda. Revisa las ofertas y añade únicamente URLs comprobadas del vendedor.':
   'Hay enlaces HTTPS directos guardados. Comprueba que sigan apuntando al producto y precio adecuados.'
 };
}
function queue(items,filter){
 const entries=(Array.isArray(items)?items:[]).map((value,index)=>({...value,originalIndex:index}));
 const counts={todas:entries.length,'sin-foto':entries.filter(x=>x.audit.noPhoto).length,
  'sin-enlace':entries.filter(x=>x.audit.noDirect).length};
 const selected=Object.hasOwn(counts,filter)?filter:'todas';
 return {selected,counts,rows:entries.filter(x=>
  selected==='todas'||selected==='sin-foto'&&x.audit.noPhoto||
  selected==='sin-enlace'&&x.audit.noDirect).sort((a,b)=>
   Number(b.audit.noPhoto)-Number(a.audit.noPhoto)||
   Number(b.audit.noDirect)-Number(a.audit.noDirect)||a.originalIndex-b.originalIndex)};
}
module.exports={summary,queue};
