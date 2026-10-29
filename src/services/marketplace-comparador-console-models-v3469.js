'use strict';
// V3.4.6.9. Modelos completos de consola: no son categorías genéricas.
// Sin APIs, costes externos ni heurísticas amplias. Solo dos referencias conocidas.
const quality=require('./marketplace-comparador-offer-quality-v3419');
function normalized(value){return quality.normalize(value);}
function consoleModel(query){
 const q=normalized(query);
 if(/^(?:sony )?(?:playstation 5|ps5) pro(?: 2 tb)?$/.test(q))return 'ps5-pro';
 if(/^(?:nintendo )?switch(?: modelo)? oled(?: 64 gb)?$/.test(q))return 'switch-oled';
 return null;
}
const CONSOLE_EXTRAS=/\b(?:pack|bundle|kit|lote|juego incluido|incluye juego|con juego|game included|with game|sin consola|solo consola rota|solo mando|controller only|digital code|codigo digital|tarjeta regalo|gift card|micro sd|microsd|lector externo|disc drive|disk drive|ssd upgrade|skin|protective shell)\b/;
function offerMatches(query,title){
 const type=consoleModel(query);
 if(!type)return false;
 const t=normalized(title);
 if(!t||CONSOLE_EXTRAS.test(t)||quality.accessoryReason({title})||
  quality.repairReason({title}))return false;
 if(type==='ps5-pro'){
  if(!/\b(?:playstation 5|ps5) pro\b/.test(t))return false;
  if(/\b(?:ps4|ps6|playstation 4|playstation 6|slim|portal|pro max|pro plus|standard edition)\b/.test(t))return false;
  // Un modelo de 1 TB no se puede anunciar como PS5 Pro estándar de 2 TB.
  if(/\b(?:1 tb|500 gb|512 gb|825 gb)\b/.test(t))return false;
 }else{
  if(!/\bswitch(?: modelo)? oled\b/.test(t))return false;
  if(/\b(?:switch 2|switch2|lite|switch v1|switch v2|solo pantalla|tablet only)\b/.test(t))return false;
  // 64 GB es la referencia habitual de esta consola, no una nueva gama.
  // Rechazar ampliaciones implícitas: no aceptar como SKU básico un kit de memoria.
  if(/\b(?:128|256|512|1024) gb\b/.test(t))return false;
 }
 return true;
}
module.exports={consoleModel,offerMatches};
