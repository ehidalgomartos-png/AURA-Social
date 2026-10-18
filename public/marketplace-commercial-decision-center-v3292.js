'use strict';
// V3.2.92 — read-only decision center; actual progress is decided by existing server.
// Only opens the existing admin forms. Never writes, approves terms or changes billing.
(()=>{
 const $=id=>document.getElementById(id);
 const endpoint='/api/marketplace/subscriptions/admin/commercial/launch-readiness';
 const plans=[['professional','Profesional'],['professional_plus','Profesional Plus']];
 const topics=['pricing','taxes','terms','renewals','cancellations','privacy'];
 const stepIds=['price','features','external','terms','internal'];
 const guidance={
  price:'Estudia el importe, comprueba impuestos y guarda solo una propuesta editable. No se publicará.',
  features:'Revisa la capacidad, las tiendas conectadas y las prestaciones propuestas de esta modalidad.',
  external:'Comprueba que la compra de productos se realiza exclusivamente en la tienda original del vendedor.',
  terms:'Sustituye las seis plantillas por textos revisados y guarda un borrador privado.',
  internal:'Primero completa los seis textos; después solicita una revisión interna no aprobada.',
  pricing:'Falta cerrar el estudio de precios y costes reales. Las cantidades actuales son solo orientativas.',
  taxes:'Consulta el tratamiento fiscal, el IVA aplicable y la facturación antes del lanzamiento.',
  termsReview:'Revisa jurídicamente los términos y la forma de obtener consentimiento expreso.',
  renewals:'Define las renovaciones, sus avisos y el tratamiento de los pagos fallidos.',
  cancellations:'Estudia las bajas, los reembolsos y el eventual período de gracia.',
  privacy:'Revisa los datos de facturación, su conservación y las comunicaciones.'
 };
 const routes={
  price:{group:'workgroup-plans',list:'drafts',attribute:'data-plan'},
  features:{group:'workgroup-plans',list:'definitionCards',attribute:'data-plan'},
  external:{group:'workgroup-plans',list:'proposedFeatures',attribute:'data-plan'},
  terms:{group:'workgroup-terms',list:'contractDraftList',attribute:'data-code'},
  internal:{group:'workgroup-terms',list:'contractDraftList',attribute:'data-code'}
 };
 const state={data:null,mode:'pending',loading:false,again:false};
 function node(tag,value,className){
  const result=document.createElement(tag);
  if(value!==undefined)result.textContent=String(value);
  if(className)result.className=className;
  return result;
 }
 function valid(data){
  if(!data||data.ok!==true||data.adminOnly!==true||data.previewOnly!==true||
   data.commercialDraftOnly!==true||data.releaseAuthorized!==false||
   data.productionReady!==false||data.billingEnabled!==false||
   data.liveStripeEnabled!==false||data.publicEnrollmentEnabled!==false||
   data.entitlementsEnforced!==false||data.consentRecorded!==false||
   data.pricesPublished!==false||data.legalApproval!==false||
   data.taxApproval!==false||data.pilotProtected!==true||
   data.externalProductCheckout!==true||data.summary?.needsFinalApprovals!==true||
   !Array.isArray(data.plans)||data.plans.length!==2||
   !Array.isArray(data.reviewChecklist)||data.reviewChecklist.length!==6)return false;
  const seen=new Set();
  let missing=0,planMissing=0,reviewMissing=0;
  for(const plan of data.plans){
   if(!plans.some(([id])=>id===plan.code)||seen.has(plan.code)||
      plan.priceApproved!==false||plan.productPurchaseExternal!==true||
      !Array.isArray(plan.checklist)||plan.checklist.length!==5)return false;
   seen.add(plan.code);
   const steps=new Set();
   for(const item of plan.checklist){
    if(!item||!stepIds.includes(item.id)||steps.has(item.id)||
       typeof item.label!=='string'||typeof item.complete!=='boolean')return false;
    steps.add(item.id);
    if(!item.complete){missing++;planMissing++;}
   }
   if(!stepIds.every(id=>steps.has(id)))return false;
  }
  const reviews=new Set();
  for(const item of data.reviewChecklist){
   if(!item||!topics.includes(item.id)||reviews.has(item.id)||
      typeof item.label!=='string'||typeof item.complete!=='boolean')return false;
   reviews.add(item.id);
   if(!item.complete){missing++;reviewMissing++;}
  }
  return topics.every(id=>reviews.has(id))&&
   Number.isSafeInteger(data.summary.outstanding)&&
   data.summary.outstanding===missing&&
   data.summary.planTasks===planMissing&&
   data.summary.internalReviewTasks===reviewMissing;
 }
 function locationOf(id,code){
  if(code==='review')return {group:'workgroup-terms',list:'reviews',attribute:'data-review',code:id};
  return {...routes[id],code};
 }
 function jump(id,code){
  const where=locationOf(id,code),group=$(where.group),list=$(where.list);
  if(!group||!list){
   $('decisionCenterMessage').textContent='El editor aún no está disponible. Actualiza la página y vuelve a intentarlo.';
   return;
  }
  let target=null;
  for(const candidate of list.children){
   const key=candidate.getAttribute?.(where.attribute)||
     (where.attribute==='data-code'?candidate.dataset?.code:null);
   if(key===where.code){target=candidate;break;}
  }
  if(!target){
   $('decisionCenterMessage').textContent='El formulario todavía se está cargando. Espera un momento y vuelve a pulsar «Ir al apartado».';
   return;
  }
  group.open=true;
  target.open=true;
  const summary=target.querySelector('summary');
  if(!summary){
   $('decisionCenterMessage').textContent='El apartado seleccionado no tiene una cabecera accesible.';
   return;
  }
  $('decisionCenterMessage').textContent='Abierto el apartado correspondiente. Los cambios solo se guardarán si los confirmas en su formulario.';
  summary.scrollIntoView({block:'start',behavior:'auto'});
  summary.focus({preventScroll:true});
 }
 function row(item,code,review=false){
  const line=node('div',undefined,'decision-center-item'+(item.complete?' is-complete':''));
  const status=node('span',item.complete?'✓':'○','decision-center-state');
  status.setAttribute('aria-label',item.complete?'Revisión interna preparada':'Pendiente');
  const detail=node('div',undefined,'decision-center-detail');
  detail.append(node('strong',item.label));
  const key=review?(item.id==='terms'?'termsReview':item.id):item.id;
  detail.append(node('p',item.complete?'Control interno preparado; no supone aprobación comercial o legal.':
   guidance[key]||'Completa la revisión desde el editor privado.'));
  const button=node('button','Ir al apartado');button.type='button';
  button.setAttribute('aria-label','Abrir '+item.label);
  button.addEventListener('click',()=>jump(item.id,review?'review':code));
  line.append(status,detail,button);
  return line;
 }
 function render(){
  if(!state.data)return;
  const data=state.data;
  const total=data.plans.reduce((n,p)=>n+p.checklist.length,0)+data.reviewChecklist.length;
  const done=total-data.summary.outstanding;
  $('decisionCenterCount').textContent=done+' de '+total+' comprobaciones internas preparadas · '+data.summary.outstanding+' pendientes';
  $('decisionCenterProgress').setAttribute('aria-valuemax',String(total));
  $('decisionCenterProgress').setAttribute('aria-valuenow',String(done));
  $('decisionCenterProgressFill').style.width=(done/total*100).toFixed(0)+'%';
  $('decisionCenterPending').setAttribute('aria-pressed',String(state.mode==='pending'));
  $('decisionCenterAll').setAttribute('aria-pressed',String(state.mode==='all'));
  const container=$('decisionCenterGroups');
  const opened=new Set([...container.children].filter(x=>x.open).map(x=>x.getAttribute('data-group')));
  const groups=[
   ...plans.map(([code,title])=>{
    const plan=data.plans.find(p=>p.code===code);
    return {code,title,items:plan.checklist,review:false};
   }),
   {code:'review',title:'Revisiones generales',items:data.reviewChecklist,review:true}
  ];
  const elements=groups.map(group=>{
   const visible=group.items.filter(item=>state.mode==='all'||!item.complete);
   const pending=group.items.filter(item=>!item.complete).length;
   const wrap=node('details',undefined,'decision-center-group');
   wrap.setAttribute('data-group',group.code);
   if(opened.has(group.code))wrap.open=true;
   const summary=node('summary');
   summary.append(node('span',group.title),node('span',pending+' pendientes · '+group.items.length+' controles'));
   const list=node('div',undefined,'decision-center-list');
   if(!visible.length)list.append(node('p',
    state.mode==='pending'?'Sin decisiones pendientes en este grupo.':'No hay comprobaciones disponibles.',
    'decision-center-empty'));
   for(const item of visible)list.append(row(item,group.code,group.review));
   wrap.append(summary,list);
   return wrap;
  });
  container.replaceChildren(...elements);
 }
 async function refresh(){
  if(state.loading){state.again=true;return;}
  state.loading=true;
  $('decisionCenterRefresh').disabled=true;
  $('decisionCenterMessage').textContent='Comprobando los borradores guardados…';
  try{
   const response=await fetch(endpoint,{method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('No se pudo consultar el progreso.');
   const data=await response.json();
   if(!valid(data))throw Error('El estado privado de las decisiones no puede verificarse.');
   state.data=data;
   render();
   $('decisionCenterMessage').textContent='Estado actualizado desde los borradores privados. No se ha guardado ningún cambio.';
  }catch(error){
   // Never leave stale "completed" claims or active shortcuts on an invalid response.
   state.data=null;
   $('decisionCenterCount').textContent='No se ha podido verificar el estado de las decisiones';
   $('decisionCenterProgressFill').style.width='0%';
   $('decisionCenterProgress').setAttribute('aria-valuenow','0');
   $('decisionCenterGroups').replaceChildren();
   $('decisionCenterMessage').textContent=error.message+' Puedes reintentarlo con «Actualizar estado».';
  }finally{
   state.loading=false;$('decisionCenterRefresh').disabled=false;
   if(state.again){state.again=false;refresh();}
  }
 }
 $('decisionCenterPending').addEventListener('click',()=>{state.mode='pending';render();});
 $('decisionCenterAll').addEventListener('click',()=>{state.mode='all';render();});
 $('decisionCenterRefresh').addEventListener('click',refresh);
 for(const name of ['commercial:price-saved','commercial:review-saved',
  'commercial:features-saved','commercial:policy-saved','commercial:terms-saved']){
  window.addEventListener(name,refresh);
 }
 refresh();
})();
