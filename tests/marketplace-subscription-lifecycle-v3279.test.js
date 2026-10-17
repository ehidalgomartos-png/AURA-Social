'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const life=require('../src/services/marketplace-subscription-lifecycle-v3279');
const subscriptions=require('../src/routes/marketplace-subscriptions-v3278').router;
const seo=require('../src/routes/marketplace-seo-v3251').router;
const NOW=Date.parse('2026-11-01T12:00:00Z');
const future='2026-11-17T12:00:00.000Z';
const expired='2026-10-30T12:00:00.000Z';
const approved=1;
function trial(overrides={}){
 return {plan_code:'professional',status:'trialing',period_starts_at:new Date(NOW-10*life.ONE_DAY),
  period_ends_at:new Date(future),grace_until:null,cancel_at_period_end:false,...overrides};
}

test('MundoTaza and approved stores remain pilot by default; no entitlement enforcement',()=>{
 assert.deepEqual(life.accountView(null,1,NOW),{
  planCode:'professional',status:'pilot',recordedStatus:null,periodStartsAt:null,
  periodEndsAt:null,graceUntil:null,cancelAtPeriodEnd:false,grandfathered:true
 });
 assert.equal(life.accountView(null,0,NOW).status,'free');
 assert.equal(life.displayedStatus(trial(),NOW),'trialing');
 assert.equal(life.displayedStatus(trial({period_ends_at:new Date(expired)}),NOW),'awaiting_review');
 assert.equal(life.displayedStatus(trial({period_ends_at:new Date(expired),grace_until:new Date(future)}),NOW),'grace');
});
test('starting trials requires approved store, explicit grandfathered-pilot confirmation and dates',()=>{
 assert.throws(()=>life.transition(null,{action:'start_trial',periodEndAt:future},1,NOW),{code:'confirm_pilot_change_required'});
 assert.throws(()=>life.transition(null,{action:'start_trial',periodEndAt:future,confirmPilotChange:true},0,NOW),{code:'approved_store_required'});
 assert.throws(()=>life.transition(null,{action:'start_trial',periodEndAt:expired,confirmPilotChange:true},1,NOW),{code:'period_end_out_of_range'});
 const created=life.transition(null,{action:'start_trial',periodEndAt:future,confirmPilotChange:true},1,NOW);
 assert.equal(created.status,'trialing');assert.equal(created.plan_code,'professional');assert.equal(created.cancel_at_period_end,false);
 assert.equal(created.period_ends_at.toISOString(),future);
 assert.throws(()=>life.transition(created,{action:'start_trial',periodEndAt:future,confirmPilotChange:true},1,NOW),{code:'invalid_transition'});
});
test('renewal, cancellation, grace and closure stay manual and preserve a pilot return path',()=>{
 const first=trial();
 const cancel=life.transition(first,{action:'schedule_cancel'},1,NOW);
 assert.equal(cancel.cancel_at_period_end,true);assert.equal(cancel.status,'trialing');
 const undone=life.transition({...first,...cancel},{action:'undo_cancel'},1,NOW);
 assert.equal(undone.cancel_at_period_end,false);
 const renewed=life.transition(first,{action:'renew_trial',periodEndAt:'2026-12-01T12:00:00.000Z'},1,NOW);
 assert.equal(renewed.status,'trialing');assert.equal(renewed.cancel_at_period_end,false);
 assert.throws(()=>life.transition(first,{action:'renew_trial',periodEndAt:'2026-11-02T12:00:00.000Z'},1,NOW),{code:'period_end_out_of_range'});
 const ended=trial({period_ends_at:new Date(expired)});
 const grace=life.transition(ended,{action:'grant_grace',graceDays:7},1,NOW);
 assert.ok(grace.grace_until instanceof Date);assert.equal(grace.status,'trialing');
 assert.throws(()=>life.transition({...ended,grace_until:grace.grace_until},{action:'close_period'},1,NOW),{code:'grace_still_active'});
 assert.equal(life.transition({...ended,cancel_at_period_end:false},{action:'close_period'},1,NOW).status,'expired');
 assert.equal(life.transition({...ended,cancel_at_period_end:true},{action:'close_period'},1,NOW).status,'canceled');
 const restored=life.transition({...ended,...grace},{action:'restore_pilot',confirmPilotChange:true},1,NOW);
 assert.equal(restored.status,'pilot');assert.equal(restored.period_ends_at,null);assert.equal(restored.grace_until,null);
});
test('invalid actions cannot add unapproved fields or bypass billing-provider protection',async()=>{
 assert.throws(()=>life.parseAction({action:'start_trial',periodEndAt:future,paymentToken:'x'}),{code:'invalid_action'});
 assert.throws(()=>life.parseAction({action:'grant_grace',graceDays:31}),{code:'invalid_grace_days'});
 assert.throws(()=>life.parseAction({action:'renew_trial',periodEndAt:'2026-11-17'}),{code:'invalid_period_end'});
 assert.throws(()=>life.transition(trial(),{action:'grant_grace',graceDays:7},1,NOW),{code:'ended_trial_required'});
 const calls=[],connect=async()=>({query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT id FROM users'))return {rowCount:1,rows:[{id:2}]};
  if(sql.includes('count(*)::integer'))return {rowCount:1,rows:[{count:1}]};
  if(sql.includes('FROM marketplace_seller_subscriptions WHERE seller_id'))return {rowCount:1,rows:[{...trial(),billing_provider:'stripe',billing_subscription_ref:'sub_1'}]};
  return {rowCount:1,rows:[]};
 },release:()=>{calls.push({sql:'RELEASE'});}});
 await assert.rejects(life.recordAction({sellerId:2,actorId:1,body:{action:'schedule_cancel'},connect,clock:()=>NOW}),{code:'external_billing_managed'});
 assert.ok(calls.some(c=>c.sql==='ROLLBACK'));assert.equal(calls.some(c=>c.sql.includes('INSERT INTO marketplace_subscription_audit')),false);
});
test('admin mutation is atomic and audit records before/after without touching stores or checkout',async()=>{
 const calls=[];let released=false;
 const connect=async()=>({query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT id FROM users'))return {rowCount:1,rows:[{id:2}]};
  if(sql.includes('count(*)::integer'))return {rowCount:1,rows:[{count:1}]};
  if(sql.includes('FROM marketplace_seller_subscriptions WHERE seller_id'))return {rowCount:0,rows:[]};
  return {rowCount:1,rows:[]};
 },release:()=>{released=true;}});
 const r=await life.recordAction({sellerId:'2',actorId:1,body:{action:'start_trial',periodEndAt:future,confirmPilotChange:true},clock:()=>NOW,connect});
 assert.equal(r.ok,true);assert.equal(r.billingEnabled,false);assert.equal(r.entitlementsEnforced,false);
 assert.equal(r.account.status,'trialing');
 assert.equal(calls[0].sql,'BEGIN');assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(released,true);
 const audit=calls.find(x=>x.sql.includes('INSERT INTO marketplace_subscription_audit'));
 assert.ok(audit);assert.equal(audit.args[0],'2');assert.equal(audit.args[1],1);assert.equal(audit.args[2],'start_trial');
 const snapshot=JSON.parse(audit.args[3]);
 assert.equal(snapshot.before.status,'pilot');assert.equal(snapshot.after.status,'trialing');
 assert.equal(calls.some(x=>/UPDATE marketplace_professional_stores|UPDATE marketplace_listings|UPDATE marketplace_external_products|payment|stripe/i.test(x.sql)),false);
});
test('admin page stays authenticated and API stays admin-only; CSRF origin and JSON guards work',async()=>{
 const savedQuery=db.query,savedConnect=db.pool.connect,savedSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='lifecycle-v3279-test-secret';
 db.query=async(sql,args=[])=>{
  const s=String(sql);
  if(/FROM users\s+WHERE id=\$1/.test(s)&&/LIMIT 1/.test(s))return {rowCount:1,rows:[{id:Number(args[0]),username:Number(args[0])===1?'admin':'mundotaza',is_admin:Number(args[0])===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  if(s.includes('SELECT u.id AS seller_id'))return {rowCount:1,rows:[{seller_id:2,username:'mundotaza',plan_code:null,status:null,period_starts_at:null,period_ends_at:null,grace_until:null,cancel_at_period_end:null,store_count:1,approved_count:1}]};
  if(s.includes('FROM marketplace_subscription_audit a'))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 };
 let connectCount=0;
 db.pool.connect=async()=>{connectCount++;throw Error('Unexpected database mutation');};
 const app=express();app.use(express.json(),cookieParser());
 const {requireAuth}=require('../src/middleware/auth');
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);app.use(seo);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const url='http://127.0.0.1:'+server.address().port;
 const headers=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 try{
  const request=(resource,id,options={})=>fetch(url+resource,{...options,headers:{...(id?headers(id):{}),...(options.headers||{})}});
  assert.equal((await request('/marketplace/suscripciones')).status,401);
  assert.equal((await request('/marketplace/suscripciones',2)).status,403);
  const page=await request('/marketplace/suscripciones',1);
  assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);assert.match(await page.text(),/viewport-fit=cover/);
  assert.equal((await request('/api/marketplace/subscriptions/admin/lifecycle',2)).status,403);
  const list=await request('/api/marketplace/subscriptions/admin/lifecycle',1);
  assert.equal(list.status,200);const data=await list.json();
  assert.equal(data.items[0].account.status,'pilot');assert.equal(data.billingEnabled,false);
  assert.equal((await request('/api/marketplace/subscriptions/admin/lifecycle/2/history',2)).status,403);
  const endpoint='/api/marketplace/subscriptions/admin/lifecycle/2/action';
  assert.equal((await request(endpoint,2,{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({action:'restore_pilot'})})).status,403);
  assert.equal((await request(endpoint,1,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({action:'restore_pilot'})})).status,403);
  assert.equal((await request(endpoint,1,{method:'POST',headers:{Origin:url},body:'action=restore_pilot'})).status,415);
  assert.equal(connectCount,0);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=savedQuery;db.pool.connect=savedConnect;
  if(savedSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=savedSecret;
 }
});
test('V3.2.79 mobile admin interface is safe, minimal and not a checkout',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','src','views','marketplace-subscription-admin-v3279.html'),'utf8');
 const browser=fs.readFileSync(path.join(__dirname,'..','public','marketplace-subscription-admin-v3279.js'),'utf8');
 const routes=fs.readFileSync(path.join(__dirname,'..','src','routes','marketplace-seo-v3251.js'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'..','src','routes','marketplace-subscription-lifecycle-v3279.js'),'utf8');
 assert.match(routes,/router\.get\('\/marketplace\/suscripciones',requireAdmin/);
 assert.match(html,/noindex,nofollow/);assert.match(html,/viewport-fit=cover/);
 assert.doesNotMatch(browser,/\.innerHTML\s*=/);assert.match(browser,/textContent/);
 assert.match(browser,/window\.confirm/);assert.match(browser,/credentials:'same-origin'/);
 assert.match(api,/router\.use\(requireAdmin\)/);assert.match(api,/origin_not_allowed/);
 assert.doesNotMatch(api,/stripe\.checkout|createCheckout|billingEnabled:true/);
 assert.doesNotThrow(()=>new (require('node:vm').Script)(browser));
 const src=fs.readFileSync('src/services/marketplace-subscriptions-v3278.js','utf8');
 assert.match(src,/ALTER TABLE marketplace_seller_subscriptions ADD COLUMN IF NOT EXISTS grace_until/);
});
