'use strict';
// V3.6.6: únicamente responder a botones pulsados. No auto-compartir ni enviar datos.
(()=>{
 for(const root of document.querySelectorAll('[data-resuelve-share-root]')){
  const url=root.getAttribute('data-resuelve-share-url');
  if(!/^https:\/\/redlibertad\.com\/resuelve\//.test(url||''))continue;
  const status=root.querySelector('[data-resuelve-share-status]');
  const copy=root.querySelector('[data-resuelve-copy]');
  const native=root.querySelector('[data-resuelve-native]');
  if(copy)copy.addEventListener('click',async()=>{
   try{
    if(!navigator.clipboard||!window.isSecureContext)throw Error('clipboard_unavailable');
    await navigator.clipboard.writeText(url);
    status.textContent='Enlace copiado. Puedes compartirlo con quien quieras.';
   }catch(_){
    window.prompt('Copia este enlace para compartirlo:',url);
    status.textContent='Puedes copiar el enlace mostrado.';
   }
  });
  if(native&&typeof navigator.share==='function'){
   native.hidden=false;
   native.addEventListener('click',async()=>{
    try{await navigator.share({title:'Una ayuda útil de RedLibertad Resuelve',url});}
    catch(error){
     if(error?.name!=='AbortError')status.textContent='No se pudo abrir el menú. Usa otro canal o copia el enlace.';
    }
   });
  }
 }
})();
