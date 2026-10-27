'use strict';
// V3.2.39: one mobile installation experience shared by visitors and signed-in members.
// V3.3.6: mobile-friendly SW refresh budget. Previously every tab focus
// triggered a network update, including repeated app switches on slow networks.
let serviceWorkerRegistration=null;
const SW_UPDATE_INTERVAL_V336=60*60*1000;
const SW_ERROR_RETRY_V336=5*60*1000;
let lastServiceWorkerCheckAtV336=-Infinity;
let pendingServiceWorkerCheckV336=null;
function refreshServiceWorkerV336(){
  if(!serviceWorkerRegistration || pendingServiceWorkerCheckV336 ||
     navigator.onLine===false || document.visibilityState!=='visible')return Promise.resolve(false);
  const now=Date.now();
  if(now>=lastServiceWorkerCheckAtV336 &&
     now-lastServiceWorkerCheckAtV336<SW_UPDATE_INTERVAL_V336)return Promise.resolve(false);
  lastServiceWorkerCheckAtV336=now;
  const work=Promise.resolve()
    .then(()=>serviceWorkerRegistration.update())
    .then(()=>true,()=>{
      // Retry transient failures after five minutes rather than on every focus.
      lastServiceWorkerCheckAtV336=Date.now()-SW_UPDATE_INTERVAL_V336+SW_ERROR_RETRY_V336;
      return false;
    })
    .finally(()=>{if(pendingServiceWorkerCheckV336===work)pendingServiceWorkerCheckV336=null;});
  pendingServiceWorkerCheckV336=work;
  return work;
}
if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      serviceWorkerRegistration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      await refreshServiceWorkerV336();
    }catch(_){}
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void refreshServiceWorkerV336();
  });
  // V3.3.27 — reconnect while the PWA remains open: apply the SAME hourly
  // check budget instead of waiting for an unrelated tab switch.
  window.addEventListener('online',()=>{void refreshServiceWorkerV336();});
}

