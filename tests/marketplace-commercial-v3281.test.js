'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const jwt=require('jsonwebtoken');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const commercial=require('../src/services/marketplace-subscription-commercial-v3281');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {router:seo}=require('../src/routes/marketplace-seo-v3251');
const {requireAuth}=require('../src/middleware/auth');

test('commercial planning schema is additive and cannot modify real plans or products',()=>{
 const sql=commercial.DDL.join('\n');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_drafts/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_reviews/);
 assert.match(sql,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.match(sql,/ON CONFLICT\(topic\) DO NOTHING/);
 assert.doesNotMatch(sql,/UPDATE marketplace_subscription_plans|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_listings|UPDATE marketplace_external_products|DROP TABLE|TRUNCATE|DELETE FROM/i);
 assert.deepEqual(commercial.CODES,['professional','professional_plus']);
 assert.deepEqual(commercial.STATUSES,['pending','in_review','reviewed']);
 assert.equal(commercial.TOPICS.length,6);
});
test('validates draft price, text and plan without approving publication or tampering',()=>{
 const valid=commercial.parseDraft('professional',{proposedMonthlyCents:null,summary:'Borrador de modalidad profesional sin precio aprobado.'});
 assert.equal(valid.proposedMonthlyCents,null);
 assert.deepEqual(commercial.parseDraft('professional_plus',{proposedMonthlyCents:2490,summary:'  Propuesta de plan avanzado.  '}),{
  planCode:'professional_plus',proposedMonthlyCents:2490,summary:'Propuesta de plan avanzado.'
 });
 assert.throws(()=>commercial.parseDraft('particular',{proposedMonthlyCents:0,summary:'Free forever'}),{code:'unknown_plan'});
 assert.throws(()=>commercial.parseDraft('professional',{proposedMonthlyCents:990,summary:'Descripción correcta',billingEnabled:true}),{code:'invalid_draft_payload'});
 assert.throws(()=>commercial.parseDraft('professional',{proposedMonthlyCents:0,summary:'Descripción válida.'}),{code:'invalid_proposed_price'});
 assert.throws(()=>commercial.parseDraft('professional',{proposedMonthlyCents:'990',summary:'Descripción válida.'}),{code:'invalid_proposed_price'});
 assert.throws(()=>commercial.parseDraft('professional',{proposedMonthlyCents:990,summary:'Corto'}),{code:'invalid_summary'});
 assert.throws(()=>commercial.parseDraft('professional',{proposedMonthlyCents:990,summary:'x'.repeat(401)}),{code:'invalid_summary'});
});
test('legal and tax checklist is internal review only, not activation',()=>{
 assert.deepEqual(commercial.parseReview('taxes',{reviewStatus:'in_review',notes:' Consultar asesoría fiscal '}),
  {topic:'taxes',reviewStatus:'in_review',notes:'Consultar asesoría fiscal'});
 assert.throws(()=>commercial.parseReview('onboarding',{reviewStatus:'reviewed',notes:''}),{code:'unknown_topic'});
 assert.throws(()=>commercial.parseReview('terms',{reviewStatus:'approved',notes:''}),{code:'invalid_review_status'});
 assert.throws(()=>commercial.parseReview('terms',{reviewStatus:'reviewed',notes:'',enableCheckout:true}),{code:'invalid_review_payload'});
 assert.throws(()=>commercial.parseReview('terms',{reviewStatus:'reviewed',notes:'a'.repeat(1001)}),{code:'invalid_review_notes'});
});
test('overview is private and mutations only update isolated commercial tables',async()=>{
 const calls=[];
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT plan_code,proposed_monthly_cents'))return {rows:[{
   plan_code:'professional',proposed_monthly_cents:990,summary:'Solo propuesta interna.',updated_at:null
  }]};
  if(sql.startsWith('SELECT topic,review_status'))return {rows:[{topic:'taxes',review_status:'pending',notes:'Consultar asesoría.',updated_at:null}]};
  if(sql.startsWith('UPDATE marketplace_subscription_commercial_drafts'))return {rowCount:1,rows:[{plan_code:args[0],proposed_monthly_cents:args[1],summary:args[2]}]};
  if(sql.startsWith('UPDATE marketplace_subscription_commercial_reviews'))return {rowCount:1,rows:[{topic:args[0],review_status:args[1],notes:args[2]}]};
  throw Error('Unapproved SQL');
 };
 const list=await commercial.overview(query);
 assert.equal(list.commercialDraftOnly,true);assert.equal(list.billingEnabled,false);
 assert.equal(list.enrollmentEnabled,false);assert.equal(list.pricesPublished,false);
 assert.equal(list.pilotProtected,true);assert.equal(list.reviews.length,6);
 const saved=await commercial.saveDraft({planCode:'professional',body:{
  proposedMonthlyCents:990,summary:'Descripción de propuesta comercial privada.'
 },adminId:17,query});
 assert.equal(saved.billingEnabled,false);
 const review=await commercial.saveReview({topic:'renewals',body:{
  reviewStatus:'reviewed',notes:'Nota interna sin aprobar ningún pago.'
 },adminId:17,query});
 assert.equal(review.billingEnabled,false);
 const writes=calls.filter(x=>x.sql.startsWith('UPDATE'));
 assert.equal(writes.length,2);assert.equal(writes[0].args[3],17);assert.equal(writes[1].args[3],17);
 assert.equal(writes.some(x=>/UPDATE marketplace_subscription_plans|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_stripe_test_subscriptions|UPDATE marketplace_professional_stores/i.test(x.sql)),false);
});
test('commercial page/API deny sellers and cross-origin; admin can only save drafts',async()=>{
 const previousQuery=db.query,previousSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='commercial-v3281-test-secret';
 const calls=[];
 db.query=async(sql,args=[])=>{
  const s=String(sql);calls.push({sql:s,args});
  if(/FROM users\s+WHERE id=\$1/.test(s)&&/LIMIT 1/.test(s)){
   const id=Number(args[0]);return {rowCount:1,rows:[{
    id,username:id===1?'admin':'seller',is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false
   }]};
  }
  if(s.startsWith('SELECT plan_code,proposed_monthly_cents'))return {rowCount:1,rows:[{
   plan_code:'professional',proposed_monthly_cents:null,summary:'Propuesta interna sin contratar.',updated_at:null
  }]};
  if(s.startsWith('SELECT topic,review_status'))return {rowCount:1,rows:[{topic:'taxes',review_status:'pending',notes:'',updated_at:null}]};
  if(s.startsWith('UPDATE marketplace_subscription_commercial_drafts'))return {rowCount:1,rows:[{plan_code:args[0],proposed_monthly_cents:args[1],summary:args[2]}]};
  if(s.startsWith('UPDATE marketplace_subscription_commercial_reviews'))return {rowCount:1,rows:[{topic:args[0],review_status:args[1],notes:args[2]}]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);app.use(seo);
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const base='http://127.0.0.1:'+server.address().port;
 const h=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const req=(url,id,options={})=>fetch(base+url,{...options,headers:{...(id?h(id):{}),...(options.headers||{})}});
 try{
  const page='/marketplace/suscripciones/comercial',endpoint='/api/marketplace/subscriptions/admin/commercial';
  assert.equal((await req(page)).status,401);
  assert.equal((await req(page,2)).status,403);
  const adminPage=await req(page,1);assert.equal(adminPage.status,200);
  assert.match(adminPage.headers.get('cache-control'),/no-store/);
  assert.match(await adminPage.text(),/viewport-fit=cover/);
  assert.equal((await req(endpoint,2)).status,403);
  const data=await req(endpoint,1);assert.equal(data.status,200);
  const payload=await data.json();assert.equal(payload.pricesPublished,false);assert.equal(payload.billingEnabled,false);
  const post=(url,id,body,origin=base)=>req(url,id,{method:'POST',
   headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  const draft=endpoint+'/drafts/professional';
  const valid={proposedMonthlyCents:990,summary:'Descripción interna para revisión comercial.'};
  assert.equal((await post(draft,2,valid)).status,403);
  assert.equal((await post(draft,1,valid,'https://external.example')).status,403);
  assert.equal((await post(draft,1,{...valid,billingEnabled:true})).status,400);
  assert.equal((await post(draft,1,valid)).status,200);
  assert.equal((await post(endpoint+'/reviews/taxes',1,{reviewStatus:'reviewed',notes:'Revisión interna.'})).status,200);
  assert.equal((await post(endpoint+'/reviews/taxes',1,{reviewStatus:'approved',notes:''})).status,400);
  assert.equal((await post(endpoint+'/drafts/particular',1,{proposedMonthlyCents:100,summary:'Descripción interna válida.'})).status,404);
  assert.equal(calls.some(x=>/UPDATE marketplace_subscription_plans|UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|INSERT INTO marketplace_stripe_test/i.test(x.sql)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=previousQuery;
  if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
 }
});
test('vendor copy is clear, screens are mobile-first, private and XSS safe',()=>{
 const root=path.join(__dirname,'..');
 const vendorHtml=fs.readFileSync(path.join(root,'src/views/marketplace-subscriptions-v3278.html'),'utf8');
 const adminHtml=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const client=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.js'),'utf8');
 const vendorJs=fs.readFileSync(path.join(root,'public/marketplace-subscriptions-v3278.js'),'utf8');
 const seoText=fs.readFileSync(path.join(root,'src/routes/marketplace-seo-v3251.js'),'utf8');
 assert.match(vendorHtml,/todavía no se puede contratar/);
 assert.match(vendorHtml,/El vendedor elegirá un plan/);
 assert.match(vendorHtml,/propia tienda del vendedor/);
 assert.match(vendorJs,/grandfathered/);
 assert.match(adminHtml,/USO INTERNO/);assert.match(adminHtml,/noindex,nofollow/);
 assert.match(adminHtml,/viewport-fit=cover/);
 assert.match(seoText,/router\.get\('\/marketplace\/suscripciones\/comercial',requireAdmin/);
 assert.match(client,/credentials:'same-origin'/);assert.match(client,/window\.confirm/);
 assert.doesNotMatch(client,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new (require('node:vm').Script)(client));
 assert.doesNotMatch(client,/checkout\.stripe|sk_live_/);
});
