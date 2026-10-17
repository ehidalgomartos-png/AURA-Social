'use strict';
// V3.2.90 — guide proposals may suggest, but must never commit prices or legal approval.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const guidance=require('../src/services/marketplace-commercial-guidance-v3290');
const contracts=require('../src/services/marketplace-contract-drafts-v3288');
const readiness=require('../src/services/marketplace-launch-readiness-v3289');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');
const root=path.join(__dirname,'..');
const plans=['professional','professional_plus'];
const fieldNames=['priceDisclosure','taxes','renewals','cancellations','privacy','consent'];
test('internal-only guidance suggests orientation prices without offering or approving them',()=>{
 const result=guidance.guide();
 assert.equal(result.ok,true);
 assert.equal(result.adminOnly,true);
 assert.equal(result.privateSuggestion,true);
 assert.equal(result.liveStripeEnabled,false);
 assert.equal(result.billingEnabled,false);
 assert.equal(result.termsApproved,false);
 assert.equal(result.pricesApproved,false);
 assert.equal(result.consentRecorded,false);
 assert.equal(result.pilotProtected,true);
 assert.deepEqual(result.proposals.map(p=>p.code),plans);
 assert.deepEqual(result.proposals.map(p=>p.proposedMonthlyCents),[990,2490]);
 assert.equal(guidance.suggest('particular'),null);
 for(const p of result.proposals){
  assert.equal(p.approved,false);
  assert.equal(p.published,false);
  assert.equal(p.contractable,false);
  assert.equal(p.suggestedOnly,true);
  assert.deepEqual(Object.keys(p.terms),fieldNames);
  for(const text of Object.values(p.terms)){
   assert.match(text,/PLANTILLA INTERNA V3\.2\.90/);
   assert.ok(text.length>20&&text.length<=1200);
   assert.equal(contracts.isTemplate(text),true);
  }
 }
 assert.equal(result.note,undefined);
 const json=JSON.stringify(result);
 assert.doesNotMatch(json,/sk_live_|sk_test_|whsec_|stripeSecret|sellerId|checkoutSession/);
});
test('guide-prefilled draft remains a DRAFT; internal review rejects all template fields',()=>{
 const proposed=guidance.suggest('professional');
 const payload={expectedRevision:0,reviewState:'draft',...proposed.terms};
 assert.equal(contracts.parse('professional',payload).reviewState,'draft');
 assert.throws(()=>contracts.parse('professional',{...payload,reviewState:'internal_review'}),
  {code:'contract_draft_incomplete'});
 const row={plan_code:'professional',revision:1,review_state:'draft',
  price_disclosure:proposed.terms.priceDisclosure,taxes:proposed.terms.taxes,
  renewals:proposed.terms.renewals,cancellations:proposed.terms.cancellations,
  privacy:proposed.terms.privacy,consent:proposed.terms.consent,updated_at:null};
 const snapshot=contracts.view(row);
 assert.equal(snapshot.complete,false);
 const final=Object.fromEntries(fieldNames.map(f=>[f,
  'Texto individual redactado tras quitar la marca y revisado manualmente por el equipo correspondiente.']));
 assert.equal(contracts.parse('professional',{...payload,...final,reviewState:'internal_review'}).reviewState,'internal_review');
 assert.equal(contracts.view({...row,...Object.fromEntries(fieldNames.map(f=>[
  ({priceDisclosure:'price_disclosure',taxes:'taxes',renewals:'renewals',
   cancellations:'cancellations',privacy:'privacy',consent:'consent'})[f],final[f]]))}).complete,true);
});
test('launch readiness does not reduce decision counter from mere template insertion',()=>{
 const props=guidance.suggest('professional');
 const commercialData={
  drafts:[{code:'professional',proposedMonthlyCents:990},{code:'professional_plus',proposedMonthlyCents:2490}],
  reviews:[{code:'pricing',status:'pending'}]
 };
 const clean=code=>({
  code,storeLimit:code==='professional'?1:3,productLimit:null,
  bulkImport:code==='professional_plus',wooSync:code==='professional_plus',
  policy:{mode:'unlimited_proposal'},capacity:{status:'proposed'},issues:[]
 });
 const template=code=>({code,revision:1,reviewState:'draft',
  ...guidance.suggest(code).terms});
 const result=readiness.build({cards:plans.map(clean)},{drafts:plans.map(template)},commercialData);
 assert.equal(result.plans.every(p=>p.checklist.find(x=>x.id==='terms').complete===false),true);
 assert.equal(result.plans.every(p=>p.checklist.find(x=>x.id==='internal').complete===false),true);
 assert.equal(result.plans.every(p=>p.openTasks>=2),true);
 assert.equal(result.billingEnabled,false);
 assert.equal(result.releaseAuthorized,false);
 assert.equal(result.pricesPublished,false);
 assert.equal(result.liveStripeEnabled,false);
 assert.equal(result.pilotProtected,true);
});
test('admin-only guidance endpoint has no writes; anonymous and non-admin users are rejected',async()=>{
 const oldQuery=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='guide-v3290-mock-secret';
 const seen=[];
 db.query=async(sql,args=[])=>{
  const q=String(sql);seen.push({q,args});
  if(/FROM users\s+WHERE id=\$1/.test(q)&&/LIMIT 1/.test(q)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id:String(id),username:id===1?'admin':'seller',is_admin:id===1,
    status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const uri=base+'/api/marketplace/subscriptions/admin/commercial/guidance';
 const auth=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const call=(id,method='GET')=>fetch(uri,{method,headers:id?auth(id):{},redirect:'manual'});
 try{
  assert.equal((await call(null)).status,401);
  assert.equal((await call(2)).status,403);
  assert.equal((await call(1,'POST')).status,404);
  const response=await call(1);
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/private,no-store/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow');
  const value=await response.json();
  assert.equal(value.adminOnly,true);
  assert.equal(value.billingEnabled,false);
  assert.equal(value.proposals[0].proposedMonthlyCents,990);
  assert.equal(value.proposals[1].proposedMonthlyCents,2490);
  assert.equal(seen.some(item=>/^(?:INSERT|UPDATE|DELETE)\b/i.test(item.q)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('admin UI suggestions never send a write until existing explicit draft save is invoked',()=>{
 const main=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.js'),'utf8');
 const contractsJS=fs.readFileSync(path.join(root,'public/marketplace-contract-drafts-v3288.js'),'utf8');
 const launch=fs.readFileSync(path.join(root,'public/marketplace-launch-readiness-v3289.js'),'utf8');
 const contractsService=fs.readFileSync(path.join(root,'src/services/marketplace-contract-drafts-v3288.js'),'utf8');
 const admin=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const readinessHtml=fs.readFileSync(path.join(root,'src/views/marketplace-launch-readiness-v3289.html'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(main));
 assert.doesNotThrow(()=>new vm.Script(contractsJS));
 assert.doesNotThrow(()=>new vm.Script(launch));
 assert.match(main,/suggestion\.addEventListener\('click'/);
 assert.match(main,/if\(cost\.value\.trim\(\)\)/);
 assert.match(main,/window\.confirm\('¿Insertar un precio/);
 assert.match(main,/const save=el\('button','Guardar borrador'\)/);
 assert.match(contractsJS,/insert\.addEventListener\('click'/);
 assert.match(contractsJS,/if\(values\[key\]\.value\.trim\(\)\)continue/);
 assert.match(contractsJS,/review\.value='draft'/);
 assert.match(contractsJS,/window\.confirm\('¿Copiar la guía/);
 assert.match(contractsService,/isTemplate\(values\[f\]\)/);
 assert.match(contractsService,/!isTemplate\(result\[field\]\)/);
 assert.match(launch,/Precio mensual pendiente de definir/);
 assert.match(launch,/1 tienda propuesta/);
 assert.match(launch,/tiendas propuestas/);
 assert.doesNotMatch(launch,/tienda\(s\)|Por definir\/mes/);
 assert.match(admin,/v=3\.2\.90/);
 assert.match(readinessHtml,/v=3\.2\.90/);
 assert.doesNotMatch(main,/\.innerHTML\s*=/);
 assert.doesNotMatch(contractsJS,/\.innerHTML\s*=/);
 assert.doesNotMatch(launch,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});
