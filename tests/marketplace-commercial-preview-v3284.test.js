'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const jwt=require('jsonwebtoken');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const preview=require('../src/services/marketplace-commercial-preview-v3284');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');
const repo=path.join(__dirname,'..');
const plans=[
 {code:'professional',storeLimit:1,productLimit:null,bulkImport:false,wooSync:false,externalCheckout:true},
 {code:'professional_plus',storeLimit:3,productLimit:null,bulkImport:true,wooSync:true,externalCheckout:true}
];
const scenario=(planCode,action,updates={})=>({planCode,action,storeCount:0,productCount:0,requestCount:1,...updates});
test('simulator requires strict bounded hypothetical inputs and never accepts seller IDs',()=>{
 assert.deepEqual(preview.PLANS,['professional','professional_plus','pilot']);
 assert.equal(preview.ACTIONS.length,5);
 assert.deepEqual(preview.normalize(scenario('professional','single_product')),scenario('professional','single_product'));
 const cases=[
  [{...scenario('professional','single_product'),sellerId:1},'invalid_preview_payload'],
  [scenario('premium','single_product'),'unknown_preview_plan'],
  [scenario('professional','sql_query'),'unknown_preview_action'],
  [scenario('professional','single_product',{storeCount:-1}),'invalid_preview_counts'],
  [scenario('professional','single_product',{productCount:'1'}),'invalid_preview_counts'],
  [scenario('professional','single_product',{requestCount:2}),'individual_action_requires_one'],
  [scenario('professional_plus','bulk_import',{requestCount:10001}),'invalid_preview_counts'],
  [{planCode:'pilot',action:'external_purchase'},'invalid_preview_payload']
 ];
 for(const [payload,code] of cases)assert.throws(()=>preview.normalize(payload),{code});
});
test('Professional is manual-only; Plus permits bulk, with draft product and store caps',()=>{
 for(const action of ['bulk_import','woo_auto_sync']){
  const pro=preview.compute(scenario('professional',action,{requestCount:50}),plans);
  assert.equal(pro.status,'proposed_denied');assert.equal(pro.limitsEnforced,false);
  assert.equal(pro.billingEnabled,false);assert.equal(pro.previewOnly,true);
  const plus=preview.compute(scenario('professional_plus',action,{requestCount:50}),plans);
  assert.equal(plus.status,'proposed_allowed');
  assert.match(plus.notes.join(' '),/pendiente de definir/);
 }
 assert.equal(preview.compute(scenario('professional','single_product'),plans).status,'proposed_allowed');
 assert.equal(preview.compute(scenario('professional','connect_store',{storeCount:1}),plans).status,'proposed_denied');
 assert.equal(preview.compute(scenario('professional_plus','connect_store',{storeCount:2}),plans).status,'proposed_allowed');
 assert.equal(preview.compute(scenario('professional_plus','connect_store',{storeCount:3}),plans).status,'proposed_denied');
 const capped=plans.map(p=>p.code==='professional'?{...p,productLimit:10}:{...p,productLimit:100});
 assert.equal(preview.compute(scenario('professional','single_product',{productCount:10}),capped).status,'proposed_denied');
 assert.equal(preview.compute(scenario('professional_plus','bulk_import',{productCount:90,requestCount:11}),capped).status,'proposed_denied');
 assert.equal(preview.compute(scenario('professional_plus','bulk_import',{productCount:90,requestCount:10}),capped).status,'proposed_allowed');
 assert.equal(preview.compute(scenario('professional_plus','connect_store'),[{...plans[1],storeLimit:null}]).status,'to_define');
});
test('pilot stays unbounded and purchases always occur on the external merchant website',()=>{
 const pilot=preview.compute(scenario('pilot','bulk_import',{storeCount:999,productCount:9999999,requestCount:10000}),plans);
 assert.equal(pilot.status,'proposed_allowed');assert.equal(pilot.pilotProtected,true);
 assert.equal(pilot.limitsEnforced,false);assert.equal(pilot.billingEnabled,false);
 const purchase=preview.compute(scenario('professional','external_purchase'),plans);
 assert.equal(purchase.status,'proposed_allowed');assert.match(purchase.reason,/fuera de RedLibertad/);
 assert.match(purchase.notes.join(' '),/aprobación de la tienda/);
 assert.equal(purchase.plan.externalCheckout,true);
 assert.throws(()=>preview.compute(scenario('professional','bulk_import'),[]),{code:'plan_proposal_not_found'});
});
test('preview API only permits admins, denies cross-origin, and only SELECTs commercial proposals',async()=>{
 const oldQuery=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3284-test-admin-secret';
 const statements=[];
 db.query=async(sql,args=[])=>{
  const query=String(sql);statements.push({query,args});
  if(/FROM users\s+WHERE id=\$1/.test(query)&&/LIMIT 1/.test(query)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id,username:id===1?'admin':'seller',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(query.startsWith('SELECT plan_code,proposed_store_limit')){
   return {rowCount:2,rows:[
    {plan_code:'professional',proposed_store_limit:1,proposed_product_limit:null,
     woo_sync:false,bulk_import:false,external_checkout:true},
    {plan_code:'professional_plus',proposed_store_limit:3,proposed_product_limit:null,
     woo_sync:true,bulk_import:true,external_checkout:true}
   ]};
  }
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 const base='http://127.0.0.1:'+server.address().port;
 const uri='/api/marketplace/subscriptions/admin/commercial/preview';
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const post=(id,body,origin=base)=>fetch(base+uri,{method:'POST',headers:{
  ...(id?token(id):{}),'Content-Type':'application/json',Origin:origin
 },body:JSON.stringify(body)});
 try{
  const payload=scenario('professional','bulk_import',{requestCount:5});
  assert.equal((await post(null,payload)).status,401);
  assert.equal((await post(2,payload)).status,403);
  assert.equal((await post(1,payload,'https://attacker.example')).status,403);
  assert.equal((await post(1,{...payload,sellerId:123})).status,400);
  const response=await post(1,payload);assert.equal(response.status,200);
  const answer=await response.json();
  assert.equal(answer.status,'proposed_denied');assert.equal(answer.previewOnly,true);
  assert.equal(answer.billingEnabled,false);assert.equal(answer.limitsEnforced,false);
  assert.equal((await post(1,scenario('pilot','bulk_import',{requestCount:5}))).status,200);
  assert.ok(statements.some(x=>x.query.startsWith('SELECT plan_code,proposed_store_limit')));
  // The pre-existing schema bootstrap seeds some tables with INSERT ... ON CONFLICT
  // DO NOTHING; those are not writes caused by a preview request. There must be
  // no operative change to seller, store, listing, external product or Stripe data.
  assert.equal(statements.some(x=>
   /^\s*(UPDATE|DELETE FROM|INSERT INTO)\s+marketplace_(seller_subscriptions|subscription_plans|professional_stores|listings|external_products|stripe_test_subscriptions|woocommerce_connection)\b/i.test(x.query)
    && !/ON CONFLICT[\s\S]+DO NOTHING/i.test(x.query)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=oldQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('simulation UI accessible and never includes live checkout or untrusted HTML',()=>{
 const html=fs.readFileSync(path.join(repo,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const script=fs.readFileSync(path.join(repo,'public/marketplace-commercial-preview-v3284.js'),'utf8');
 const route=fs.readFileSync(path.join(repo,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(html,/id="simulator"/);assert.match(html,/id="simResult" role="status" aria-live="polite"/);
 assert.match(html,/v=3\.2\.\d+(?:\.\d+)?/);assert.match(html,/Piloto existente/);
 assert.match(script,/commercial\/preview/);assert.match(script,/credentials:'same-origin'/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
 assert.doesNotMatch(script,/sk_live_|checkout\.stripe|StripeConnect|document\.cookie/);
 assert.doesNotThrow(()=>new(require('node:vm').Script)(script));
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/router\.post\('\/preview',limiter,checkOrigin/);
});
