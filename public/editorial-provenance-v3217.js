'use strict';
// V3.2.17 — Free, deterministic RSS metadata assistance. No external AI,
// full-article retrieval, persistence, publication or copyright verdict.
// Shared read-only function for the private admin interface and backend.
function editorialProvenanceV3217(item={},draft={}){
  const clean=(value,max=1100)=>String(value??'').replace(/<[^>]*>/g,' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const phrase=(value)=>clean(value).split(' ').filter(Boolean);
  const overlap=(a,b,size=7)=>{
    const A=phrase(a),B=phrase(b);
    if(A.length<size||B.length<size)return false;
    const patterns=new Set();
    for(let i=0;i+size<=A.length;i++)patterns.add(A.slice(i,i+size).join(' '));
    for(let i=0;i+size<=B.length;i++)if(patterns.has(B.slice(i,i+size).join(' ')))return true;
    return false;
  };
  const sourceTitle=String(item.source_title||'').trim();
  const excerpt=String(item.source_excerpt||'').trim();
  const title=String(draft.title??item.editorial_title??'').trim();
  const summary=String(draft.summary??item.editorial_summary??'').trim();
  const flags=[];
  const add=(code,label,explanation)=>flags.push({code,label,explanation});
  if(!sourceTitle||sourceTitle.length<12)add('title_metadata_sparse','Titular RSS escaso','El título de origen aporta pocos datos: consulta el artículo completo.');
  if(excerpt.length<50)add('excerpt_metadata_sparse','Extracto RSS insuficiente','No hay contexto suficiente en el RSS para contrastar un resumen sin abrir el artículo.');
  if(!item.published_at||!Number.isFinite(new Date(item.published_at).getTime()))add('publication_date_missing','Fecha sin verificar','Comprueba cuándo sucedieron los hechos y la fecha de publicación original.');
  if(item.source_status&&item.source_status!=='approved')add('source_not_approved','Estado de fuente pendiente','Revisa la autorización de la fuente antes de aprobar; esta alerta no modifica sus permisos.');
  if(title&&sourceTitle){
    if(clean(title)===clean(sourceTitle))add('title_exact','Titular idéntico al RSS','Redacta un titular editorial propio antes de aprobar.');
    else if(overlap(title,sourceTitle,7))add('title_extended_match','Titular muy parecido al RSS','Revisa si hay una secuencia extensa de palabras copiada del título original.');
  }
  if(summary&&excerpt){
    if(clean(summary)===clean(excerpt))add('summary_exact','Resumen idéntico al extracto','El resumen debe redactarse con palabras propias y con comprobación del contexto.');
    else if(overlap(summary,excerpt,9))add('summary_extended_match','Resumen muy parecido al extracto','Se ha detectado una secuencia extensa de palabras compartidas: revísala y comprueba derechos.');
  }
  return {
    provisional:true,advisoryOnly:true,
    reviewedFacts:false,rightsVerified:false,
    sourceName:String(item.source_name||'Medio sin identificar').slice(0,100),
    sourceLinkAvailable:/^https?:\/\/[^\s]+$/i.test(String(item.canonical_url||'')),
    warnings:flags,
    warningCount:flags.length,
    notice:'Comparación textual orientativa sobre metadatos RSS; no determina plagio, veracidad ni permisos. La revisión y publicación siguen siendo humanas.'
  };
}
if(typeof module!=='undefined'&&module.exports)module.exports={editorialProvenanceV3217};
if(typeof window!=='undefined')window.editorialProvenanceV3217=editorialProvenanceV3217;
