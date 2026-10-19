'use strict';
// V3.2.122 — expected public sitemap shape, derived from current PUBLIC counts.
// This is NOT a fetch, Google Search Console integration, or indexing result.
const PAGE_SIZE=2000;
const ORIGIN='https://redlibertad.com';
const ROOT='/sitemap-index.xml';
const MARKET='/sitemap-marketplace.xml';
const KINDS=Object.freeze([
 Object.freeze({id:'general',label:'Todos los anuncios',path:MARKET,countKey:'public_total',pagePrefix:'/sitemap-marketplace-'}),
 Object.freeze({id:'productos',label:'Productos',path:'/sitemap-marketplace-productos.xml',countKey:'products',pagePrefix:'/sitemap-marketplace-productos-'}),
 Object.freeze({id:'servicios',label:'Servicios',path:'/sitemap-marketplace-servicios.xml',countKey:'services',pagePrefix:'/sitemap-marketplace-servicios-'}),
 Object.freeze({id:'inmuebles',label:'Inmuebles',path:'/sitemap-marketplace-inmuebles.xml',countKey:'properties',pagePrefix:'/sitemap-marketplace-inmuebles-'})
]);
function safeCount(value){
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:0;
}
function pageCount(count){return Math.max(1,Math.ceil(safeCount(count)/PAGE_SIZE));}
function summary(metrics={},categoryCounts={},categories=[],canIndex=()=>false){
 const entries=KINDS.map(k=>{
  const count=safeCount(metrics[k.countKey]);
  const pages=pageCount(count);
  return {id:k.id,label:k.label,path:k.path,count,pages,
   firstPage:k.pagePrefix+'1.xml',lastPage:k.pagePrefix+pages+'.xml',type:'indice'};
 });
 const qualified=categories.filter(x=>canIndex(categoryCounts,x)).length;
 entries.push({id:'categorias',label:'Categorías con inventario suficiente',
  path:'/sitemap-marketplace-categorias.xml',count:qualified,pages:1,
  firstPage:'/sitemap-marketplace-categorias.xml',lastPage:'/sitemap-marketplace-categorias.xml',
  type:'urlset'});
 return {
  kind:'expected_sitemap_structure',
  origin:ORIGIN,
  rootIndex:ROOT,
  robots:'/robots.txt',
  marketIndex:MARKET,
  shardSize:PAGE_SIZE,
  entries,
  note:'Previsión obtenida de anuncios públicos y umbrales de categorías. No comprueba HTTP en producción, la lectura de Google, ni la indexación en Search Console.'
 };
}
module.exports={PAGE_SIZE,ORIGIN,ROOT,MARKET,KINDS,safeCount,pageCount,summary};
