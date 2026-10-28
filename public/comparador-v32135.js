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


/* V3.4.3.8 — Consulta de enlace en su propia tarjeta.
   Solo sigue una URL HTTPS devuelta como enlace verificado por el servidor.
   Delegación de eventos: funciona también tras refrescar resultados sin recargar. */
document.addEventListener('submit',async event=>{
 const form=event.target?.closest?.('form.offer-lookup[action^="/comparar/tienda/"]');
 if(!form)return;
 event.preventDefault();
 if(form.dataset.lookupRunning==='1')return;
 const button=form.querySelector('button[type="submit"]');
 if(!button)return;
 form.dataset.lookupRunning='1';
 button.disabled=true;
 button.textContent='Comprobando enlace…';
 const notice=(message)=>{
  const p=document.createElement('p');
  p.className='offer-lookup-feedback';
  p.setAttribute('role','status');
  p.textContent=message;
  form.replaceWith(p);
 };
 try{
  const response=await fetch(form.action,{
   method:'POST',credentials:'same-origin',redirect:'error',
   headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
    Accept:'application/json','X-Requested-With':'XMLHttpRequest'},
   body:new URLSearchParams(new FormData(form))
  });
  if(!response.ok)throw Error('http');
  const data=await response.json();
  if(data?.ok===true && typeof data.href==='string'){
   const url=new URL(data.href);
   if(url.protocol!=='https:'||url.username||url.password)throw Error('unsafe_link');
   window.location.assign(url.href);
   return;
  }
  if(data?.ok===false){
   notice(typeof data.message==='string'?data.message:
    'No se ha confirmado el enlace directo de esta oferta. Puedes usar «Buscar en Google».');
   return;
  }
  throw Error('unexpected_response');
 }catch(_){
  // Un fallo de conexión no equivale a una comprobación negativa de tienda.
  form.dataset.lookupRunning='';
  button.disabled=false;
  button.textContent='Consultar enlace de la tienda';
  let feedback=form.querySelector('.offer-lookup-network-error');
  if(!feedback){
   feedback=document.createElement('p');
   feedback.className='offer-lookup-feedback offer-lookup-network-error';
   feedback.setAttribute('role','alert');
   form.appendChild(feedback);
  }
  feedback.textContent='No se ha podido completar la consulta. Comprueba tu conexión o utiliza «Buscar en Google».';
 }
});
