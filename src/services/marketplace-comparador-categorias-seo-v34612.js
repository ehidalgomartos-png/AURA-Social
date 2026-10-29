'use strict';
// V3.4.6.12 — categorías editoriales estrictamente identificadas:
// no presentarlas como una compra del mismo SKU ni indexarlas sin variedad real.
// No consulta Google, altera ofertas ni consume SerpApi.
const quality=require('./marketplace-comparador-offer-quality-v3419');
const CATEGORY_RULES=[
 {query:/^zapatillas skechers mujer$/,kind:'calzado',min:2000,max:35000,
  name:'Zapatillas Skechers para mujer',
  lines:[['Go Walk',/\bgo walk\b/],['Arch Fit',/\barch fit\b/],["D'Lites",/\bd lites\b/],
   ['Uno',/\buno\b/],['Summits',/\bsummits\b/],['Graceful',/\bgraceful\b/],
   ['Flex Appeal',/\bflex appeal\b/],['Ultra Flex',/\bultra flex\b/],
   ['Bobs',/\bbobs\b/],['Slip-ins',/\bslip ins\b/]]},
 {query:/^chaqueta (?:the )?north face hombre$/,kind:'ropa',min:3000,max:150000,
  name:'Chaquetas The North Face para hombre',
  lines:[['Antora',/\bantora\b/],['Quest',/\bquest\b/],['Resolve',/\bresolve\b/],
   ['Sangro',/\bsangro\b/],['Evolve',/\bevolve\b/],['Nuptse',/\bnuptse\b/],
   ['Aconcagua',/\baconcagua\b/],['Thermoball',/\bthermoball\b/]]}
];
function rule(query){
 const q=quality.normalize(query);
 return CATEGORY_RULES.find(r=>r.query.test(q))||null;
}
function series(ruleItem,title){
 const t=quality.normalize(title);
 return ruleItem?.lines.find(([,re])=>re.test(t))?.[0]||null;
}
function suitable(query,offer){
 const r=rule(query);
 if(!r||!offer)return false;
 const t=quality.normalize(offer.title);
 const genderMale=/\b(?:hombre|hombres|men|mens|masculino|masculina)\b/;
 const genderFemale=/\b(?:mujer|mujeres|women|womens|femenino|femenina)\b/;
 const isUnisex=/\bunisex\b/.test(t);
 if(r.kind==='calzado'){
  if(!/\bskechers\b/.test(t) || !series(r,t) ||
   genderMale.test(t)&&!genderFemale.test(t)&&!isUnisex)return false;
  if(/\b(?:hombre|bota de seguridad|sandalia|infantil|nino|nina|kids)\b/.test(t)&&
   !genderFemale.test(t)&&!isUnisex)return false;
 }else{
  if(!/\bnorth face\b/.test(t)||!series(r,t)||
   genderFemale.test(t)&&!genderMale.test(t)&&!isUnisex)return false;
  if(/\b(?:mujer|mujeres|kids|nino|nina|infantil)\b/.test(t)&&
   !genderMale.test(t)&&!isUnisex)return false;
  if(!/\b(?:chaqueta|jacket|anorak|abrigo|cortavientos|parka|puffer)\b/.test(t))return false;
 }
 return offer.price_cents>=r.min&&offer.price_cents<=r.max &&
  !quality.accessoryReason(offer)&&!quality.rentalReason(offer)&&
  !quality.repairReason(offer);
}
function evidence(query,offers){
 const r=rule(query);
 if(!r)return {eligible:false,reason:'No se reconoce una categoría editorial',lines:[]};
 const seen=new Map(),shops=new Set();
 for(const offer of Array.isArray(offers)?offers:[]){
  if(!suitable(query,offer))continue;
  const line=series(r,offer.title);
  if(!line)continue;
  shops.add(quality.normalize(offer.shop));
  const item=seen.get(line)||{name:line,count:0,shops:new Set()};
  item.count++;item.shops.add(quality.normalize(offer.shop));
  seen.set(line,item);
 }
 const lines=[...seen.values()].map(x=>({name:x.name,count:x.count,sellers:x.shops.size}));
 const good=(Array.isArray(offers)?offers:[]).filter(o=>suitable(query,o));
 const valid=good.length>=4&&shops.size>=3&&lines.length>=2;
 return {eligible:valid,reason:valid?'Categoría con modelos identificados':
  good.length<4?'Faltan al menos cuatro ofertas coherentes de esta categoría':
  shops.size<3?'Faltan tres comercios distintos para esta categoría':
  'Faltan dos líneas de producto identificables; no indexar una lista genérica',
  name:r.name,lines,sellerCount:shops.size,offers:good};
}
// ASUS ROG Strix «gaming» agrupa G15/G16/G17, no un único portátil.
// Un rango de precios entre MODELOS distintos es legítimo solo con pruebas
// explícitas de distintos números de modelo, y nunca anuncia AggregateOffer.
function asusFamily(query){return quality.normalize(query)==='portatil asus rog strix gaming';}
function asusEvidence(offers){
 const clean=(Array.isArray(offers)?offers:[]).filter(o=>
  o&&Number.isSafeInteger(o.price_cents)&&o.price_cents>=30000&&o.price_cents<=600000 &&
  !quality.accessoryReason(o)&&!quality.rentalReason(o)&&!quality.repairReason(o));
 const lines=new Map(),shops=new Set();
 for(const o of clean){
  const title=quality.normalize(o.title);
  if(!/\basus\b/.test(title)||!/\brog\b/.test(title)||!/\bstrix\b/.test(title))continue;
  const model=title.match(/\bg(?:15|16|17|18)\b/)?.[0];
  if(!model)continue;
  const label=model.toUpperCase();
  lines.set(label,(lines.get(label)||0)+1);
  shops.add(quality.normalize(o.shop));
 }
 const prices=clean.map(o=>o.price_cents);
 const coherent=prices.length>=4&&Math.max(...prices)/Math.min(...prices)<=8;
 const eligible=coherent&&shops.size>=3&&lines.size>=2;
 return {eligible,reason:eligible?'Familia ASUS de distintos modelos':
  !coherent?'Precios o número de ofertas incoherentes para una familia ASUS':
  shops.size<3?'Faltan comercios diferentes':
  'Faltan números de modelo G15/G16/G17/G18 identificables',
  lines:[...lines].map(([name,count])=>({name,count})),sellerCount:shops.size};
}
module.exports={rule,series,suitable,evidence,asusFamily,asusEvidence};
