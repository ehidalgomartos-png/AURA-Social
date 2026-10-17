'use strict';
// V3.2.88. Never published, never shown to seller, never records legal acceptance.
(()=>{
 const $=id=>document.getElementById(id);
 const titles={professional:'Profesional',professional_plus:'Profesional Plus'};
 const fields=[
  ['priceDisclosure','Precio definitivo y periodicidad'],
  ['taxes','IVA y facturación'],
  ['renewals','Renovaciones y avisos'],
  ['cancellations','Cancelación, reembolsos y gracia'],
  ['privacy','Privacidad de datos de facturación'],
  ['consent','Información de consentimiento comercial']
 ];
 const el=(tag,text,cls)=>{
  const n=document.createElement(tag);
  if(text!==undefined)n.textContent=String(text??'');
  if(cls)n.className=cls;
  return n;
 };
 async function api(url,options={}){
  const response=await fetch('/api/marketplace/subscriptions/admin/commercial/contract-drafts'+url,{
   credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(value.error||'No se pudo guardar el borrador.');
  if(value.commercialDraftOnly!==true||value.legallyApproved!==false||
    value.billingEnabled!==false||value.liveStripeEnabled!==false||
    value.consentCollected!==false||value.pricesPublished!==false||
    value.pilotProtected!==true)
   throw Error('El modo privado de preparación no está garantizado.');
  return value;
 }
 function card(draft){
  const details=el('details',undefined,'fold');
  const summary=el('summary',undefined,'fold-head');
  const left=el('span',undefined,'fold-main');
  left.append(el('strong',titles[draft.code]||draft.code),
   el('small','Revisión interna '+draft.revision+' · '+(draft.complete?'Todos los campos cumplimentados':'Contenido incompleto')));
  const right=el('span',undefined,'fold-end');
  right.append(el('span',draft.reviewState==='internal_review'?'En revisión interna':'Borrador','tag'),el('span',undefined,'chevron'));
  right.lastChild.setAttribute('aria-hidden','true');
  summary.append(left,right);
  details.append(summary);
  const form=el('form',undefined,'contract-draft-body');
  const meta=el('p','Cada campo admite hasta 1.200 caracteres. Redacta sin datos personales; no son condiciones vigentes.','contract-draft-note');
  form.append(meta);
  const values={};
  for(const [key,label] of fields){
   const group=el('div');
   const caption=el('label',label);
   const area=el('textarea');area.value=draft[key]||'';area.maxLength=1200;
   area.rows=3;area.id='contract-'+draft.code+'-'+key;
   caption.htmlFor=area.id;
   const counter=el('p',area.value.length+' / 1.200','contract-draft-counter');
   area.addEventListener('input',()=>{counter.textContent=area.value.length+' / 1.200';});
   group.append(caption,area,counter);form.append(group);
   values[key]=area;
  }
  const insert=el('button','Preparar guía de condiciones en campos vacíos','draft-helper-btn');
  insert.type='button';
  const guideHint=el('p','Solo copia textos de trabajo. No sobrescribe apartados escritos ni guarda cambios. Las plantillas necesitan revisión y no cuentan como condiciones completadas.','draft-helper-hint');
  form.append(insert,guideHint);
  insert.addEventListener('click',async()=>{
   const empty=fields.filter(([key])=>!values[key].value.trim());
   if(!empty.length){
    message.className='status error';message.textContent='No hay apartados vacíos. La guía no sobrescribe tus textos.';return;
   }
   insert.disabled=true;message.className='status';message.textContent='Consultando la guía privada…';
   try{
    const res=await fetch('/api/marketplace/subscriptions/admin/commercial/guidance',{
     credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    if(!res.ok)throw Error('No se pudo cargar la guía privada.');
    const content=await res.json();
    if(content.adminOnly!==true||content.privateSuggestion!==true||
       content.termsApproved!==false||content.billingEnabled!==false||
       content.liveStripeEnabled!==false||content.consentRecorded!==false||
       content.pilotProtected!==true)throw Error('Estado inseguro de la guía privada.');
    const proposal=(content.proposals||[]).find(x=>x.code===draft.code);
    if(!proposal||proposal.approved!==false||!proposal.terms)throw Error('Guía no disponible.');
    if(!window.confirm('¿Copiar la guía preliminar solo a los campos vacíos? Seguirá como borrador, sin guardar ni aceptar términos legales.'))return;
    let count=0;
    for(const [key] of empty){
     if(values[key].value.trim())continue;
     const text=proposal.terms[key];
     if(typeof text!=='string'||!text.includes('PLANTILLA INTERNA V3.2.90')||text.length>1200)continue;
     values[key].value=text;
     values[key].dispatchEvent(new Event('input',{bubbles:true}));
     count++;
    }
    if(count)review.value='draft';
    message.textContent=count+' apartados preparados en pantalla. Revisa, modifica y guarda cuando lo decidas. El estado permanece en borrador.';
   }catch(err){message.className='status error';message.textContent=err.message;}
   finally{insert.disabled=false;}
  });
  const reviewLabel=el('label','Estado del borrador');
  const review=el('select');
  for(const [value,label] of [['draft','Borrador'],['internal_review','En revisión interna (no aprobado)']]){
   const option=el('option',label);option.value=value;review.append(option);
  }
  review.value=draft.reviewState;
  reviewLabel.append(review);form.append(reviewLabel);
  const message=el('p','Los cambios solo quedan en la zona privada de administración.','status');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const button=el('button','Guardar borrador privado');button.type='submit';
  form.append(button,message);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!window.confirm('¿Guardar una nueva revisión privada de '+(titles[draft.code]||'este plan')+'? No publica términos, no recaba consentimientos y no activa pagos.'))return;
   button.disabled=true;message.className='status';message.textContent='Guardando…';
   try{
    const body={expectedRevision:draft.revision,reviewState:review.value};
    for(const [key] of fields)body[key]=values[key].value;
    const saved=await api('/'+encodeURIComponent(draft.code),{method:'POST',body:JSON.stringify(body)});
    const oldOpen=details.open;
    const result=await api('');
    render(result.drafts);
    const newDetail=[...$('contractDraftList').children].find(x=>x.dataset.code===draft.code);
    if(newDetail)newDetail.open=oldOpen;
    $('contractDraftLoading').textContent=saved.changed?'Revisión privada guardada y auditada.':'Sin cambios que guardar.';
   }catch(error){
    message.className='status error';
    if(error.message==='contract_draft_incomplete')review.value=draft.reviewState;
    message.textContent=error.message==='contract_draft_conflict'
     ?'Otro cambio fue guardado antes. Actualiza la página para revisar la última versión.'
     :error.message==='contract_draft_incomplete'
      ?'No se puede iniciar la revisión interna. Revisa y sustituye los textos de plantilla de los seis apartados antes de solicitarla. El borrador anterior se ha conservado.'
      :error.message;
   }finally{button.disabled=false;}
  });
  details.append(form);details.dataset.code=draft.code;
  return details;
 }
 function render(drafts){
  const rows=(Array.isArray(drafts)?drafts:[]).filter(x=>titles[x.code]);
  $('contractDraftList').replaceChildren(...rows.map(card));
 }
 async function load(){
  try{
   const result=await api('');
   render(result.drafts);
   $('contractDraftLoading').textContent='Borradores privados, sin aprobación legal ni publicación.';
  }catch(error){$('contractDraftLoading').className='status error';$('contractDraftLoading').textContent=error.message;}
 }
 load();
})();
