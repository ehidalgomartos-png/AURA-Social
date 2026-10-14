'use strict';
// Plain browser sharing for public Marketplace listing pages.
document.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-copy-url]');
 if(!button)return;
 const url=button.getAttribute('data-copy-url')||'';
 if(!/^https:\/\/redlibertad\.com\/marketplace\/p\/[1-9]\d{0,15}\/[a-z0-9-]+$/.test(url))return;
 const status=document.getElementById('marketCopyNotice');
 try{
  if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
  await navigator.clipboard.writeText(url);
  if(status)status.textContent='Enlace copiado para compartir.';
 }catch{
  window.prompt('Copia la dirección del anuncio:',url);
 }
});
