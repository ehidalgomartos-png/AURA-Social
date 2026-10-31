'use strict';
(()=>{
 const root=document.getElementById('voicesReportV3643');
 if(!root)return;
 const id=root.dataset.publicationId;
 if(!/^[1-9]\d{0,14}$/.test(String(id||'')))return;
 const form=document.getElementById('voicesReportFormV3643');
 const reason=document.getElementById('voicesReportReasonV3643');
 const details=document.getElementById('voicesReportDetailsV3643');
 const status=document.getElementById('voicesReportStatusV3643');
 const submit=document.getElementById('voicesReportSubmitV3643');
 let busy=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!form.reportValidity())return;
  const description=details.value.trim();
  if(description.length<20||description.length>1200){
   status.textContent='Explica el problema con al menos 20 caracteres y un máximo de 1200.';
   details.focus();return;
  }
  if(!window.confirm('¿Enviar este aviso privado al equipo editorial? No se retirará el artículo automáticamente.'))return;
  busy=true;submit.disabled=true;status.textContent='Registrando el aviso…';
  try{
   const response=await fetch('/api/noticias/redactores/voces/'+encodeURIComponent(id)+'/denunciar',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({reason:reason.value,details:description,confirmed:true})
   });
   const data=await response.json().catch(()=>({}));
   if(response.status===401){status.textContent='Inicia sesión en RedLibertad para enviar tu aviso privado.';return;}
   if(response.status===403){status.textContent='Tu cuenta no puede enviar este aviso.';return;}
   if(response.status===429){status.textContent='Has enviado demasiadas solicitudes; prueba más adelante.';return;}
   if(response.status===404){status.textContent='Este artículo ya no está disponible.';return;}
   if(!response.ok){status.textContent='No se ha podido guardar el aviso. Revisa los datos y vuelve a intentarlo.';return;}
   status.textContent=data.alreadyReported?
    'Ya existe un aviso tuyo sobre este artículo. El equipo editorial lo tiene registrado.':
    'Aviso recibido. El equipo editorial podrá revisarlo; no se ha retirado el artículo automáticamente.';
   submit.hidden=true;details.readOnly=true;reason.disabled=true;
  }catch(_){status.textContent='No se ha podido conectar. Puedes volver a intentarlo.';}
  finally{busy=false;if(!submit.hidden)submit.disabled=false;}
 });
})();
