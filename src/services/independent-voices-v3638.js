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
      '<p class="ed-voices-status-v3638">Ya puedes redactar borradores y enviarlos a revisión humana. Aún no hay publicación pública, puntuaciones ni propinas.</p>',
      '<div class="ed-voices-actions-v3638">',
        '<a href="/noticias/redactores/escribir">Escribir mis borradores</a>',
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


function renderIndependentVoicesEditor(){
 return [
  '<div class="ed-voices-editor-v3639">',
  '<nav class="ed-voices-editor-breadcrumb-v3639" aria-label="Navegación de redactores"><a href="/noticias/redactores">← Voces Independientes</a></nav>',
  '<section class="ed-hero" aria-labelledby="editorTitleV3639"><span class="ed-label">SOLO TÚ PUEDES VER TUS BORRADORES</span><h1 id="editorTitleV3639">Escribe tu artículo</h1>',
  '<p>Guarda tus ideas y vuelve a editarlas cuando quieras. Los borradores son privados. Puedes enviar un texto completo a revisión humana, pero no se publicará automáticamente. No existen puntos ni propinas.</p></section>',
  '<div class="ed-voices-editor-columns-v3639">',
   '<section class="ed-voices-drafts-v3639" aria-labelledby="draftsHeadingV3639">',
    '<h2 id="draftsHeadingV3639">Mis borradores</h2>',
    '<p id="draftsMessageV3639" role="status" aria-live="polite">Comprobando tu sesión…</p>',
    '<div id="draftListV3639" class="ed-voices-draft-list-v3639"></div>',
    '<button id="draftNewV3639" type="button" class="ed-voices-primary-v3639" hidden>Nuevo borrador</button>',
    '<a id="draftLoginV3639" href="/app" hidden>Entrar en RedLibertad para escribir</a>',
   '</section>',
   '<section class="ed-voices-form-section-v3639" id="editorFormSectionV3639" aria-labelledby="draftFormTitleV3639" hidden>',
    '<h2 id="draftFormTitleV3639">Nuevo borrador</h2>',
    '<form id="draftFormV3639">',
     '<label for="draftKindV3639">Tipo de artículo</label>',
     '<select id="draftKindV3639" required>',
      '<option value="noticia">Noticia</option><option value="reportaje">Reportaje</option>',
      '<option value="analisis">Análisis</option><option value="opinion">Opinión</option>',
     '</select>',
     '<label for="draftTitleV3639">Título</label><input id="draftTitleV3639" maxlength="180" minlength="3" required placeholder="Escribe un título claro">',
     '<label for="draftBodyV3639">Texto del borrador</label>',
     '<textarea id="draftBodyV3639" maxlength="15000" minlength="1" rows="12" required placeholder="Empieza con la información principal; podrás continuar más adelante."></textarea>',
     '<label for="draftSourcesV3639">Enlaces a las fuentes (opcional mientras sea borrador)</label>',
     '<textarea id="draftSourcesV3639" rows="3" placeholder="Un enlace HTTPS por línea; máximo 8 fuentes."></textarea>',
     '<p class="ed-voices-hint-v3639">Se guarda solo para tu cuenta. Las noticias necesitarán fuentes y revisión humana antes de poder publicarse en futuras versiones.</p>',
     '<div class="ed-voices-editor-actions-v3639"><button id="draftSaveV3639" type="submit" class="ed-voices-primary-v3639">Guardar borrador</button>',
      '<button id="draftDeleteV3639" type="button" class="ed-voices-danger-v3639" hidden>Eliminar borrador</button></div>',
     '<label class="ed-voices-editor-consent-v3640"><input id="draftCertifyV3640" type="checkbox"><span>Confirmo que el artículo es original, que puedo usar su contenido y que deseo enviarlo a revisión humana. No se publicará automáticamente.</span></label>',
     '<button id="draftSubmitV3640" type="button" class="ed-voices-primary-v3639" hidden>Enviar a revisión editorial</button>',
     '<p id="draftReviewStatusV3640" role="status" aria-live="polite">Solo los artículos suficientemente desarrollados y con las fuentes necesarias pueden enviarse a revisión.</p>',
    '</form>',
    '<p id="draftEditorStatusV3639" role="status" aria-live="polite"></p>',
   '</section>',
  '</div></div>'
 ].join('');
}


function renderIndependentVoicesReviewPanel(){
 return [
  '<div class="ed-voices-editor-v3639">',
  '<nav class="ed-voices-editor-breadcrumb-v3639"><a href="/noticias/redactores">← Voces Independientes</a></nav>',
  '<section class="ed-hero"><span class="ed-label">ADMINISTRACIÓN · REVISIÓN HUMANA</span><h1>Revisión de artículos independientes</h1><p>Las decisiones quedan registradas. Aprobar un artículo en esta fase no lo publica ni autoriza cobros o puntos.</p></section>',
  '<section class="ed-voices-form-section-v3639" aria-labelledby="reviewHeadingV3640">',
   '<h2 id="reviewHeadingV3640">Artículos pendientes</h2>',
   '<p id="reviewQueueStatusV3640" role="status" aria-live="polite">Consultando la cola…</p>',
   '<button id="reviewRefreshV3640" type="button" class="ed-voices-primary-v3639">Actualizar la cola</button>',
   '<div id="reviewQueueV3640" class="ed-voices-review-queue-v3640"></div>',
  '</section>',
  '</div>'
 ].join('');
}

module.exports={renderIndependentVoicesLanding,renderIndependentVoicesEditor,renderIndependentVoicesReviewPanel};
