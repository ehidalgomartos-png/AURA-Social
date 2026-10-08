'use strict';
const express=require('express');
const router=express.Router();
const PUBLISHED='2026-10-08';
const GUIDES=Object.freeze([
  {
    slug:'como-empezar',
    title:'Cómo empezar en RedLibertad: crea tu perfil y encuentra tu espacio',
    short:'Prepara tu cuenta, personaliza tu perfil y descubre contenido público antes de publicar.',
    intro:'Empezar en una comunidad nueva resulta más fácil cuando conoces las herramientas disponibles. En RedLibertad puedes compartir ideas, seguir a otras personas y participar en conversaciones, con controles de privacidad y normas de convivencia.',
    sections:[
      {heading:'Conoce la comunidad antes de registrarte',paragraphs:[
        'Puedes consultar las secciones públicas de personas, publicaciones, comunidades, eventos y temas sin abrir una cuenta. Las publicaciones privadas o reservadas a círculos no aparecen en esos listados públicos.',
        'Usa la página Descubrir para orientarte y la búsqueda para encontrar intereses. No hace falta interactuar con contenido sensible para conocer cómo funciona la red.'
      ],link:['/descubrir','Explorar contenidos públicos']},
      {heading:'Crea tu cuenta y completa tu perfil',paragraphs:[
        'El registro solicita un nombre visible, un nombre de usuario, correo, contraseña y fecha de nacimiento. RedLibertad es una comunidad para mayores de 18 años; debes aceptar sus términos y normas.',
        'Tras entrar, prepara una presentación breve y elige la información que quieres mostrar. Revisa la configuración de privacidad antes de publicar fotos, vídeos o detalles personales.'
      ],link:['/privacy/','Conocer la política de privacidad']},
      {heading:'Tu primera publicación puede ser solo texto',paragraphs:[
        'Una pregunta, una opinión o una presentación sencilla son buenas formas de empezar. También puedes compartir imágenes y vídeos propios, siempre respetando las normas de la comunidad.',
        'Si en una publicación aparece otra persona, comprueba las reglas de consentimiento. Usa las opciones de audiencia y evita compartir datos privados de terceros.'
      ],link:['/community-guidelines/','Leer las normas de la comunidad']},
      {heading:'Encuentra conversaciones que te interesen',paragraphs:[
        'Sigue personas con intereses comunes, participa en comentarios y busca comunidades públicas sobre tus temas favoritos. Puedes guardar publicaciones para retomarlas y bloquear interacciones no deseadas.',
        'No hace falta publicar cada día para participar: conocer a otras personas y contribuir con respuestas respetuosas también forma parte de la comunidad.'
      ],link:['/comunidades','Explorar comunidades']}
    ]
  },
  {
    slug:'privacidad-y-consentimiento',
    title:'Privacidad y consentimiento: comparte con más control',
    short:'Antes de compartir fotos, conversaciones o publicaciones, revisa los límites de audiencia y consentimiento.',
    intro:'Expresarse con libertad también implica decidir qué información mostrar y respetar la privacidad de los demás. Esta guía explica medidas prácticas para usar RedLibertad con más tranquilidad, sin sustituir los textos legales oficiales.',
    sections:[
      {heading:'Distingue contenido público y privado',paragraphs:[
        'No todo lo que se comparte en una red social tiene que ser visible para cualquier visitante. Revisa quién puede ver una publicación antes de enviarla y comprueba la visibilidad de tu perfil.',
        'Los contenidos de audiencias restringidas no deben tratarse como publicaciones públicas; aun así, evita compartir contraseñas, direcciones o documentación personal en fotografías y textos.'
      ],link:['/perfiles','Ver perfiles públicos']},
      {heading:'Si aparecen otras personas, pide permiso',paragraphs:[
        'Que una imagen sea tuya no significa que puedas compartir libremente la imagen de otra persona. Antes de etiquetar o publicar material en el que alguien pueda ser identificado, confirma que existe consentimiento.',
        'RedLibertad incorpora mecanismos de consentimiento para publicaciones con participantes. Revisa los permisos y respeta cualquier revocación o solicitud de retirada.'
      ],link:['/terms/','Consultar los términos de uso']},
      {heading:'Contenido sensible, mayores de edad y moderación',paragraphs:[
        'La plataforma está destinada a mayores de 18 años y dispone de controles para clasificar y limitar la exposición a contenido sensible. El acceso a una cuenta no elimina las reglas de legalidad, seguridad o consentimiento.',
        'Las funciones de denuncia, bloqueo y moderación están pensadas para reducir abusos. No publiques contenido ilegal, no consentido ni datos privados de otras personas.'
      ],link:['/moderation/','Cómo funciona la moderación']},
      {heading:'Protege también tu cuenta',paragraphs:[
        'Usa una contraseña única y revisa las sesiones activas si sospechas que alguien ha entrado en tu cuenta. Evita enviar códigos de acceso por mensajes y desconfía de enlaces que te pidan iniciar sesión fuera del sitio oficial.',
        'Antes de publicar, piensa si el contenido podría circular fuera de su audiencia mediante capturas o reenvíos; los controles de una plataforma no pueden garantizar que otras personas no copien lo que reciben.'
      ],link:['/privacy/','Leer la política de privacidad']}
    ]
  },
  {
    slug:'encontrar-personas-y-comunidades',
    title:'Cómo encontrar personas, temas y comunidades en RedLibertad',
    short:'Descubre perfiles y conversaciones mediante temas, comunidades, publicaciones y eventos abiertos.',
    intro:'Una red social resulta más útil cuando conectas con personas y temas que te interesan. RedLibertad ofrece varios caminos para explorar su contenido público antes de decidir con quién interactuar.',
    sections:[
      {heading:'Empieza por los temas que conoces',paragraphs:[
        'Visita Temas para encontrar intereses como fotografía, arte, música, viajes, creatividad o bienestar. Cada tema reúne enlaces hacia contenido y perfiles públicos relacionados, cuando existen suficientes resultados.',
        'Usa esas páginas como punto de partida y entra en los perfiles para conocer lo que las personas han decidido compartir abiertamente.'
      ],link:['/temas','Ver temas e intereses']},
      {heading:'Descubre perfiles públicos',paragraphs:[
        'La sección Personas permite navegar por perfiles visibles. Algunos usuarios prefieren no aparecer en listados públicos o limitar parte de su actividad; esos ajustes deben respetarse.',
        'Al encontrar una persona afín, revisa sus publicaciones accesibles, síguela si te interesa y evita enviar mensajes insistentes. Las conexiones de calidad nacen de intereses compartidos.'
      ],link:['/perfiles','Encontrar personas']},
      {heading:'Participa en comunidades y conversaciones',paragraphs:[
        'Las comunidades ofrecen espacios organizados en torno a intereses o actividades. Lee su descripción y sus reglas antes de participar y comprueba si la comunidad es pública o requiere solicitud de acceso.',
        'También puedes explorar las publicaciones públicas para comentar ideas, seguir conversaciones o compartir contenido propio que aporte algo al tema.'
      ],link:['/comunidades','Explorar comunidades']},
      {heading:'Eventos y nuevas conversaciones',paragraphs:[
        'Los eventos públicos ayudan a descubrir actividades y encuentros anunciados por la comunidad. Verifica los detalles y conserva precauciones habituales si planeas acudir a un encuentro presencial.',
        'Si hoy no encuentras una conversación adecuada, puedes volver a Descubrir más adelante: el contenido disponible depende de lo que la comunidad publique.'
      ],link:['/eventos','Ver eventos públicos']}
    ]
  }
]);
const bySlug=new Map(GUIDES.map(g=>[g.slug,g]));
const esc=(s='')=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const origin=req=>String(process.env.APP_ORIGIN||(req.protocol+'://'+req.get('host'))).replace(/\/$/,'');
const guidePath=slug=>'/guias/'+slug;
const signupHref=(slug,anchor='registro')=>{
  const query=new URLSearchParams({entry:'guide',entryKey:slug,next:guidePath(slug)});
  return '/?'+query.toString()+'#'+anchor;
};
const jsonLd=value=>JSON.stringify(value).replace(/[<>&]/g,c=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026'}[c]));

function layout(req,{title,description,pathname,body,structuredData,kind='website'}){
  const o=origin(req),canonical=o+pathname;
  const schema=structuredData?'<script type="application/ld+json">'+jsonLd(structuredData)+'</script>':'';
  return '<!doctype html><html lang="es"><head>'+
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<meta name="theme-color" content="#0d2238">'+
    '<title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'">'+
    '<meta name="robots" content="index,follow,max-image-preview:large">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+
    '<meta property="og:type" content="'+esc(kind)+'"><meta property="og:site_name" content="RedLibertad">'+
    '<meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'">'+
    '<meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(o+'/assets/og-redlibertad-v1922.jpg')+'">'+
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'">'+
    '<meta name="twitter:description" content="'+esc(description)+'"><meta name="twitter:image" content="'+esc(o+'/assets/og-redlibertad-v1922.jpg')+'">'+
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'+
    '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/guides-v218.css">'+schema+
    '</head><body><a class="guide-skip" href="#guide-main">Saltar al contenido</a>'+
    '<header class="guide-header"><a class="guide-brand" href="/"><img src="/assets/logo-mark.svg" alt="">RedLibertad</a>'+
    '<nav aria-label="Navegación de guías"><a href="/guias">Guías</a><a href="/descubrir">Descubrir</a>'+
    '<a class="guide-button" href="/#registro">Crear cuenta</a></nav></header>'+
    '<main id="guide-main" class="guide-container">'+body+'</main>'+
    '<footer class="guide-footer"><p>RedLibertad · Comunidad para mayores de 18 años</p>'+
    '<nav aria-label="Información legal"><a href="/privacy/">Privacidad</a><a href="/terms/">Términos</a>'+
    '<a href="/community-guidelines/">Normas</a><a href="/moderation/">Moderación</a></nav>'+
    '<p>Libertad de expresión con límites de legalidad, seguridad y consentimiento.</p></footer></body></html>';
}
function guideCard(g){
  return '<article class="guide-card"><h2><a href="'+guidePath(g.slug)+'">'+esc(g.title)+'</a></h2>'+
    '<p>'+esc(g.short)+'</p><a class="guide-inline-link" href="'+guidePath(g.slug)+'">Leer la guía →</a></article>';
}

router.get('/guias',(req,res)=>{
  const o=origin(req),body='<nav aria-label="Ruta de navegación"><a href="/">Inicio</a> / Guías</nav>'+
    '<section class="guide-hero"><span class="guide-eyebrow">APRENDE Y DESCUBRE</span>'+
    '<h1>Guías para empezar en RedLibertad</h1>'+
    '<p>Aprende a crear tu perfil, compartir con respeto y descubrir personas y comunidades. Guías gratuitas, accesibles sin registrarte y diseñadas para móvil.</p>'+
    '<a class="guide-button" href="/#registro">Crear mi cuenta</a></section>'+
    '<section aria-labelledby="guide-list-title"><h2 id="guide-list-title">Elige por dónde empezar</h2>'+
    '<div class="guide-grid">'+GUIDES.map(guideCard).join('')+'</div></section>'+
    '<section class="guide-next"><h2>¿Quieres explorar primero?</h2><p>Puedes navegar por perfiles y publicaciones públicas antes de registrarte.</p>'+
    '<a class="guide-inline-link" href="/descubrir">Ir a Descubrir →</a></section>';
  const doc={
    '@context':'https://schema.org','@type':'CollectionPage',
    name:'Guías de RedLibertad',url:o+'/guias',
    description:'Guías para conocer RedLibertad, privacidad y comunidades.',
    hasPart:GUIDES.map(g=>({'@type':'Article',headline:g.title,url:o+guidePath(g.slug)}))
  };
  res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
  res.type('html').send(layout(req,{title:'Guías para empezar — RedLibertad',description:'Consejos para crear tu cuenta, compartir con privacidad y descubrir personas y comunidades en RedLibertad.',pathname:'/guias',body,structuredData:doc}));
});

router.get('/guias/:slug',(req,res)=>{
  const guide=bySlug.get(req.params.slug);
  if(!guide){res.setHeader('X-Robots-Tag','noindex');return res.status(404).type('text/plain').send('Guía no encontrada');}
  const o=origin(req),pathname=guidePath(guide.slug);
  const breadcrumbs={
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement:[
      {'@type':'ListItem',position:1,name:'Inicio',item:o+'/'},
      {'@type':'ListItem',position:2,name:'Guías',item:o+'/guias'},
      {'@type':'ListItem',position:3,name:guide.title,item:o+pathname}
    ]
  };
  const article={
    '@context':'https://schema.org','@type':'Article',
    headline:guide.title,description:guide.short,
    datePublished:PUBLISHED,dateModified:PUBLISHED,
    inLanguage:'es',author:{'@type':'Organization',name:'RedLibertad'},
    publisher:{'@type':'Organization',name:'RedLibertad'},
    mainEntityOfPage:o+pathname
  };
  const paragraphs=guide.sections.map((section,i)=>'<section class="guide-section">'+
    '<h2>'+esc((i+1)+'. '+section.heading)+'</h2>'+
    section.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+
    '<a class="guide-inline-link" href="'+esc(section.link[0])+'">'+esc(section.link[1])+' →</a></section>').join('');
  const other=GUIDES.filter(x=>x.slug!==guide.slug);
  const body='<nav aria-label="Ruta de navegación"><a href="/">Inicio</a> / <a href="/guias">Guías</a> / '+esc(guide.title)+'</nav>'+
    '<article class="guide-article"><header class="guide-hero"><span class="guide-eyebrow">GUÍA REDLIBERTAD · +18</span>'+
    '<h1>'+esc(guide.title)+'</h1><p>'+esc(guide.intro)+'</p></header>'+
    paragraphs+'<section class="guide-next"><h2>¿Quieres formar parte de RedLibertad?</h2>'+
    '<p>Puedes registrarte gratuitamente o acceder a tu cuenta. Tus decisiones de privacidad siguen estando en tus manos.</p>'+
    '<div class="guide-actions"><a class="guide-button" href="'+esc(signupHref(guide.slug))+'">Crear cuenta</a>'+
    '<a class="guide-button guide-button-ghost" href="'+esc(signupHref(guide.slug,'acceso'))+'">Ya tengo cuenta</a></div></section></article>'+
    '<aside class="guide-related" aria-labelledby="guide-related-title"><h2 id="guide-related-title">Más guías</h2>'+
    '<div class="guide-grid">'+other.map(guideCard).join('')+'</div></aside>';
  res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
  res.type('html').send(layout(req,{title:guide.title+' — RedLibertad',description:guide.short,pathname,body,
    structuredData:[breadcrumbs,article],kind:'article'}));
});

router.get('/sitemap-guias.xml',(req,res)=>{
  const o=origin(req);
  const paths=['/guias',...GUIDES.map(g=>guidePath(g.slug))];
  const xml='<?xml version="1.0" encoding="UTF-8"?>'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
    paths.map(path=>'<url><loc>'+esc(o+path)+'</loc><lastmod>'+PUBLISHED+'</lastmod></url>').join('')+
    '</urlset>';
  res.setHeader('Cache-Control','public, max-age=3600, must-revalidate');
  res.type('application/xml').send(xml);
});
module.exports={router,GUIDES,guidePath,signupHref,PUBLISHED};
