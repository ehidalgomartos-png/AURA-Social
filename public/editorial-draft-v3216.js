'use strict';
// V3.2.16: fact-bound provisional text from RSS only (not article content).
// Deliberately attributes RSS statements; no inferred names, dates or outcomes.
function editorialDraftV3216(item={}){
  const plain=(v,max)=>String(v||'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,max);
  const source=plain(item.source_name||'la fuente original',70);
  const headline=plain(item.source_title,170).replace(/[.!?\s]+$/g,'');
  if(headline.length<8)return {title:'',summary:'',note:'',provisional:true,evidence:'insufficient'};
  // Take at most 18 words from the RSS extract, explicitly marked as a
  // quotation so an editor knows which words are not original prose.
  const raw=plain(item.source_excerpt,400);
  const excerpt=raw?raw.split(/\s+/).slice(0,18).join(' ').replace(/[,:;\s]+$/g,''):'';
  const title=('En el foco de '+source+': '+headline).slice(0,220);
  const lead='La noticia recogida en el RSS de '+source+' trata este asunto: «'+headline+'».';
  const context=excerpt.length>=18?
    ' El extracto proporcionado por el medio añade: «'+excerpt+'».':
    ' El RSS no incluye una descripción suficiente para añadir más contexto sin consultar el artículo.';
  const caveat=' Es una propuesta provisional basada únicamente en metadatos, pendiente de lectura del artículo y comprobación editorial.';
  const summary=(lead+context+caveat).slice(0,1100);
  const note='BORRADOR AUTOMÁTICO NO VERIFICADO. Consultar texto original, contraste de hechos, fechas, contexto, atribución y derechos. Reescribir el resumen antes de aprobar.';
  return {title,summary,note,provisional:true,evidence:excerpt?'title-and-rss-excerpt':'title-only',quotedExcerptWords:excerpt?excerpt.split(/\s+/).length:0};
}
if(typeof module!=='undefined'&&module.exports)module.exports={editorialDraftV3216};
if(typeof window!=='undefined')window.editorialDraftV3216=editorialDraftV3216;
