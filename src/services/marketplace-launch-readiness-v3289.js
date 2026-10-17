'use strict';
// V3.2.89. Private, admin-only launch readiness / seller-copy preview.
// No publishing, charging, consent recording, entitlement changes or Stripe API.
const definitions=require('./marketplace-commercial-decisions-v3285');
const contracts=require('./marketplace-contract-drafts-v3288');
const commercial=require('./marketplace-subscription-commercial-v3281');
const CODES=Object.freeze(['professional','professional_plus']);
const names={professional:'Profesional',professional_plus:'Profesional Plus'};
const reviewTopics=Object.freeze(['pricing','taxes','terms','renewals','cancellations','privacy']);
const textFields=Object.freeze(['priceDisclosure','taxes','renewals','cancellations','privacy','consent']);
const check=(id,label,passed)=>({id,label,complete:passed===true});
function build(defined,contractData,commercialData){
 const cards=Array.isArray(defined?.cards)?defined.cards:[];
 const drafts=Array.isArray(contractData?.drafts)?contractData.drafts:[];
 const priceDrafts=Array.isArray(commercialData?.drafts)?commercialData.drafts:[];
 const reviews=Array.isArray(commercialData?.reviews)?commercialData.reviews:[];
 const plans=CODES.map(code=>{
  const features=cards.find(c=>c.code===code);
  const terms=drafts.find(d=>d.code===code);
  const price=priceDrafts.find(p=>p.code===code);
  const proposedPrice=Number.isSafeInteger(price?.proposedMonthlyCents)?price.proposedMonthlyCents:null;
  const coherent=!!features&&features.capacity?.status==='proposed'&&features.policy?.mode==='unlimited_proposal'&&
   features.productLimit===null&&Number.isSafeInteger(features.storeLimit)&&features.storeLimit>=1&&
   (code==='professional'?
     features.bulkImport===false&&features.wooSync===false:
     features.bulkImport===true&&features.wooSync===true);
  const external=!!features&&!features.issues?.some(issue=>issue.includes('Compra externa obligatoria'));

  const drafting=!!terms&&textFields.every(f=>typeof terms[f]==='string'&&terms[f].trim().length>=20&&!contracts.isTemplate(terms[f]));
  const steps=[
   check('price','Definir el precio propuesto (sin aprobar)',proposedPrice!==null),
   check('features','Confirmar prestaciones y propuesta sin límite de productos',coherent),
   check('external','Mantener todas las compras de productos en la web del vendedor',external),
   check('terms','Redactar los seis apartados de condiciones internas',drafting),
   check('internal','Pasar el borrador a revisión interna',drafting&&terms?.reviewState==='internal_review')
  ];
  return {
   code,name:names[code],priceProposalCents:proposedPrice,
   monthlyCurrency:'EUR',priceApproved:false,storeLimitProposal:features?.storeLimit??null,
   unlimitedProductsProposed:features?.capacity?.status==='proposed'&&features.policy?.mode==='unlimited_proposal',
   oneByOne:true,bulkImportProposed:code==='professional_plus',wooSyncProposed:code==='professional_plus',
   productPurchaseExternal:true,
   contractDraftRevision:terms?.revision??0,contractReviewState:terms?.reviewState||'draft',
   termsPreview:textFields.map(id=>({id,text:terms?.[id]||'',draftOnly:true})),
   checklist:steps,openTasks:steps.filter(t=>!t.complete).length
  };
 });
 const checklist=reviewTopics.map(code=>{
  const item=reviews.find(x=>x.code===code);
  return check(code,item?.name||code,item?.status==='reviewed');
 });
 const planTasks=plans.reduce((count,p)=>count+p.openTasks,0);
 return {
  ok:true,previewOnly:true,commercialDraftOnly:true,adminOnly:true,
  releaseAuthorized:false,productionReady:false,legalApproval:false,taxApproval:false,
  publicEnrollmentEnabled:false,pricesPublished:false,billingEnabled:false,liveStripeEnabled:false,
  consentRecorded:false,entitlementsEnforced:false,
  pilotProtected:true,externalProductCheckout:true,
  plans,reviewChecklist:checklist,
  summary:{
   planTasks,internalReviewTasks:checklist.filter(t=>!t.complete).length,
   outstanding:planTasks+checklist.filter(t=>!t.complete).length,
   needsFinalApprovals:true
  },
  information:'Incluso con todas las revisiones internas completadas, se requiere autorización legal, fiscal, comercial y técnica expresa, además de un despliegue independiente para activar Stripe LIVE.'
 };
}
async function overview(){
 await Promise.all([definitions.ensureSchema(),contracts.ensureSchema()]);
 const [a,b,c]=await Promise.all([definitions.overview(),contracts.list(),commercial.overview()]);
 return build(a,b,c);
}
module.exports={CODES,reviewTopics,textFields,build,overview};
