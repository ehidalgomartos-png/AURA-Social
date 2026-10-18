'use strict';
// Admin-only preview. Only GET requests, no Stripe, no consent writes.
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,value,className)=>{
  const node=document.createElement(tag);
  if(value!==undefined)node.textContent=String(value??'');
  if(className)node.className=className;
  return node;
 };
 const monthly=cents=>Number.isSafeInteger(cents)?(cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})+'/mes':'Precio mensual pendiente de definir';
 let data=null;
 function mark(parent,entry){
  const line=el('div',undefined,'check-row');
  line.append(el('span',entry.complete?'✓':'○',entry.complete?'mark done':'mark'),el('span',entry.label));
  parent.append(line);
 }
 function features(plan){
  return [
   plan.unlimitedProductsProposed?'Productos sin límite (propuesto)':'Capacidad de productos por confirmar',
   'Publicación de productos uno a uno',
   plan.bulkImportProposed?'Incluye importación CSV/lotes':'Sin importación CSV/lotes',
   plan.wooSyncProposed?'Sincronización automática WooCommerce prevista':'Sin sincronización automática',
   plan.storeLimitProposal===null?'Tiendas conectadas por definir':
    plan.storeLimitProposal===1?'1 tienda propuesta':plan.storeLimitProposal+' tiendas propuestas',
   'La compra de cada producto continúa en la web del vendedor'
  ];
 }
 function card(plan){
  const node=el('article',undefined,'plan-card');
  node.append(el('h3',plan.name));
  node.append(el('div',monthly(plan.priceProposalCents)+' · propuesta privada','price'));
  node.append(el('p','Importe no aprobado; IVA y facturación pendientes.','note'));
  const ul=el('ul',undefined,'features');
  features(plan).forEach(value=>ul.append(el('li',value)));
  node.append(ul);
  const remaining=el('p',plan.openTasks+' decisiones de plan pendientes','note');
  node.append(remaining);
  return node;
 }
 const labels={
  priceDisclosure:'Precio definitivo y periodicidad',taxes:'IVA y facturación',
  renewals:'Renovaciones y avisos',cancellations:'Bajas, devoluciones y gracia',
  privacy:'Privacidad',consent:'Consentimiento contractual'
 };
 function preview(code){
  const plan=data.plans.find(item=>item.code===code);
  if(!plan)return;
  const container=$('planPreview');
  const header=el('h3',plan.name+' · Previsualización administrativa');
  const caveat=el('p','Precio orientativo: '+monthly(plan.priceProposalCents)+'. Aún no hay oferta aprobada ni precio publicado.');
  const list=el('ul',undefined,'features');
  features(plan).forEach(feature=>list.append(el('li',feature)));
  const title=el('h3','Condiciones de contratación · Borradores privados');
  const texts=plan.termsPreview.map(item=>{
   const details=el('details');
   const content=item.text||'Pendiente de redacción';
   const template=content.includes('PLANTILLA INTERNA V3.2.90');
   details.append(el('summary',(labels[item.id]||item.id)+(template?' · plantilla pendiente':'')),el('p',content));
   return details;
  });
  const note=el('p','Revisión '+plan.contractDraftRevision+' · '+(
   plan.contractReviewState==='internal_review'?'Revisión interna, no aprobada':'Borrador sin aprobación'));
  container.replaceChildren(header,caveat,list,title,...texts,note);
 }
 function render(result){
  const audience=result.audience;
  const audienceContainer=$('audiencePreview');
  const people=el('p',audience.customerTypes.map(type=>type.label).join(' · '),'hint');
  const contexts=el('p','La contratación podrá tener finalidad personal o profesional. El tipo de cuenta no determina por sí solo si el cliente tiene derechos de consumidor.','hint');
  const heading=el('strong','Pendiente de revisión fiscal y legal');
  const tasks=el('ul',undefined,'features');
  audience.legalAndTaxReviews.forEach(item=>tasks.append(el('li',item.label+' · pendiente de aprobación')));
  const warning=el('p','No se han aprobado precios, impuestos, contratos ni cobros reales. Las compras de productos continúan en la web del vendedor.','hint');
  audienceContainer.replaceChildren(people,contexts,heading,tasks,warning);
  const geo=audience.geography;
  const location=$('countryScopePreview');
  const regions=el('ul',undefined,'features');
  geo.taxTerritories.forEach(area=>regions.append(el('li',area.label+' · régimen fiscal pendiente de revisión; sin tipo impositivo aprobado')));
  location.replaceChildren(
   el('p','País propuesto para las suscripciones iniciales: '+geo.launchCountryName+' ('+geo.launchCountryCode+').','hint'),
   el('p','Península, Baleares, Canarias, Ceuta y Melilla están dentro del alcance geográfico. La fiscalidad no es la misma en todos ellos.','hint'),
   regions,
   el('p','Sin comprobación por IP ni restricción de acceso al Marketplace. En un futuro Checkout de pago habrá que verificar país y datos de facturación antes de cobrar.','hint')
  );
  const billing=result.billingPreflight;
  const billingTarget=$('billingPreflightPreview');
  const buyerCases=el('ul',undefined,'features');
  billing.cases.forEach(item=>{
   const row=el('li');
   const detail=el('details');
   const questions=el('ul',undefined,'features');
   item.questions.forEach(question=>questions.append(el('li',question)));
   detail.append(el('summary',item.label),questions);
   row.append(detail);
   buyerCases.append(row);
  });
  const territoryHeading=el('h3','Territorios españoles: fiscalidad pendiente');
  const territories=el('ul',undefined,'features');
  billing.territories.forEach(item=>territories.append(el('li',item.label+' · '+(
   item.scope==='spanish_vat_area'?'ámbito del IVA español':'fuera del ámbito del IVA español')+
   ' · tratamiento sin aprobar')));
  const invoiceHeading=el('h3','Antes de emitir facturas o cobrar');
  const steps=el('ul',undefined,'features');
  billing.checklist.forEach(item=>steps.append(el('li',item.label+' · pendiente')));
  billingTarget.replaceChildren(buyerCases,territoryHeading,territories,invoiceHeading,steps,
   el('p','No se recopilan datos fiscales ni se calculan impuestos desde esta vista.','hint'));
  $('taskCount').textContent=result.summary.outstanding;
  $('launchPlans').replaceChildren(...result.plans.map(card));
  $('reviewTasks').replaceChildren(...result.reviewChecklist.map(entry=>{
   const row=el('div',undefined,'check-row');
   row.append(el('span',entry.complete?'✓':'○',entry.complete?'mark done':'mark'),el('span',entry.label));
   return row;
  }));
  const explanation=el('p','Aunque no queden revisiones internas, el lanzamiento comercial NO está autorizado.','hint');
  $('reviewTasks').append(explanation);
  preview($('planSelector').value);
  $('launchWorkspace').hidden=false;
 }
 $('planSelector').addEventListener('change',value=>{if(data)preview(value.target.value);});
 async function load(){
  try{
   const response=await fetch('/api/marketplace/subscriptions/admin/commercial/launch-readiness',{
    cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('No se puede consultar la preparación. Comprueba tu acceso de administrador.');
   const item=await response.json();
   if(item.ok!==true||item.adminOnly!==true||item.previewOnly!==true||
      item.productionReady!==false||item.releaseAuthorized!==false||item.billingEnabled!==false||
      item.liveStripeEnabled!==false||item.pricesPublished!==false||
      item.consentRecorded!==false||item.entitlementsEnforced!==false||
      item.pilotProtected!==true||!Array.isArray(item.plans)||item.plans.length!==2||
      item.audience?.adminOnly!==true||item.audience?.previewOnly!==true||
      item.audience?.sameProposedPlansForAll!==true||
      item.audience?.consumerStatusNotInferredFromAccountType!==true||
      item.audience?.billingEnabled!==false||item.audience?.liveStripeEnabled!==false||
      item.audience?.publicEnrollmentEnabled!==false||
      item.audience?.geography?.launchCountryCode!=='ES'||
      item.audience?.geography?.initiallyEligibleBillingCountryCodes?.length!==1||
      item.audience.geography.initiallyEligibleBillingCountryCodes[0]!=='ES'||
      item.audience?.geography?.taxationReviewed!==false||
      item.audience?.geography?.noUniversalVatRate!==true||
      item.billingPreflight?.adminOnly!==true||
      item.billingPreflight?.previewOnly!==true||
      item.billingPreflight?.countryCode!=='ES'||
      item.billingPreflight?.taxApproved!==false||
      item.billingPreflight?.legalApproved!==false||
      item.billingPreflight?.billingEnabled!==false||
      item.billingPreflight?.liveStripeEnabled!==false||
      item.billingPreflight?.invoiceGenerationEnabled!==false||
      item.billingPreflight?.personalDataCollectionEnabled!==false||
      item.billingPreflight?.taxRatesConfigured!==false||
      !Array.isArray(item.billingPreflight?.cases)||
      item.billingPreflight.cases.length!==4||
      !Array.isArray(item.billingPreflight?.territories)||
      item.billingPreflight.territories.length!==3||
      !Array.isArray(item.billingPreflight?.checklist)||
      item.audience?.geography?.appliesToPaidSubscriptionsOnly!==true||
      item.audience?.geography?.doesNotRestrictMarketplaceBrowse!==true||
      item.audience?.geography?.doesNotRestrictExternalSellerCheckout!==true||
      !Array.isArray(item.audience?.customerTypes)||item.audience.customerTypes.length!==3||
      !Array.isArray(item.audience?.legalAndTaxReviews))
    throw Error('Estado de seguridad inesperado; vista previa desactivada.');
   data=item;render(data);
   $('loadStatus').textContent='Datos internos cargados. No existe autorización para publicar ni cobrar.';
  }catch(err){
   $('loadStatus').className='error';
   $('loadStatus').textContent=err.message;
  }
 }
 load();
})();
