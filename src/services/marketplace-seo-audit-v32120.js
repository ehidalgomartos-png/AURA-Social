'use strict';
// V3.2.120: read-only readiness audit of PUBLIC listings, not Google index status.
// All aggregates and sample queries share the same strict visibility predicate.
const SAMPLE_LIMIT=100;
const PUBLIC_FROM=" FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true";
// These are checks on original listing content, not Google meta title/description.
// Short, distinctive catalogue names such as "Taza Cuphead" are legitimate.
const SHORT_TITLE=10,SHORT_DESCRIPTION=35;
const IMAGE_PATTERN=/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:jpe?g|png|webp)$/i;
const metricsSql=
 "SELECT COUNT(*)::integer AS public_total,"+
 "COUNT(*) FILTER (WHERE l.kind='product')::integer AS products,"+
 "COUNT(*) FILTER (WHERE l.kind='service')::integer AS services,"+
 "COUNT(*) FILTER (WHERE l.kind='property')::integer AS properties,"+
 "COUNT(*) FILTER (WHERE char_length(btrim(l.title)) < "+SHORT_TITLE+")::integer AS short_titles,"+
 "COUNT(*) FILTER (WHERE char_length(btrim(l.description)) < "+SHORT_DESCRIPTION+")::integer AS short_descriptions,"+
 "COUNT(*) FILTER (WHERE jsonb_array_length(l.image_urls)=0)::integer AS without_images,"+
 "COUNT(*) FILTER (WHERE l.kind='product' AND l.deal='sale' AND COALESCE(l.details->>'condition','') NOT IN ('new','used'))::integer AS condition_unset"+
 PUBLIC_FROM;
const sampleSql=
 "SELECT l.id,l.title,l.description,l.kind,l.deal,l.category,l.city,l.image_urls,l.details,l.updated_at"+
 PUBLIC_FROM+" ORDER BY l.updated_at DESC,l.id DESC LIMIT "+SAMPLE_LIMIT;

function photosStatus(images){
 const entries=Array.isArray(images)?images.slice(0,6):[];
 const valid=entries.filter(path=>IMAGE_PATTERN.test(String(path)));
 return {valid:new Set(valid).size,invalid:entries.length-valid.length,duplicates:valid.length-new Set(valid).size};
}
function issueCodes(row){
 const issues=[];
 if(String(row.title||'').trim().length<SHORT_TITLE)issues.push('titulo_corto');
 if(String(row.description||'').trim().length<SHORT_DESCRIPTION)issues.push('descripcion_breve');
 const images=photosStatus(row.image_urls);
 if(!images.valid)issues.push('sin_fotos_publicas');
 if(images.invalid)issues.push('referencias_imagen_invalidas');
 if(images.duplicates)issues.push('fotografias_duplicadas');
 if(!String(row.category||'').trim())issues.push('categoria_incompleta');
 return issues;
}
const LABELS=Object.freeze({
 titulo_corto:'Título demasiado corto',
 descripcion_breve:'Descripción original muy escueta',
 sin_fotos_publicas:'Sin fotografías locales válidas',
 referencias_imagen_invalidas:'Imagen con formato no permitido',
 fotografias_duplicadas:'Fotografías repetidas',
 categoria_incompleta:'Sin categoría'
});
// V3.2.121: inspection order inside the existing bounded 100-public-ad sample.
// This is a workflow suggestion, NOT an SEO score or Google indexing signal.
const REVIEW_GROUP_PRIORITY=Object.freeze({fotos:0,datos:1,descripcion:2});
function reviewGroup(codes){
 if(codes.some(code=>['sin_fotos_publicas','referencias_imagen_invalidas','fotografias_duplicadas'].includes(code)))return 'fotos';
 if(codes.some(code=>['categoria_incompleta','titulo_corto'].includes(code)))return 'datos';
 return 'descripcion';
}
function sortIssues(issues){
 return issues.map((item,index)=>({...item,reviewGroup:reviewGroup(item.issues),_initialIndex:index}))
  .sort((a,b)=>REVIEW_GROUP_PRIORITY[a.reviewGroup]-REVIEW_GROUP_PRIORITY[b.reviewGroup]||b.issues.length-a.issues.length||a._initialIndex-b._initialIndex)
  .map(({_initialIndex,...item})=>item);
}
function int(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;}
function report({metrics={},rows=[],categoryCounts={},categories=[],isCategoryIndexable,listingPath}={}){
 if(typeof isCategoryIndexable!=='function'||typeof listingPath!=='function')
  throw Error('audit_helpers_required');
 const sample=rows.slice(0,SAMPLE_LIMIT);
 const issues=sample.map(row=>{
  const codes=issueCodes(row);
  if(!codes.length)return null;
  return {
   id:String(row.id),title:String(row.title||'').slice(0,120),
   category:String(row.category||'').slice(0,65),
   kind:row.kind,deal:row.deal,
   url:listingPath(row),issues:codes
  };
 }).filter(Boolean);
 const prioritized=sortIssues(issues);
 const groups=categories.map(def=>({
  name:String(def.h1),url:String(def.path),
  listings:int(categoryCounts[def.id]),
  indexable:Boolean(isCategoryIndexable(categoryCounts,def))
 }));
 return {
  ok:true,mode:'preparacion_tecnica',readOnly:true,
  generatedAt:new Date().toISOString(),
  note:'Esta auditoría analiza datos públicos de RedLibertad. No consulta Google Search Console y no confirma qué URLs ha indexado Google.',
  limits:{recentSample:sample.length,maximumSample:SAMPLE_LIMIT,issueExamples:prioritized.length},
  reviewNote:'Orden orientativo solo dentro de los anuncios públicos recientes de la muestra: primero fotos, después nombres y categorías, y finalmente descripciones originales. No es una clasificación de Google.',
  totals:{
   publicListings:int(metrics.public_total),
   products:int(metrics.products),services:int(metrics.services),properties:int(metrics.properties)
  },
  checks:[
   {id:'short_titles',name:'Títulos demasiado cortos',count:int(metrics.short_titles),note:'Solo nombres originales de menos de '+SHORT_TITLE+' caracteres; el título SEO de productos se construye por separado.'},
   {id:'short_descriptions',name:'Descripciones originales muy escuetas',count:int(metrics.short_descriptions),note:'Solo texto original de menos de '+SHORT_DESCRIPTION+' caracteres. La descripción SEO del producto se genera por separado.'},
   {id:'without_images',name:'Sin fotografías',count:int(metrics.without_images),note:'Anuncios con galería vacía'}
  ],
  informational:[
   {id:'condition_unset',name:'Productos sin estado nuevo/usado declarado (dato opcional)',
    count:int(metrics.condition_unset),
    note:'Los CSV de WooCommerce pueden no contener el campo Estado. No es un error SEO y no permite asumir que el producto es nuevo o usado.'}
  ],
  categories:groups,
  examples:prioritized,
  issueLabels:LABELS
 };
}
module.exports={SAMPLE_LIMIT,PUBLIC_FROM,metricsSql,sampleSql,photosStatus,issueCodes,reviewGroup,sortIssues,report,LABELS};
