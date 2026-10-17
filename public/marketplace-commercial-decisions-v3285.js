'use strict';
// Private commercial definitions: no enrollment, entitlement or billing switches.
(()=>{
const base='/api/marketplace/subscriptions/admin/commercial';
const $=id=>document.getElementById(id);
const labels={professional:'Profesional',professional_plus:'Profesional Plus'};
const modes={
 undecided:'Pendiente de decisión',
 unlimited_proposal:'Sin límite de productos (propuesta)',
 capped_proposal:'Con límite numérico (propuesta)'
};
const el=(tag,value,cls)=>{
 const node=document.createElement(tag);
 if(value!==undefined)node.textContent=String(value??'');
 if(cls)node.className=cls;
 return node;
};
async function api(url,opts={}){
 const response=await fetch(base+url,{
  credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(opts.body?{'Content-Type':'application/json'}:{})},...opts});
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(value.error||'No se pudo consultar el estado comercial.');
 return value;
}
const descriptor=(label,value)=>{
 const line=el('div',undefined,'decision-row');
 line.append(el('span',label),el('strong',value));
 return line;
};
function planCard(card){
 const section=el('details',undefined,'fold');
 const heading=el('summary',undefined,'fold-head');
 const label=el('span',undefined,'fold-main');
 label.append(el('strong',labels[card.code]),el('small',
  card.internallyDefined?'Definición interna completa, pendiente de aprobación':'Pendientes: '+card.issues.length));
 const end=el('span',undefined,'fold-end');
 end.append(el('span',card.internallyDefined?'Propuesta completa':'Por definir','tag'));
 const arrow=el('span',undefined,'chevron');arrow.setAttribute('aria-hidden','true');end.append(arrow);
 heading.append(label,end);section.append(heading);
 const body=el('div',undefined,'fold-body');
 body.append(descriptor('Tiendas propuestas',Number.isInteger(card.storeLimit)?String(card.storeLimit):'Por decidir'));
 body.append(descriptor('Alta de productos',card.manualOnly?'Uno a uno':'Uno a uno y por lotes'));
 body.append(descriptor('Importación de lotes',card.bulkImport?'Propuesta de Plus':'No incluida'));
 body.append(descriptor('WooCommerce automático',card.wooSync?'Propuesto':'No incluido'));
 body.append(descriptor('Precio mensual',
  Number.isInteger(card.priceProposedCents)?(card.priceProposedCents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})+' (no aprobado)':'Por decidir'));
 body.append(descriptor('Capacidad de productos',card.capacity.description));
 const form=el('form',undefined,'policy-form');
 const modeLabel=el('label','Criterio para el número de productos');
 const select=el('select');select.required=true;
 for(const [code,title] of Object.entries(modes)){
  const option=el('option',title);option.value=code;select.append(option);
 }
 select.value=card.policy.mode;modeLabel.append(select);form.append(modeLabel);
 const hint=el('p','El criterio es únicamente comercial. Si eliges un límite numérico, escribe primero la cifra en «Características propuestas»; para proponer un catálogo sin límite, deja esa cifra vacía.','muted');
 form.append(hint);
 const notes=el('textarea');notes.maxLength=400;notes.value=card.policy.reason||'';
 notes.placeholder='Justificación comercial, costes, incidencias o motivos para no limitar productos.';
 const notesLabel=el('label','Motivo de la decisión (12–400 caracteres cuando no esté pendiente)');
 notesLabel.append(notes);form.append(notesLabel);
 const feedback=el('p','', 'status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const save=el('button','Guardar decisión interna');save.type='submit';form.append(save,feedback);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(select.value!=='undecided'&&notes.value.trim().length<12){
   feedback.className='status error';feedback.textContent='Introduce al menos 12 caracteres para explicar la propuesta.';return;
  }
  if(!window.confirm('¿Guardar solo esta decisión interna? No activa límites, pagos ni suscripciones.'))return;
  save.disabled=true;feedback.className='status';feedback.textContent='Guardando…';
  try{
   await api('/definition/product-policy/'+encodeURIComponent(card.code),{
    method:'POST',body:JSON.stringify({mode:select.value,reason:notes.value})});
   feedback.textContent='Decisión guardada. Se mantiene como propuesta privada.';
   const opened=section.open;
   await refresh();
   const current=$('definitionCards').children[[...Object.keys(labels)].indexOf(card.code)];
   if(current&&opened)current.open=true;
  }catch(error){feedback.className='status error';feedback.textContent=error.message;}
  finally{save.disabled=false;}
 });
 body.append(form);
 if(card.issues.length){
  const wrap=el('div',undefined,'decision-pending');
  wrap.append(el('strong','Decisiones pendientes:'));
  const ul=el('ul');
  for(const issue of card.issues)ul.append(el('li',issue));
  wrap.append(ul);body.append(wrap);
 }
 section.append(body);
 return section;
}
let busy=false;
async function refresh(){
 if(busy)return;
 busy=true;
 const status=$('definitionStatus');
 try{
  const data=await api('/definition');
  if(!data.commercialDraftOnly||data.productionReady||data.billingEnabled||data.entitlementsEnforced||
     !data.pilotProtected||!data.externalCheckoutOnly||data.pricesPublished||data.enrollmentEnabled)
   throw Error('La preparación debe permanecer privada y no operativa.');
  const opened=new Set([...$('definitionCards').children].filter(x=>x.open).map(x=>x.getAttribute('data-plan')));
  const cards=data.cards.map(card=>{
   const element=planCard(card);element.setAttribute('data-plan',card.code);
   if(opened.has(card.code))element.open=true;
   return element;
  });
  $('definitionCards').replaceChildren(...cards);
  $('definitionPending').textContent=
   data.cards.reduce((n,x)=>n+x.issues.length,0)+' decisiones de plan pendientes · '+data.pendingReviews.length+' revisiones sin completar';
  const pending=$('definitionReviews');
  pending.replaceChildren(el('strong','Revisiones internas pendientes:'));
  const list=el('ul');
  for(const title of data.pendingReviews)list.append(el('li',title));
  if(!data.pendingReviews.length)list.append(el('li','Todas marcadas como revisadas internamente; falta aprobación legal y comercial.'));
  pending.append(list);
  status.className='status';
  status.textContent='La definición interna no autoriza publicar planes ni activar Stripe LIVE.';
 }catch(error){status.className='status error';status.textContent='No se pudieron comprobar los planes: '+error.message;}
 finally{busy=false;}
}
window.addEventListener('commercial:policy-saved',refresh);
window.addEventListener('commercial:price-saved',refresh);
window.addEventListener('commercial:features-saved',refresh);
window.addEventListener('commercial:review-saved',refresh);
refresh();
})();
