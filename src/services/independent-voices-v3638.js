'use strict';

// Proyecto informativo: aún no acepta artículos, votos ni propinas.
// Se mantiene separado de la publicación editorial importada y del feed social.
function renderIndependentVoicesLanding(){
  return [
    '<div class="ed-voices-v3638">',
    '<section class="ed-hero ed-voices-hero-v3638" aria-labelledby="voicesTitleV3638">',
      '<span class="ed-label">PROYECTO EN PREPARACIÓN · REDLIBERTAD</span>',
      '<h1 id="voicesTitleV3638">Voces Independientes</h1>',
      '<p>Un futuro espacio para que las personas publiquen artículos originales, expliquen lo que conocen y reciban reconocimiento de lectores reales.</p>',
      '<p class="ed-voices-status-v3638">Actualmente no admite envíos, puntuaciones ni propinas. Estamos preparando sus reglas y herramientas.</p>',
      '<div class="ed-voices-actions-v3638">',
        '<a href="/noticias">Leer noticias actuales</a>',
        '<a href="#como-funcionara">Conocer el proyecto</a>',
      '</div>',
    '</section>',
    '<section class="ed-voices-section-v3638" id="como-funcionara" aria-labelledby="voicesHowTitleV3638">',
     '<h2 id="voicesHowTitleV3638">Cómo queremos que funcione</h2>',
     '<div class="ed-voices-grid-v3638">',
      '<article><span>01</span><h3>Tu voz, tu autoría</h3><p>Podrás presentar artículos propios sobre actualidad local, explicaciones útiles, análisis o experiencias, identificando qué es noticia y qué es opinión.</p></article>',
      '<article><span>02</span><h3>Fuentes y revisión</h3><p>Las noticias deberán aportar referencias comprobables y pasar una revisión antes de aparecer. Habrá correcciones y posibilidad de denunciar errores.</p></article>',
      '<article><span>03</span><h3>Apoyo de lectores</h3><p>Los lectores podrán reconocer trabajos útiles mediante apoyos no monetarios. Las cifras serán reales y se protegerán frente a votos duplicados.</p></article>',
     '</div>',
    '</section>',
    '<section class="ed-voices-section-v3638 ed-voices-trust-v3638" aria-labelledby="voicesTrustTitleV3638">',
     '<h2 id="voicesTrustTitleV3638">Independencia con transparencia</h2>',
     '<p>No hace falta ser periodista profesional para aportar información, pero sí respetar a las personas, los derechos de autor y la diferencia entre hechos comprobados y opiniones.</p>',
     '<p>No mostraremos a personas o artículos como verificados sin revisión. Las valoraciones no demostrarán que una noticia sea cierta.</p>',
     '<p>Las posibles propinas serán voluntarias y se estudiarán en una fase posterior con verificación de beneficiarios, condiciones económicas claras y cumplimiento fiscal. <strong>Ahora mismo no se reciben ni se pagan propinas.</strong></p>',
    '</section>',
    '<nav class="ed-voices-footnav-v3638" aria-label="Continúa en RedLibertad">',
      '<a href="/noticias">Volver a Noticias</a>',
      '<a href="/resuelve">Ayudar a otras personas en Resuelve</a>',
    '</nav>',
    '</div>'
  ].join('');
}

module.exports={renderIndependentVoicesLanding};
