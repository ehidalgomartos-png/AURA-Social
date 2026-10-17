'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const decisions=require('../src/services/marketplace-commercial-decisions-v3285');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');
const base=path.join(__dirname,'..');
const specs=[
 {code:'professional',storeLimit:1,productLimit:null,bulkImport:false,wooSync:false,externalCheckout:true},
 {code:'professional_plus',storeLimit:3,productLimit:null,bulkImport:true,wooSync:true,externalCheckout:true}
];
const drafts=[
 {code:'professional',proposedMonthlyCents:null},
 {code:'professional_plus',proposedMonthlyCents:null}
];
const reviews=[
 {name:'Precios definitivos',status:'pending'},
 {name:'IVA y facturación',status:'reviewed'},
 {name:'Condiciones y consentimiento',status:'in_review'}
];
const undecided=[
 {code:'professional',mode:'undecided',reason:''},
 {code:'professional_plus',mode:'undecided',reason:''}
];

test('policy schema is additive and private; never updates a shop, entitlement or prices',()=>{
 const ddl=decisions.DDL.join('\n');
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_product_policy/);
 assert.match(ddl,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.match(ddl,/undecided/);
 assert.doesNotMatch(ddl,/UPDATE marketplace_subscription_plans|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_external_products|UPDATE marketplace_listings|UPDATE marketplace_stripe_test/i);
 assert.deepEqual(decisions.CODES,['professional','professional_plus']);
 assert.deepEqual(decisions.MODES,['undecided','unlimited_proposal','capped_proposal']);
});

test('policy validation uses strict plan, fields, allowed states and justification',()=>{
 assert.deepEqual(decisions.parse('professional',{mode:'undecided',reason:''}),
  {planCode:'professional',mode:'undecided',reason:''});
 assert.deepEqual(decisions.parse('professional_plus',{mode:'unlimited_proposal',reason:' No limitar hasta medir costes. '}),
  {planCode:'professional_plus',mode:'unlimited_proposal',reason:'No limitar hasta medir costes.'});
 const attempts=[
  ['particular',{mode:'undecided',reason:''},'unknown_plan'],
  ['professional',{mode:'approved',reason:'Criterio confirmado.'},'invalid_policy_mode'],
  ['professional',{mode:'capped_proposal',reason:'Corto'},'invalid_policy_reason'],
  ['professional',{mode:'capped_proposal',reason:'a'.repeat(401)},'invalid_policy_reason'],
  ['professional',{mode:'undecided',reason:'',billingEnabled:true},'invalid_decision_payload'],
  ['professional',{mode:'undecided',reason:15},'invalid_policy_reason']
 ];
 for(const [code,body,error] of attempts)assert.throws(()=>decisions.parse(code,body),{code:error});
});

test('product capacity can be undecided, genuinely unlimited proposed, capped or mismatched',()=>{
 assert.equal(decisions.policyCheck(undecided[0],specs[0]).status,'undecided');
 assert.equal(decisions.policyCheck({mode:'unlimited_proposal'},specs[0]).status,'proposed');
 assert.equal(decisions.policyCheck({mode:'capped_proposal'},specs[0]).status,'mismatch');
 assert.equal(decisions.policyCheck({mode:'capped_proposal'}, {...specs[0],productLimit:500}).status,'proposed');
 assert.equal(decisions.policyCheck({mode:'unlimited_proposal'}, {...specs[0],productLimit:500}).status,'mismatch');
});

