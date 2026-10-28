'use strict';
// Clasificación conservadora: solamente títulos que declaran una avería.
// Nunca deducir que un móvil usado funciona si la ficha no lo especifica.
const MATCHERS=[
 ['No funciona',/\b(?:no funciona|sin funcionar|no enciende|no arranca|no operativo|inoperativo|not working|does not work|won t turn on)\b/],
 ['Para piezas',/\b(?:para piezas|solo piezas|por piezas|para despiece|despiece|para repuestos|para recambios|for parts|spares or repair)\b/],
 ['Para reparar',/\b(?:para reparar|necesita reparacion|a reparar|to repair)\b/],
 ['Averiado',/\b(?:averiado|averiada|defectuoso|defectuosa|estropeado|estropeada|danado|danada|faulty|broken|damaged)\b/],
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
  /\b(?:samsung|galaxy)\s+(?:galaxy\s+)?[saz]\s*\d{1,2}\b/.test(q);
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
function medianPrice(values){
 const list=values.filter(v=>Number.isSafeInteger(v)&&v>0).sort((a,b)=>a-b);
 if(!list.length)return 0;
 const i=Math.floor(list.length/2);
 return list.length%2?list[i]:(list[i-1]+list[i])/2;
}
function groupOffers(query,offers){
 const main=[],repair=[],accessories=[],review=[];
 const explicitRepair=isRepairSearch(query),phone=isPhoneSearch(query)&&!isAccessorySearch(query);
 for(const offer of Array.isArray(offers)?offers:[]){
  if(!explicitRepair&&repairReason(offer)){repair.push(offer);continue;}
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
 return {main,repair,accessories,review};
}
module.exports={normalize,repairReason,isRepairSearch,groupOffers,accessoryReason,isAccessorySearch,isPhoneSearch,deviceEvidence};
