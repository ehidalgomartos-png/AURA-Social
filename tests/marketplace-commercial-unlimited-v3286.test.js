'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const service=require('../src/services/marketplace-commercial-unlimited-v3286');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');
const root=path.join(__dirname,'..');
function fakePool(initial){
 const rows=(initial||[
  {plan_code:'professional',proposed_product_limit:null,policy_mode:'undecided',reason:'Prueba de guardado V3.2.85'},
  {plan_code:'professional_plus',proposed_product_limit:null,policy_mode:'undecided',reason:''}
 ]).map(row=>({...row}));
 const calls=[],audits=[];
 let released=0,fail=false;
 const client={
  release(){released++;},
  async query(sql,args=[]){
   const q=sql.trim();calls.push({sql:q,args});
   if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rowCount:0,rows:[]};
   if(q.startsWith('SELECT f.plan_code')){
    return {rowCount:rows.length,rows:rows.map(row=>({...row}))};
   }
   if(q.startsWith('UPDATE marketplace_subscription_commercial_features')){
    for(const row of rows)row.proposed_product_limit=null;
    return {rowCount:rows.length,rows:[]};
   }
   if(q.startsWith('UPDATE marketplace_subscription_commercial_product_policy')){
    for(const row of rows){row.policy_mode='unlimited_proposal';row.reason=args[1];}
    return {rowCount:rows.length,rows:[]};
   }
   if(q.startsWith('INSERT INTO marketplace_subscription_commercial_capacity_audit')){
    if(fail)throw Error('simulated_audit_error');
    audits.push(args);return {rowCount:1,rows:[]};
   }
   throw Error('Unexpected SQL '+q.slice(0,100));
  }
 };
 return {rows,calls,audits,pool:{connect:async()=>client},get released(){return released;},set fail(v){fail=v;}};
}
function poolWithFailures(){const fake=fakePool();fake.fail=true;return fake;}
test('only a genuine explicit confirmation can request both draft plans',()=>{
 assert.deepEqual(service.PLAN_CODES,['professional','professional_plus']);
 assert.equal(service.CONFIRMATION,'propose_unlimited_for_both');
 assert.equal(service.parse({confirmation:service.CONFIRMATION}),true);
 for(const payload of [
  {},{confirmation:'activate_live'},null,[],
  {confirmation:service.CONFIRMATION,stripeLive:true},
  {confirmation:service.CONFIRMATION,sellerId:10}
 ])assert.throws(()=>service.parse(payload),{code:'invalid_unlimited_confirmation'});
});
test('migration only adds private audit table; never changes existing stores or payment schemas',()=>{
 const ddl=service.DDL.join('\n');
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_capacity_audit/);
 assert.match(ddl,/previous_product_limit/);
 assert.match(ddl,/previous_reason/);
 assert.match(ddl,/actor_id/);
 assert.doesNotMatch(ddl,/DROP TABLE|ALTER TABLE|UPDATE marketplace_professional_stores|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_subscription_plans|UPDATE marketplace_listings|UPDATE marketplace_external_products/i);
});
test('atomic draft proposal clears both old numeric caps, stores history, and never changes entitlements',async()=>{
 const orig=db.query;db.query=async()=>({rows:[],rowCount:0});
 try{
  const fake=fakePool([
   {plan_code:'professional',proposed_product_limit:500,policy_mode:'capped_proposal',reason:'Límite de 500 provisional'},
   {plan_code:'professional_plus',proposed_product_limit:5000,policy_mode:'capped_proposal',reason:'Límite de 5000 provisional'}
  ]);
  const response=await service.apply({body:{confirmation:service.CONFIRMATION},adminId:44,pool:fake.pool});
  assert.equal(response.ok,true);
  assert.deepEqual(response.changesAppliedToCommercialDrafts,['professional','professional_plus']);
  for(const flag of ['billingEnabled','liveStripeEnabled','pricesPublished','enrollmentEnabled','entitlementsEnforced'])
   assert.equal(response[flag],false);
  assert.equal(response.pilotProtected,true);assert.equal(response.externalCheckoutOnly,true);
  assert.deepEqual(fake.rows.map(x=>x.proposed_product_limit),[null,null]);
  assert.deepEqual(fake.rows.map(x=>x.policy_mode),['unlimited_proposal','unlimited_proposal']);
  assert.equal(fake.audits.length,2);
  assert.equal(fake.audits[0][1],500);
  assert.equal(fake.audits[0][2],'capped_proposal');
  assert.equal(fake.audits[0][3],'Límite de 500 provisional');
  assert.equal(fake.audits[1][1],5000);
  assert.equal(fake.audits[0][5],44);
  assert.equal(fake.calls[0].sql,'BEGIN');
  assert.equal(fake.calls.at(-1).sql,'COMMIT');
  assert.equal(fake.released,1);
  assert.equal(fake.calls.filter(x=>/^(UPDATE|INSERT)/.test(x.sql)).every(x=>
   /^UPDATE marketplace_subscription_commercial_(features|product_policy)|^INSERT INTO marketplace_subscription_commercial_capacity_audit/.test(x.sql)),true);
 }finally{db.query=orig;}
});
test('repeat confirmation is idempotent, produces no extra audit and preserves previous notes in first audit',async()=>{
 const orig=db.query;db.query=async()=>({rows:[],rowCount:0});
 try{
  const fake=fakePool();
  await service.apply({body:{confirmation:service.CONFIRMATION},adminId:2,pool:fake.pool});
  assert.equal(fake.audits[0][3],'Prueba de guardado V3.2.85');
  const count=fake.audits.length;
  const second=await service.apply({body:{confirmation:service.CONFIRMATION},adminId:2,pool:fake.pool});
  assert.equal(second.changesAppliedToCommercialDrafts.length,0);
  assert.equal(fake.audits.length,count);
  assert.equal(fake.released,2);
  assert.equal(fake.calls.filter(x=>x.sql==='COMMIT').length,2);
});
test('failed audit rolls back instead of committing a partial change',async()=>{
 const orig=db.query;db.query=async()=>({rows:[],rowCount:0});
 try{
  const fake=poolWithFailures();
  await assert.rejects(service.apply({body:{confirmation:service.CONFIRMATION},adminId:2,pool:fake.pool}),/simulated_audit_error/);
  assert.equal(fake.calls.at(-1).sql,'ROLLBACK');
  assert.equal(fake.released,1);
  assert.equal(fake.calls.some(x=>x.sql==='COMMIT'),false);
 }finally{db.query=orig;}
});
test('incomplete private plan drafts cannot silently apply only one plan',async()=>{
 const orig=db.query;db.query=async()=>({rows:[],rowCount:0});
 try{
  const fake=fakePool([{plan_code:'professional',proposed_product_limit:100,policy_mode:'undecided',reason:''}]);
  await assert.rejects(service.apply({body:{confirmation:service.CONFIRMATION},adminId:3,pool:fake.pool}),
   {code:'commercial_plans_incomplete',status:409});
  assert.equal(fake.calls.at(-1).sql,'ROLLBACK');
  assert.equal(fake.calls.some(x=>x.sql.startsWith('UPDATE')),false);
 }finally{db.query=orig;}
});
test('admin-only endpoint validates origin and body, never operates when unauthorized',async()=>{
 const oldQuery=db.query,oldConnect=db.pool.connect,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3286-test-admin-secret';
 const statements=[],fake=fakePool();
 db.query=async(sql,args=[])=>{
  const s=String(sql);statements.push({sql:s,args});
  if(/FROM users\s+WHERE id=\$1/.test(s)&&/LIMIT 1/.test(s)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id,username:id===1?'admin':'seller',is_admin:id===1,
    status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  return {rowCount:0,rows:[]};
 };
 db.pool.connect=async()=>fake.pool.connect();
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const host='http://127.0.0.1:'+server.address().port;
 const uri=host+'/api/marketplace/subscriptions/admin/commercial/definition/propose-unlimited';
 const headers=id=>id?{authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)}:{};
 const post=(id,body,origin=host)=>fetch(uri,{method:'POST',
  headers:{...headers(id),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const body={confirmation:service.CONFIRMATION};
  assert.equal((await post(null,body)).status,401);
  assert.equal((await post(2,body)).status,403);
  assert.equal((await post(1,body,'https://evil.example')).status,403);
  assert.equal((await post(1,{...body,activateLive:true})).status,400);
  assert.equal(fake.calls.length,0);
  const good=await post(1,body);assert.equal(good.status,200);
  assert.match(good.headers.get('cache-control'),/no-store/);
  const saved=await good.json();assert.equal(saved.billingEnabled,false);
  assert.equal(saved.entitlementsEnforced,false);
  assert.deepEqual(saved.changesAppliedToCommercialDrafts,['professional','professional_plus']);
  assert.equal(fake.audits.length,2);
  assert.equal(statements.some(x=>/UPDATE marketplace_(?:professional_stores|seller_subscriptions|subscription_plans|external_products|listings)/i.test(x.sql)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;db.pool.connect=oldConnect;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('admin UI requires confirmation, shows the proposal in comparison and keeps prices private',()=>{
 const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'public/marketplace-commercial-unlimited-v3286.js'),'utf8');
 const features=fs.readFileSync(path.join(root,'public/marketplace-commercial-features-v3282.js'),'utf8');
 const route=fs.readFileSync(path.join(root,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(html,/id="applyUnlimited"/);
 assert.match(html,/v=3\.2\.86/);assert.match(html,/noindex,nofollow/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/confirmation:'propose_unlimited_for_both'/);
 assert.match(ui,/commercial:policy-saved/);
 assert.match(features,/Sin límite \(propuesta\)/);
 assert.match(features,/professional_plus/);
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/router\.post\('\/definition\/propose-unlimited',limiter,checkOrigin/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.doesNotMatch(ui,/sk_live_|checkout\.stripe|StripeConnect/);
 assert.doesNotThrow(()=>new(require('node:vm').Script)(ui));
});