test('readiness stays internal even if proposed prices, policies and six reviews are filled',()=>{
 const draftPlans=drafts.map(x=>({...x,proposedMonthlyCents:x.code==='professional'?990:2490}));
 const specsLimited=specs.map(p=>({...p,productLimit:p.code==='professional'?500:5000}));
 const allReviewed=reviews.map(x=>({...x,status:'reviewed'}));
 const policies=[
  {code:'professional',mode:'capped_proposal',reason:'Costes operativos estimados'},
  {code:'professional_plus',mode:'capped_proposal',reason:'Control de volumen estimado'}
 ];
 const report=decisions.summary(draftPlans,specsLimited,allReviewed,policies);
 assert.equal(report.productionReady,false);
 assert.equal(report.legalApproval,false);
 assert.equal(report.pricesPublished,false);
 assert.equal(report.billingEnabled,false);
 assert.equal(report.entitlementsEnforced,false);
 assert.equal(report.liveStripeEnabled,false);
 assert.equal(report.externalCheckoutOnly,true);
 assert.equal(report.pilotProtected,true);
 assert.deepEqual(report.cards.map(x=>x.issues),[[],[]]);
 assert.deepEqual(report.cards.map(x=>x.internallyDefined),[true,true]);
 assert.equal(report.pendingReviews.length,0);
 assert.equal(decisions.summary(drafts,specs,reviews,undecided).cards[0].issues.includes('Criterio de productos por decidir'),true);
 assert.equal(decisions.summary(drafts,specs,reviews,undecided).pendingReviews.length,2);
 const noCap=decisions.summary(draftPlans,specs,allReviewed,[
  {code:'professional',mode:'unlimited_proposal',reason:'Valor de prueba'},
  {code:'professional_plus',mode:'unlimited_proposal',reason:'Valor de prueba'}
 ]);
 assert.deepEqual(noCap.cards.map(x=>x.issues),[[],[]]);
});

test('saving policy requires compatible numeric draft; cannot alter production tables',async()=>{
 const calls=[];
 const fake=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT proposed_product_limit'))return {
   rowCount:1,rows:[{proposed_product_limit:args[0]==='professional'?null:5000}]
  };
  if(sql.startsWith('UPDATE marketplace_subscription_commercial_product_policy'))return {
   rowCount:1,rows:[{plan_code:args[0],policy_mode:args[1],reason:args[2],updated_at:null}]
  };
  throw Error('Unexpected statement');
 };
 const note='Revisar el coste de almacenamiento.';
 const p=await decisions.save({planCode:'professional',body:{mode:'unlimited_proposal',reason:note},adminId:17,query:fake});
 assert.equal(p.billingEnabled,false);assert.equal(p.entitlementsEnforced,false);
 assert.equal(p.policy.mode,'unlimited_proposal');
 const q=await decisions.save({planCode:'professional_plus',body:{mode:'capped_proposal',reason:note},adminId:17,query:fake});
 assert.equal(q.policy.mode,'capped_proposal');
 await assert.rejects(()=>decisions.save({planCode:'professional',body:{mode:'capped_proposal',reason:note},adminId:17,query:fake}),{code:'numeric_limit_required'});
 await assert.rejects(()=>decisions.save({planCode:'professional_plus',body:{mode:'unlimited_proposal',reason:note},adminId:17,query:fake}),{code:'clear_numeric_limit_first'});
 assert.equal(calls.filter(x=>x.sql.startsWith('UPDATE')).length,2);
 assert.equal(calls.filter(x=>x.sql.startsWith('UPDATE'))[0].args[3],17);
 assert.equal(calls.some(x=>/UPDATE marketplace_(?:subscription_plans|seller_subscriptions|professional_stores|listings|external_products)/.test(x.sql)),false);
});

