'use strict';
// V3.2.91: navigation and PRIVATE, read-only readiness summary.
// Every existing form and server-side commercial decision remains unchanged.
(()=>{
 const groups=new Map([
  ['workgroup-plans',document.getElementById('workgroup-plans')],
  ['workgroup-terms',document.getElementById('workgroup-terms')],
  ['workgroup-tools',document.getElementById('workgroup-tools')]
 ]);
 const current=document.getElementById('workspaceReadiness');
 for(const link of document.querySelectorAll('.workspace-jump')){
  link.addEventListener('click',event=>{
   const id=link.getAttribute('href').slice(1);
   const group=groups.get(id);
   if(!group)return;
   event.preventDefault();
   group.open=true;
   const summary=group.querySelector('summary');
   if(summary){
    summary.scrollIntoView({block:'start',behavior:'auto'});
    summary.focus({preventScroll:true});
   }
  });
 }
 let fetching=false,rerun=false;
 async function refresh(){
  if(fetching){rerun=true;return;}
  fetching=true;
  try{
   const response=await fetch('/api/marketplace/subscriptions/admin/commercial/launch-readiness',{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('No se pudo consultar el resumen de decisiones.');
   const data=await response.json();
   if(data.ok!==true||data.adminOnly!==true||data.previewOnly!==true||
      data.releaseAuthorized!==false||data.productionReady!==false||
      data.billingEnabled!==false||data.liveStripeEnabled!==false||
      data.consentRecorded!==false||data.pricesPublished!==false||
      data.pilotProtected!==true||!Number.isSafeInteger(data.summary?.outstanding))
    throw Error('El resumen comercial no está en modo privado.');
   const tasks=data.summary.outstanding;
   current.textContent=tasks===0?
    'Sin tareas internas pendientes. El lanzamiento sigue sin autorización legal, fiscal ni comercial.':
    tasks+' decisiones internas pendientes · '+data.summary.planTasks+
    ' de planes y '+data.summary.internalReviewTasks+' revisiones generales. Cobros desactivados.';
  }catch(error){
   current.textContent='Consulta el estado detallado de las decisiones en «Ver pendientes». Los cobros siguen desactivados.';
  }finally{
   fetching=false;
   if(rerun){rerun=false;refresh();}
  }
 }
 for(const name of ['commercial:price-saved','commercial:review-saved','commercial:features-saved','commercial:policy-saved']){
  window.addEventListener(name,refresh);
 }
 window.addEventListener('commercial:terms-saved',refresh);
 refresh();
})();
