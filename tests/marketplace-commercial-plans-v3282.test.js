'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const features=require('../src/services/marketplace-commercial-plans-v3282');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');

test('commercial feature proposals are additive; no entitlement, billing or WooCommerce mutation',()=>{
 const sql=features.DDL.join('\n');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_features/);
 assert.match(sql,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.match(sql,/'professional',1,NULL,true,true,true/);
 assert.match(sql,/'professional_plus',3,NULL,true,true,true/);
 assert.doesNotMatch(sql,/DROP |TRUNCATE |DELETE FROM|UPDATE marketplace_subscription_plans|UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_external_products|UPDATE marketplace_listings/i);
 assert.deepEqual(features.PLANS,['professional','professional_plus']);
});
test('plan details validate exact fields, numeric limits and external payments always on seller website',()=>{
 const data={storeLimit:1,productLimit:null,wooSync:true,bulkImport:true,externalCheckout:true};
 assert.deepEqual(features.normalize('professional',data),{code:'professional',...data});
 assert.deepEqual(features.normalize('professional_plus',{...data,storeLimit:3,productLimit:2500}),{
  code:'professional_plus',...data,storeLimit:3,productLimit:2500
 });
 const errors=[
  ['professional',{...data,storeLimit:0},'invalid_store_limit'],
  ['professional',{...data,storeLimit:101},'invalid_store_limit'],
  ['professional',{...data,productLimit:1000001},'invalid_product_limit'],
  ['professional',{...data,productLimit:'100'},'invalid_product_limit'],
  ['professional',{...data,wooSync:'true'},'invalid_wooSync'],
  ['professional',{...data,bulkImport:true,wooSync:false},'bulk_import_requires_sync'],
  ['professional',{...data,externalCheckout:false},'external_checkout_required'],
  ['professional',{...data,enableBilling:true},'invalid_proposal'],
  ['particular',data,'unknown_plan']
 ];
 for(const [code,body,error] of errors)assert.throws(()=>features.normalize(code,body),{code:error});
});
test('overview and save target only isolated commercial table and never touch productive store limits',async()=>{
 const queries=[];
 const query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT plan_code,proposed_store_limit'))return {rows:[
   {plan_code:'professional',proposed_store_limit:1,proposed_product_limit:null,woo_sync:true,bulk_import:true,external_checkout:true},
   {plan_code:'professional_plus',proposed_store_limit:3,proposed_product_limit:null,woo_sync:true,bulk_import:true,external_checkout:true}
  ]};
  if(sql.startsWith('UPDATE marketplace_subscription_commercial_features'))return {rowCount:1,rows:[{
   plan_code:args[0],proposed_store_limit:args[1],proposed_product_limit:args[2],woo_sync:args[3],bulk_import:args[4],external_checkout:args[5]
  }]};
  throw Error('Non-approved SQL statement');
 };
 const view=await features.list(query);
 assert.equal(view.proposalOnly,true);
 assert.equal(view.enrollmentEnabled,false);
 assert.equal(view.entitlementsEnforced,false);
 assert.equal(view.pricesPublished,false);
 assert.equal(view.plans.length,2);
 assert.equal(view.plans[0].storeLimit,1);
 const result=await features.save({planCode:'professional_plus',
  body:{storeLimit:3,productLimit:2500,wooSync:true,bulkImport:true,externalCheckout:true},
  adminId:12,query});
 assert.equal(result.proposalOnly,true);assert.equal(result.entitlementsEnforced,false);
 assert.equal(result.plan.productLimit,2500);
 assert.equal(queries.find(x=>x.sql.startsWith('UPDATE')).args[6],12);
 assert.equal(queries.some(x=>/UPDATE marketplace_subscription_plans|UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_listings|UPDATE marketplace_external_products/i.test(x.sql)),false);
});
test('private feature endpoints reject seller and cross-origin, save only valid admin proposals',async()=>{
 const before=db.query,secret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='test-v3282-secret';
 const calls=[];
 db.query=async(sql,args=[])=>{
  const s=String(sql);calls.push({sql:s,args});
  if(/FROM users\s+WHERE id=\$1/.test(s)&&/LIMIT 1/.test(s)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{
    id,username:id===1?'admin':'seller',is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false
   }]};
  }
  if(s.startsWith('SELECT plan_code,proposed_store_limit'))
   return {rowCount:1,rows:[{plan_code:'professional',proposed_store_limit:1,
    proposed_product_limit:null,woo_sync:true,bulk_import:true,external_checkout:true}]};
  if(s.startsWith('UPDATE marketplace_subscription_commercial_features'))
   return {rowCount:1,rows:[{plan_code:args[0],proposed_store_limit:args[1],
    proposed_product_limit:args[2],woo_sync:args[3],bulk_import:args[4],external_checkout:args[5]}]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const headers=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const req=(url,id,opts={})=>fetch(base+url,{...opts,headers:{...(id?headers(id):{}),...(opts.headers||{})}});
 const endpoint='/api/marketplace/subscriptions/admin/commercial/features';
 const body={storeLimit:3,productLimit:null,wooSync:true,bulkImport:true,externalCheckout:true};
 const post=(url,id,payload,origin=base)=>req(url,id,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)
 });
 try{
  assert.equal((await req(endpoint)).status,401);
  assert.equal((await req(endpoint,2)).status,403);
  const read=await req(endpoint,1);assert.equal(read.status,200);
  const info=await read.json();assert.equal(info.proposalOnly,true);
  assert.equal(info.pricesPublished,false);
  assert.equal((await post(endpoint+'/professional',2,body)).status,403);
  assert.equal((await post(endpoint+'/professional',1,body,'https://attacker.example')).status,403);
  assert.equal((await post(endpoint+'/professional',1,{...body,enableBilling:true})).status,400);
  assert.equal((await post(endpoint+'/professional',1,{...body,externalCheckout:false})).status,400);
  assert.equal((await post(endpoint+'/particular',1,body)).status,404);
  const result=await post(endpoint+'/professional_plus',1,body);
  assert.equal(result.status,200);
  const saved=await result.json();assert.equal(saved.entitlementsEnforced,false);
  assert.equal(saved.plan.storeLimit,3);
  assert.equal(calls.some(x=>/UPDATE marketplace_subscription_plans|UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_listings/i.test(x.sql)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=before;
  if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;
 }
});
test('mobile comparison and editor remain private with proposal-only UI and external checkout',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'public/marketplace-commercial-features-v3282.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.css'),'utf8');
 assert.match(html,/id="planComparison"/);
 assert.match(html,/id="proposedFeatures"/);
 assert.match(html,/v=3\.2\.82/);
 assert.match(html,/noindex,nofollow/);
 assert.match(js,/commercial:price-saved/);
 assert.match(js,/window\.confirm/);
 assert.match(js,/externalCheckout:true/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/sk_live_|StripeConnect|checkout\.stripe/);
 assert.match(css,/@media\(min-width:640px\)/);
 assert.doesNotThrow(()=>new(require('node:vm').Script)(js));
 assert.match(fs.readFileSync(path.join(root,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8'),
  /router\.use\(requireAdmin\)/);
});
