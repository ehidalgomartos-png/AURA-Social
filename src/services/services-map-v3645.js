'use strict';
// V3.6.45 — Explora RedLibertad: public, curated map of existing routes.
// Static, first-party links. No live usage counts, fictional activity or user profiling.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=[
 {id:'ayuda',title:'Ayuda entre personas',kicker:'ESCUCHAR · COMPARTIR · RESOLVER',intro:'Pregunta cuando lo necesites o comparte una experiencia útil con alguien más.',services:[
  {id:'resuelve',title:'Resuelve',description:'Cuenta tu duda o necesidad y encuentra consejos de otras personas.',href:'/resuelve',icon:'heart-handshake',tag:'Pedir ayuda',keywords:'dudas problemas soluciones consejo orientación resolver'},
  {id:'ayudar',title:'Ayudar a otras personas',description:'Descubre peticiones abiertas y aporta tu experiencia.',href:'/resuelve#questions',icon:'hand-heart',tag:'Participar',keywords:'ayudar preguntas sin respuesta colaboración voluntariado'},
  {id:'soluciones',title:'Soluciones de la comunidad',description:'Lee aportaciones útiles que han pasado por revisión.',href:'/resuelve#solutions',icon:'check-circle',tag:'Aprender',keywords:'respuesta solución experiencias ayuda revisadas'}
 ]},
 {id:'informacion',title:'Información y conocimiento',kicker:'LEER · ENTENDER · ESCRIBIR',intro:'Actualidad, explicaciones y artículos originales para conocer otros puntos de vista.',services:[
  {id:'noticias',title:'Noticias',description:'Consulta actualidad organizada por categorías y fuentes.',href:'/noticias',icon:'newspaper',tag:'Actualidad',keywords:'noticias información actualidad actualidad local'},
  {id:'voces',title:'Voces Independientes',description:'Lee artículos originales o prepara el tuyo para revisión editorial.',href:'/noticias/redactores',icon:'pen-line',tag:'Participa escribiendo',keywords:'escribir periodismo autor artículo noticia opinión redactor'},
  {id:'articulos',title:'Artículos publicados',description:'Explora noticias, análisis, reportajes y opiniones de la comunidad.',href:'/noticias/redactores/voces',icon:'book-open',tag:'Lectura',keywords:'reportajes artículos redactores analizar'},
  {id:'guias',title:'Guías',description:'Encuentra explicaciones y recursos para orientarte en distintos temas.',href:'/guias',icon:'bookmark',tag:'Recursos',keywords:'guía aprender información consejos'}
 ]},
 {id:'comercio',title:'Compras y comparaciones',kicker:'BUSCAR · COMPARAR · DECIDIR',intro:'Conoce anuncios, ofertas y tiendas; toma tus propias decisiones con información clara.',services:[
  {id:'marketplace',title:'Marketplace',description:'Explora anuncios de productos, servicios e inmuebles de otras personas.',href:'/marketplace/explorar',icon:'store',tag:'Compra y venta',keywords:'comprar vender alquilar ofertas anuncios tienda inmueble segunda mano'},
  {id:'comparador',title:'Comparador de precios',description:'Busca productos y consulta opciones de distintas tiendas.',href:'/comparar',icon:'scan-search',tag:'Compara',keywords:'comparar precios ofertas tiendas productos'},
  {id:'tiendas',title:'Tiendas participantes',description:'Descubre comercios incluidos en el comparador.',href:'/comparar/comercios/tiendas',icon:'shopping-basket',tag:'Comercios',keywords:'tiendas comercios precios productos profesionales'}
 ]},
 {id:'comunidad',title:'Tu comunidad',kicker:'DESCUBRIR · PUBLICAR · CONVERSAR',intro:'Encuentra personas y espacios compartidos, descubre contenido o continúa tus conversaciones.',services:[
  {id:'personas',title:'Personas',description:'Descubre perfiles públicos que han elegido aparecer en el directorio.',href:'/perfiles',icon:'users',tag:'Descubrir',keywords:'gente perfiles contactos amigos personas conocer'},
  {id:'comunidades',title:'Comunidades',description:'Encuentra grupos públicos y conversaciones sobre intereses comunes.',href:'/comunidades',icon:'network',tag:'Grupos',keywords:'comunidades grupos temas intereses'},
  {id:'publicaciones',title:'Publicaciones',description:'Lee ideas, fotografías y conversaciones compartidas públicamente.',href:'/publicaciones',icon:'message-square',tag:'Compartir',keywords:'posts publicaciones ideas comentarios fotos'},
  {id:'reels',title:'Reels',description:'Descubre vídeos cortos que la comunidad comparte públicamente.',href:'/reels',icon:'play-circle',tag:'Vídeos',keywords:'reels videos vídeos vertical'},
  {id:'eventos',title:'Eventos',description:'Consulta actividades y encuentros compartidos en la plataforma.',href:'/eventos',icon:'calendar-days',tag:'Actividades',keywords:'evento actividades reunión encuentros agenda'},
  {id:'buscar',title:'Buscar en RedLibertad',description:'Encuentra contenido y temas públicos desde un único buscador.',href:'/buscar',icon:'search',tag:'Buscador',keywords:'buscar publicaciones personas comunidades temas'},
  {id:'cuenta',title:'Mi espacio y mensajes',description:'Accede a tu perfil, tus publicaciones y tus conversaciones privadas.',href:'/app',icon:'user-round',tag:'Necesita sesión',keywords:'iniciar sesión registro mensajes chat privado mi perfil cuenta'}
 ]}
];
const icons={
 'heart-handshake':'<path d="M20.8 4.6a5.6 5.6 0 0 0-7.9 0l-.9.9-.9-.9a5.6 5.6 0 0 0-7.9 7.9l8.8 8.4 8.8-8.4a5.6 5.6 0 0 0 0-7.9Z"/><path d="m8 11 2.5 2.5a2 2 0 0 0 2.8 0L16 11"/>',
 'hand-heart':'<path d="M4 15v4h5.5l7.9-5a2.3 2.3 0 0 0-2.6-3.8l-3.7 2H7l-3 2.8Z"/><path d="M18 4.5c-1.8-1.8-4.5.2-4.5.2S10.8 2.7 9 4.5C7.2 6.3 8.4 8.4 10 9.8l3.5 3 3.5-3c1.6-1.4 2.8-3.5 1-5.3Z"/>',
 'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 'newspaper':'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3M8 15h8M8 18h8"/><rect x="13" y="10" width="3" height="3"/>',
 'pen-line':'<path d="m12 19 8-8-7-7-8 8-2 9 9-2Z"/><path d="m10 7 7 7M3 21h18"/>',
 'book-open':'<path d="M12 6C9 3.5 6 4 3 5v14c3-1 6-1.5 9 1 3-2.5 6-2 9-1V5c-3-1-6-1.5-9 1Z"/><path d="M12 6v14"/>',
 'bookmark':'<path d="M6 3h12v18l-6-4-6 4V3Z"/><path d="M9 8h6"/>',
 'store':'<path d="M4 10h16l-1.5-6h-13L4 10ZM5 10v11h14V10M9 21v-7h6v7"/><path d="M4 10c0 3 4 3 4 0 0 3 4 3 4 0 0 3 4 3 4 0 0 3 4 3 4 0"/>',
 'scan-search':'<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/><circle cx="11" cy="11" r="4"/><path d="m14 14 4 4"/>',
 'shopping-basket':'<path d="M3 10h18l-2 11H5L3 10ZM8 10l4-7 4 7M8 14v3M12 14v3M16 14v3"/>',
 'users':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1h-3"/>',
 'network':'<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M10 8 6.5 16M14 8l3.5 8M8 19h8"/>',
 'message-square':'<path d="M4 4h16v13H9l-5 4V4Z"/><path d="M8 9h8M8 13h6"/>',
 'play-circle':'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
 'calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M13 14h3"/>',
 'search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 'user-round':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(icons[name]||icons.search)+'</svg>';
function allServices(){return groups.flatMap(g=>g.services.map(s=>({...s,group:g.id})));}
// V3.6.49: datos estructurados basados únicamente en enlaces públicos presentes en el mapa.
function mapStructuredData(){
 const base='https://redlibertad.com';
 const page=base+'/explorar';
 const services=allServices().filter(s=>s.href!=='/app'&&!s.href.includes('#'));
 return {
  '@context':'https://schema.org',
  '@graph':[
   {'@type':'CollectionPage','@id':page+'#webpage',url:page,name:'Explora RedLibertad: ayuda, noticias y comunidad',description:'Mapa de servicios públicos para ayudar, informarte, comparar productos y conectar con otras personas.',inLanguage:'es-ES',breadcrumb:{'@id':page+'#breadcrumb'},mainEntity:{'@id':page+'#services'}},
   {'@type':'BreadcrumbList','@id':page+'#breadcrumb',itemListElement:[
    {'@type':'ListItem',position:1,name:'Inicio',item:base+'/'},
    {'@type':'ListItem',position:2,name:'Servicios',item:page}
   ]},
   {'@type':'ItemList','@id':page+'#services',name:'Servicios públicos de RedLibertad',numberOfItems:services.length,itemListElement:services.map((s,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'WebPage','@id':base+s.href,name:s.title}}))}
  ]
 };
}
function renderMap(){
 const number=allServices().length;
 const jsonLd=JSON.stringify(mapStructuredData()).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 // Atajos a servicios reales: una pulsación basta para llegar a la acción elegida.
 const tasks=[
  {href:'/resuelve',text:'Necesito ayuda',icon:'heart-handshake'},
  {href:'/resuelve#questions',text:'Quiero ayudar',icon:'hand-heart'},
  {href:'/noticias',text:'Quiero informarme',icon:'newspaper'},
  {href:'/marketplace/explorar',text:'Comprar o vender',icon:'store'},
  {href:'/comparar',text:'Comparar productos',icon:'scan-search'},
  {href:'/perfiles',text:'Conectar con personas',icon:'users'}
 ];
 const quick=tasks.map(t=>'<a class="sm-intent" href="'+esc(t.href)+'"><span class="sm-intent-icon">'+icon(t.icon)+'</span><span>'+esc(t.text)+'</span><span class="sm-intent-arrow" aria-hidden="true">↗</span></a>').join('');
 const sections=groups.map((g,i)=>{
  const cards=g.services.map(s=>'<a class="sm-service" href="'+esc(s.href)+'" data-service-id="'+esc(s.id)+'" data-search="'+esc([s.title,s.description,s.tag,s.keywords].join(' '))+'">'+
    '<span class="sm-service-icon">'+icon(s.icon)+'</span>'+
    '<span class="sm-service-tag">'+esc(s.tag)+'</span>'+
    '<span class="sm-service-heading">'+esc(s.title)+'</span>'+
    '<span class="sm-service-description">'+esc(s.description)+'</span>'+
    '<span class="sm-service-cta">Explorar <span aria-hidden="true">↗</span></span></a>').join('');
  return '<section id="'+g.id+'" class="sm-group sm-group-'+g.id+'" data-map-section="'+g.id+'" aria-labelledby="sm-heading-'+g.id+'">'+
   '<div class="sm-group-head"><div><span class="sm-eyebrow">'+esc(g.kicker)+'</span><h2 id="sm-heading-'+g.id+'">'+esc(g.title)+'</h2><p>'+esc(g.intro)+'</p></div>'+
   '<span class="sm-group-index" aria-hidden="true">0'+(i+1)+'</span></div>'+
   '<div class="sm-services">'+cards+'</div></section>';
 }).join('');
 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<meta name="theme-color" content="#102f42">'+
 '<title>Explora RedLibertad | Ayuda, noticias, comparador y comunidad</title>'+
 '<meta name="description" content="Descubre qué hacer en RedLibertad: resolver dudas, ayudar a otras personas, leer noticias, comparar precios y participar en comunidades.">'+
 '<meta name="robots" content="index,follow,max-image-preview:large">'+
 '<link rel="canonical" href="https://redlibertad.com/explorar">'+
 '<meta property="og:type" content="website"><meta property="og:site_name" content="RedLibertad">'+
 '<meta property="og:title" content="Explora RedLibertad — Todos nuestros servicios">'+
 '<meta property="og:description" content="Un mapa visual para descubrir todo lo que puedes hacer en la comunidad.">'+
 '<meta property="og:url" content="https://redlibertad.com/explorar">'+
 '<meta property="og:image" content="https://redlibertad.com/assets/og-redlibertad-v1922.jpg">'+
 '<meta name="twitter:card" content="summary_large_image">'+
 '<meta name="twitter:title" content="Explora RedLibertad | Servicios para ayudar y conectar">'+
 '<meta name="twitter:description" content="Tu mapa de ayuda, noticias, comparador de precios y comunidad.">'+
 '<script type="application/ld+json">'+jsonLd+'</script>'+
 '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'+
 '<link rel="stylesheet" href="/services-map-v3645.css?v=3.6.45">'+
 '<script defer src="/services-map-v3645.js?v=3.6.45"></script>'+
 '</head><body class="services-map-v3645">'+
 '<a class="sm-skip" href="#sm-main">Saltar al contenido</a>'+
 '<header class="sm-header"><div class="sm-container sm-header-inner">'+
 '<a href="/" class="sm-brand" aria-label="RedLibertad, ir a portada"><img src="/assets/logo-mark.svg" width="39" height="39" alt=""><strong>RedLibertad</strong></a>'+
 '<nav aria-label="Navegación principal"><a href="#sm-services" aria-current="page">Servicios</a><a href="/resuelve">Resuelve</a><a href="/marketplace/explorar">Marketplace</a><a class="sm-nav-account" href="/app">Entrar en mi espacio</a></nav>'+
 '</div></header>'+
 '<main id="sm-main" class="sm-container" tabindex="-1">'+
 '<nav class="sm-breadcrumb" aria-label="Ruta de navegación"><a href="/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">Servicios</span></nav>'+
 '<section class="sm-hero" aria-labelledby="sm-title"><div class="sm-hero-copy">'+
 '<span class="sm-hero-eyebrow">EL MAPA DE TU COMUNIDAD</span>'+
 '<h1 id="sm-title">Todo RedLibertad, <em>en un solo lugar.</em></h1>'+
 '<p>Un espacio para ayudar, informarte, compartir, descubrir personas y tomar mejores decisiones. Elige lo que necesitas hoy.</p>'+
 '<div class="sm-hero-actions"><a href="#sm-services" class="sm-hero-primary">Explorar todos los servicios <span aria-hidden="true">↗</span></a><a href="#sm-intents" class="sm-hero-secondary">No sé por dónde empezar</a></div>'+
 '</div><div class="sm-hero-map" aria-label="Ayuda, información, compras y comunidad conectadas en RedLibertad">'+
 '<div class="sm-map-node sm-map-node-a">Ayuda</div><div class="sm-map-node sm-map-node-b">Infórmate</div>'+
 '<div class="sm-map-core"><img src="/assets/logo-mark.svg" width="66" height="66" alt=""><strong>Una comunidad</strong><small>Muchos caminos</small></div>'+
 '<div class="sm-map-node sm-map-node-c">Compara</div><div class="sm-map-node sm-map-node-d">Conecta</div>'+
 '</div></section>'+
 '<section id="sm-intents" class="sm-intents" aria-labelledby="sm-intents-title"><div class="sm-section-intro"><span class="sm-eyebrow">ENCUENTRA TU CAMINO</span><h2 id="sm-intents-title">¿Qué te gustaría hacer hoy?</h2><p>Empieza por una necesidad. Cada camino te llevará al lugar adecuado.</p></div><div class="sm-intent-grid">'+quick+'</div></section>'+
 '<section id="sm-services" class="sm-catalog" aria-labelledby="sm-catalog-title"><div class="sm-catalog-top">'+
 '<div><span class="sm-eyebrow">TODAS LAS HERRAMIENTAS</span><h2 id="sm-catalog-title">Tu mapa de servicios</h2><p>Encuentra lo que buscas por nombre o tema.</p></div>'+
 '<label class="sm-search-label" for="sm-search">Buscar un servicio <span class="sm-search-wrap"><span aria-hidden="true">'+icon('search')+'</span><input id="sm-search" type="search" autocomplete="off" maxlength="100" placeholder="Ej.: noticias, ayuda, comparar..." aria-describedby="sm-search-status"></span></label>'+
 '</div><p id="sm-search-status" class="sm-search-status" role="status" aria-live="polite">Mostrando '+number+' servicios y accesos.</p>'+
 '<div id="sm-no-results" class="sm-no-results" hidden><h3>No encontramos ese servicio</h3><p>Prueba con otra palabra o vuelve a ver todas las opciones.</p><button id="sm-clear" type="button">Ver todos los servicios</button></div>'+
 sections+'</section>'+
 '<section class="sm-connection" aria-labelledby="sm-connection-title"><div><span class="sm-eyebrow">TODO FORMA PARTE DE REDLIBERTAD</span><h2 id="sm-connection-title">Distintos servicios, una misma comunidad.</h2><p>Una pregunta puede comenzar en Resuelve. Una experiencia puede convertirse en un artículo de Voces Independientes. También puedes compartir, comparar productos o encontrar personas con intereses comunes.</p></div><a href="/app">Entrar en RedLibertad <span aria-hidden="true">↗</span></a></section>'+
 '</main><footer class="sm-footer"><div class="sm-container sm-footer-inner"><p><strong>RedLibertad</strong> · Tu espacio para compartir y ayudar. Plataforma para mayores de 18 años.</p>'+
 '<nav aria-label="Información"><a href="/">Inicio</a><a href="/privacy/">Privacidad</a><a href="/terms/">Términos</a><a href="/community-guidelines/">Normas</a></nav></div></footer>'+
 '</body></html>';
}
module.exports={groups,allServices,mapStructuredData,renderMap,esc};
