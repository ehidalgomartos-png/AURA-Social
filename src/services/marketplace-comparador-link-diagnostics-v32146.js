'use strict';
// Diagnóstico solo para administración. No realiza peticiones de red ni consulta SerpApi.
const crypto=require('node:crypto');
const provider=require('./marketplace-comparador-provider-v32133');
const DAY_MS=24*60*60*1000, CHECK_MS=2*60*1000;

function keyFor(offer){
 return crypto.createHash('sha256').update([
  String(offer?.product_id||''),String(offer?.shop||''),
  String(offer?.title||''),String(offer?.price_cents||'')
 ].join('|')).digest('hex');
}
function currentRecord(record,now=Date.now()){
 if(!record||!record.checked_at)return null;
 const elapsed=now-new Date(record.checked_at).getTime();
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=DAY_MS)return null;
 if(record.status==='checking'&&elapsed>=CHECK_MS)return null;
 return record;
}
function diagnosis(offer,record=null,quota=null,now=Date.now()){
 if(!offer||typeof offer!=='object')return {status:'unavailable',label:'Oferta no válida',description:'Faltan datos de la oferta'};
 if(offer.internal)return {status:'internal',label:'Anuncio de RedLibertad',description:'Acceso directo al anuncio del Marketplace'};
 const direct=provider.resolveOfferLink(offer);
 if(direct?.destination==='store')return {status:'direct',label:'Enlace directo disponible',description:'Dirección HTTPS proporcionada por la fuente',href:direct.href};
 const cache=currentRecord(record,now);
 if(cache?.status==='ok'){
  const resolved=provider.resolveOfferLink({...offer,resolved_href:cache.href});
  if(resolved?.destination==='store')return {
   status:'verified',label:'Enlace comprobado',description:'URL obtenida en una comprobación anterior; precio y disponibilidad pueden cambiar',href:resolved.href
  };
 }
 if(!provider.canLookupSeller(offer))return {status:'peer',label:'Sin enlace individual',description:'Portal de particulares: no repetir comprobaciones Google Product'};
 if(cache?.status==='checking')return {status:'checking',label:'Comprobación en curso',description:'No se debe duplicar la consulta'};
 if(cache?.status==='unavailable'||cache?.status==='ok')return {status:'unavailable',label:'Sin enlace comprobado',description:'La última verificación no obtuvo una URL válida para esta oferta'};
 if(!provider.hasProductReference(offer))return {status:'identifier',label:'Falta identificador de oferta',description:'SerpApi no entregó ni un product_id válido ni un page_token utilizable'};
 if(quota?.reason==='disabled'||quota?.reason==='not_configured')return {status:'disabled',label:'Servicio no configurado',description:'Las comprobaciones externas no están habilitadas'};
 if(quota?.available===false)return {status:'quota',label:'Pendiente por presupuesto',description:'Se podrá comprobar si vuelve a existir cuota disponible'};
 return {status:'ready',label:'Comprobación disponible',description:'Requiere una consulta voluntaria; no asegura obtener enlace'};
}
function pageDiagnostics(page,cache=new Map(),quota=null,now=Date.now()){
 const offers=(Array.isArray(page?.external_results)?page.external_results:[]).filter(o=>
  o&&!o.internal&&provider.titleMatches(page.query_text,o.title)&&Number.isSafeInteger(Number(o.price_cents))&&Number(o.price_cents)>0
 );
 return offers.map(o=>({offer:o,...diagnosis(o,cache.get(keyFor(o)),quota,now)}));
}
function keysToCheck(pages){
 const keys=new Set();
 for(const page of pages||[]){
  for(const o of (Array.isArray(page?.external_results)?page.external_results:[])){
   if(!o||o.internal||!provider.titleMatches(page.query_text,o.title))continue;
   if(provider.resolveOfferLink(o)?.destination==='store')continue;
   // Las ofertas antiguas también pueden tener caché sin identificador.
   keys.add(keyFor(o));
  }
 }
 return [...keys].slice(0,1500);
}
module.exports={keyFor,currentRecord,diagnosis,pageDiagnostics,keysToCheck};
