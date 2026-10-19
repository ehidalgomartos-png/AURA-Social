'use strict';
// V3.2.112: a finite set of truthful SEO category pages, backed by live public ads.
// This threshold is an editorial quality gate, not an official Google requirement.
const ORIGIN='https://redlibertad.com';
const furnitureFamily=require('./services/marketplace-furniture-family-v32114');
const MIN_PUBLIC_ADS=5;
const PUBLIC_FROM=" FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true";
const LANDINGS=Object.freeze([
 {
  id:'segunda_mano',slug:'segunda-mano',path:'/marketplace/segunda-mano',
  where:"l.kind='product' AND l.deal='sale' AND l.details->>'condition'='used'",
  title:'Productos de segunda mano en España | RedLibertad',
  h1:'Productos de segunda mano en España',
  description:'Explora anuncios públicos de productos usados en España. Compara fotos, precios y ubicación, consulta cada anuncio y contacta directamente con su vendedor.',
  intro:'Explora productos marcados como usados por sus anunciantes. Consulta el precio, las fotografías y la ubicación de cada artículo antes de contactar.',
  advice:'Comprueba el estado real del artículo, los accesorios incluidos y las condiciones de entrega con la persona que publica el anuncio.',
  discover:'/marketplace/explorar?tipo=product&operacion=sale'
 },
 {
  id:'muebles_catalogo',slug:'muebles',path:'/marketplace/muebles',
  where:furnitureFamily.sqlPredicate('l'),
  title:'Muebles nuevos y de segunda mano en España | RedLibertad',
  h1:'Muebles para el hogar: nuevos y de segunda mano',
  description:'Explora muebles para el hogar publicados en RedLibertad: sofás, dormitorios, camas, mesas y armarios, nuevos o usados. Consulta anuncios y vendedores en España.',
  intro:'Descubre anuncios públicos de muebles en España, incluidos artículos importados por CSV de tiendas WooCommerce. La categoría del vendedor se conserva y el estado del artículo se muestra solo si está indicado.',
  advice:'Compara medidas, materiales, disponibilidad y condiciones de entrega. Si existe enlace de compra verificado, la compra y el pago se completan en la tienda original.',
  discover:'/marketplace/explorar?tipo=product'
 },
 {
  id:'muebles',slug:'muebles-segunda-mano',path:'/marketplace/muebles-segunda-mano',
  where:furnitureFamily.sqlPredicate('l')+" AND l.details->>'condition'='used'",
  title:'Muebles de segunda mano en España | RedLibertad',
  h1:'Muebles de segunda mano',
  description:'Consulta anuncios de muebles usados en RedLibertad. Encuentra sofás, mesas y otros muebles publicados, compara precios y pregunta por medidas y recogida.',
  intro:'Aquí se reúnen anuncios públicos de muebles que sus propietarios han marcado como usados. Consulta cada ficha para ver las fotos y la localidad indicada.',
  advice:'Antes de desplazarte, pregunta por las medidas, el estado, las condiciones de recogida y si el artículo se puede desmontar o transportar.',
  discover:'/marketplace/explorar?tipo=product&categoria=Hogar+y+muebles'
 },
 {
  id:'moviles',slug:'moviles-segunda-mano',path:'/marketplace/moviles-segunda-mano',
  where:"l.kind='product' AND l.deal='sale' AND l.details->>'condition'='used' AND LOWER(BTRIM(l.category)) IN ('móviles y telefonía','moviles y telefonia','móviles','moviles','telefonía','telefonia')",
  title:'Móviles de segunda mano en España | RedLibertad',
  h1:'Móviles de segunda mano',
  description:'Explora anuncios públicos de móviles usados. Revisa fotografías, precio y ubicación y consulta al vendedor por batería, accesorios y estado del dispositivo.',
  intro:'Consulta teléfonos usados que sus anunciantes han publicado en la categoría de móviles y telefonía. La disponibilidad depende de los anuncios activos.',
  advice:'Pregunta por el estado de la batería, el funcionamiento de la pantalla, el bloqueo de operador y los accesorios antes de acordar una compra.',
  discover:'/marketplace/explorar?tipo=product&categoria=M%C3%B3viles+y+telefon%C3%ADa'
 },
 {
  id:'vehiculos',slug:'vehiculos-segunda-mano',path:'/marketplace/vehiculos-segunda-mano',
  where:"l.kind='product' AND l.deal='sale' AND l.details->>'condition'='used' AND LOWER(BTRIM(l.category)) IN ('vehículos','vehiculos')",
  title:'Vehículos de segunda mano en España | RedLibertad',
  h1:'Vehículos de segunda mano',
  description:'Consulta anuncios de vehículos usados publicados en RedLibertad. Compara fotos, ubicación y precio y solicita información al anunciante.',
  intro:'Aquí aparecen únicamente anuncios públicos de vehículos que sus vendedores han identificado como usados, cuando haya publicaciones disponibles.',
  advice:'Solicita documentación, historial de mantenimiento, kilómetros y estado antes de visitar el vehículo. Confirma los datos con el vendedor.',
  discover:'/marketplace/explorar?tipo=product&categoria=Veh%C3%ADculos'
 },
 {
  id:'servicios',slug:'servicios',path:'/marketplace/servicios',
  where:"l.kind='service' AND l.deal='offer'",
  title:'Anuncios de servicios profesionales en España | RedLibertad',
  h1:'Encuentra servicios profesionales en España',
  description:'Explora anuncios públicos de servicios profesionales y particulares en España. Busca por ciudad, consulta cada oferta y conversa con el anunciante.',
  intro:'Descubre anuncios de servicios ofrecidos por personas y profesionales de la comunidad. Las modalidades y zonas de atención se indican en las fichas publicadas.',
  advice:'Antes de contratar un servicio, solicita presupuesto, condiciones y detalles del trabajo directamente al anunciante.',
  discover:'/marketplace/explorar?tipo=service'
 },
 {
  id:'inmuebles',slug:'inmuebles',path:'/marketplace/inmuebles',
  where:"l.kind='property' AND l.deal IN ('sale','rent')",
  title:'Pisos, casas e inmuebles anunciados en España | RedLibertad',
  h1:'Anuncios de pisos, casas e inmuebles',
  description:'Explora anuncios públicos de pisos, casas, habitaciones y otros inmuebles en venta o alquiler. Consulta ubicación, precio y datos del anunciante.',
  intro:'Consulta inmuebles en venta o alquiler anunciados públicamente en RedLibertad, con los datos disponibles en cada publicación.',
  advice:'Antes de reservar o entregar dinero, verifica la información, titularidad y condiciones de la operación con la parte anunciante.',
  discover:'/marketplace/explorar?tipo=property'
 }
]);
const BY_SLUG=new Map(LANDINGS.map(def=>[def.slug,def]));
function bySlug(slug){return BY_SLUG.get(String(slug||''))||null;}
function countQuery(){
 return 'SELECT '+LANDINGS.map(def=>'COUNT(*) FILTER (WHERE ('+def.where+'))::integer AS '+def.id).join(',')+
  ",COUNT(DISTINCT LOWER(BTRIM(l.category))) FILTER (WHERE (l.kind='product' AND l.deal='sale' AND l.details->>'condition'='used'))::integer AS used_category_diversity"+PUBLIC_FROM;
}
function listingQuery(def){
 if(!LANDINGS.includes(def))throw Error('unknown_marketplace_category');
 return 'SELECT l.id,l.title,l.kind,l.deal,l.city,l.details,l.price_cents,l.image_urls,l.created_at,l.updated_at,l.category'+
  PUBLIC_FROM+' AND ('+def.where+') ORDER BY l.created_at DESC,l.id DESC LIMIT 24';
}
function totalFor(counts,def){
 if(!LANDINGS.includes(def))return 0;
 const value=Number(counts?.[def.id]);
 return Number.isSafeInteger(value)&&value>=0?value:0;
}
function canIndex(counts,def){
 if(totalFor(counts,def)<MIN_PUBLIC_ADS)return false;
 // An all-second-hand page with exactly the same inventory as one specialist
 // category adds little value. Require at least two distinct used categories.
 if(def.id==='segunda_mano')return Number(counts?.used_category_diversity)>=2;
 return true;
}
function qualified(counts){return LANDINGS.filter(def=>canIndex(counts,def));}

