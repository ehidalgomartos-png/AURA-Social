'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const billing=require('../src/services/marketplace-billing-preflight-v32105');
const readiness=require('../src/services/marketplace-launch-readiness-v3289');
const src=()=>fs.readFileSync('public/marketplace-launch-readiness-v3289.js','utf8');

test('Spain billing planning covers all eligible cases without classifying freelancers automatically',()=>{
 const v=billing.preview();
 assert.deepEqual(v.cases.map(x=>x.id),[
  'individual_personal','self_employed_personal','self_employed_business','company_business']);
 assert.deepEqual(v.cases.map(x=>x.purchasePurpose),['personal','personal','business','business']);
 assert.deepEqual(v.cases.map(x=>x.customerType),['individual','self_employed','self_employed','company']);
 assert.equal(v.cases.every(x=>x.questions.length>=3),true);
 assert.equal(v.countryCode,'ES');
 assert.deepEqual(v.territories.map(x=>x.id),['peninsula_balearic','canary','ceuta_melilla']);
 assert.equal(v.territories.find(x=>x.id==='canary').scope,'outside_spanish_vat_area');
 assert.equal(v.territories.find(x=>x.id==='ceuta_melilla').scope,'outside_spanish_vat_area');
 assert.equal(v.territories.every(x=>x.taxDecision==='pending_professional_review'),true);
});
test('billing simulation cannot issue invoices, charge money, record consent or collect tax identifiers',()=>{
 const v=billing.preview();
 for(const x of ['taxRatesConfigured','automaticTaxDecision','invoiceIssuerApproved',
  'invoiceGenerationEnabled','personalDataCollectionEnabled','consentCollected',
  'legalApproved','taxApproved','enrollmentEnabled','pricesPublished','billingEnabled',
  'liveStripeEnabled','entitlementsEnforced'])assert.equal(v[x],false,x);
 assert.equal(v.adminOnly,true);assert.equal(v.previewOnly,true);
 assert.equal(v.pilotProtected,true);assert.equal(v.productCheckoutExternal,true);
 assert.equal(v.checklist.every(x=>x.approved===false),true);
 for(const banned of ['INSERT INTO','UPDATE marketplace_','stripeRequest(','sk_live_','fetch('])
  assert.equal(fs.readFileSync('src/services/marketplace-billing-preflight-v32105.js','utf8').includes(banned),false);
});
function sample(){
 const codes=readiness.CODES;
 const cards=codes.map(code=>({code,storeLimit:code==='professional'?1:3,productLimit:null,
  bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  issues:[],capacity:{status:'proposed'},policy:{mode:'unlimited_proposal'}}));
 const drafts=codes.map(code=>({code,reviewState:'internal_review',revision:2,
  priceDisclosure:'Texto en preparación y pendiente de revisión fiscal.',
  taxes:'Texto en preparación y pendiente de revisión fiscal.',
  renewals:'Texto en preparación y pendiente de revisión fiscal.',
  cancellations:'Texto en preparación y pendiente de revisión fiscal.',
  privacy:'Texto en preparación y pendiente de revisión fiscal.',
  consent:'Texto en preparación y pendiente de revisión fiscal.'}));
 const commercial={drafts:codes.map(code=>({code,proposedMonthlyCents:code==='professional'?990:2490})),
  reviews:readiness.reviewTopics.map(code=>({code,status:'reviewed'}))};
 return readiness.build({cards},{drafts},commercial);
}
test('even fully drafted plans retain all commercial safeguards in private preview',()=>{
 const v=sample();
 assert.equal(v.billingPreflight.checklist.length,8);
 assert.equal(v.summary.outstanding,0);
 assert.equal(v.summary.needsFinalApprovals,true);
 for(const key of ['releaseAuthorized','productionReady','legalApproval','taxApproval',
  'publicEnrollmentEnabled','pricesPublished','billingEnabled','liveStripeEnabled',
  'consentRecorded','entitlementsEnforced'])assert.equal(v[key],false,key);
});
test('mobile private page uses collapsed details and never accepts or transmits billing data',()=>{
 const page=fs.readFileSync('src/views/marketplace-launch-readiness-v3289.html','utf8');
 const ui=src();
 assert.match(page,/id="billingPreflightPreview"/);
 assert.match(page,/<details>/);
 assert.match(page,/viewport-fit=cover/);
 assert.match(page,/marketplace-launch-readiness-v3289.js\?v=3\.2\.\d+/);
 assert.match(page,/Contratar \(no disponible\)/);
 assert.match(ui,/billing\.cases\.forEach/);
 assert.match(ui,/billing\.checklist\.forEach/);
 assert.match(ui,/item\.billingPreflight\?\.liveStripeEnabled!==false/);
 assert.doesNotMatch(ui,/method:\s*['"]POST['"]|localStorage|sessionStorage|sk_live_/);
});
test('admin preview actually renders and switches plans without shadowed function errors',async()=>{
 const nodes=new Map();
 const element=tag=>({
  tag,children:[],hidden:false,attributes:{},value:undefined,textContent:'',className:'',
  append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=items;},
  addEventListener(name,callback){this.listener=callback;}
 });
 const document={
  getElementById(id){
   if(!nodes.has(id))nodes.set(id,element('div'));
   return nodes.get(id);
  },
  createElement:element
 };
 document.getElementById('planSelector').value='professional';
 let requests=0;
 const fetch=async(url,options)=>{
  requests++;
  assert.equal(url,'/api/marketplace/subscriptions/admin/commercial/launch-readiness');
  assert.equal(options.credentials,'same-origin');
  assert.equal(options.cache,'no-store');
  return {ok:true,json:async()=>sample()};
 };
 vm.runInNewContext(src(),{document,fetch,Intl,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,1);
 assert.equal(document.getElementById('loadStatus').className,'');
 assert.match(document.getElementById('loadStatus').textContent,/Datos internos cargados/);
 assert.equal(document.getElementById('launchWorkspace').hidden,false);
 assert.ok(document.getElementById('billingPreflightPreview').children.length>=5);
 assert.ok(document.getElementById('planPreview').children.length>2);
 document.getElementById('planSelector').listener({target:{value:'professional_plus'}});
 assert.match(document.getElementById('planPreview').children[0].textContent,/Profesional Plus/);
});