(function initMobilePwaInstallV3239(){
  const INSTALLED_KEY='redlibertad-pwa-installed-v3239';
  const DISMISS_KEY='redlibertad-pwa-dismiss-until-v3239';
  const COOLDOWN_MS=7*24*60*60*1000;
  const agent=String(navigator.userAgent||'');
  const isIOS=/iPhone|iPad|iPod/i.test(agent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isAndroid=/Android/i.test(agent);
  const isMobile=isIOS||isAndroid;
  const isSafari=isIOS&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(agent);
  let deferredInstallPrompt=null;
  let installedThisVisit=false;
  let acceptedThisVisit=false;
  let banner=null;
  let editingField=false;
  let authFormInView=false;

  function standaloneV3239(){
    return navigator.standalone===true ||
      !!window.matchMedia?.('(display-mode: standalone)')?.matches ||
      !!window.matchMedia?.('(display-mode: fullscreen)')?.matches;
  }
  function storageRead(key){
    try{return localStorage.getItem(key);}catch(_){return null;}
  }
  function storageWrite(key,value){
    try{localStorage.setItem(key,value);}catch(_){}
  }
  function storageClear(key){
    try{localStorage.removeItem(key);}catch(_){}
  }
  function isEditableV3239(target){
    return !!target && (/^(INPUT|TEXTAREA|SELECT)$/i.test(String(target.tagName||'')) || target.isContentEditable===true);
  }
  function isSuppressedV3239(){
    return standaloneV3239()||installedThisVisit||acceptedThisVisit||
      storageRead(INSTALLED_KEY)==='1'||
      Number(storageRead(DISMISS_KEY)||0)>Date.now();
  }
  function createBannerV3239(){
    if(banner)return banner;
    if(!document.body)return null;
    banner=document.createElement('aside');
    banner.className='pwa-install-banner-v3239';
    banner.setAttribute('aria-label','Instalar RedLibertad');
    banner.hidden=true;
    banner.innerHTML=
      '<img class="pwa-install-icon-v3239" src="/icons/redlibertad-192.png" width="48" height="48" alt="">'+
      '<div class="pwa-install-copy-v3239"><strong>RedLibertad en tu móvil</strong>'+
      '<span>Accede desde tu pantalla de inicio, como una app.</span>'+
      '<div class="pwa-install-actions-v3239">'+
      '<button type="button" class="pwa-install-primary-v3239">Instalar</button>'+
      '<button type="button" class="pwa-install-already-v3239">Ya la tengo</button>'+
      '</div><p class="pwa-install-guide-v3239" hidden tabindex="-1"></p></div>'+
      '<button type="button" class="pwa-install-close-v3239" aria-label="Cerrar aviso de instalación" title="Ahora no">×</button>';
    document.body.appendChild(banner);
    banner.querySelector('.pwa-install-primary-v3239').addEventListener('click',runInstallV3239);
    banner.querySelector('.pwa-install-already-v3239').addEventListener('click',()=>{
      installedThisVisit=true;
      storageWrite(INSTALLED_KEY,'1');
      renderInstallV3239();
    });
    banner.querySelector('.pwa-install-close-v3239').addEventListener('click',()=>{
      storageWrite(DISMISS_KEY,String(Date.now()+COOLDOWN_MS));
      renderInstallV3239();
    });
    return banner;
  }
  function instructionV3239(){
    if(isIOS)return isSafari
      ? 'En Safari, toca Compartir (el cuadrado con una flecha) y elige «Añadir a pantalla de inicio». Confirma con «Añadir».'
      : 'Abre RedLibertad en Safari, toca Compartir y selecciona «Añadir a pantalla de inicio».';
    return 'En el menú de tu navegador (⋮), busca «Instalar aplicación» o «Añadir a pantalla de inicio» y confirma.';
  }
  async function runInstallV3239(){
    if(isSuppressedV3239())return;
    if(deferredInstallPrompt){
      const event=deferredInstallPrompt;
      deferredInstallPrompt=null;
      try{
        await event.prompt();
        const choice=await event.userChoice;
        if(choice?.outcome==='accepted'){
          // Confirmed install is only appinstalled/standalone, not a guessed choice.
          acceptedThisVisit=true;
        }else{
          storageWrite(DISMISS_KEY,String(Date.now()+COOLDOWN_MS));
        }
      }catch(_){
        // A rejected browser prompt is not proof of installation.
      }
      renderInstallV3239();
      return;
    }
    const box=createBannerV3239();
    if(!box)return;
    const guide=box.querySelector('.pwa-install-guide-v3239');
    guide.textContent=instructionV3239();
    guide.hidden=false;
    guide.focus({preventScroll:true});
  }
  function renderInstallV3239(){
    const sidebar=document.querySelector('#installApp');
    const canOffer=!isSuppressedV3239();
    // A desktop browser can still use its native install dialog from the existing menu.
    if(sidebar){
      sidebar.classList.toggle('hidden',!canOffer||!deferredInstallPrompt);
      if(canOffer&&deferredInstallPrompt)sidebar.onclick=runInstallV3239;
    }
    if(!isMobile)return;
    if(document.querySelector('.social-shell'))document.body?.classList.add('pwa-install-inside-app-v3239');
    const box=createBannerV3239();
    if(!box)return;
    // Keep signup, login and mobile text editing usable without a floating overlay.
    box.hidden=!canOffer||editingField||authFormInView;
    if(!canOffer)return;
    box.querySelector('.pwa-install-primary-v3239').textContent=
      deferredInstallPrompt?'Instalar':'Cómo instalarla';
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    // The browser now offers a fresh installation: a previous install was removed.
    storageClear(INSTALLED_KEY);
    installedThisVisit=false;
    acceptedThisVisit=false;
    renderInstallV3239();
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    installedThisVisit=true;
    storageWrite(INSTALLED_KEY,'1');
    storageClear(DISMISS_KEY);
    renderInstallV3239();
  });
  document.addEventListener('focusin',event=>{
    if(isEditableV3239(event.target)){
      editingField=true;
      renderInstallV3239();
    }
  });
  document.addEventListener('focusout',event=>{
    if(isEditableV3239(event.target)){
      editingField=false;
      renderInstallV3239();
    }
  });
  // On the public landing page, don't cover either registration or login forms.
  if(isMobile && typeof IntersectionObserver!=='undefined'){
    const forms=['#registerForm','#loginForm'].map(sel=>document.querySelector(sel)).filter(Boolean);
    if(forms.length){
      const visibleForms=new Set();
      const observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(entry.isIntersecting)visibleForms.add(entry.target);
          else visibleForms.delete(entry.target);
        }
        authFormInView=visibleForms.size>0;
        renderInstallV3239();
      });
      for(const form of forms)observer.observe(form);
    }
  }
  window.addEventListener('pageshow',renderInstallV3239);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')renderInstallV3239();
  });
  window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',renderInstallV3239);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderInstallV3239,{once:true});
  else renderInstallV3239();
  window.RedLibertadPwaInstall={refresh:renderInstallV3239};
})();