// A listing can link to an SEO category only when it actually belongs there.
// Prefer specialist pages and fall back to the general used-products collection.
// The same category normalization and deal/condition rules as the SQL predicates
// must be respected; in particular new WooCommerce products never become "used".
const USED_MOBILES=new Set(['móviles y telefonía','moviles y telefonia','móviles','moviles','telefonía','telefonia']);
const USED_VEHICLES=new Set(['vehículos','vehiculos']);
function candidateCategories(row){
 if(!row || typeof row!=='object')return [];
 if(row.kind==='service'&&row.deal==='offer')return [bySlug('servicios')];
 if(row.kind==='property'&&['sale','rent'].includes(row.deal))return [bySlug('inmuebles')];
 if(row.kind!=='product'||row.deal!=='sale')return [];
 const furniture=furnitureFamily.isFurnitureListing(row);
 const used=row.details?.condition==='used';
 const choices=[];
 if(used&&furniture)choices.push(bySlug('muebles-segunda-mano'));
 if(furniture)choices.push(bySlug('muebles'));
 if(!used)return choices; // Unknown/new WooCommerce products are not second-hand.
 const category=String(row.category||'').trim().toLocaleLowerCase('es');
 if(!furniture&&USED_MOBILES.has(category))choices.push(bySlug('moviles-segunda-mano'));
 else if(!furniture&&USED_VEHICLES.has(category))choices.push(bySlug('vehiculos-segunda-mano'));
 choices.push(bySlug('segunda-mano'));
 return choices;
}
function qualifiedCategoryForListing(row,counts){
 return candidateCategories(row).find(def=>canIndex(counts,def))||null;
}

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function navigation(counts,{current=null}={}){
 const options=qualified(counts).filter(def=>def.slug!==current);
 if(!options.length)return '';
 return '<nav class="market-category-seo-nav" aria-label="Más categorías con anuncios"><h2>Más categorías para explorar</h2><div>'+
  options.map(def=>'<a href="'+esc(def.path)+'">'+esc(def.h1)+' →</a>').join('')+'</div></nav>';
}
function content(def,{count=0,cards='',indexable=false,navigationHtml=''}={}){
 if(!LANDINGS.includes(def))throw Error('unknown_marketplace_category');
 const intro='<nav class="market-category-seo-crumb" aria-label="Ruta de navegación">'+
  '<a href="/">Inicio</a> › <a href="/marketplace/explorar">Marketplace</a> › '+esc(def.h1)+'</nav>'+
  '<header class="market-category-seo-hero"><span>ANUNCIOS EN ESPAÑA · REDLIBERTAD</span><h1>'+esc(def.h1)+'</h1>'+
  '<p>'+esc(def.intro)+'</p><div class="market-category-seo-actions">'+
  '<a class="primary" href="'+esc(def.discover)+'">Explorar anuncios relacionados</a>'+
  '<a class="secondary" href="/marketplace?publicar=1">Publicar un anuncio</a></div></header>';
 const selection=indexable?
  '<section class="market-category-seo-listings" aria-label="Anuncios publicados"><h2>Anuncios disponibles</h2>'+
  '<p>'+esc(String(count))+' anuncios públicos en esta categoría. Comprueba cada ficha para conocer los detalles actualizados.</p>'+
  '<div class="cards market-public-grid">'+cards+'</div></section>':
  '<section class="market-category-seo-empty"><h2>Estamos ampliando esta categoría</h2>'+
  '<p>Por ahora hay pocos anuncios públicos de este tipo. Puedes explorar el Marketplace completo o volver más adelante.</p>'+
  (cards?'<div class="cards market-public-grid">'+cards+'</div>':'')+'</section>';
 return intro+selection+
  '<section class="market-category-seo-guide"><h2>Consejos antes de contactar</h2><p>'+esc(def.advice)+'</p>'+
  '<p>Los anuncios son responsabilidad de quienes los publican. RedLibertad no gestiona los pagos ni los envíos. Si un producto dispone de un enlace de compra verificado, la operación se realiza en la web del vendedor.</p></section>'+
  navigationHtml;
}
function structuredData(def,rows){
 if(!LANDINGS.includes(def))throw Error('unknown_marketplace_category');
 const url=ORIGIN+def.path;
 const items=rows.slice(0,24).map((row,index)=>({
  '@type':'ListItem',position:index+1,name:row.title,url:ORIGIN+'/marketplace/p/'+encodeURIComponent(row.id)+'/'+slugify(row.title)
 }));
 return {'@context':'https://schema.org','@graph':[
  {'@type':'CollectionPage','@id':url+'#webpage',url,name:def.title,
   description:def.description,inLanguage:'es-ES',isPartOf:{'@id':ORIGIN+'/#website'}},
  {'@type':'BreadcrumbList','@id':url+'#breadcrumbs',itemListElement:[
   {'@type':'ListItem',position:1,name:'RedLibertad',item:ORIGIN+'/'},
   {'@type':'ListItem',position:2,name:'Marketplace',item:ORIGIN+'/marketplace/explorar'},
   {'@type':'ListItem',position:3,name:def.h1,item:url}
  ]},
  {'@type':'ItemList','@id':url+'#anuncios',itemListElement:items}
 ]};
}
function slugify(value){
 return String(value||'anuncio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75)||'anuncio';
}
function sitemapXml(counts){
 return '<?xml version="1.0" encoding="UTF-8"?>'+
 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
 qualified(counts).map(def=>'<url><loc>'+esc(ORIGIN+def.path)+'</loc></url>').join('')+'</urlset>';
}
module.exports={ORIGIN,MIN_PUBLIC_ADS,LANDINGS,bySlug,countQuery,listingQuery,totalFor,canIndex,qualified,candidateCategories,qualifiedCategoryForListing,navigation,content,structuredData,sitemapXml};
