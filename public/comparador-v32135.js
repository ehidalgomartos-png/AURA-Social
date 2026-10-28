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


/* V3.4.4.0 — filtros combinables de enlaces, estado y capacidad. Todo local;
   nunca modifica el precio principal ni oculta anuncios averiados/accesorios. */
function applyComparisonFilters(toolbar){
 const list=toolbar?.nextElementSibling;
 if(!list?.matches?.('[data-primary-offers]'))return;
 const mode=toolbar.dataset.activeAccess||'all';
 const condition=toolbar.querySelector('[data-condition-filter]')?.value||'all';
 const capacity=toolbar.querySelector('[data-capacity-filter]')?.value||'all';
 let visible=0,total=0,lowestVisible=null,firstVisible=null;
 for(const item of list.children){
  if(!item.matches('li.offer'))continue;
  total++;
  const show=(mode==='all'||item.dataset.offerAccess==='direct')&&
   (condition==='all'||item.dataset.offerCondition===condition)&&
   (capacity==='all'||item.dataset.offerCapacity===capacity);
  item.hidden=!show;
  if(show){
   visible++;
   if(!firstVisible && item.id)firstVisible=item;
   const cents=Number(item.dataset.offerPriceCents);
   if(Number.isSafeInteger(cents)&&cents>0 && (lowestVisible===null||cents<lowestVisible))
    lowestVisible=cents;
  }
 }
 const filtered=mode!=='all'||condition!=='all'||capacity!=='all';
 const note=toolbar.querySelector('[data-access-note]');
 if(note)note.hidden=!filtered;
 const status=toolbar.querySelector('[data-filter-results]');
 if(status){
  status.hidden=!filtered;
  const price=lowestVisible===null?'':
   ' · mínimo visible: '+(lowestVisible/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
  status.textContent=filtered?visible+' de '+total+' ofertas visibles'+
   (visible?price:' · Ninguna coincide. Quita algún filtro para ver más ofertas.'):'';
 }
 const reset=toolbar.querySelector('[data-clear-comparison-filters]');
 if(reset)reset.hidden=!filtered;
 // En listas largas, ir siempre a la primera oferta que siga visible.
 // La ruta sin JavaScript conserva el enlace HTML a la primera oferta.
 const jump=toolbar.querySelector('[data-first-visible-link]');
 if(jump){
  jump.hidden=!firstVisible;
  if(firstVisible)jump.setAttribute('href','#'+firstVisible.id);
 }
}
// V3.4.4.10: resumen del mínimo VISIBLE sin alterar el precio general de la ficha.
document.addEventListener('click',event=>{
 const reset=event.target?.closest?.('[data-clear-comparison-filters]');
 if(!reset)return;
 const toolbar=reset.closest('[data-direct-filter]');
 if(!toolbar)return;
 toolbar.dataset.activeAccess='all';
 for(const option of toolbar.querySelectorAll('[data-access-choice]'))
  option.setAttribute('aria-pressed',String(option.getAttribute('data-access-choice')==='all'));
 for(const filter of toolbar.querySelectorAll('[data-condition-filter],[data-capacity-filter]'))
  filter.value='all';
 applyComparisonFilters(toolbar);
});
document.addEventListener('click',event=>{
 const button=event.target?.closest?.('[data-access-choice]');
 if(!button)return;
 const toolbar=button.closest('[data-direct-filter]');
 if(!toolbar)return;
 const mode=button.getAttribute('data-access-choice');
 if(mode!=='all'&&mode!=='direct')return;
 toolbar.dataset.activeAccess=mode;
 for(const option of toolbar.querySelectorAll('[data-access-choice]')){
  option.setAttribute('aria-pressed',String(option===button));
 }
 applyComparisonFilters(toolbar);
});
document.addEventListener('change',event=>{
 const input=event.target?.closest?.('[data-condition-filter],[data-capacity-filter]');
 if(!input)return;
 const toolbar=input.closest('[data-direct-filter]');
 if(toolbar)applyComparisonFilters(toolbar);
});

/* V3.4.4.14 — Compartir una tarjeta sin exponer enlaces comerciales.
   Si no hay Web Share ni portapapeles, el ancla HTML sigue funcionando. */
document.addEventListener('click',async event=>{
 const link=event.target?.closest?.('a[data-share-comparison-offer]');
 if(!link)return;
 let url;
 try{url=new URL(link.href,location.href);}catch(_){return;}
 if(url.origin!==location.origin || !url.pathname.startsWith('/comparar/') ||
   !/^#oferta-[a-f0-9]{64}$/.test(url.hash))return;
 const nativeShare=typeof navigator.share==='function';
 const canCopy=typeof navigator.clipboard?.writeText==='function';
 if(!nativeShare&&!canCopy)return;
 event.preventDefault();
 const feedback=link.parentElement?.querySelector?.('[data-share-offer-feedback]');
 const inform=message=>{
  if(feedback){feedback.textContent=message;feedback.hidden=false;}
 };
 if(nativeShare){
  try{
   await navigator.share({title:'Oferta en RedLibertad',url:url.href});
   return;
  }catch(e){
   if(e?.name==='AbortError')return;
   // Si el sistema no puede compartir, usar portapapeles sin perder la URL.
  }
 }
 if(canCopy){
  try{
   await navigator.clipboard.writeText(url.href);
   inform('Enlace copiado para compartir.');
   return;
  }catch(_){/* No afirmar que la copia se completó. */}
 }
 inform('No se ha podido copiar. Mantén pulsado el enlace para copiarlo.');
});

/* V3.4.4.15 — Enlaces compartidos: avisar si una oferta ya no está disponible.
   El realce de una tarjeta existente funciona con CSS incluso sin JavaScript. */
(()=>{
 const updateSharedOffer=()=>{
  const results=document.querySelector('[data-comparison-results]');
  if(!results)return;
  let notice=results.querySelector('[data-shared-offer-notice]');
  const hash=location.hash;
  if(!/^#oferta-[a-f0-9]{64}$/.test(hash)){
   if(notice)notice.hidden=true;
   return;
  }
  const card=document.getElementById(hash.slice(1));
  const present=card?.matches?.('li.offer') &&
   Boolean(card.closest?.('[data-primary-offers]'));
  if(present){
   if(notice)notice.hidden=true;
   return;
  }
  if(!notice){
   notice=document.createElement('p');
   notice.className='cmp-shared-offer-notice';
   notice.setAttribute('role','status');
   notice.setAttribute('data-shared-offer-notice','');
   results.insertBefore(notice,results.firstChild);
  }
  notice.textContent='Esta oferta compartida ya no aparece en la comparación actual. Puedes revisar las ofertas disponibles.';
  notice.hidden=false;
 };
 document.addEventListener('DOMContentLoaded',updateSharedOffer);
 if(typeof window!=='undefined')window.addEventListener('hashchange',updateSharedOffer);
})();
