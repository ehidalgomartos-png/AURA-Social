'use strict';
// V3.2.140 — Resumen verificable de las ofertas guardadas.
// No crea páginas por sí mismo, no inventa precio/stock ni llama al proveedor.
const auto=require('./marketplace-comparador-auto-seo-v32138');
const provider=require('./marketplace-comparador-provider-v32133');
const CONDITION_PATTERNS=[
 ['Reacondicionado',/\b(reacondicionado|reacondicionada|refurbished|renewed|reconditioned|certified refurbished)\b/],
 ['Usado',/\b(usado|usada|segunda mano|second hand|pre owned|preowned|used)\b/],
 ['Nuevo',/\b(nuevo|nueva|new|precintado|precintada)\b/]
];
const STORAGE_LABEL=new Map([['64gb','64 GB'],['128gb','128 GB'],['256gb','256 GB'],['512gb','512 GB'],['1024gb','1 TB'],['2048gb','2 TB']]);
function conditionOf(o){
 const title=auto.normalize(o?.title),declared=auto.normalize(o?.condition);
 // "Nuevo" solo si se declara expresamente: "Consultar estado" no es nuevo.
 for(const [value,re] of CONDITION_PATTERNS.slice(0,2)){
  if(re.test(declared)||re.test(title))return value;
 }
 if(declared==='nuevo'||CONDITION_PATTERNS[2][1].test(title))return 'Nuevo';
 return 'Estado sin confirmar';
}
function storageLabel(value){return STORAGE_LABEL.get(value)||null;}
function safeOffer(o){
 return o&&typeof o.title==='string'&&o.title.trim()&&
  Number.isSafeInteger(o.price_cents)&&o.price_cents>0&&o.price_cents<=100000000&&
  (o.internal===true||o.price_currency==='EUR');
}
function variantKey(o){
 const cap=auto.capacity(o.title)||'unknown';
 const edition=auto.family(o.title)||'base';
 const condition=conditionOf(o);
 return {cap,edition,condition,key:edition+'|'+cap+'|'+condition};
}
function variantTitle(query,{cap,edition,condition}){
 const label=[edition==='base'?'Modelo estándar':edition.split('|').map(x=>x[0].toUpperCase()+x.slice(1)).join(' '),
  storageLabel(cap)||'Capacidad sin identificar',condition];
 return label.join(' · ');
}
function suggestedQuery(query,variant){
 const clean=String(query||'').trim(),storage=storageLabel(variant.cap);
 if(!storage||clean.length>90)return null;
 if(auto.capacity(clean))return null;
 const currentEdition=auto.family(clean);
 if(variant.edition!=='base' && currentEdition!==variant.edition)return null;
 const candidate=(clean+' '+storage).replace(/\s+/g,' ').trim();
 return candidate.length<=100?candidate:null;
}
function buildInsights(query,offers){
 const groups=new Map(),seen=new Set();
 let total=0;
 for(const o of (Array.isArray(offers)?offers:[]).slice(0,80)){
  if(!safeOffer(o))continue;
  const id=[auto.normalize(o.title),auto.normalize(o.shop),String(o.price_cents)].join('|');
  if(seen.has(id))continue;
  seen.add(id);
  total++;
  const v=variantKey(o);
  if(!groups.has(v.key))groups.set(v.key,{
   ...v,count:0,minCents:Infinity,maxCents:0,shops:new Set(),colors:new Set(),directShops:new Set()
  });
  const g=groups.get(v.key);
  g.count++;
  g.minCents=Math.min(g.minCents,o.price_cents);
  g.maxCents=Math.max(g.maxCents,o.price_cents);
  if(String(o.shop||'').trim())g.shops.add(auto.normalize(o.shop));
  const color=auto.color(o.title);
  if(color)g.colors.add(color);
  const destination=o.internal?'internal':provider.resolveOfferLink(o)?.destination;
  if(destination==='store'||destination==='internal')g.directShops.add(auto.normalize(o.shop));
 }
 const variants=[...groups.values()].map(g=>({
  key:g.key,label:variantTitle(query,g),count:g.count,minCents:g.minCents,maxCents:g.maxCents,
  shopCount:g.shops.size,directShopCount:g.directShops.size,colors:[...g.colors].sort(),
  capacity:storageLabel(g.cap),condition:g.condition,edition:g.edition,
  suggestedQuery:suggestedQuery(query,g)
 })).sort((a,b)=>b.count-a.count||a.minCents-b.minCents).slice(0,9);
 return {variants,total,hasMixedVariants:groups.size>1,
  hasUsedOrRefurbished:variants.some(v=>v.condition==='Usado'||v.condition==='Reacondicionado'),
  directCount:variants.reduce((n,v)=>n+v.directShopCount,0)};
}
module.exports={conditionOf,storageLabel,variantKey,variantTitle,suggestedQuery,buildInsights,safeOffer};
