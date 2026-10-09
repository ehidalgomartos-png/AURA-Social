'use strict';
// News pages are SEO-public and cached equally for visitors and members.
// Navigation destinations are selected client-side after a same-origin session check.
(()=>{
  const accountLinks=Array.from(document.querySelectorAll('[data-ed-auth-link]'));
  const sectionLinks=Array.from(document.querySelectorAll('[data-ed-route]'));
  if(!accountLinks.length&&!sectionLinks.length)return;
  async function syncSession(){
    let signedIn=false;
    try{
      const response=await fetch('/api/auth/me',{
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
      });
      signedIn=response.ok;
    }catch(_){signedIn=false;}
    for(const link of accountLinks){
      const label=link.querySelector('small')||link;
      label.textContent=signedIn?(link.dataset.edLoggedLabel||'Mi perfil'):'Entrar';
      link.href=signedIn?'/app?view=profile':'/app';
      link.setAttribute('aria-label',signedIn?'Ir a mi perfil de RedLibertad':'Entrar en RedLibertad');
    }
    for(const link of sectionLinks){
      if(link.dataset.edRoute==='communities'){
        // In-session communities are part of the social app. Anonymous visitors
        // stay in the crawlable public directory and can return to the article.
        if(signedIn)link.href='/app?view=communities';
      }else if(link.dataset.edRoute==='explore'){
        link.href=signedIn?'/app?view=explore':'/descubrir';
      }
    }
  }
  syncSession();
  window.addEventListener('pageshow',event=>{if(event.persisted)syncSession();});
})();
