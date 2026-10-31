'use strict';
const {escapeHtml:esc,publicSource,types}=require('./independent-publication-v3641');
function when(value){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'':date.toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Madrid'});
}
const path=id=>'/noticias/redactores/voces/'+encodeURIComponent(String(id));
function directory(items){
 const cards=items.map(a=>[
  '<article class="voices-public-card-v3641">',
   '<p class="voices-public-meta-v3641">'+esc(types[a.kind]||'Artículo')+' · @'+esc(a.author_username)+' · '+esc(when(a.published_at))+'</p>',
   '<h2><a href="'+path(a.id)+'">'+esc(a.title)+'</a></h2>',
   '<p>'+esc(String(a.body||'').slice(0,230))+(String(a.body||'').length>230?'…':'')+'</p>',
   '<a class="voices-public-read-v3641" href="'+path(a.id)+'">Leer artículo original</a>',
  '</article>'
 ].join('')).join('');
 return '<div class="voices-public-v3641">'+
   '<nav class="voices-public-back-v3641"><a href="/noticias/redactores">← Voces Independientes</a></nav>'+
   '<header class="voices-public-head-v3641"><span>ARTÍCULOS DE PERSONAS INDEPENDIENTES</span>'+
   '<h1>Voces de la comunidad</h1><p>Textos originales de usuarios de RedLibertad con revisión editorial previa. La opinión se identifica y los apoyos no determinan la veracidad.</p></header>'+
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
 '</article></div>';
}
module.exports={directory,article,path,when};
