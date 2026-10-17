'use strict';
// V3.2.87 - all interactions are client-only. Never send a checkout/consent request.
(()=>{
 const byId=id=>document.getElementById(id);
 const el=(tag,text,cls)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=String(text??'');
  if(cls)node.className=cls;
  return node;
 };
 const area=byId('contractArea'),loading=byId('loading');
 const plansStage=byId('stagePlans'),termsStage=byId('stageTerms'),doneStage=byId('stageDone');
 const confirmation=byId('simulationForm'),read=byId('readTerms'),understand=byId('understandDemo');
 let state=null,chosen=null;
 function stage(step){
  plansStage.hidden=step!=='plans';
  termsStage.hidden=step!=='terms';
  doneStage.hidden=step!=='done';
 }
 function choose(plan){
  chosen=plan;
  read.checked=false;understand.checked=false;byId('formError').hidden=true;
  byId('selectedPlan').textContent='Modalidad simulada: '+plan.name+' · '+plan.price.label;
  stage('terms');
  termsStage.querySelector('h2')?.focus?.();
  window.scrollTo?.({top:0,behavior:'auto'});
 }
 function makePlan(plan){
  const card=el('article',undefined,'contract-plan');
  card.append(el('h3',plan.name));
  card.append(el('span','Propuesta interna · no contratable','contract-badge'));
  card.append(el('p',plan.price.label,'contract-price'));
  const ul=el('ul');
  for(const benefit of plan.benefits||[])ul.append(el('li',benefit));
  card.append(ul);
  const button=el('button','Ver simulación de '+plan.name);
  button.type='button';
  button.addEventListener('click',()=>choose(plan));
  card.append(button);
  return card;
 }
 function paintPolicy(policy){
  const policies=[
   ['Precio e impuestos','No hay importe final aprobado. '+policy.taxes],
   ['Renovaciones',policy.renewal],
   ['Bajas y reembolsos',policy.cancellation],
   ['Condiciones y consentimiento',policy.terms],
   ['Privacidad',policy.privacy],
   ['Pago de productos','Cada producto se compra y se paga en la tienda original del vendedor.']
  ];
  const entries=policies.map(([k,v])=>{
   const item=el('div');item.append(el('dt',k),el('dd',v));return item;
  });
  byId('conditions').replaceChildren(...entries);
 }
 function validate(data){
  if(!data||data.ok!==true||data.previewOnly!==true||data.billingEnabled!==false||
     data.checkoutEnabled!==false||data.liveStripeEnabled!==false||
     data.enrollmentEnabled!==false||data.entitlementsEnforced!==false||
     data.pricesPublished!==false||data.consentRecorded!==false||
     data.productCheckoutExternal!==true||
     !Array.isArray(data.plans)||data.plans.length!==2||
     !data.plans.every(p=>p.contractable===false&&p.price?.approved===false&&p.price?.amountCents===null))
   throw Error('La contratación no está disponible: no se puede mostrar una simulación segura.');
  return data;
 }
 confirmation.addEventListener('submit',event=>{
  event.preventDefault();
  if(!chosen)return;
  if(!read.checked||!understand.checked){
   byId('formError').textContent='Marca las dos confirmaciones para continuar con esta simulación.';
   byId('formError').hidden=false;
   return;
  }
  byId('formError').hidden=true;
  // Explicitly local-only. No network request, legal acceptance, card or Stripe customer.
  byId('donePlan').textContent='Has recorrido el ejemplo del plan '+chosen.name+'.';
  stage('done');window.scrollTo?.({top:0,behavior:'auto'});
 });
 byId('backPlans').addEventListener('click',()=>{chosen=null;stage('plans');});
 byId('restart').addEventListener('click',()=>{chosen=null;read.checked=false;understand.checked=false;stage('plans');});
 async function load(){
  try{
   const response=await fetch('/api/marketplace/subscriptions/contract-preview',{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error(response.status===401?'Inicia sesión para abrir el centro de contratación.':'No se pudo cargar la simulación.');
   state=validate(await response.json());
   byId('pilotNotice').textContent=state.pilotNotice;
   byId('sellerNotice').classList.toggle('pilot',state.account.pilotProtected===true);
   byId('planCards').replaceChildren(...state.plans.map(makePlan));
   byId('workflow').replaceChildren(...state.steps.map(step=>el('li',step)));
   paintPolicy(state.policies);
   stage('plans');area.hidden=false;loading.textContent='';
  }catch(error){loading.textContent=error.message||'No se ha podido cargar la vista previa.';}
 }
 load();
})();
