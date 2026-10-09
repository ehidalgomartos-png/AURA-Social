'use strict';
// The public editorial shell is cached and identical for visitors and members.
// Only the link label changes on the client after a same-origin authenticated check.
(()=>{
  const links=Array.from(document.querySelectorAll('[data-ed-auth-link]'));
  if(!links.length)return;
  async function syncSession(){
    let signedIn=false;
    try{
      const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      signedIn=response.ok;
    }catch(_){signedIn=false;}
    for(const link of links){
      link.textContent=signedIn?(link.dataset.edLoggedLabel||'Mi inicio'):'Entrar';
      link.href='/app';
      link.setAttribute('aria-label',signedIn?'Ir al inicio de RedLibertad':'Entrar en RedLibertad');
    }
  }
  syncSession();
  window.addEventListener('pageshow',event=>{if(event.persisted)syncSession();});
})();
