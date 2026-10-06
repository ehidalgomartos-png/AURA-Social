let serviceWorkerRegistration=null;

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      serviceWorkerRegistration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      serviceWorkerRegistration.update().catch(()=>{});
    }catch(_){}
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      serviceWorkerRegistration?.update().catch(()=>{});
    }
  });
}

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  window.dispatchEvent(new CustomEvent('redlibertad-install-ready',{detail:deferredInstallPrompt}));
});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;});
