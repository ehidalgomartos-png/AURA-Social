'use strict';
// V3.4.6.0 — lista editorial de trabajo, basada en resultados guardados.
// No modifica reglas de indexación, no hace peticiones externas ni publica páginas.
const seo=require('./marketplace-comparador-seo-v32132');
const {safeHttps}=require('./marketplace-comparador-provider-v32133');
const clear=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function plan(page,matching=[],eligible=false,discovery=null){
 const count=Array.isArray(matching)?matching.length:0;
 const shops=new Set((Array.isArray(matching)?matching:[])
  .map(o=>clear(o?.shop)).filter(Boolean));
 const direct=(Array.isArray(matching)?matching:[]).filter(o=>safeHttps(o?.href)).length;
 const reason=discovery?.reason||'';
 const reasonKey=clear(reason);
 const kind=seo.discovery.classifyQuery(page?.query_text||'');
 const base={reason,offerCount:count,sellerCount:shops.size,directCount:direct};
 const next=(priority,title,action,extra='')=>({...base,priority,title,action,extra});
 if(page?.seo_blocked)return next('bloqueada','Excluida por administración',
  'Solo una revisión administrativa puede retirar el bloqueo.');
 if(eligible)return next('apta','Lista para Google',
  'Comprueba el HTML público, el sitemap y la prueba de URL publicada en Search Console.');
 if(page?.provider_status!=='ok')return next('sin-datos','Consulta externa incompleta',
  'No hay una búsqueda completada que sustente el SEO. Comprueba el diagnóstico de errores antes de repetirla.');
 if(count===0)return next('sin-datos','Sin ofertas verificables',
  'No basta con un nombre de producto: necesita ofertas guardadas con precios y enlaces reales.');
 if(!kind||/genérica|generica/.test(reasonKey))return next('baja','Búsqueda demasiado amplia',
  'Crear otra comparación para un modelo o familia identificable usando solo nombres presentes en las ofertas.');
 if(/capacidad|modelos, capacidades o colores/.test(reasonKey))return next('media','Variantes que deben separarse',
  'Verifica el modelo, la capacidad y el color; evita mezclar versiones en una misma página.');
 if(/precios incompatibles/.test(reasonKey))return next('alta','Revisar precios extremos',
  'Comprueba si las ofertas mezclan accesorios o modelos distintos. No indexar hasta tener precios coherentes.');
 if(/comercios diferentes/.test(reasonKey))return next('alta','Falta diversidad de tiendas',
  'Conservar únicamente ofertas independientes y comprobar si hay más vendedores distintos. No duplicar comercios.');
 if(/ofertas independientes/.test(reasonKey))return next('alta','Faltan ofertas verificables',
  'Revisa coincidencia de modelo, estado, moneda EUR y enlaces HTTPS. No inventar ofertas.');
 if(/antiguas|fecha/.test(reasonKey))return next('media','Precios por actualizar',
  'Revisa una actualización dentro de la cuota disponible y confirma si las ofertas siguen vigentes.');
 return next('media','Revisión de calidad pendiente',
  'Comprueba las variantes, los comercios y los enlaces de tienda antes de solicitar indexación.');
}
const PRIORITY_ORDER={apta:0,alta:1,media:2,baja:3,'sin-datos':4,bloqueada:5};
function queue(items,filter){
 const rows=(Array.isArray(items)?items:[]).map((item,index)=>({...item,originalIndex:index}));
 const prioritized=rows.filter(i=>i?.plan?.priority==='alta');
 const visible=filter==='prioritarias'?prioritized:rows;
 return {priorityCount:prioritized.length,rows:visible.sort((a,b)=>
  (PRIORITY_ORDER[a.plan?.priority]??5)-(PRIORITY_ORDER[b.plan?.priority]??5)||
   a.originalIndex-b.originalIndex)};
}
module.exports={plan,queue};
