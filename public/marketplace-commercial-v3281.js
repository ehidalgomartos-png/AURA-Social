'use strict';
const $=id=>document.getElementById(id);
const plans={professional:'Profesional',professional_plus:'Profesional Plus'};
const reviewLabels={pending:'Pendiente',in_review:'En revisión',reviewed:'Revisado internamente'};
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text??'');if(cls)node.className=cls;return node;}
function label(parent,text,input){const l=el('label',text);l.append(input);parent.append(l);}
async function api(url,options={}){
 const resp=await fetch('/api/marketplace/subscriptions/admin/commercial'+url,{
  credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options
 });
 let data={};try{data=await resp.json();}catch(_){}
 if(!resp.ok)throw Error(data.error||'No se pudo completar la solicitud.');
 return data;
}
function proposal(entry){
 const article=el('article',undefined,'item'),heading=el('div',undefined,'row');
 heading.append(el('h3',plans[entry.code]||entry.code),el('span','Borrador privado','tag'));
 article.append(heading);
 const form=el('form');
 const cost=el('input');cost.type='number';cost.min='1';cost.max='10000';cost.step='0.01';cost.inputMode='decimal';
 cost.placeholder='Sin precio decidido';cost.value=entry.proposedMonthlyCents===null?'':(entry.proposedMonthlyCents/100).toFixed(2);
 const field=el('div',undefined,'field');label(field,'Precio mensual propuesto (€) — opcional',cost);form.append(field);
 const desc=el('textarea');desc.maxLength=400;desc.required=true;desc.value=entry.summary;
 label(form,'Descripción provisional (10–400 caracteres)',desc);
 const feedback=el('p','', 'status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const save=el('button','Guardar borrador');save.type='submit';form.append(save,feedback);
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const raw=cost.value.trim();
  const cents=raw===''?null:Math.round(Number(raw)*100);
  if(raw!==''&&(!/^(?:\d+)(?:[.,]\d{1,2})?$/.test(raw)||!Number.isSafeInteger(cents)||cents<100||cents>1000000)){
   feedback.className='status error';feedback.textContent='Escribe un importe válido (mínimo 1 €, máximo 10.000 €), o deja el campo vacío.';return;
  }
  if(!window.confirm('¿Guardar este borrador interno? No se publicará ni activará ningún cobro.'))return;
  save.disabled=true;feedback.className='status';feedback.textContent='Guardando…';
  try{
   await api('/drafts/'+encodeURIComponent(entry.code),{method:'POST',body:JSON.stringify({proposedMonthlyCents:cents,summary:desc.value})});
   feedback.textContent='Borrador guardado. Sigue sin estar disponible para contratar.';
  }catch(err){feedback.className='status error';feedback.textContent=err.message;}
  finally{save.disabled=false;}
 });
 article.append(form);return article;
}
function checklist(entry){
 const article=el('article',undefined,'item'),heading=el('div',undefined,'row');
 heading.append(el('h3',entry.name),el('span',reviewLabels[entry.status]||'Pendiente','tag'));
 article.append(heading,el('p',entry.detail,'muted'));
 const form=el('form'),status=el('select');
 for(const [value,name] of Object.entries(reviewLabels)){const opt=el('option',name);opt.value=value;status.append(opt);}
 status.value=entry.status;const container=el('div',undefined,'field');label(container,'Estado de revisión interna',status);form.append(container);
 const notes=el('textarea');notes.maxLength=1000;notes.value=entry.notes||'';notes.placeholder='Decisiones, dudas y tareas pendientes. Sin datos sensibles.';
 label(form,'Notas internas',notes);
 const feedback=el('p','', 'status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const save=el('button','Guardar revisión');save.type='submit';form.append(save,feedback);
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!window.confirm('¿Guardar esta revisión? No autoriza la contratación ni los pagos.'))return;
  save.disabled=true;feedback.className='status';feedback.textContent='Guardando…';
  try{
   await api('/reviews/'+encodeURIComponent(entry.code),{method:'POST',body:JSON.stringify({reviewStatus:status.value,notes:notes.value})});
   heading.querySelector('span').textContent=reviewLabels[status.value];
   feedback.textContent='Revisión guardada. El lanzamiento sigue bloqueado.';
  }catch(err){feedback.className='status error';feedback.textContent=err.message;}
  finally{save.disabled=false;}
 });
 article.append(form);return article;
}
async function load(){
 try{
  const data=await api('');
  if(!data.commercialDraftOnly||data.billingEnabled||data.enrollmentEnabled||data.pricesPublished)throw Error('El área comercial no está en modo borrador.');
  $('drafts').replaceChildren(...(data.drafts||[]).map(proposal));
  $('reviews').replaceChildren(...(data.reviews||[]).map(checklist));
  $('workspace').hidden=false;$('message').textContent='';
 }catch(e){$('message').className='error';$('message').textContent=e.message;}
}
load();
