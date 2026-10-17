'use strict';
const $=id=>document.getElementById(id);
const plans={professional:'Profesional',professional_plus:'Profesional Plus'};
const reviewLabels={pending:'Pendiente',in_review:'En revisión',reviewed:'Revisado internamente'};
let reviewSnapshot=[];
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text??'');if(cls)node.className=cls;return node;}
function label(parent,text,input){const l=el('label',text);l.append(input);parent.append(l);}
function fmtPrice(cents){return Number.isInteger(cents)?(cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})+'/mes':'Sin precio decidido';}
function folded(title,secondary,badge){
 const fold=el('details',undefined,'fold'),summary=el('summary',undefined,'fold-head');
 const main=el('span',undefined,'fold-main');
 main.append(el('strong',title),el('small',secondary));
 const end=el('span',undefined,'fold-end'),chip=el('span',badge,'tag');
 end.append(chip,el('span',undefined,'chevron'));
 end.lastChild.setAttribute('aria-hidden','true');
 summary.append(main,end);fold.append(summary);
 return {fold,subtitle:main.lastChild,chip};
}
function updateStats(plansData){
 const pending=reviewSnapshot.filter(x=>x.status==='pending').length;
 const reviewed=reviewSnapshot.filter(x=>x.status==='reviewed').length;
 $('statPlans').textContent=String(plansData.length);
 $('statPending').textContent=String(pending);
 $('statReviewed').textContent=String(reviewed);
 $('reviewProgress').textContent=reviewed+' de '+reviewSnapshot.length+' revisadas · '+reviewSnapshot.filter(x=>x.status==='in_review').length+' en revisión';
}
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
 const view=folded(plans[entry.code]||entry.code,fmtPrice(entry.proposedMonthlyCents),'Borrador privado');
 const form=el('form',undefined,'fold-body');
 const cost=el('input');cost.type='number';cost.min='1';cost.max='10000';cost.step='0.01';cost.inputMode='decimal';
 cost.placeholder='Sin precio decidido';cost.value=entry.proposedMonthlyCents===null?'':(entry.proposedMonthlyCents/100).toFixed(2);
 const field=el('div',undefined,'field');label(field,'Precio mensual propuesto (€) — opcional',cost);form.append(field);
 const desc=el('textarea');desc.maxLength=400;desc.minLength=10;desc.required=true;desc.value=entry.summary;
 label(form,'Descripción provisional (10–400 caracteres)',desc);
 const feedback=el('p','', 'status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const save=el('button','Guardar borrador');save.type='submit';form.append(save,feedback);
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const raw=cost.value.trim(),cents=raw===''?null:Math.round(Number(raw)*100);
  if(raw!==''&&(!/^(?:\d+)(?:\.\d{1,2})?$/.test(raw)||!Number.isSafeInteger(cents)||cents<100||cents>1000000)){
   feedback.className='status error';feedback.textContent='Introduce un precio válido de 1 € a 10.000 €, o déjalo vacío.';return;
  }
  if(!window.confirm('¿Guardar este borrador interno? No se publicará ni activará ningún cobro.'))return;
  save.disabled=true;feedback.className='status';feedback.textContent='Guardando…';
  try{
   await api('/drafts/'+encodeURIComponent(entry.code),{method:'POST',body:JSON.stringify({proposedMonthlyCents:cents,summary:desc.value})});
   entry.proposedMonthlyCents=cents;entry.summary=desc.value;
   view.subtitle.textContent=fmtPrice(cents);
   feedback.textContent='Borrador guardado. Sigue sin estar disponible para contratar.';
  }catch(err){feedback.className='status error';feedback.textContent=err.message;}
  finally{save.disabled=false;}
 });
 view.fold.append(form);return view.fold;
}
function checklist(entry,plansData){
 const view=folded(entry.name,entry.detail,reviewLabels[entry.status]||'Pendiente');
 const form=el('form',undefined,'fold-body'),status=el('select');
 for(const [value,name] of Object.entries(reviewLabels)){const option=el('option',name);option.value=value;status.append(option);}
 status.value=entry.status;const field=el('div',undefined,'field');label(field,'Estado de revisión interna',status);form.append(field);
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
   entry.status=status.value;entry.notes=notes.value;
   view.chip.textContent=reviewLabels[entry.status];updateStats(plansData);
   feedback.textContent='Revisión guardada. El lanzamiento sigue bloqueado.';
  }catch(err){feedback.className='status error';feedback.textContent=err.message;}
  finally{save.disabled=false;}
 });
 view.fold.append(form);return view.fold;
}
async function load(){
 try{
  const data=await api('');
  if(!data.commercialDraftOnly||data.billingEnabled||data.enrollmentEnabled||data.pricesPublished)
   throw Error('El área comercial no está en modo borrador.');
  const drafts=data.drafts||[];reviewSnapshot=data.reviews||[];
  $('drafts').replaceChildren(...drafts.map(proposal));
  $('reviews').replaceChildren(...reviewSnapshot.map(r=>checklist(r,drafts)));
  updateStats(drafts);
  $('workspace').hidden=false;$('message').textContent='';
 }catch(e){$('message').className='error';$('message').textContent=e.message;}
}
load();
