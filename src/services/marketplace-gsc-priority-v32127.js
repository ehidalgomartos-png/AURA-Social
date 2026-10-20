'use strict';
// V3.2.127 — editorial ordering within eligible PUBLIC products that lack a
// recent SAVED manual inspection. Not a Google score or proof of indexation.
// Favour complete published product cards before spending scarce GSC quota.
const audit=require('./marketplace-seo-audit-v32120');
// The PostgreSQL expression and JS explanations intentionally share the
// existing original-content thresholds. No condition=new/used, brand or GTIN
// assumption is made for WooCommerce imports.
const TITLE_MIN=audit.SHORT_TITLE||10;
const DESCRIPTION_MIN=audit.SHORT_DESCRIPTION||35;
const AGE_DAYS=7;
const LOCAL_PHOTO_EXISTS=
 "EXISTS (SELECT 1 FROM jsonb_array_elements_text("+
 "CASE WHEN jsonb_typeof(l.image_urls)='array' THEN l.image_urls ELSE '[]'::jsonb END"+
 ") AS photo(url) WHERE photo.url ~* '^/uploads/[A-Za-z0-9._-]{1,180}[.](jpe?g|png|webp)$')";
const IS_REVIEW_READY=
 "char_length(btrim(COALESCE(l.title,''))) >= "+TITLE_MIN+
 " AND char_length(btrim(COALESCE(l.description,''))) >= "+DESCRIPTION_MIN+
 " AND char_length(btrim(COALESCE(l.category,''))) > 0 AND "+LOCAL_PHOTO_EXISTS;
const SELECT_PRIORITY=
 "SELECT l.id,l.title,l.category,l.description,l.image_urls,l.updated_at,l.created_at,"+
 " CASE WHEN NOT ("+IS_REVIEW_READY+") THEN 2"+
 " WHEN l.created_at <= now()-interval '"+AGE_DAYS+" days' THEN 0 ELSE 1 END AS priority_band";
function query({publicSaleFrom,searchFilter,missingFilter}){
 if(!publicSaleFrom||!searchFilter||!missingFilter)throw Error('priority_public_filters_required');
 return SELECT_PRIORITY+publicSaleFrom+searchFilter+missingFilter+
  " ORDER BY priority_band ASC,l.created_at ASC,l.id ASC LIMIT $2 OFFSET $3";
}
const BANDS=Object.freeze({
 0:Object.freeze({code:'review_first',label:'Revisar primero',
  why:'Tiene fotografía local, categoría y textos básicos, y lleva al menos siete días publicada. Es un orden editorial orientativo; no afirma que Google vaya a indexarla.'}),
 1:Object.freeze({code:'ready_recent',label:'Ficha preparada, reciente',
  why:'Tiene los elementos básicos. Al haberse publicado hace menos de siete días, puedes priorizar fichas más antiguas antes de gastar cuota.'}),
 2:Object.freeze({code:'improve_card',label:'Revisar contenido antes',
  why:'Conviene revisar los datos indicados antes de gastar una consulta manual de Google. No es un bloqueo oficial de indexación.'})
});
function guidance(row){
 const issues=[];
 if(audit.photosStatus(row?.image_urls).valid===0)
  issues.push('Sin fotografía local reconocida');
 if(String(row?.title||'').trim().length<TITLE_MIN)
  issues.push('Título original muy breve');
 if(String(row?.description||'').trim().length<DESCRIPTION_MIN)
  issues.push('Descripción original muy breve');
 if(!String(row?.category||'').trim())
  issues.push('Categoría sin completar');
 // Band is calculated in SQL for the COMPLETE matching public product set,
 // before LIMIT/OFFSET; never reorder a single 20-product page in JS.
 const raw=Number(row?.priority_band);
 const band=Number.isInteger(raw)&&raw>=0&&raw<=2?raw:2;
 const selected=issues.length?BANDS[2]:BANDS[band];
 return {code:selected.code,label:selected.label,why:selected.why,
  attention:issues.slice(0,4),
  note:'Priorización local para organizar revisiones; NO es una puntuación ni una recomendación de Google.'};
}
module.exports={TITLE_MIN,DESCRIPTION_MIN,AGE_DAYS,LOCAL_PHOTO_EXISTS,IS_REVIEW_READY,
 SELECT_PRIORITY,BANDS,query,guidance};
