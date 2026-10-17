'use strict';
// V3.2.86: explicit administrator confirmation, never auto-change on page load.
// No seller entitlement or Stripe switches exist here.
(()=>{
 const button=document.getElementById('applyUnlimited');
 const feedback=document.getElementById('unlimitedMessage');
 const set=(value,problem=false)=>{
  feedback.className=problem?'status error':'status';
  feedback.textContent=value;
 };
 async function status(){
  try{
   const response=await fetch('/api/marketplace/subscriptions/admin/commercial/definition',{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('No se pudo comprobar el estado de los borradores.');
   const data=await response.json();
   const cards=Array.isArray(data.cards)?data.cards:[];
   if(data.productionReady!==false||data.entitlementsEnforced!==false||data.billingEnabled!==false||
       !data.pilotProtected||cards.length!==2)throw Error('No está disponible la planificación privada.');
   const both=cards.every(card=>card.policy?.mode==='unlimited_proposal' &&
     card.capacity?.status==='proposed' && card.productLimit===null);
   set(both?'Productos sin límite: propuesta guardada para Profesional y Profesional Plus. No activa cobros ni permisos.':
       'Aún no están guardadas las dos propuestas de catálogo sin límite.');
   return both;
  }catch(error){set(error.message,true);return false;}
 }
 button.addEventListener('click',async()=>{
  if(!window.confirm('¿Proponer productos sin límite para Profesional y Plus? Esto modificará solo sus dos borradores privados y conservará los cambios anteriores en un historial. No afectará a vendedores, Stripe ni tiendas.'))return;
  button.disabled=true;set('Guardando las propuestas…');
  try{
   const response=await fetch('/api/marketplace/subscriptions/admin/commercial/definition/propose-unlimited',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({confirmation:'propose_unlimited_for_both'})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok||!data.proposalOnly||data.entitlementsEnforced!==false||
     data.billingEnabled!==false||data.liveStripeEnabled!==false||!data.pilotProtected)
    throw Error(data.error||'No se han podido guardar las propuestas.');
   await status();
   // The comparison and readiness panels recalculate from saved server values.
   window.dispatchEvent(new Event('commercial:policy-saved'));
  }catch(error){set(error.message,true);}
  finally{button.disabled=false;}
 });
 window.addEventListener('commercial:policy-saved',status);
 status();
})();
