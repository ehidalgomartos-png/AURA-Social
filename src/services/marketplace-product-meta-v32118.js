'use strict';
// V3.2.118 — Factual server-rendered metadata for PUBLIC product-sale pages.
// No AI copy, no inferred stock/delivery and no modification of source listings.
// Google may generate its own snippets, independently of these suggestions.
const {readableDescription}=require('./marketplace-description-v3267');
const {publicLocation,nationalSale,originLocation}=require('./marketplace-coverage-v3261');
const TITLE_LIMIT=78,DESCRIPTION_LIMIT=160;
function clean(value){
 return readableDescription(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function clipped(text,limit){
 const raw=clean(text);
 if(raw.length<=limit)return raw;
 const cut=raw.slice(0,limit-1);
 const last=cut.lastIndexOf(' ');
 return (last>=Math.floor(limit*0.6)?cut.slice(0,last):cut).replace(/[ ,;:|.\-–—]+$/,'')+'…';
}
function euro(cents){
 const n=Number(cents);
 if(!Number.isSafeInteger(n)||n<0)return '';
 return (n/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
}
function dedupeLocation(value){
 return clean(value).replace(/\s*·\s*/g,', ').replace(/\s+/g,' ');
}
function titleFor(row){
 const product=clean(row?.title)||'Producto anunciado';
 const origin=dedupeLocation(originLocation(row));
 // For country-wide offers without a physical origin we use the truthful
 // coverage indicator, not an invented seller city or shipping guarantee.
 const place=origin||((nationalSale(row))?'España':dedupeLocation(publicLocation(row)));
 const brand='RedLibertad';
 const suffix=' | '+(place?place+' | ':'')+brand;
 const limit=Math.max(25,TITLE_LIMIT-suffix.length);
 return clipped(product,limit)+suffix;
}
function descriptionFor(row,{externalPurchase=false}={}){
 const title=clean(row?.title)||'Producto';
 const amount=euro(row?.price_cents);
 const condition=row?.details?.condition==='new'?'Nuevo. ':row?.details?.condition==='used'?'Usado. ':'';
 const place=dedupeLocation(originLocation(row))||(
  nationalSale(row)?'Venta anunciada para España':dedupeLocation(publicLocation(row))
 );
 const parts=[
  title+(amount?' — '+amount+'.':'.'),
  condition.trim(),
  place?place+'.':'',
  externalPurchase?'Compra en la web del vendedor.':'Consulta el anuncio y contacta con el vendedor.'
 ];
 // If there is room, prefer an authentic brief seller description, but avoid
 // boilerplate duplication and never invent condition, stock or shipping.
 const summary=clean(row?.description);
 const base=parts.filter(Boolean).join(' ');
 if(summary&&base.length+summary.length+1<=DESCRIPTION_LIMIT)
  return base+' '+summary;
 return clipped(base,DESCRIPTION_LIMIT);
}
function forListing(row,opts={}){
 if(row?.kind!=='product'||row?.deal!=='sale')return null;
 return {title:titleFor(row),description:descriptionFor(row,opts)};
}
module.exports={TITLE_LIMIT,DESCRIPTION_LIMIT,clean,clipped,euro,titleFor,descriptionFor,forListing};
