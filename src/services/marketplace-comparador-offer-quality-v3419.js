'use strict';
// Clasificación conservadora: solamente títulos que declaran una avería.
// Nunca deducir que un móvil usado funciona si la ficha no lo especifica.
const MATCHERS=[
 ['No funciona',/\b(?:no funciona|sin funcionar|no enciende|no arranca|no operativo|inoperativo|not working|does not work|won t turn on)\b/],
 ['Para piezas',/\b(?:para piezas|solo piezas|por piezas|para despiece|despiece|para repuestos|para recambios|for parts|spares or repair)\b/],
 ['Para reparar',/\b(?:para reparar|para arreglar|necesita reparacion|necesita arreglo|a reparar|to repair)\b/],
 ['Averiado',/\b(?:averiado|averiada|defectuoso|defectuosa|estropeado|estropeada|danado|danada|roto|rota|rotos|rotas|inservible|inutilizable|faulty|broken|damaged)\b/],
 ['Dañado',/\b(?:pantalla rota|pantalla partida|pantalla quebrada|pantalla danada|pantalla rajada|bateria hinchada|broken screen)\b/]
];
function normalize(x){
 return String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[’']/g,' ').replace(/[\W_]+/g,' ').replace(/\s+/g,' ').trim();
}
function repairReason(offer){
 const text=normalize(String(offer?.title||'')+' '+String(offer?.condition||''));
 const found=MATCHERS.find(([,re])=>re.test(text));
 return found?found[0]:null;
}
function isRepairSearch(query){
 const t=normalize(query);
 return MATCHERS.some(([,re])=>re.test(t));
}
// V3.4.3.7: no confundir un teléfono con una funda, una caja o un accesorio.
// Las ofertas dudosas se conservan para revisión, pero no forman el precio del móvil.
const ACCESSORIES=[
 ['Funda o carcasa',/\b(?:fundas?|carcasas?|estuches?|bumper|cases?|covers?|skins?|pegatinas?|stickers?)\b/],
 ['Protector de pantalla',/\b(?:protectores?|protectors?|cristal(?:es)? templad(?:o|os)|laminas?|hidrogel|tempered glass|screen protector)\b/],
 ['Cargador o accesorio',/\b(?:cargadores?|chargers?|cables?|adaptadores?|adapters?|soportes?|holders?|power bank|auriculares?|earbuds|headphones|correas?)\b/],
 ['Repuesto o embalaje',/\b(?:repuestos?|recambios?|replacement|digitalizador|pantalla de recambio|bateria de repuesto|spare parts|solo caja|caja vacia|empty box|box only|retail box|packaging|embalaje|dummy|maqueta|replica)\b/],
 ['Accesorio compatible',/\b(?:compatible con|designed for|case for|cover for|proteccion para)\b/]
];
function accessoryReason(offer){
 const text=normalize(offer?.title);
 return ACCESSORIES.find(([,regex])=>regex.test(text))?.[0]||null;
}
function isAccessorySearch(query){return Boolean(accessoryReason({title:query}));}
function isPhoneSearch(query){
 const q=normalize(query);
 return /\biphone\s*\d{1,2}\b/.test(q)||
  /\b(?:samsung|galaxy)\s+(?:galaxy\s+)?[saz]\s*\d{1,2}\b/.test(q)||
  /\b(?:xiaomi\s+)?redmi\s+note\s+\d{1,2}\b/.test(q)||
  /\b(?:xiaomi\s+)?poco\s+[fxm]\s*\d{1,2}\b/.test(q);
}
function isSamsungSearch(query){
 const q=normalize(query);
 return /\b(?:samsung|galaxy)\s+(?:galaxy\s+)?[saz]\s*\d{1,2}\b/.test(q);
}
function deviceEvidence(query,offer){
 if(!isSamsungSearch(query))return true;
 const title=normalize(offer?.title);
 return /\b(?:smartphone|telefono|movil|moviles|handset|mobile phone|dual sim|unlocked)\b/.test(title)||
  /\bgalaxy\s+[saz]\s*\d{1,2}\b/.test(title)||
  /\b(?:samsung|galaxy)\b.*\b[saz]\s*\d{1,2}\b.*\b(?:64|128|256|512|1024)\s*(?:gb|g|tb)\b/.test(title);
}
// Identifica un calzado New Balance con número de modelo; no generaliza a zapatos
// mezclados de marcas distintas ni a consultas «zapatillas mujer» genéricas.
function footwearFamily(query){
 const q=normalize(query);
 return /\bnew balance\s+\d{2,4}[a-z]{0,3}\b/.test(q) &&
  /\b(?:zapatillas|deportivas|sneakers|calzado|mujer|hombre|unisex)\b/.test(q);
}
function footwearGenderCompatible(query,title){
 if(!footwearFamily(query))return true;
 const q=normalize(query),t=normalize(title);
 const women=/\b(?:mujer|mujeres|femenino|femenina|women|womens|woman|ladies|dama)\b/;
 const men=/\b(?:hombre|hombres|masculino|masculina|men|mens|man)\b/;
 const unisex=/\bunisex\b/;
 if(women.test(q)&&men.test(t)&&!women.test(t)&&!unisex.test(t))return false;
 if(men.test(q)&&women.test(t)&&!men.test(t)&&!unisex.test(t))return false;
 return true;
}
function footwearModelCompatible(query,title){
 if(!footwearFamily(query))return true;
 const requested=normalize(query).match(/\bnew balance\s+(\d{2,4}[a-z]{0,3})\b/);
 const observed=normalize(title).match(/\bnew balance\s+(\d{2,4}[a-z]{0,3})\b/);
 return Boolean(requested&&observed&&requested[1]===observed[1]);
}
function medianPrice(values){
 const list=values.filter(v=>Number.isSafeInteger(v)&&v>0).sort((a,b)=>a-b);
 if(!list.length)return 0;
 const i=Math.floor(list.length/2);
 return list.length%2?list[i]:(list[i-1]+list[i])/2;
}
// V3.4.6.11: cuotas periódicas no son precios de adquisición.
// Grover comercializa alquiler tecnológico; detectar también las menciones
// explícitas al alquiler en otros comercios. Nunca deducir precio de compra
// dividiendo/multiplicando cuotas, ni ocultar la oferta original.
function rentalReason(o){
 if(!o||o.internal)return null;
 const merchant=normalize(o.shop);
 const url=String(o.href||o.resolved_href||'');
 let groverHost=false;
 try{
  const parsed=new URL(url);
  groverHost=parsed.protocol==='https:'&&
   (parsed.hostname.toLowerCase()==='grover.com'||
    parsed.hostname.toLowerCase().endsWith('.grover.com'));
 }catch(_){}
 if(merchant==='grover'||merchant==='grover es'||merchant==='grover com'||groverHost)
  return 'Alquiler de tecnología (Grover): cuota periódica, no precio de compra';
 const title=normalize([o.title,o.price_label,o.price_period,o.billing_period].filter(Boolean).join(' '));
 if(/\b(?:alquiler|alquilar|alquila|renting|rental|rentals|rent|suscripcion|subscription|mensual|monthly)\b/.test(title)||
  /\b(?:por mes|al mes|per month|cada mes)\b/.test(title)||
  /(?:€|eur)\s*\/\s*(?:mes|month)|\/\s*(?:mes|month)\b/i.test(String(o.title||'')))
  return 'Oferta de alquiler o suscripción, no precio de compra';
 return null;
}
// V3.4.6.12 — Roborock S8 básico no es S8+, S8 Pro, S8 Max ni Ultra.
// Separar anuncios de variantes en revisión sin borrarlos; solo este modelo
// exacto, no extender heurísticas a otros fabricantes.
function roborockBase(query){
 return normalize(query)==='robot aspirador roborock s8';
}
function roborockCompatible(title){
 const raw=String(title||'');
 const t=normalize(raw);
 return /\broborock\s+s8\b/.test(t)&&
  !/\bs8\s*\+/.test(raw.toLowerCase())&&
  !/\bs8\s+(?:pro|plus|max|ultra|v|maxv)\b/.test(t)&&
  !/\b(?:recambio|filtro|bolsas|mopas|accesorios|compatible con)\b/.test(t);
}
function groupOffers(query,offers){
 const main=[],repair=[],accessories=[],review=[],rentals=[];
 const explicitRepair=isRepairSearch(query),phone=isPhoneSearch(query)&&!isAccessorySearch(query);
 for(const offer of Array.isArray(offers)?offers:[]){
  if(roborockBase(query)&&!roborockCompatible(offer?.title)){
   review.push({...offer,quality_reason:'Variante distinta de Roborock S8 (Pro/Max/Ultra/Plus) o artículo no confirmado'});
   continue;
  }
  const rental=rentalReason(offer);
  if(rental){
   rentals.push({...offer,quality_reason:rental});
   continue;
  }
  if(!explicitRepair&&repairReason(offer)){repair.push(offer);continue;}
  if(footwearFamily(query)&&(!footwearModelCompatible(query,offer.title)||
   !footwearGenderCompatible(query,offer.title))){
   review.push({...offer,quality_reason:'Modelo o público distinto del calzado buscado'});
   continue;
  }
  const accessory=phone?accessoryReason(offer):null;
  if(accessory){accessories.push({...offer,quality_reason:accessory});continue;}
  if(phone&&!deviceEvidence(query,offer)){
   review.push({...offer,quality_reason:'No confirma que sea el teléfono'});continue;
  }
  main.push(offer);
 }
 // Un precio varias veces inferior al resto puede ser un accesorio mal titulado
 // o una oferta excepcional. No se inventa su categoría: queda visible "a revisar".
 if(phone&&main.length>=2){
  const reference=medianPrice(main.map(o=>o.price_cents));
  if(reference>=15000){
   for(let i=main.length-1;i>=0;i--){
    const o=main[i];
    if(Number.isSafeInteger(o.price_cents)&&o.price_cents<reference*.30){
     review.push({...o,quality_reason:'Precio atípico: confirmar producto y estado'});
     main.splice(i,1);
    }
   }
  }
 }
 // V3.4.6.10: al comparar PlayStation 5 Pro no usar un único anuncio
 // extremadamente anómalo como precio mínimo/máximo. Solo se separa
 // con al menos 4 vendedores y 3 ofertas limpias/coherentes restantes.
 // Con 2-3 ofertas dispares NO hay certeza suficiente: sigue noindex.
 if(/^(?:sony )?(?:playstation 5|ps5) pro(?: 2 tb)?$/.test(normalize(query))&&main.length>=4){
  const clean=o=>o && !o.internal && !o.sponsored && o.price_currency==='EUR' &&
   Number.isSafeInteger(o.price_cents)&&o.price_cents>0 &&
   ['','Nuevo','No indicado','Consultar estado'].includes(String(o.condition||'')) &&
   !/\b(?:usado|reacondicionado|used|refurbished|bundle|pack|juego|funda|mando|accesorio|lector externo|disc drive)\b/.test(normalize(o.title)) &&
   /\b(?:playstation 5|ps5) pro\b/.test(normalize(o.title)) &&
   typeof o.shop==='string'&&o.shop.trim()&&
   typeof o.href==='string'&&/^https:\/\//i.test(o.href);
  if(main.every(clean)){
   const shops=new Set(main.map(o=>normalize(o.shop)));
   if(shops.size>=4){
    const mid=medianPrice(main.map(o=>o.price_cents));
    const extreme=main.filter(o=>o.price_cents<mid*.40||o.price_cents>mid*2.75);
    if(extreme.length===1){
     const others=main.filter(o=>o!==extreme[0]);
     const sellers=new Set(others.map(o=>normalize(o.shop)));
     const values=others.map(o=>o.price_cents);
     if(sellers.size>=3&&Math.max(...values)/Math.min(...values)<=2){
      review.push({...extreme[0],quality_reason:'Precio extremo de consola pendiente de confirmar; fuera del mínimo comparable'});
      main.splice(main.indexOf(extreme[0]),1);
     }
    }
   }
  }
 }
 // V3.4.6.7: excluir SOLO una anomalía extrema de una familia identificable
 // si hay al menos cuatro vendedores y quedan tres vendedores coherentes.
 // No eliminarla: aparecerá como anuncio relacionado pendiente de revisión.
 // Un simple descuento no activa esta regla si la disparidad es moderada.
 if(footwearFamily(query)&&main.length>=4){
  const eligible=main.filter(o=>Number.isSafeInteger(o.price_cents)&&o.price_cents>0);
  const shops=new Set(eligible.map(o=>normalize(o.shop)).filter(Boolean));
  if(eligible.length===main.length&&shops.size>=4){
   const median=medianPrice(eligible.map(o=>o.price_cents));
   const suspects=eligible.filter(o=>o.price_cents<median*.40||o.price_cents>median*2.75);
   if(suspects.length===1){
    const remaining=eligible.filter(o=>o!==suspects[0]);
    const restShops=new Set(remaining.map(o=>normalize(o.shop)).filter(Boolean));
    const prices=remaining.map(o=>o.price_cents);
    if(restShops.size>=3&&Math.max(...prices)/Math.min(...prices)<=2.5){
     const index=main.indexOf(suspects[0]);
     if(index!==-1){
      review.push({...suspects[0],quality_reason:'Precio extremo pendiente de confirmar; separado del mínimo comparable'});
      main.splice(index,1);
     }
    }
   }
  }
 }
 return {main,repair,accessories,review,rentals};
}
module.exports={normalize,repairReason,isRepairSearch,groupOffers,rentalReason,roborockBase,roborockCompatible,accessoryReason,isAccessorySearch,isPhoneSearch,deviceEvidence,footwearFamily,footwearGenderCompatible,footwearModelCompatible};
