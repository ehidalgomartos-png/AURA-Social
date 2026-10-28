'use strict';
// V3.4.4.9 — Informar del DESTINO real del botón, sin afirmar stock ni compra.
// No se abre ningún enlace ni se hacen búsquedas. Solo datos que ya están en la ficha.
function safeHost(href){
 try{
  const u=new URL(href);
  if(u.protocol!=='https:'||u.username||u.password)return null;
  return u.hostname.toLowerCase();
 }catch(_){return null;}
}
function describeDestination(offer,link,merchant){
 if(link?.destination==='internal'){
  return {note:'Anuncio de RedLibertad',
   ariaLabel:'Ver anuncio en RedLibertad: '+String(offer?.title||'Producto').slice(0,100)};
 }
 if(link?.destination==='shopping-search'){
  return {note:'Búsqueda en Google: puede mostrar ofertas diferentes',
   ariaLabel:'Buscar en Google otras ofertas para '+String(offer?.title||'este producto').slice(0,100)};
 }
 const host=safeHost(link?.href);
 if(!host||!merchant)return {note:'Destino de la oferta sin confirmar',ariaLabel:'Consultar destino de oferta'};
 const title=String(offer?.shop||'tienda').trim().slice(0,75)||'tienda';
 const context=offer?.partner_store?'Compra en la web del comercio':
  offer?.manual_link?'Enlace revisado por administración':
  offer?.sponsored?'Publicidad de Google':'Enlace directo del vendedor';
 return {
  note:context+' · '+host,
  ariaLabel:'Ver oferta de '+title+' en '+host
 };
}
module.exports={safeHost,describeDestination};
