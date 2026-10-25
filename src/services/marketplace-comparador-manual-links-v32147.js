'use strict';
// Enlaces confirmados por un administrador: se almacenan separados de las
// respuestas del proveedor para sobrevivir a nuevas consultas y precios.
const crypto=require('node:crypto');
const {isIP}=require('node:net');
const provider=require('./marketplace-comparador-provider-v32133');
const ID=/^[a-f0-9]{64}$/;
function identityKey(offer){
 if(!offer||!offer.title||!offer.shop)return null;
 const normalized=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 // El precio NO forma parte de la identidad. Puede cambiar al refrescar.
 const product=/^\d{8,30}$/.test(String(offer.product_id||''))?String(offer.product_id):'';
 return crypto.createHash('sha256').update([normalized(offer.shop),normalized(offer.title),
  normalized(offer.condition),product].join('|')).digest('hex');
}
function merchantUrl(value,shop){
 if(typeof value!=='string'||value.length>2048||value!==value.trim()||!/^https:\/\//i.test(value))return null;
 let u;
 try{u=new URL(value);}catch(_){return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash)return null;
 const host=u.hostname.toLowerCase();
 if(isIP(host)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
  host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||
  !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host))return null;
 if(provider.isGoogleHost(host)||/^(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|cutt\.ly)$/.test(host))return null;
 const labels=host.split('.');
 const main=labels.at(-2);
 // Un dominio del atacante como "pixmania.ejemplo.com" no debe superar
 // esta comprobación: solo se compara la etiqueta principal registrada.
 const shopName=String(shop||'').trim().split(/\s+[·|—–-]\s+/)[0]
  .replace(/\.(?:es|com|net|org|eu)$/i,'')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!shopName||shopName.length<3||shopName!==main.replace(/[^a-z0-9]/g,''))return null;
 if(u.pathname==='/'&&!u.search)return null;
 return u.href;
}
function validIdentity(key){return typeof key==='string'&&ID.test(key);}
function findOffer(page,key){
 if(!validIdentity(key))return null;
 const offers=Array.isArray(page?.external_results)?page.external_results:[];
 return offers.find(o=>o&&!o.internal&&Number.isSafeInteger(o.price_cents)&&o.price_cents>0&&
  provider.titleMatches(page.query_text,o.title)&&identityKey(o)===key)||null;
}
function storedLink(offer,record){
 if(!record||!offer)return null;
 return merchantUrl(record.href,offer.shop);
}
function applyManualLinks(page,offers,rows){
 const map=new Map((rows||[]).map(r=>[r.offer_key,r]));
 for(const o of offers){
  if(o.internal)continue;
  const record=map.get(identityKey(o)),href=storedLink(o,record);
  if(href){o.resolved_href=href;o.manual_link=true;}
 }
 return offers;
}
module.exports={identityKey,merchantUrl,validIdentity,findOffer,storedLink,applyManualLinks};
