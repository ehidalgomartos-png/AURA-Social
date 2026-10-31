'use strict';
const {escapeHtml:esc,publicSource,types}=require('./independent-publication-v3641');
function when(value){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'':date.toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Madrid'});
}
const path=id=>'/noticias/redactores/voces/'+encodeURIComponent(String(id));
const authorPath=name=>'/noticias/redactores/autores/'+encodeURIComponent(String(name));
const kinds=['noticia','reportaje','analisis','opinion'];
function directory(items,selectedKind=null){
 const tabs='<nav class="voices-directory-tabs-v3643" aria-label="Filtrar artículos por tipo">'+
  '<a href="/noticias/redactores/voces"'+(!selectedKind?' aria-current="page"':'')+'>Todos</a>'+
  kinds.map(k=>'<a href="/noticias/redactores/voces?tipo='+encodeURIComponent(k)+'"'+(selectedKind===k?' aria-current="page"':'')+'>'+esc(types[k])+'</a>').join('')+'</nav>';
 const cards=items.map(a=>[
  '<article class="voices-public-card-v3641">',
   '<p class="voices-public-meta-v3641">'+esc(types[a.kind]||'Artículo')+' · <a href="'+authorPath(a.author_username)+'">@'+esc(a.author_username)+'</a> · '+esc(when(a.published_at))+'</p>',
   '<h2><a href="'+path(a.id)+'">'+esc(a.title)+'</a></h2>',
   '<p>'+esc(String(a.body||'').slice(0,230))+(String(a.body||'').length>230?'…':'')+'</p>',
   '<a class="voices-public-read-v3641" href="'+path(a.id)+'">Leer artículo original</a>',
  '</article>'
 ].join('')).join('');
 return '<div class="voices-public-v3641">'+
   '<nav class="voices-public-back-v3641"><a href="/noticias/redactores">← Voces Independientes</a></nav>'+
   '<header class="voices-public-head-v3641"><span>ARTÍCULOS DE PERSONAS INDEPENDIENTES</span>'+
   '<h1>Voces de la comunidad</h1><p>Textos originales de usuarios de RedLibertad con revisión editorial previa. La opinión se identifica y los apoyos no determinan la veracidad.</p></header>'+tabs+
   (cards?'<section class="voices-public-grid-v3641" aria-label="Artículos publicados">'+cards+'</section>':
    '<p class="voices-public-empty-v3641">Todavía no se han publicado artículos independientes. Puedes empezar a escribir un borrador privado.</p>')+
   '<p class="voices-public-note-v3641">Las aportaciones son responsabilidad de sus autores. La revisión editorial no constituye una certificación profesional ni garantiza la exactitud de todas las afirmaciones.</p>'+
   '<a class="voices-public-write-v3641" href="/noticias/redactores/escribir">Escribir mi artículo</a>'+
   '</div>';
}
function article(a){
 const sources=(Array.isArray(a.sources)?a.sources:[]).map(publicSource).filter(Boolean);
 const refs=sources.map((url,i)=>'<li><a href="'+esc(url)+'" target="_blank" rel="nofollow noopener noreferrer external">Fuente '+(i+1)+': '+esc(new URL(url).hostname)+'</a></li>').join('');
 const body=String(a.body||'');
 const byline='@'+String(a.author_username||'usuario');
 return '<div class="voices-public-v3641">'+
 '<nav class="voices-public-back-v3641"><a href="/noticias/redactores/voces">← Todos los artículos</a></nav>'+
 '<article class="voices-public-article-v3641" aria-labelledby="voicesArticleTitleV3641">'+
 '<p class="voices-public-meta-v3641">'+esc(types[a.kind]||'Artículo')+' · '+esc(when(a.published_at))+'</p>'+
 '<h1 id="voicesArticleTitleV3641">'+esc(a.title)+'</h1>'+
 '<p class="voices-public-byline-v3641">Artículo de '+esc(byline)+' · Redactor independiente en RedLibertad</p>'+
 '<p class="voices-public-note-v3641">Revisión editorial previa. Este contenido no es una acreditación profesional y las opiniones son del autor.</p>'+
 '<div class="voices-public-body-v3641">'+esc(body)+'</div>'+
 '<section class="voices-public-sources-v3641" aria-labelledby="voicesSourcesV3641"><h2 id="voicesSourcesV3641">Fuentes aportadas</h2>'+
 (refs?'<ol>'+refs+'</ol>':'<p>Texto de opinión sin fuentes externas aportadas.</p>')+'</section>'+
 '<p class="voices-public-note-v3641">Si observas un error o un posible incumplimiento, contacta con el equipo de moderación de RedLibertad. Los contenidos pueden corregirse o retirarse.</p>'+
 '<section id="voicesSupportV3642" class="voices-support-v3642" data-publication-id="'+esc(a.id)+'" aria-labelledby="voicesSupportTitleV3642">'+
 '<h2 id="voicesSupportTitleV3642">¿Te ha resultado útil este artículo?</h2>'+
 '<p>Reconoce el trabajo del autor si te ha ayudado a comprender un tema. Solo un apoyo voluntario por cuenta y artículo: no equivale a verificar la información ni tiene valor económico.</p>'+
 '<p id="voicesSupportCountV3642" role="status" aria-live="polite">Consultando apoyos reales…</p>'+
 '<button id="voicesSupportActionV3642" type="button" hidden disabled>Me ha resultado útil</button>'+
 '<a id="voicesSupportLoginV3642" href="/app" hidden>Entrar para apoyar</a>'+
 '<p id="voicesSupportStatusV3642" role="status" aria-live="polite"></p>'+
 '</section>'+
 '<section class="voices-report-v3643" id="voicesReportV3643" data-publication-id="'+esc(a.id)+'" aria-labelledby="voicesReportHeadingV3643">'+
 '<details><summary id="voicesReportHeadingV3643">Avisar de un posible error en este artículo</summary>'+
 '<p>Tu aviso es privado para el equipo editorial. Enviarlo no elimina automáticamente el contenido.</p>'+
 '<form id="voicesReportFormV3643">'+
 '<label for="voicesReportReasonV3643">Motivo del aviso</label>'+
 '<select id="voicesReportReasonV3643" required><option value="inexactitud">Información incorrecta</option><option value="sin_fuentes">Fuentes insuficientes</option><option value="plagio">Posible copia sin permiso</option><option value="privacidad">Datos personales o privacidad</option><option value="otro">Otro problema</option></select>'+
 '<label for="voicesReportDetailsV3643">Explica qué deberíamos revisar</label>'+
 '<textarea id="voicesReportDetailsV3643" minlength="20" maxlength="1200" rows="4" required placeholder="Explica el motivo y, si puedes, indica qué parte del texto afecta."></textarea>'+
 '<button type="submit" id="voicesReportSubmitV3643">Enviar aviso privado</button>'+
 '<p id="voicesReportStatusV3643" role="status" aria-live="polite"></p>'+
 '</form></details></section>'+
 '</article></div>';
}
function authorProfile(name,items){
 const publicName=items[0]?.author_username||name;
 const cards=items.map(a=>[
  '<article class="voices-public-card-v3641"><p class="voices-public-meta-v3641">'+esc(types[a.kind]||'Artículo')+' · '+esc(when(a.published_at))+'</p>',
  '<h2><a href="'+path(a.id)+'">'+esc(a.title)+'</a></h2>',
  '<p>'+esc(String(a.body||'').slice(0,180))+(String(a.body||'').length>180?'…':'')+'</p></article>'
 ] .join('')).join('');
 return '<div class="voices-public-v3641">'+
  '<nav class="voices-public-back-v3641"><a href="/noticias/redactores/voces">← Todos los artículos</a></nav>'+
  '<header class="voices-public-head-v3641"><span>COLABORADOR INDEPENDIENTE</span>'+
  '<h1>Artículos de @'+esc(publicName)+'</h1>'+
  '<p>Únicamente se muestran artículos publicados, autorizados y revisados. Este perfil no constituye acreditación profesional ni aporta datos privados del autor.</p></header>'+
  '<section class="voices-public-grid-v3641" aria-label="Artículos públicos del autor">'+cards+'</section>'+
  '</div>';
}
module.exports={directory,article,authorProfile,path,authorPath,when};
