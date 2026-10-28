'use strict';
// V3.4.4.0 — etiquetas de filtros derivadas de ofertas reales, no del texto de búsqueda.
const insights=require('./marketplace-comparador-insights-v32140');
const CONDITION_CODES={
 'Nuevo':'nuevo','Usado':'usado','Reacondicionado':'reacondicionado','Estado sin confirmar':'sin-confirmar'
};
const CAPACITIES=new Map([
 ['64gb','64 GB'],['128gb','128 GB'],['256gb','256 GB'],
 ['512gb','512 GB'],['1024gb','1 TB'],['2048gb','2 TB']
]);
function attributes(offer){
 const condition=CONDITION_CODES[insights.conditionOf(offer)]||'sin-confirmar';
 const capacity=insights.variantKey(offer).cap;
 return {condition,capacity:CAPACITIES.has(capacity)?capacity:'unknown'};
}
function choices(offers,{specificModel=true}={}){
 const rows=Array.isArray(offers)?offers:[];
 const conditions=[...new Set(rows.map(o=>attributes(o).condition))];
 const capacities=specificModel?[...new Set(rows.map(o=>attributes(o).capacity))]:[];
 const ordered=['nuevo','reacondicionado','usado','sin-confirmar'];
 const capList=capacities.sort((a,b)=>{
  if(a==='unknown')return 1;
  if(b==='unknown')return -1;
  return Number.parseInt(a,10)-Number.parseInt(b,10);
 });
 return {
  conditionOptions:conditions.length>1?ordered.filter(c=>conditions.includes(c)):[],
  capacityOptions:capList.length>1?capList.map(code=>({code,label:CAPACITIES.get(code)||'Capacidad no indicada'})):[]
 };
}
module.exports={attributes,choices};
