'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const preflight=require('../src/services/marketplace-billing-preflight-v32105');
const readiness=require('../src/services/marketplace-launch-readiness-v3289');
const src=()=>fs.readFileSync('public/marketplace-launch-readiness-v3289.js','utf8');

function sample(){
 const codes=readiness.CODES;
 const cards=codes.map(code=>({code,storeLimit:code==='professional'?1:3,productLimit:null,
  bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  issues:[],capacity:{status:'proposed'},policy:{mode:'unlimited_proposal'}}));
 const drafts=codes.map(code=>({code,reviewState:'internal_review',revision:2,
  priceDisclosure:'Texto en revisión, no aprobado para cobrar ni facturar.',
  taxes:'Texto en revisión, no aprobado para cobrar ni facturar.',
  renewals:'Texto en revisión, no aprobado para cobrar ni facturar.',
  cancellations:'Texto en revisión, no aprobado para cobrar ni facturar.',
  privacy:'Texto en revisión, no aprobado para cobrar ni facturar.',
  consent:'Texto en revisión, no aprobado para cobrar ni facturar.'}));
 const commercial={drafts:codes.map(code=>({code,proposedMonthlyCents:code==='professional'?990:2490})),
  reviews:readiness.reviewTopics.map(code=>({code,status:'reviewed'}))};
 return readiness.build({cards},{drafts},commercial);
}
test('Spanish sole trader is selected as prospective subscription issuer, never an SL',()=>{
 const plan=preflight.preview();
 assert.equal(plan.adminOnly,true);
 assert.equal(plan.previewOnly,true);
 assert.equal(plan.countryCode,'ES');
 assert.deepEqual(Object.keys(plan.invoiceIssuer).includes('legalForm'),true);
 const issuer=plan.invoiceIssuer;
 assert.equal(issuer.legalForm,'natural_person');
 assert.equal(issuer.businessStatus,'self_employed');
 assert.equal(issuer.countryCode,'ES');
 assert.equal(issuer.noLegalPersonCompany,true);
 assert.equal(issuer.selectionStatus,'selected_pending_verification');
 assert.equal(issuer.checklist.length,7);
 assert.ok(issuer.checklist.every(x=>x.approved===false));
});
test('no fiscal identity is invented, saved, verified, or serialized in configuration',()=>{
 const issuer=preflight.preview().invoiceIssuer;
 for(const field of ['issuerLegalName','issuerTaxId','issuerFiscalAddress'])assert.equal(issuer[field],null,field);
 for(const flag of ['legalIdentityVerified','fiscalRegistrationVerified','invoicingSystemApproved',
  'stripeMerchantIdentityMatched','invoiceIssuerApproved','identityFieldsStored'])assert.equal(issuer[flag],false,flag);
 const source=fs.readFileSync('src/services/marketplace-billing-preflight-v32105.js','utf8');
 for(const forbidden of ['process.env.STRIPE_SECRET_KEY','UPDATE marketplace_','INSERT INTO','CREATE TABLE',
  'stripeRequest(', 'localStorage','sessionStorage'])assert.equal(source.includes(forbidden),false,forbidden);
});
test('issuer decision never grants tax, invoices, consent, plans, or paid entitlements',()=>{
 const plan=sample(),issuer=plan.billingPreflight.invoiceIssuer;
 assert.equal(issuer.legalForm,'natural_person');
 assert.equal(plan.billingPreflight.invoiceGenerationEnabled,false);
 assert.equal(plan.billingPreflight.taxRatesConfigured,false);
 assert.equal(plan.billingPreflight.personalDataCollectionEnabled,false);
 assert.equal(plan.billingPreflight.invoiceIssuerApproved,false);
 assert.equal(plan.summary.needsFinalApprovals,true);
 for(const field of ['releaseAuthorized','productionReady','legalApproval','taxApproval','billingEnabled',
  'liveStripeEnabled','publicEnrollmentEnabled','pricesPublished','consentRecorded',
  'entitlementsEnforced']) assert.equal(plan[field],false,field);
 assert.equal(plan.pilotProtected,true);
 assert.equal(plan.externalProductCheckout,true);
});
test('mobile admin view stays private and readable with collapsed issuer tasks',()=>{
 const html=fs.readFileSync('src/views/marketplace-launch-readiness-v3289.html','utf8');
 const ui=src(),route=fs.readFileSync('src/routes/marketplace-subscription-commercial-v3281.js','utf8');
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/id="billingPreflightPreview"/);
 assert.match(html,/<details>/);
 assert.match(html,/marketplace-launch-readiness-v3289.js\?v=3\.2\.106/);
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(ui,/Emisor previsto de las suscripciones/);
 assert.match(ui,/invoiceIssuer\.checklist/);
 assert.match(ui,/issuerTaxId!==null/);
 assert.doesNotMatch(ui,/method:\s*['"]POST['"]|localStorage|sessionStorage|sk_live_/);
});
test('actual browser preview renders issuer proposal and both plans, never uses POST',async()=>{
 const nodes=new Map(),element=tag=>({
  tag,children:[],hidden:false,value:undefined,textContent:'',className:'',
  append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=items;},
  addEventListener(name,cb){this.listener=cb;}
 });
 const document={
  getElementById(id){if(!nodes.has(id))nodes.set(id,element('div'));return nodes.get(id);},
  createElement:element
 };
 document.getElementById('planSelector').value='professional';
 let requests=0;
 const fetch=async(url,opts)=>{
  requests++;
  assert.equal(url,'/api/marketplace/subscriptions/admin/commercial/launch-readiness');
  assert.equal(opts.credentials,'same-origin');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.method,undefined);
  return {ok:true,json:async()=>sample()};
 };
 vm.runInNewContext(src(),{document,fetch,Intl,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,1);
 assert.match(document.getElementById('loadStatus').textContent,/Datos internos cargados/);
 assert.equal(document.getElementById('launchWorkspace').hidden,false);
 const nodesInBilling=document.getElementById('billingPreflightPreview').children;
 assert.ok(nodesInBilling.some(x=>x.textContent==='Emisor previsto de las suscripciones'));
 assert.ok(nodesInBilling.some(x=>x.textContent.includes('Persona física · autónomo en España')));
 assert.ok(nodesInBilling.length>=8);
 document.getElementById('planSelector').listener({target:{value:'professional_plus'}});
 assert.match(document.getElementById('planPreview').children[0].textContent,/Profesional Plus/);
});
