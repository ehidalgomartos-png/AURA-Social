'use strict';
// V3.2.114 — SEO-only furniture family classification; never mutates WooCommerce inventory.
// The allowlist is based on category or original WooCommerce subcategory, not free-text
// descriptions. Title fallback is restricted to generic category buckets and exact
// item-name beginnings, to avoid classifying unrelated goods by casual keyword matches.
const CATEGORY_ALIASES=Object.freeze([
 'mueble','muebles','hogar y muebles','muebles hogar','muebles para el hogar',
 'mobiliario','mobiliario hogar','muebles de oficina','muebles auxiliares',
 'salon','salones','sala de estar','salas de estar','comedores','comedor',
 'dormitorio','dormitorios','dormitorios juveniles','habitaciones',
 'sofa','sofas','sofas y sillones','sillon','sillones','sillones relax',
 'chaiselongue','chaiselongues','chaise longue','chaise longues','butaca','butacas',
 'mesa','mesas','mesitas','mesitas de noche','mesa de comedor','mesas de comedor',
 'silla','sillas','mesas y sillas','taburete','taburetes','escritorios',
 'cama','camas','canape','canapes','litera','literas','cabecero','cabeceros',
 'armario','armarios','aparador','aparadores','comoda','comodas',
 'estanteria','estanterias','libreria','librerias','vitrina','vitrinas',
 'mueble tv','muebles tv','muebles de salon','mueble de salon','zapatero','zapateros',
 'colchon','colchones'
]);
const PREFIXES=Object.freeze([
 'muebles de ','mueble de ','muebles para ','mobiliario de ','mobiliario para ',
 'sofas de ','sillones de ','camas de ','sillas de ','armarios de ',
 'dormitorios de ','salones de ','comedores de ','muebles y '
]);
// Real WooCommerce taxonomies often add a descriptive qualifier after the
// furniture noun (e.g. 'Armarios Puertas Batientes'). Matching only exact
// labels made entire imported collections invisible to the SEO page.
// Recognize these bounded furniture subfamilies without accepting arbitrary
// categories whose names merely contain a furniture keyword.
const CATEGORY_DETAIL_PREFIXES=Object.freeze([
 'armarios puertas','armarios puerta','armarios con puertas','armarios correderas','armarios abatibles',
 'armarios empotrados','armarios roperos','armarios vestidores','armarios esquineros',
 'armarios 1 puerta','armarios 2 puertas','armarios 3 puertas',
 'armarios 4 puertas','armarios 5 puertas','armarios 6 puertas',
 'sofas 2 plazas','sofas 3 plazas','sofas 4 plazas','sofas cama',
 'sofas chaise longue','sofas rinconeros','sofas modulares',
 'camas nido','camas abatibles','camas juveniles',
 'mesas centro','mesas de centro','mesas comedor','mesas de comedor',
 'mesas de cocina','mesas de estudio','mesas de trabajo','mesas de oficina',
 'mesas de jardin','mesas de noche','mesas de despacho','mesas de terraza',
 'mesas auxiliares','sillas comedor','sillas de comedor',
 'muebles dormitorio','muebles de dormitorio','muebles salon',
 'muebles de salon','muebles auxiliares'
]);
const GENERIC_BUCKETS=Object.freeze([
 'otros','otros productos','general','sin categoria','uncategorized','tienda',
 'casa','hogar','hogar y decoracion','decoracion','productos','catalogo'
]);
const TITLE_HEADS=Object.freeze([
 'mueble','muebles','sofa','sofas','sillon','sillones',
 'chaiselongue','chaiselongues','chaise longue','chaise longues',
 'mesa','mesas','mesita','mesitas','silla','sillas','butaca','butacas',
 'armario','armarios','aparador','aparadores','comoda','comodas',
 'cama','camas','canape','canapes','litera','literas','cabecero','cabeceros',
 'estanteria','estanterias','libreria','librerias','vitrina','vitrinas',
 'escritorio','escritorios','zapatero','zapateros','colchon','colchones',
 'taburete','taburetes'
]);
const ALIASES_SET=new Set(CATEGORY_ALIASES),GENERIC_SET=new Set(GENERIC_BUCKETS);
const HEAD_REGEX=new RegExp('^(?:'+TITLE_HEADS.join('|')+')(?:$|[^a-z])');
function normalized(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
}
function categoryMatches(value){
 const name=normalized(value);
 return !!name&&(ALIASES_SET.has(name)||PREFIXES.some(prefix=>name.startsWith(prefix))||
  CATEGORY_DETAIL_PREFIXES.some(prefix=>name===prefix||name.startsWith(prefix+' ')));
}
function isFurnitureListing(row){
 if(row?.kind!=='product'||row?.deal!=='sale')return false;
 const category=normalized(row.category);
 if(categoryMatches(category)||categoryMatches(row.details?.subcategory))return true;
 // Existing CSV imports may retain only a generic WooCommerce parent category.
 // Require a recognizable furniture noun at the BEGINNING of the title.
 return GENERIC_SET.has(category)&&HEAD_REGEX.test(normalized(row.title));
}
const SQL_NORM=value=>"translate(lower(btrim(COALESCE("+value+",''))), 'áéíóúüñ', 'aeiouun')";
function quote(s){return "'"+s.replace(/'/g,"''")+"'";}
function inList(values,sql){return sql+' IN ('+values.map(quote).join(',')+')';}
function sqlPredicate(alias='l'){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw Error('invalid_sql_alias');
 const category=SQL_NORM(alias+'.category');
 const subcategory=SQL_NORM(alias+".details->>'subcategory'");
 const title=SQL_NORM(alias+'.title');
 const aliasMatches=column=>'('+inList(CATEGORY_ALIASES,column)+' OR '+
  PREFIXES.map(prefix=>column+' LIKE '+quote(prefix+'%')).join(' OR ')+' OR '+
  CATEGORY_DETAIL_PREFIXES.map(prefix=>'('+column+' = '+quote(prefix)+' OR '+column+' LIKE '+quote(prefix+' %')+')').join(' OR ')+')';
 const titleStart='^('+TITLE_HEADS.map(h=>h.replace(/ /g,'[[:space:]]+')).join('|')+')([^a-z]|$)';
 return "("+alias+".kind='product' AND "+alias+".deal='sale' AND ("+
  aliasMatches(category)+' OR '+aliasMatches(subcategory)+
  ' OR ('+inList(GENERIC_BUCKETS,category)+' AND '+title+' ~ '+quote(titleStart)+')'+
  '))';
}
module.exports={normalized,categoryMatches,isFurnitureListing,sqlPredicate,CATEGORY_ALIASES,PREFIXES,CATEGORY_DETAIL_PREFIXES,GENERIC_BUCKETS,TITLE_HEADS};
