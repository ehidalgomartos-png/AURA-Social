'use strict';
// V3.2.111 — one canonical, indexable Marketplace landing, not doorway pages.
// Content is truthful and does not promise inventory, free seller plans or purchases here.
const URL='https://redlibertad.com/marketplace/explorar';
const TITLE='Anuncios de segunda mano y compraventa en España | RedLibertad';
const DESCRIPTION='Explora anuncios de segunda mano, productos nuevos y usados, servicios e inmuebles en España. Busca por categoría o ciudad y contacta con anunciantes en RedLibertad.';
const CATEGORIES=[
 {icon:'🛋️',name:'Muebles y hogar',copy:'Sofás, decoración, electrodomésticos y artículos para casa.',filters:{tipo:'product',categoria:'Hogar y muebles'}},
 {icon:'📱',name:'Móviles y telefonía',copy:'Consulta anuncios de teléfonos y accesorios.',filters:{tipo:'product',categoria:'Móviles y telefonía'}},
 {icon:'🚗',name:'Vehículos',copy:'Explora anuncios de coches y otros vehículos.',filters:{tipo:'product',categoria:'Vehículos'}},
 {icon:'🛠️',name:'Servicios profesionales',copy:'Encuentra anuncios de servicios por ciudad o especialidad.',filters:{tipo:'service'}},
 {icon:'🏠',name:'Pisos e inmuebles',copy:'Busca viviendas, habitaciones, locales y otros inmuebles.',filters:{tipo:'property'}},
 {icon:'🇪🇸',name:'Venta en toda España',copy:'Productos que sus anunciantes ofrecen para venta nacional.',filters:{tipo:'product',operacion:'sale',nacional:'1'}}
];
const QUESTIONS=[
 ['¿Puedo consultar los anuncios sin registrarme?',
  'Sí. Puedes explorar las fichas públicas y utilizar los filtros sin iniciar sesión. Para contactar por chat necesitas una cuenta.'],
 ['¿Cómo busco artículos de segunda mano cerca de mí?',
  'Utiliza la búsqueda y el filtro de ciudad. En cada anuncio podrás consultar la ubicación o, cuando corresponda, el ámbito de venta indicado por el anunciante.'],
 ['¿Dónde se realiza la compra y el pago?',
  'RedLibertad no cobra ni gestiona pagos o envíos de productos. Si el anuncio tiene un enlace de compra verificado, la compra se realiza exclusivamente en la web del vendedor.'],
 ['¿Puedo publicar un anuncio de un producto, servicio o inmueble?',
  'Sí. Desde el Marketplace puedes crear anuncios de venta o de búsqueda y publicar servicios o inmuebles, según las opciones disponibles en el formulario.']
];
function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function categoryHref(filters){return '/marketplace/explorar?'+new URLSearchParams(filters).toString();}
function hero(){
 return '<section class="market-landing-hero" aria-labelledby="marketLandingTitle">'+
  '<div class="market-landing-hero-inner"><span class="market-landing-eyebrow">MARKETPLACE · ANUNCIOS EN ESPAÑA</span>'+
  '<h1 id="marketLandingTitle">Anuncios de segunda mano y compraventa en España</h1>'+
  '<p>Encuentra productos nuevos y usados, descubre servicios e inmuebles y habla directamente con las personas que publican en RedLibertad.</p>'+
  '<div class="market-landing-actions"><a class="market-landing-primary" href="#marketBuscador">Buscar anuncios</a>'+
  '<a class="market-landing-secondary" href="/marketplace?publicar=1">Publicar un anuncio</a></div>'+
  '<ul class="market-landing-benefits" aria-label="Cómo funciona"><li>Explora sin registrarte</li><li>Filtra por ciudad y categoría</li><li>Contacto directo con el anunciante</li></ul>'+
  '</div></section>';
}
function categories(){
 return '<section class="market-landing-section" aria-labelledby="marketLandingCategories">'+
  '<div class="market-landing-section-head"><span class="market-landing-kicker">ENCUENTRA LO QUE NECESITAS</span>'+
  '<h2 id="marketLandingCategories">Compra, vende o encuentra anuncios por categoría</h2>'+
  '<p>De muebles de segunda mano a servicios e inmobiliaria: entra en cada categoría y comprueba los anuncios disponibles.</p></div>'+
  '<div class="market-landing-categories">'+CATEGORIES.map(c=>
   '<a class="market-landing-category" href="'+esc(categoryHref(c.filters))+'">'+
   '<span class="market-landing-icon" aria-hidden="true">'+c.icon+'</span>'+
   '<span class="market-landing-category-text"><strong>'+esc(c.name)+'</strong><span>'+esc(c.copy)+'</span></span>'+
   '<span class="market-landing-arrow" aria-hidden="true">→</span></a>'
  ).join('')+'</div></section>';
}
function ending(){
 return '<section class="market-landing-section market-landing-how" aria-labelledby="marketLandingHow">'+
  '<div class="market-landing-section-head"><span class="market-landing-kicker">COMPRA Y VENTA CON INFORMACIÓN CLARA</span>'+
  '<h2 id="marketLandingHow">Cómo funciona el Marketplace</h2></div>'+
  '<div class="market-landing-steps">'+
  '<div><strong>01 · Busca y compara</strong><p>Filtra los anuncios de segunda mano y otros productos por palabra, categoría, precio o ciudad.</p></div>'+
  '<div><strong>02 · Consulta el anuncio</strong><p>Comprueba fotografías, descripción, ubicación y perfil público antes de decidir.</p></div>'+
  '<div><strong>03 · Contacta o visita la tienda</strong><p>Consulta al anunciante por chat. Cuando exista un enlace de compra, pagarás únicamente en la web del vendedor.</p></div>'+
  '</div></section>'+
  '<section class="market-landing-section market-landing-geo" aria-labelledby="marketLandingSpain">'+
  '<h2 id="marketLandingSpain">Anuncios cerca de ti y productos disponibles en toda España</h2>'+
  '<p>¿Buscas un sofá en Valencia, un móvil de segunda mano o un servicio en tu ciudad? Utiliza el buscador para ver las publicaciones disponibles. Si buscas productos con venta nacional, aplica el filtro <a href="/marketplace/explorar?tipo=product&amp;operacion=sale&amp;nacional=1">Venta en toda España</a>: solo muestra anuncios donde se indica ese ámbito.</p>'+
  '<p>RedLibertad es un espacio para descubrir anuncios y conversar con sus anunciantes. No actúa como intermediario de pago, no garantiza transacciones y no gestiona envíos.</p></section>'+
  '<section class="market-landing-section market-landing-faq" aria-labelledby="marketLandingFaq">'+
  '<h2 id="marketLandingFaq">Preguntas frecuentes sobre compraventa y anuncios</h2>'+
  QUESTIONS.map(([question,answer])=>'<details><summary>'+esc(question)+'</summary><p>'+esc(answer)+'</p></details>').join('')+
  '</section>';
}
function structuredData(){
 return {'@context':'https://schema.org','@graph':[
  {'@type':'WebSite','@id':'https://redlibertad.com/#website',url:'https://redlibertad.com/',name:'RedLibertad',inLanguage:'es-ES'},
  {'@type':'CollectionPage','@id':URL+'#webpage',url:URL,name:TITLE,description:DESCRIPTION,inLanguage:'es-ES',
   isPartOf:{'@id':'https://redlibertad.com/#website'},about:{'@type':'Thing',name:'Compraventa, segunda mano, anuncios, servicios e inmobiliaria'}},
  {'@type':'BreadcrumbList','@id':URL+'#breadcrumbs',itemListElement:[
   {'@type':'ListItem',position:1,name:'RedLibertad',item:'https://redlibertad.com/'},
   {'@type':'ListItem',position:2,name:'Marketplace',item:URL}
  ]}
 ]};
}
module.exports={URL,TITLE,DESCRIPTION,CATEGORIES,QUESTIONS,categoryHref,hero,categories,ending,structuredData};
