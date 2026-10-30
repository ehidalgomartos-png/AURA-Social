'use strict';
// V3.6.6: compartir explícitamente soluciones autorizadas; nunca mensajes automáticos.
const ORIGIN='https://redlibertad.com';
function escapeAttr(raw){
 return String(raw??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
}
function shareableResuelveUrl(url){
 if(typeof url!=='string')return false;
 return /^https:\/\/redlibertad\.com\/resuelve\/(?:solucion\/[1-9]\d{0,15}|temas\/(?:hogar|tecnologia|tramites|estudios|vida-cotidiana))$/.test(url);
}
function renderPublicShareLinks(canonical,kind='solucion'){
 if(!shareableResuelveUrl(canonical))return '';
 const isTopic=kind==='tema';
 const title=isTopic?'Compartir este tema':'Compartir esta solución revisada';
 const text=(isTopic?'Aquí encontrarás consejos revisados que pueden ayudar: ':
   'Esta solución revisada puede servirle a otra persona: ')+canonical;
 const methods=[
  ['WhatsApp','https://api.whatsapp.com/send?text='+encodeURIComponent(text)],
  ['Facebook','https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(canonical)],
  ['Telegram','https://t.me/share/url?'+new URLSearchParams({url:canonical,text:isTopic?'Temas de ayuda en Resuelve':'Una solución útil revisada en Resuelve'})],
  ['Correo electrónico','mailto:?'+new URLSearchParams({
   subject:isTopic?'Tema útil de Resuelve':'Solución útil revisada de Resuelve',body:text
  }).toString().replace(/\+/g,'%20')]
 ];
 const anchors=methods.map(([label,href])=>
  '<a class="secondary" href="'+escapeAttr(href)+'"'+
  (href.startsWith('mailto:')?'':' target="_blank" rel="noopener noreferrer"')+
  '>'+escapeAttr(label)+'</a>').join('');
 return '<section class="resuelve-public-share" data-resuelve-share-root '+
  'data-resuelve-share-url="'+escapeAttr(canonical)+'" aria-label="'+escapeAttr(title)+'">'+
  '<h2>'+escapeAttr(title)+'</h2>'+
  '<p class="muted">Si crees que puede ayudar a alguien, compártelo de forma voluntaria. No se enviará nada automáticamente.</p>'+
  '<div class="resuelve-public-share-actions">'+anchors+
  '<button type="button" class="secondary" data-resuelve-copy>Copiar enlace</button>'+
  '<button type="button" class="secondary" data-resuelve-native hidden>Compartir desde mi móvil</button>'+
  '</div><p class="muted" data-resuelve-share-status role="status" aria-live="polite"></p></section>';
}
module.exports={shareableResuelveUrl,renderPublicShareLinks};
