/* RedLibertad V3.2.135 — refresco sin interrumpir la lectura ni repetir búsquedas de pago. */
'use strict';
(()=>{
 const root=document.querySelector('[data-comparison-status]');
 if(!root||!['queued','checking'].includes(root.dataset.comparisonStatus))return;
 const target=document.querySelector('[data-comparison-results]');
 if(!target)return;
 let attempts=0,polling=false;
 const maxAttempts=18;
 const refresh=async()=>{
  if(polling||document.hidden)return;
  attempts++;
  polling=true;
  try{
   const response=await fetch(location.pathname,{credentials:'same-origin',cache:'no-store',headers:{Accept:'text/html'}});
   if(!response.ok)throw Error('unavailable');
   const html=await response.text();
   const doc=new DOMParser().parseFromString(html,'text/html');
   const fresh=doc.querySelector('[data-comparison-results]');
   const status=doc.querySelector('[data-comparison-status]');
   if(!fresh||!status)return;
   // Solo reemplazamos resultados y estado, no el formulario ni el foco del usuario.
   target.innerHTML=fresh.innerHTML;
   root.dataset.comparisonStatus=status.dataset.comparisonStatus||'unknown';
   root.innerHTML=status.innerHTML;
   if(!['queued','checking'].includes(root.dataset.comparisonStatus)){
    clearInterval(interval);
   }
  }catch(_){
   // El botón de actualizar manualmente permanece visible.
  }finally{
   polling=false;
   if(attempts>=maxAttempts){
    clearInterval(interval);
    if(['queued','checking'].includes(root.dataset.comparisonStatus)){
     const title=root.querySelector('h2');
     const description=root.querySelector('p');
     if(title)title.textContent='Esta comparación está tardando más de lo habitual';
     if(description)description.textContent='La página está guardada. Puedes regresar más tarde para consultar las ofertas.';
     root.dataset.comparisonStatus='waiting';
    }
   }
  }
 };
 const interval=setInterval(refresh,5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden && attempts<maxAttempts)refresh();});
})();

/* V3.4.2.2: registrar clic sin interrumpir la compra; nunca redirigir por RedLibertad. */
document.addEventListener('click',event=>{
 const link=event.target?.closest?.('a[data-comparison-merchant-click="1"]');
 if(!link)return;
 const storeId=link.dataset.storeId,listingId=link.dataset.listingId,proof=link.dataset.proof;
 if(!storeId||!listingId||!proof)return;
 try{
  fetch('/comparar/comercios/registrar-clic',{
   method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'omit',keepalive:true,
   body:JSON.stringify({storeId,listingId,proof})
  }).catch(()=>{});
 }catch(_){/* Métrica opcional: nunca impedir abrir la tienda. */}
},true);
