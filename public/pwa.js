if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  window.dispatchEvent(new CustomEvent('aura-install-ready',{detail:deferredInstallPrompt}));
});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;});