test('definition HTTP endpoints are private admin-only; state-changing POST checks origin and input',async()=>{
 const oldQuery=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='private-commercial-v3285-test-secret';
 const seen=[];
 db.query=async(sql,args=[])=>{
  const q=String(sql);seen.push({q,args});
  if(/FROM users\s+WHERE id=\$1/.test(q)&&/LIMIT 1/.test(q)){
   const id=Number(args[0]);return {rowCount:1,rows:[{id,username:id===1?'admin':'seller',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(q.startsWith('SELECT plan_code,proposed_monthly_cents'))return {rowCount:2,rows:[
   {plan_code:'professional',proposed_monthly_cents:null,summary:'Solo borrador'},
   {plan_code:'professional_plus',proposed_monthly_cents:null,summary:'Solo borrador'}
  ]};
  if(q.startsWith('SELECT topic,review_status'))return {rowCount:0,rows:[]};
  if(q.startsWith('SELECT plan_code,proposed_store_limit'))return {rowCount:2,rows:[
   {plan_code:'professional',proposed_store_limit:1,proposed_product_limit:null,
    woo_sync:false,bulk_import:false,external_checkout:true},
   {plan_code:'professional_plus',proposed_store_limit:3,proposed_product_limit:null,
    woo_sync:true,bulk_import:true,external_checkout:true}
  ]};
  if(q.startsWith('SELECT plan_code,policy_mode'))return {rowCount:2,rows:[
   {plan_code:'professional',policy_mode:'undecided',reason:'',updated_at:null},
   {plan_code:'professional_plus',policy_mode:'undecided',reason:'',updated_at:null}
  ]};
  if(q.startsWith('SELECT proposed_product_limit'))return {rowCount:1,rows:[{proposed_product_limit:null}]};
  if(q.startsWith('UPDATE marketplace_subscription_commercial_product_policy'))return {rowCount:1,rows:[
   {plan_code:args[0],policy_mode:args[1],reason:args[2],updated_at:null}
  ]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 const origin='http://127.0.0.1:'+server.address().port,uri='/api/marketplace/subscriptions/admin/commercial/definition';
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const read=(id)=>fetch(origin+uri,{headers:id?token(id):{}});
 const post=(id,body,at=origin)=>fetch(origin+uri+'/product-policy/professional',{
  method:'POST',headers:{...(id?token(id):{}),'Content-Type':'application/json',Origin:at},
  body:JSON.stringify(body)
 });
 try{
  assert.equal((await read(null)).status,401);
  assert.equal((await read(2)).status,403);
  const result=await read(1);assert.equal(result.status,200);
  assert.match(result.headers.get('cache-control'),/no-store/);
  const view=await result.json();assert.equal(view.billingEnabled,false);assert.equal(view.productionReady,false);
  const body={mode:'unlimited_proposal',reason:'No poner límites antes de medir costes.'};
  assert.equal((await post(2,body)).status,403);
  assert.equal((await post(1,body,'https://attacker.example')).status,403);
  assert.equal((await post(1,{...body,activateLive:true})).status,400);
  const good=await post(1,body);assert.equal(good.status,200);
  assert.equal((await good.json()).entitlementsEnforced,false);
  assert.ok(seen.some(x=>x.q.startsWith('UPDATE marketplace_subscription_commercial_product_policy')));
  assert.equal(seen.some(x=>/UPDATE marketplace_(?:seller_subscriptions|subscription_plans|professional_stores|listings|external_products|stripe_test_subscriptions)/i.test(x.q)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=oldQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('mobile-first UI stays private, accessible, escapes content and only uses admin definition endpoints',()=>{
 const html=fs.readFileSync(path.join(base,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const client=fs.readFileSync(path.join(base,'public/marketplace-commercial-decisions-v3285.js'),'utf8');
 const route=fs.readFileSync(path.join(base,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(html,/id="definitionCards"/);assert.match(html,/id="definitionReviews"/);
 assert.match(html,/v=3\.2\.85/);assert.match(html,/noindex,nofollow/);
 assert.match(client,/commercial\/definition/);
 assert.match(client,/window\.confirm/);assert.match(client,/aria-live/);
 assert.match(client,/credentials:'same-origin'/);
 assert.doesNotMatch(client,/\.innerHTML\s*=/);
 assert.doesNotMatch(client,/sk_live_|checkout\.stripe|StripeConnect/);
 assert.doesNotThrow(()=>new(require('node:vm').Script)(client));
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/router\.post\('\/definition\/product-policy\/:planCode',limiter,checkOrigin/);
});
