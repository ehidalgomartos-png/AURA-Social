'use strict';
// V3.2.93 — PRIVATE, EPHEMERAL study only. No HTTP writes, Stripe or legal approval.
(()=>{
 const $=id=>document.getElementById(id);
 const apiBase='/api/marketplace/subscriptions/admin/commercial';
 const names={professional:'Profesional',professional_plus:'Profesional Plus'};
 const fields=[
  ['priceDisclosure','Precio y periodicidad'],['taxes','IVA y facturación'],
  ['renewals','Renovaciones'],['cancellations','Cancelaciones y reembolsos'],
  ['privacy','Privacidad'],['consent','Consentimiento contractual']
 ];
 let plans=[],current='',edited=false,ready=false,loading=false,reload=false;
 const euro=value=>(value/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 const failText=(text,error=false)=>{
  const box=$('studyResult');box.className='study-result'+(error?' is-error':'');box.textContent=text;
 };
 function money(raw,allowZero){
  if(typeof raw!=='string'||!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))return null;
  const parts=raw.trim().replace(',','.').split('.');
  const cents=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents>1000000||(cents===0&&!allowZero))return null;
  return cents;
 }
 function tax(raw){
  if(typeof raw!=='string'||!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))return null;
  const parts=raw.trim().replace(',','.').split('.');
  const bps=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
  return Number.isSafeInteger(bps)&&bps<=10000?bps:null;
 }
 function calculate(){
  if(!ready){failText('No se ha podido verificar el modo privado del estudio.',true);return;}
  const price=money($('studyPrice').value,false),
   cost=money($('studyCost').value,true),
   fee=money($('studyFee').value,true),
   rate=tax($('studyVat').value);
  if([price,cost,fee,rate].some(x=>x===null)){
   failText('Introduce cuatro valores válidos: cuota de 0,01 a 10.000 € (simulación), coste y gasto de cobro de 0 a 10.000 €, e IVA hipotético de 0 a 100 %. No se aplica ningún porcentaje por defecto.',true);
   return;
  }
  const mode=$('studyVatMode').value;
  if(mode!=='included'&&mode!=='excluded'){failText('Selecciona cómo se trataría el IVA hipotético.',true);return;}
  const base=mode==='included'?Math.round(price*10000/(10000+rate)):price;
  const gross=mode==='included'?price:Math.round(price*(10000+rate)/10000);
  const vatAmount=gross-base;
  const margin=base-cost-fee;
  failText('Simulación mensual por comercio · '+names[current]+
   '\nPrecio introducido: '+euro(price)+
   '\nBase estimada sin IVA hipotético: '+euro(base)+
   '\nIVA hipotético: '+euro(vatAmount)+
   '\nTotal hipotético para el cliente: '+euro(gross)+
   '\nCoste y gasto estimados: '+euro(cost+fee)+
   '\nResultado estimado antes de otros costes e impuestos: '+euro(margin)+
   '\nCálculo orientativo, sin obligaciones fiscales determinadas ni importes guardados.');
 }
 function markup(){
  if(!ready)return;
  const code=$('studyPlan').value;
  const plan=plans.find(p=>p.code===code);
  if(!plan)return;
  current=code;
  const price=plan.savedPrice!==null?plan.savedPrice:plan.orientation;
  if(!edited)$('studyPrice').value=price===null?'':(price/100).toFixed(2);
  $('studySource').textContent=plan.savedPrice!==null?
    'Importe tomado del borrador privado guardado: '+euro(plan.savedPrice)+'. No está aprobado.':
    'Referencia orientativa sin guardar: '+(plan.orientation===null?'No disponible':euro(plan.orientation))+'. No es una oferta ni una cuota activa.';
  const entries=plan.terms;
  let prepared=0;
  const rows=fields.map(([id,label])=>{
   const field=entries.find(item=>item.id===id);
   const value=field&&typeof field.text==='string'?field.text.trim():'';
   const template=value.includes('PLANTILLA INTERNA V3.2.90');
   const complete=value.length>=20&&!template;
   if(complete)prepared++;
   const line=document.createElement('div');line.className='study-contract-field';
   const l=document.createElement('span');l.textContent=label;
   const status=document.createElement('strong');
   status.textContent=complete?'Texto preparado':template?'Plantilla por revisar':'Pendiente de redactar';
   line.append(l,status);return line;
  });
  $('studyContractFields').replaceChildren(...rows);
  $('studyContractSummary').textContent=names[code]+': '+prepared+
   ' de 6 apartados con textos propios. Estado: '+(plan.reviewState==='internal_review'?'En revisión interna (no aprobado)':'Borrador')+
   '. Ningún texto constituye condiciones legales aprobadas.';
  failText('Valores de trabajo editables. No se ha calculado ni guardado ningún escenario.');
 }
 function validate(a,b,c){
  if(a?.ok!==true||a.commercialDraftOnly!==true||a.billingEnabled!==false||
     a.enrollmentEnabled!==false||a.entitlementsEnforced!==false||
     a.pricesPublished!==false||a.pilotProtected!==true)return false;
  if(b?.ok!==true||b.adminOnly!==true||b.privateSuggestion!==true||
     b.pricesApproved!==false||b.termsApproved!==false||b.consentRecorded!==false||
     b.billingEnabled!==false||b.liveStripeEnabled!==false||b.pilotProtected!==true)return false;
  if(c?.ok!==true||c.adminOnly!==true||c.commercialDraftOnly!==true||
     c.previewOnly!==true||c.productionReady!==false||c.releaseAuthorized!==false||
     c.legalApproval!==false||c.taxApproval!==false||c.pricesPublished!==false||
     c.billingEnabled!==false||c.liveStripeEnabled!==false||
     c.consentRecorded!==false||c.pilotProtected!==true||c.externalProductCheckout!==true)return false;
  const ids=['professional','professional_plus'];
  return ids.every(id=>{
   const p=a.drafts?.find(x=>x.code===id);
   const suggestion=b.proposals?.find(x=>x.code===id);
   const actual=c.plans?.find(x=>x.code===id);
   return p&&suggestion&&actual&&actual.priceApproved===false&&actual.productPurchaseExternal===true&&
    (p.proposedMonthlyCents===null||Number.isSafeInteger(p.proposedMonthlyCents))&&
    Number.isSafeInteger(suggestion.proposedMonthlyCents)&&suggestion.approved===false&&
    Array.isArray(actual.termsPreview)&&actual.termsPreview.length===6;
  });
 }
 async function get(path){
  const response=await fetch(apiBase+path,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('No fue posible consultar los borradores privados.');
  return response.json();
 }
 async function load(){
  if(loading){reload=true;return;}
  loading=true;$('studyCalculate').disabled=true;
  try{
   const [commercial,guidance,readiness]=await Promise.all([get(''),get('/guidance'),get('/launch-readiness')]);
   if(!validate(commercial,guidance,readiness))throw Error('No se puede garantizar que las propuestas sean privadas y no operativas.');
   plans=['professional','professional_plus'].map(code=>({
    code,
    savedPrice:commercial.drafts.find(x=>x.code===code).proposedMonthlyCents,
    orientation:guidance.proposals.find(x=>x.code===code).proposedMonthlyCents,
    terms:readiness.plans.find(x=>x.code===code).termsPreview,
    reviewState:readiness.plans.find(x=>x.code===code).contractReviewState
   }));
   ready=true;$('studyCalculate').disabled=false;
   $('studyStatus').textContent='Estudio privado disponible. Los cálculos y las preguntas de revisión no guardan ningún cambio.';
   markup();
  }catch(err){
   ready=false;plans=[];$('studyStatus').textContent=err.message;
   $('studyContractFields').replaceChildren();
   $('studyContractSummary').textContent='No se ha podido verificar el estado del borrador.';
   failText('Los cálculos se han deshabilitado hasta poder comprobar la seguridad del estudio.',true);
  }finally{
   loading=false;
   if(reload){reload=false;load();}
  }
 }
 function jump(listId,attr,value,groupId){
  const list=$(listId),group=$(groupId);
  const target=[...(list?.children||[])].find(el=>attr==='data-code'?
   el.dataset?.code===value:el.getAttribute?.(attr)===value);
  if(!target||!group){
   $('studyStatus').textContent='El formulario todavía está cargando. Espera un instante y vuelve a probar.';
   return;
  }
  group.open=true;target.open=true;
  const summary=target.querySelector('summary');
  if(summary){summary.scrollIntoView({block:'start',behavior:'auto'});summary.focus({preventScroll:true});}
  $('studyStatus').textContent='Formulario abierto. Cualquier cambio requiere guardar y confirmar desde el editor existente.';
 }
 $('studyCalculate').addEventListener('click',calculate);
 $('studyPlan').addEventListener('change',()=>{edited=false;markup();});
 $('studyPrice').addEventListener('input',()=>{
  edited=true;failText('Importe modificado en pantalla; pulsa «Calcular escenario privado». No se guarda automáticamente.');
 });
 for(const id of ['studyCost','studyFee','studyVat','studyVatMode']){
  $(id).addEventListener('input',()=>failText('Hipótesis modificadas; pulsa «Calcular escenario privado» para actualizar.'));
 }
 $('studyGoPrice').addEventListener('click',()=>jump('drafts','data-plan',$('studyPlan').value,'workgroup-plans'));
 $('studyGoPricingReview').addEventListener('click',()=>jump('reviews','data-review','pricing','workgroup-terms'));
 $('studyGoTaxes').addEventListener('click',()=>jump('reviews','data-review','taxes','workgroup-terms'));
 $('studyGoContract').addEventListener('click',()=>jump('contractDraftList','data-code',$('studyPlan').value,'workgroup-terms'));
 $('studyGoTermsReview').addEventListener('click',()=>jump('reviews','data-review','terms','workgroup-terms'));
 for(const event of ['commercial:price-saved','commercial:review-saved','commercial:terms-saved']){
  window.addEventListener(event,load);
 }
 load();
})();
