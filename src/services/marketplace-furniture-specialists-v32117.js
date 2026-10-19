'use strict';
// V3.2.117 — Small allowlist of furniture specialisms, never arbitrary SEO URLs.
// Keep JS classification and PostgreSQL predicates derived from the same tokens.
const furniture=require('./marketplace-furniture-family-v32114');
const SPECS=Object.freeze([
 Object.freeze({
  id:'armarios',slug:'armarios',
  label:'Armarios',
  title:'Armarios en venta en España | RedLibertad',
  h1:'Armarios en venta: modelos y precios',
  description:'Consulta anuncios públicos de armarios en España: puertas batientes, correderas y otras opciones. Revisa fotografías, medidas, precios y vendedores en RedLibertad.',
  intro:'Descubre armarios anunciados por vendedores en España. Compara puertas, cajones, acabados y medidas en cada ficha; pueden ser artículos nuevos o usados.',
  advice:'Antes de comprar un armario, consulta sus medidas, el sistema de apertura, el montaje y las condiciones de entrega con quien lo anuncia.',
  pattern:'^armarios?([[:space:]]|$)',
  jsPattern:/^armarios?(?:\s|$)/
 }),
 Object.freeze({
  id:'sofas',slug:'sofas',
  label:'Sofás y chaiselongues',
  title:'Sofás y chaiselongues en España | RedLibertad',
  h1:'Sofás y chaiselongues en venta',
  description:'Explora anuncios públicos de sofás y chaiselongues en España. Compara fotografías, tamaños, tapizados y precios y consulta al vendedor directamente.',
  intro:'Consulta sofás de dos o tres plazas, sofás cama y chaiselongues disponibles en los anuncios públicos. Comprueba siempre medidas y condiciones de entrega.',
  advice:'Pregunta por las dimensiones, el tipo de tapizado, el estado, el transporte y si el sofá cabe por puertas y escaleras.',
  pattern:'^(sofas?|chaiselongues?|chaise[[:space:]]+longues?)([[:space:]]|$)',
  jsPattern:/^(?:sofas?|chaiselongues?|chaise\s+longues?)(?:\s|$)/
 }),
 Object.freeze({
  id:'dormitorios',slug:'dormitorios',
  label:'Dormitorios y camas',
  title:'Dormitorios y camas en España | RedLibertad',
  h1:'Dormitorios y camas en venta',
  description:'Encuentra anuncios públicos de dormitorios, camas, cabeceros y canapés en España. Revisa fotos, medidas, precio y ubicación antes de contactar.',
  intro:'Explora muebles de dormitorio, camas, canapés y cabeceros publicados en RedLibertad. Las características y la disponibilidad dependen de cada anuncio.',
  advice:'Confirma las medidas del colchón, las piezas incluidas, el montaje y las condiciones de transporte antes de comprar.',
  pattern:'^(dormitorios?|camas?|canapes?|cabeceros?)([[:space:]]|$)',
  jsPattern:/^(?:dormitorios?|camas?|canapes?|cabeceros?)(?:\s|$)/
 })
]);
const BY_ID=new Map(SPECS.map(spec=>[spec.id,spec]));
const BROAD_CATEGORY_NAMES=new Set([
 'muebles','mueble','hogar y muebles','muebles hogar','muebles para el hogar',
 'mobiliario','mobiliario hogar','otros','otros productos','general',
 'sin categoria','uncategorized','tienda','casa','hogar',
 'hogar y decoracion','decoracion','productos','catalogo',
 'salon','salones','sala de estar','salas de estar','muebles de salon',
 'mueble de salon','muebles de dormitorio','muebles dormitorio'
]);
const SQL_NORM=expr=>"translate(lower(btrim(COALESCE("+expr+",''))), 'áéíóúüñ', 'aeiouun')";
const escSql=value=>"'"+value.replace(/'/g,"''")+"'";
function byId(id){return BY_ID.get(id)||null;}
function matches(row,spec){
 if(!SPECS.includes(spec)||!furniture.isFurnitureListing(row))return false;
 const cat=furniture.normalized(row.category);
 const sub=furniture.normalized(row.details?.subcategory);
 const title=furniture.normalized(row.title);
 return spec.jsPattern.test(cat)||spec.jsPattern.test(sub)||
  (BROAD_CATEGORY_NAMES.has(cat)&&spec.jsPattern.test(title));
}
function sqlPredicate(spec,alias='l'){
 if(!SPECS.includes(spec))throw Error('unknown_furniture_specialist');
 if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))throw Error('invalid_sql_alias');
 const cat=SQL_NORM(alias+'.category'),sub=SQL_NORM(alias+".details->>'subcategory'");
 const title=SQL_NORM(alias+'.title');
 const pattern=escSql(spec.pattern);
 const broad=cat+' IN ('+[...BROAD_CATEGORY_NAMES].map(escSql).join(',')+')';
 return '('+furniture.sqlPredicate(alias)+' AND ('+
  cat+' ~ '+pattern+' OR '+sub+' ~ '+pattern+' OR ('+broad+' AND '+title+' ~ '+pattern+')'+
 '))';
}
module.exports={SPECS,byId,matches,sqlPredicate,BROAD_CATEGORY_NAMES};
