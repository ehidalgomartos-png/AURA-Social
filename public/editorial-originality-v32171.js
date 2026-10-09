'use strict';
// V3.2.17.1 — Mirror of the mandatory server editorial originality gate.
// The check only detects exact normalized RSS reuse; it does not make a
// copyright, factual accuracy or rights determination.
function editorialOriginalityV32171(item={},draft={}){
  const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const title=String(draft.title??item.editorial_title??'').trim();
  const summary=String(draft.summary??item.editorial_summary??'').trim();
  const sourceTitle=String(item.source_title||'');
  const sourceExcerpt=String(item.source_excerpt||'');
  const fields={};
  if(title.length<12||title.length>220)fields.title='El titular debe tener entre 12 y 220 caracteres.';
  else if(normalize(title)===normalize(sourceTitle))fields.title='El titular coincide con el del RSS. Escribe uno propio sin copiar el original.';
  if(summary.length<70||summary.length>1100)fields.summary='El resumen debe tener entre 70 y 1100 caracteres.';
  else if(sourceExcerpt.trim()&&normalize(summary)===normalize(sourceExcerpt))fields.summary='El resumen coincide con el extracto RSS. Redáctalo con palabras propias.';
  return {ok:Object.keys(fields).length===0,fields,advisoryOnly:true};
}
if(typeof module!=='undefined'&&module.exports)module.exports={editorialOriginalityV32171};
if(typeof window!=='undefined')window.editorialOriginalityV32171=editorialOriginalityV32171;
