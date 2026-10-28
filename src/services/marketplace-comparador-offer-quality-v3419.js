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
function groupOffers(query,offers){
 const main=[],repair=[];
 const explicit=isRepairSearch(query);
 for(const offer of Array.isArray(offers)?offers:[]){
  if(!explicit&&repairReason(offer))repair.push(offer);
  else main.push(offer);
 }
 // Ordenados por precio pero sin mezclar anuncios expresamente averiados
 // con ofertas para uso normal. Si el visitante busca averías, las ve igual.
 return {main,repair};
}
module.exports={normalize,repairReason,isRepairSearch,groupOffers};
