'use strict';
// Private admin-only proposals. Never used for seller entitlements or checkout.
(()=>{
const base='/api/marketplace/subscriptions/admin/commercial';
const names={professional:'Profesional',professional_plus:'Profesional Plus'};
const hints={professional:'Referencia para estudiar: 9,90 €/mes',professional_plus:'Referencia para estudiar: 24,90 €/mes'};
const byId=id=>document.getElementById(id);
const node=(tag,text,klass)=>{
 const el=document.createElement(tag);
 if(text!==undefined)el.textContent=String(text??'');
 if(klass)el.className=klass;
 return el;
};
const label=(parent,title,field)=>{
 const tag=node('label',title);
 tag.append(field);parent.append(tag);
};
const euro=n=>Number.isInteger(n)?(n/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})+' /mes':'Sin importe aprobado';
const limit=(n,suffix)=>{
 if(!Number.isInteger(n))return 'Pendiente de definir';
 if(suffix==='tienda(s)')return n+' '+(n===1?'tienda':'tiendas');
 if(suffix==='producto(s)')return n+' '+(n===1?'producto':'productos');
 return n+' '+suffix;
};
const booleanText=n=>n?'Sí, propuesto':'No incluido';
async function api(url,options={}){
 const response=await fetch(base+url,{credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Error al consultar los borradores');
 return data;
}
let currentDrafts=[],currentPlans=[],currentPolicies=[];
function comparisonRow(title,value){
 const row=node('div',undefined,'comparison-row');
 row.append(node('span',title),node('strong',value));
 return row;
}
function renderComparison(){
 const list=byId('planComparison');
 if(!list)return;
 const cards=currentDrafts.map(draft=>{
  const plan=currentPlans.find(p=>p.code===draft.code);
  const card=node('article',undefined,'comparison-plan');
  card.append(node('h3',names[draft.code]||draft.code));
  card.append(node('p',euro(draft.proposedMonthlyCents),'comparison-price'));
  if(draft.proposedMonthlyCents===null)card.append(node('p',hints[draft.code],'muted'));
  card.append(comparisonRow('Tiendas conectadas',plan?limit(plan.storeLimit,'tienda(s)'):'—'));
  const policy=currentPolicies.find(x=>x.code===draft.code);
  const productLabel=plan&&plan.productLimit===null&&policy?.mode==='unlimited_proposal'?
   'Sin límite (propuesta)':plan?limit(plan.productLimit,'producto(s)'):'—';
  card.append(comparisonRow('Productos',productLabel));
  card.append(comparisonRow('Alta de productos','Uno a uno'+(plan?.bulkImport?' y por lotes':'')));
  card.append(comparisonRow('Importación CSV/lotes',plan?(plan.bulkImport?'Sí, propuesta Plus':'No; solo de uno en uno'):'—'));
  card.append(comparisonRow('Sincronización automática WooCommerce',plan?(plan.wooSync?'Sí, propuesta Plus':'No; alta manual'):'—'));
  card.append(comparisonRow('Compra del producto','Siempre en la tienda del vendedor'));
  list.append(card);
  return card;
 });
 list.replaceChildren(...cards);
}
function planForm(plan){
 const section=node('details',undefined,'fold');
 const heading=node('summary',undefined,'fold-head');
 const main=node('span',undefined,'fold-main');
 main.append(node('strong',names[plan.code]),node('small',limit(plan.storeLimit,'tienda(s)')+' · '+limit(plan.productLimit,'producto(s)')));
 const end=node('span',undefined,'fold-end');
 end.append(node('span','Borrador privado','tag'));
 const arrow=node('span',undefined,'chevron');arrow.setAttribute('aria-hidden','true');end.append(arrow);
 heading.append(main,end);
 const form=node('form',undefined,'fold-body proposed-form');
 const basic=plan.code==='professional';
 form.append(node('p',basic?
  'Plan Profesional: los productos se añadirán únicamente uno a uno. Sin CSV, cargas masivas ni sincronización automática de catálogo.':
  'Profesional Plus: alta individual y propuesta de importación CSV, lotes y sincronización automática de WooCommerce.',
  'hint'));
 const store=node('input');store.type='number';store.min='1';store.max='100';store.step='1';
 store.inputMode='numeric';store.placeholder='Por definir';store.value=plan.storeLimit??'';
 const sf=node('div',undefined,'field');label(sf,'Tiendas conectadas propuestas (opcional)',store);form.append(sf);
 const products=node('input');products.type='number';products.min='1';products.max='1000000';products.step='1';
 products.inputMode='numeric';products.placeholder='Por definir';products.value=plan.productLimit??'';
 const pf=node('div',undefined,'field');label(pf,'Productos propuestos (opcional)',products);form.append(pf);
 const woo=node('input');woo.type='checkbox';woo.checked=!basic&&plan.wooSync===true;woo.disabled=basic;
 const wf=node('div',undefined,'check-line');label(wf,'Incluir conexión y sincronización WooCommerce',woo);form.append(wf);
 const bulk=node('input');bulk.type='checkbox';bulk.checked=!basic&&plan.bulkImport===true;bulk.disabled=basic;
 const bf=node('div',undefined,'check-line');label(bf,'Incluir importación CSV y por lotes',bulk);form.append(bf);
 form.append(node('p','Los compradores siempre pagan directamente en la web del vendedor. No se puede modificar esta condición.','hint'));
 const action=node('button','Guardar características');action.type='submit';
 const feedback=node('p','', 'status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 form.append(action,feedback);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const parsed=(input,max)=>{
   const raw=input.value.trim();
   if(!raw)return null;
   if(!/^\d+$/.test(raw))return NaN;
   const count=Number(raw);
   return Number.isSafeInteger(count)&&count>=1&&count<=max?count:NaN;
  };
  const storeLimit=parsed(store,100),productLimit=parsed(products,1000000);
  if(Number.isNaN(storeLimit)||Number.isNaN(productLimit)){
   feedback.className='status error';feedback.textContent='Revisa los límites: tiendas 1–100 y productos 1–1.000.000, o déjalos pendientes.';return;
  }
  if(basic&&(bulk.checked||woo.checked)){
   feedback.className='status error';feedback.textContent='En Profesional solo se pueden añadir productos de uno en uno.';return;
  }
  if(bulk.checked&&!woo.checked){
   feedback.className='status error';feedback.textContent='La importación por lotes requiere incluir WooCommerce.';return;
  }
  if(!window.confirm('¿Guardar solo como propuesta interna? No modifica ninguna tienda ni activa cuotas.'))return;
  action.disabled=true;feedback.className='status';feedback.textContent='Guardando…';
  try{
   const response=await api('/features/'+encodeURIComponent(plan.code),{method:'POST',
    body:JSON.stringify({storeLimit,productLimit,wooSync:!basic&&woo.checked,bulkImport:!basic&&bulk.checked,externalCheckout:true})});
   Object.assign(plan,response.plan);
   main.lastChild.textContent=limit(plan.storeLimit,'tienda(s)')+' · '+limit(plan.productLimit,'producto(s)');
   feedback.textContent='Borrador guardado sin aplicar restricciones comerciales.';
   renderComparison();
   if(typeof window.dispatchEvent==='function')window.dispatchEvent(new Event('commercial:features-saved'));
  }catch(error){feedback.className='status error';feedback.textContent=error.message;}
  finally{action.disabled=false;}
 });
 section.append(heading,form);
 return section;
}
async function load(){
 const notice=byId('featuresNotice');
 try{
  const [commercial,specifications,definition]=await Promise.all([api(''),api('/features'),api('/definition')]);
  if(!commercial.commercialDraftOnly||commercial.pricesPublished||commercial.enrollmentEnabled||
     !specifications.proposalOnly||specifications.entitlementsEnforced||specifications.pricesPublished||
     specifications.enrollmentEnabled)throw Error('Los planes deben permanecer exclusivamente como borradores.');
  if(definition.productionReady!==false||definition.billingEnabled!==false||
     definition.entitlementsEnforced!==false||!definition.pilotProtected)
   throw Error('Los límites reales deben permanecer desactivados.');
  currentDrafts=commercial.drafts||[];currentPlans=specifications.plans||[];
  currentPolicies=(definition.cards||[]).map(card=>({code:card.code,mode:card.policy?.mode}));
  byId('proposedFeatures').replaceChildren(...currentPlans.map(planForm));
  renderComparison();
  notice.textContent='';
 }catch(error){
  notice.className='status error';notice.textContent='No se han podido cargar las propuestas: '+error.message;
 }
}
window.addEventListener('commercial:price-saved',load);
window.addEventListener('commercial:policy-saved',load);
load();
})();
