'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const launch=require('../src/services/marketplace-launch-readiness-v3289');
const contracts=require('../src/services/marketplace-contract-drafts-v3288');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {router:seo}=require('../src/routes/marketplace-seo-v3251');
const {requireAuth}=require('../src/middleware/auth');
const root=path.join(__dirname,'..');
const draft=(code,content='')=>({
 code,revision:1,reviewState:content?'internal_review':'draft',
 priceDisclosure:content,taxes:content,renewals:content,cancellations:content,
 privacy:content,consent:content
});
const plan=(code,price=code==='professional'?990:2490)=>({
 code,proposedMonthlyCents:price,
 summary:code,updatedAt:null
});
const card=(code)=>({
 code,storeLimit:code==='professional'?1:3,
 productLimit:null,bulkImport:code==='professional_plus',
 wooSync:code==='professional_plus',externalCheckout:true,issues:[],
 policy:{code,mode:'unlimited_proposal'},
 capacity:{status:'proposed'}
});
const reviews=(allReviewed=false)=>launch.reviewTopics.map(code=>({
 code,name:code,status:allReviewed?'reviewed':'pending'
}));
const sources=(options={})=>({
 definitions:{cards:options.cards||launch.CODES.map(card)},
 contracts:{drafts:options.drafts||launch.CODES.map(code=>draft(code,options.complete?'Texto elaborado para revisión interna que requiere aprobación.':''))},
 commercial:{drafts:options.prices||launch.CODES.map(code=>plan(code)),
  reviews:options.reviews||reviews(!!options.complete)}
});
function build(x){return launch.build(x.definitions,x.contracts,x.commercial);}
test('admin launch-preparation preview contains two consistent plans and stays strictly non-operational',()=>{
 const data=build(sources());
 assert.equal(data.ok,true);
 assert.equal(data.adminOnly,true);
 assert.equal(data.previewOnly,true);
 assert.deepEqual(data.plans.map(x=>x.code),['professional','professional_plus']);
 assert.deepEqual(data.plans.map(x=>x.storeLimitProposal),[1,3]);
 assert.deepEqual(data.plans.map(x=>x.priceProposalCents),[990,2490]);
 assert.deepEqual(data.plans.map(x=>x.bulkImportProposed),[false,true]);
 assert.deepEqual(data.plans.map(x=>x.wooSyncProposed),[false,true]);
 assert.equal(data.plans.every(x=>x.oneByOne&&x.unlimitedProductsProposed&&x.productPurchaseExternal),true);
 assert.equal(data.plans.every(x=>x.openTasks>=1),true);
 assert.equal(data.reviewChecklist.length,6);
 assert.equal(data.summary.internalReviewTasks,6);
 for(const key of ['releaseAuthorized','productionReady','legalApproval','taxApproval',
  'publicEnrollmentEnabled','pricesPublished','billingEnabled','liveStripeEnabled',
  'consentRecorded','entitlementsEnforced'])assert.equal(data[key],false,key);
 assert.equal(data.pilotProtected,true);
 assert.equal(data.externalProductCheckout,true);
});
test('even fully prepared INTERNAL drafts and reviewed checks never authorize publication or Stripe LIVE',()=>{
 const data=build(sources({complete:true}));
 assert.equal(data.summary.planTasks,0);
 assert.equal(data.summary.internalReviewTasks,0);
 assert.equal(data.summary.outstanding,0);
 assert.equal(data.summary.needsFinalApprovals,true);
 assert.equal(data.releaseAuthorized,false);
 assert.equal(data.productionReady,false);
 assert.equal(data.pricesPublished,false);
 assert.equal(data.liveStripeEnabled,false);
 assert.equal(data.billingEnabled,false);
 assert.equal(data.consentRecorded,false);
 assert.equal(data.plans[0].contractReviewState,'internal_review');
 assert.equal(data.plans[0].termsPreview.length,6);
 assert.equal(data.plans[0].termsPreview[0].draftOnly,true);
 assert.equal(data.plans[0].priceApproved,false);
});
test('real missing price, plan consistency, external checkout and legal drafts each remain outstanding',()=>{
 const state=sources({complete:true});
 state.commercial.drafts=[plan('professional',null),plan('professional_plus',2490)];
 state.definitions.cards[0].policy.mode='undecided';
 state.definitions.cards[0].capacity.status='undecided';
 state.definitions.cards[0].issues=['Compra externa obligatoria no confirmada'];
 state.definitions.cards[1].bulkImport=false;
 state.contracts.drafts[1].consent='';
 state.commercial.reviews[0].status='pending';
 const data=build(state);
 assert.equal(data.summary.outstanding>0,true);
 assert.equal(data.plans[0].checklist.find(x=>x.id==='price').complete,false);
 assert.equal(data.plans[0].checklist.find(x=>x.id==='features').complete,false);
 assert.equal(data.plans[0].checklist.find(x=>x.id==='external').complete,false);
 assert.equal(data.plans[1].checklist.find(x=>x.id==='features').complete,false);
 assert.equal(data.plans[1].checklist.find(x=>x.id==='terms').complete,false);
 assert.equal(data.plans[1].checklist.find(x=>x.id==='internal').complete,false);
 assert.equal(data.reviewChecklist[0].complete,false);
});
test('launch preview references existing draft data, never operational subscriptions or seller accounts',()=>{
 const code=fs.readFileSync(path.join(root,'src/services/marketplace-launch-readiness-v3289.js'),'utf8');
 assert.match(code,/definitions\.overview\(\)/);
 assert.match(code,/contracts\.list\(\)/);
 assert.match(code,/commercial\.overview\(\)/);
 assert.doesNotMatch(code,/UPDATE |INSERT INTO |DELETE FROM |checkout\.sessions|stripe\.customers|marketplace_seller_subscriptions|seller_id/);
 assert.match(code,/releaseAuthorized:false/);
});
test('launch preview remains admin only: anonymous and seller denied, noindex and no-store',async()=>{
 const oldQuery=db.query,oldSecret=process.env.JWT_SECRET,oldOverview=launch.overview;
 process.env.JWT_SECRET='v3289-contract-readiness-test-secret';
 const queries=[];
 db.query=async(sql,args=[])=>{
  const q=String(sql);queries.push({q,args});
  if(/FROM users\s+WHERE id=\$1/.test(q)&&/LIMIT 1/.test(q)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id:String(id),username:id===1?'admin':'seller',is_admin:id===1,
    status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  return {rowCount:0,rows:[]};
 };
 launch.overview=async()=>build(sources({complete:true}));
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 app.use(seo);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+server.address().port;
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const get=(url,id,method='GET')=>fetch(origin+url,{
  method,redirect:'manual',headers:id?token(id):{}
 });
 const uri='/api/marketplace/subscriptions/admin/commercial/launch-readiness';
 const ui='/marketplace/suscripciones/lanzamiento';
 try{
  assert.equal((await get(uri)).status,401);
  assert.equal((await get(uri,2)).status,403);
  assert.equal((await get(ui)).status,401);
  assert.equal((await get(ui,2)).status,403);
  assert.equal((await get(uri,1,'POST')).status,404);
  const res=await get(uri,1);assert.equal(res.status,200);
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.match(res.headers.get('x-robots-tag'),/noindex/);
  const result=await res.json();
  assert.equal(result.liveStripeEnabled,false);
  assert.equal(result.summary.outstanding,0);
  assert.equal(result.releaseAuthorized,false);
  const page=await get(ui,1);
  assert.equal(page.status,200);
  assert.match(page.headers.get('cache-control'),/no-store/);
  assert.match(page.headers.get('x-robots-tag'),/noindex/);
  assert.match(await page.text(),/Preparar el lanzamiento profesional/);
  assert.equal(queries.some(x=>/UPDATE marketplace_|INSERT INTO marketplace_|DELETE FROM marketplace_/i.test(x.q)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  launch.overview=oldOverview;db.query=oldQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('mobile-first admin preview stays private and uses no HTML injection, live checkout or mutation controls',()=>{
 const page=fs.readFileSync(path.join(root,'src/views/marketplace-launch-readiness-v3289.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'public/marketplace-launch-readiness-v3289.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'public/marketplace-launch-readiness-v3289.css'),'utf8');
 const src=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const seller=fs.readFileSync(path.join(root,'src/services/marketplace-contract-preview-v3287.js'),'utf8');
 assert.match(page,/viewport-fit=cover/);
 assert.match(page,/noindex,nofollow/);
 assert.match(page,/disabled class="disabled-cta"/);
 assert.match(page,/id="planSelector"/);
 assert.match(src,/href="\/marketplace\/suscripciones\/lanzamiento"/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/@media\(min-width:680px\)/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/releaseAuthorized!==false/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
 assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(script,/Stripe\(|sk_live|checkout\.stripe|whsec_|localStorage|sessionStorage/);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotMatch(seller,/marketplace_subscription_contract_drafts|marketplace-launch-readiness/);
});
