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
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {router:seo}=require('../src/routes/marketplace-seo-v3251');
const {requireAuth}=require('../src/middleware/auth');
const {preview,catalog,steps}=require('../src/services/marketplace-contract-preview-v3287');
const root=path.join(__dirname,'..');
test('seller presentation is only a private preview; plans are not contractable nor priced',()=>{
 const data=preview({status:'free',grandfathered:false});
 assert.equal(data.ok,true);assert.equal(data.previewOnly,true);
 for(const field of ['checkoutEnabled','billingEnabled','liveStripeEnabled','enrollmentEnabled',
  'entitlementsEnforced','consentRecorded','pricesPublished'])assert.equal(data[field],false);
 assert.equal(data.productCheckoutExternal,true);
 assert.equal(data.plans.length,2);
 assert.deepEqual(data.plans.map(p=>p.code),['professional','professional_plus']);
 assert.deepEqual(data.plans.map(p=>p.proposedStoreLimit),[1,3]);
 assert.deepEqual(data.plans.map(p=>p.bulkImportProposal),[false,true]);
 assert.deepEqual(data.plans.map(p=>p.wooSyncProposal),[false,true]);
 for(const item of data.plans){
  assert.equal(item.manualOneByOne,true);
  assert.equal(item.unlimitedProductsProposal,true);
  assert.equal(item.productLimitProposal,null);
  assert.equal(item.contractable,false);
  assert.equal(item.price.approved,false);
  assert.equal(item.price.amountCents,null);
  assert.ok(item.benefits.includes('Compras y pagos siempre en la web del vendedor'));
 }
 assert.equal(catalog.length,2);assert.equal(steps.length,5);
 assert.match(data.policies.renewal,/por concretar/);
 assert.match(data.policies.cancellation,/pendientes de aprobación/);
 assert.match(data.policies.terms,/no existen condiciones comerciales definitivas/);
 const raw=JSON.stringify(data);
 assert.doesNotMatch(raw,/stripe_secret|sk_(?:test|live)_|whsec_|productId|sellerId|checkoutUrl|paymentUrl|9,90|24,90|990|2490/);
});
test('approved stores and recorded pilot subscriptions remain unchanged by a preview',()=>{
 const approved=preview({status:'pilot',grandfathered:true});
 assert.equal(approved.account.pilotProtected,true);
 assert.match(approved.pilotNotice,/mantiene su piloto sin cuota ni vencimiento/);
 const recorded=preview({status:'pilot',grandfathered:false});
 assert.equal(recorded.account.pilotProtected,true);
 const free=preview({status:'free',grandfathered:false});
 assert.equal(free.account.pilotProtected,false);
 assert.doesNotMatch(free.pilotNotice,/vencimiento/);
});
test('private seller HTML is mobile-first, noindexed, not a public static file and linked from Mi tienda',()=>{
 const seoText=fs.readFileSync(path.join(root,'src/routes/marketplace-seo-v3251.js'),'utf8');
 const subscriptions=fs.readFileSync(path.join(root,'src/views/marketplace-subscriptions-v3278.html'),'utf8');
 const page=fs.readFileSync(path.join(root,'src/views/marketplace-contract-preview-v3287.html'),'utf8');
 const sellerJS=fs.readFileSync(path.join(root,'public/marketplace-subscriptions-v3278.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'public/marketplace-contract-preview-v3287.css'),'utf8');
 assert.match(seoText,/router\.get\('\/marketplace\/contratacion',requireAuth/);
 assert.match(subscriptions,/href="\/marketplace\/contratacion"/);
 assert.match(sellerJS,/Productos uno a uno/);
 assert.match(page,/viewport-fit=cover/);
 assert.match(page,/noindex,nofollow/);
 assert.match(page,/Contratación profesional · Vista previa/);
 assert.match(page,/No se han aprobado tarifas/);
 assert.match(page,/id="readTerms"/);
 assert.match(page,/id="understandDemo"/);
 assert.match(page,/id="stageDone"/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/@media\(min-width:690px\)/);
 assert.equal(fs.existsSync(path.join(root,'public/marketplace-contract-preview-v3287.html')),false);
});
test('seller client never sends Stripe checkout/consent or builds untrusted HTML',()=>{
 const code=fs.readFileSync(path.join(root,'public/marketplace-contract-preview-v3287.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/credentials:'same-origin'/);
 assert.match(code,/\/api\/marketplace\/subscriptions\/contract-preview/);
 assert.match(code,/confirmation\.addEventListener\('submit',event=>/);
 assert.match(code,/event\.preventDefault\(\)/);
 assert.match(code,/!read\.checked\|\|!understand\.checked/);
 assert.match(code,/data\.consentRecorded!==false/);
 assert.match(code,/data\.liveStripeEnabled!==false/);
 assert.doesNotMatch(code,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
 assert.doesNotMatch(code,/\.innerHTML\s*=/);
 assert.doesNotMatch(code,/checkout\.stripe\.com|sk_live_|sk_test_|whsec_|localStorage|sessionStorage|document\.cookie|paymentMethod/);
});
test('seller preview API uses authenticated account only and refuses unauthorized or fake seller IDs',async()=>{
 const oldSecret=process.env.JWT_SECRET,oldQuery=db.query;
 process.env.JWT_SECRET='v3287-contract-simulation-test-only';
 const seen=[];
 db.query=async(sql,args=[])=>{
  const query=String(sql);seen.push({query,args});
  if(/FROM users\s+WHERE id=\$1/.test(query)&&/LIMIT 1/.test(query)){
   const id=Number(args[0]);return {rowCount:1,rows:[{id:String(id),username:id===2?'mundotaza':'seller',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(query.startsWith('SELECT status FROM marketplace_professional_stores WHERE seller_id=$1')){
   return {rowCount:Number(args[0])===2?1:0,rows:Number(args[0])===2?[{status:'approved'}]:[]};
  }
  if(query.startsWith('SELECT plan_code,status,period_starts_at,period_ends_at,grace_until,cancel_at_period_end FROM marketplace_seller_subscriptions WHERE seller_id=$1'))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 app.use(seo);app.use(express.static(path.join(root,'public')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const call=(url,id,options={})=>fetch(base+url,{...options,headers:{...(id?token(id):{}),...(options.headers||{})},redirect:'manual'});
 try{
  assert.equal((await call('/marketplace/contratacion')).status,401);
  assert.equal((await call('/api/marketplace/subscriptions/contract-preview')).status,401);
  const page=await call('/marketplace/contratacion',2);
  assert.equal(page.status,200);
  assert.match(page.headers.get('cache-control'),/no-store/);
  assert.match(page.headers.get('x-robots-tag'),/noindex/);
  assert.match(await page.text(),/simulación/i);
  const resp=await call('/api/marketplace/subscriptions/contract-preview?sellerId=2',3);
  assert.equal(resp.status,200);
  const other=await resp.json();
  assert.equal(other.account.pilotProtected,false);
  assert.equal(other.billingEnabled,false);
  assert.equal(other.pricesPublished,false);
  const pilot=await (await call('/api/marketplace/subscriptions/contract-preview',2)).json();
  assert.equal(pilot.account.pilotProtected,true);
  assert.equal(pilot.checkoutEnabled,false);
  assert.equal((await call('/api/marketplace/subscriptions/contract-preview',2,{method:'POST'})).status,404);
  assert.ok(seen.some(x=>/SELECT status FROM marketplace_professional_stores WHERE seller_id=\$1/.test(x.query)&&String(x.args[0])==='2'));
  assert.ok(seen.some(x=>/SELECT status FROM marketplace_professional_stores WHERE seller_id=\$1/.test(x.query)&&String(x.args[0])==='3'));
  assert.equal(seen.some(x=>/UPDATE marketplace_seller_subscriptions|INSERT INTO marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|INSERT INTO marketplace_stripe_test|UPDATE marketplace_subscription_plans/i.test(x.query)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
