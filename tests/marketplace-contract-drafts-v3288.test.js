'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const jwt=require('jsonwebtoken');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const templates=require('../src/services/marketplace-contract-drafts-v3288');
const {router:subscriptions}=require('../src/routes/marketplace-subscriptions-v3278');
const {requireAuth}=require('../src/middleware/auth');
const root=path.join(__dirname,'..');
const textValue='Texto informativo de borrador privado: pendiente de revisión final.';
const baseRow=(code='professional',revision=0)=>({
 plan_code:code,revision,review_state:'draft',
 price_disclosure:'',taxes:'',renewals:'',cancellations:'',privacy:'',consent:'',updated_at:null
});
const body=(revision=0,status='draft',value=textValue)=>({
 expectedRevision:revision,reviewState:status,
 ...Object.fromEntries(templates.FIELDS.map(key=>[key,value]))
});
function pool(initial=baseRow()){
 const row={...initial},history=[],calls=[];
 let released=0,failAudit=false,failUpdate=false;
 const client={
  release(){released++;},
  async query(sql,args=[]){
   const q=String(sql).trim();calls.push({q,args});
   if(['BEGIN','COMMIT','ROLLBACK'].includes(q))return {rowCount:0,rows:[]};
   if(q.startsWith('SELECT plan_code,revision,review_state')&&q.includes('FOR UPDATE'))
    return {rowCount:1,rows:[{...row}]};
   if(q.startsWith('UPDATE marketplace_subscription_contract_drafts')){
    if(failUpdate)throw Error('simulated_update_failure');
    row.revision+=1;row.review_state=args[1];row.price_disclosure=args[2];
    row.taxes=args[3];row.renewals=args[4];row.cancellations=args[5];
    row.privacy=args[6];row.consent=args[7];row.updated_at='2026-10-18T12:00:00Z';
    return {rowCount:1,rows:[{...row}]};
   }
   if(q.startsWith('INSERT INTO marketplace_subscription_contract_draft_history')){
    if(failAudit)throw Error('simulated_history_failure');
    history.push(args);return {rowCount:1,rows:[]};
   }
   throw Error('Unexpected SQL '+q.slice(0,80));
  }
 };
 return {pool:{connect:async()=>client},calls,history,row,
  set failAudit(x){failAudit=x;},set failUpdate(x){failUpdate=x;},
  get released(){return released;}
 };
}
test('schemas only add admin-only draft and audit tables, never billing or operational mutations',()=>{
 const ddl=templates.DDL.join('\n');
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS marketplace_subscription_contract_drafts/);
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS marketplace_subscription_contract_draft_history/);
 assert.match(ddl,/UNIQUE\(plan_code,revision\)/);
 assert.match(ddl,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.doesNotMatch(ddl,/\bALTER TABLE|\bDROP TABLE|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores/i);
 assert.deepEqual(templates.PLANS,['professional','professional_plus']);
 assert.deepEqual(templates.STATUSES,['draft','internal_review']);
 assert.equal(templates.FIELDS.length,6);
});
test('strict draft validation rejects extra fields, direct approvals, oversized content and incomplete review',()=>{
 assert.equal(templates.parse('professional',body()).planCode,'professional');
 assert.equal(templates.parse('professional_plus',body(0,'internal_review')).reviewState,'internal_review');
 for(const [plan,data,code] of [
  ['particular',body(),'unknown_contract_plan'],
  ['professional',{...body(),activateLive:true},'invalid_contract_draft_payload'],
  ['professional',{...body(),consentRecorded:true},'invalid_contract_draft_payload'],
  ['professional',{...body(),expectedRevision:-1},'invalid_contract_revision'],
  ['professional',{...body(),expectedRevision:'0'},'invalid_contract_revision'],
  ['professional',{...body(),reviewState:'published'},'invalid_contract_review_state'],
  ['professional',{...body(),privacy:'a'.repeat(1201)},'invalid_contract_text'],
  ['professional',{...body(),privacy:'abc\u0000def'},'invalid_contract_text'],
  ['professional',{...body(),taxes:123},'invalid_contract_text'],
  ['professional',{...body(0,'internal_review'),consent:''},'contract_draft_incomplete']
 ])assert.throws(()=>templates.parse(plan,data),{code});
 const valid=templates.parse('professional',body());
 assert.equal(valid.privacy,textValue);
});
test('admin template state never implies legal approval or seller consent, even when internally reviewed',()=>{
 const state=templates.state();
 for(const key of ['legallyApproved','consentCollected','pricesPublished','billingEnabled',
  'liveStripeEnabled','enrollmentEnabled','entitlementsEnforced','publiclyAvailable'])
  assert.equal(state[key],false);
 assert.equal(state.commercialDraftOnly,true);assert.equal(state.pilotProtected,true);
 const full=templates.view({...baseRow(),review_state:'internal_review',price_disclosure:textValue,
  taxes:textValue,renewals:textValue,cancellations:textValue,privacy:textValue,consent:textValue});
 assert.equal(full.complete,true);assert.equal(full.reviewState,'internal_review');
 assert.equal(templates.view(baseRow()).complete,false);
});
test('transaction records versioned private changes with original draft and pg bigint admin string',async()=>{
 const old=db.query;db.query=async()=>({rowCount:0,rows:[]});
 try{
  const fake=pool();
  const result=await templates.save({planCode:'professional',body:body(),adminId:'9007199254740993',pool:fake.pool});
  assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(result.draft.revision,1);
  assert.equal(result.consentCollected,false);assert.equal(result.liveStripeEnabled,false);
  assert.equal(fake.row.price_disclosure,textValue);
  assert.equal(fake.history.length,1);
  const history=fake.history[0];assert.equal(history[0],'professional');assert.equal(history[1],1);
  assert.equal(JSON.parse(history[2]).revision,0);
  assert.equal(JSON.parse(history[3]).revision,1);
  assert.equal(history[4],'9007199254740993');
  assert.deepEqual(fake.calls.map(c=>c.q).filter(q=>['BEGIN','COMMIT','ROLLBACK'].includes(q)),['BEGIN','COMMIT']);
  assert.equal(fake.released,1);
  assert.equal(fake.calls.filter(c=>/^(UPDATE|INSERT)/.test(c.q)).every(c=>
   /^UPDATE marketplace_subscription_contract_drafts|^INSERT INTO marketplace_subscription_contract_draft_history/.test(c.q)),true);
 }finally{db.query=old;}
});
test('repeat save is idempotent; stale revision is conflict 409, audit failure rolls back',async()=>{
 const old=db.query;db.query=async()=>({rowCount:0,rows:[]});
 try{
  const fake=pool();
  await templates.save({planCode:'professional',body:body(),adminId:'3',pool:fake.pool});
  const duplicate=await templates.save({planCode:'professional',body:body(1),adminId:'3',pool:fake.pool});
  assert.equal(duplicate.changed,false);
  assert.equal(fake.history.length,1);
  await assert.rejects(templates.save({planCode:'professional',body:body(0),adminId:'3',pool:fake.pool}),
   {code:'contract_draft_conflict',status:409});
  assert.equal(fake.calls.at(-1).q,'ROLLBACK');
  assert.equal(fake.released,3);
  const broken=pool();broken.failAudit=true;
  await assert.rejects(templates.save({planCode:'professional',body:body(),adminId:'3',pool:broken.pool}),
   /simulated_history_failure/);
  assert.equal(broken.calls.at(-1).q,'ROLLBACK');
  assert.equal(broken.calls.some(c=>c.q==='COMMIT'),false);
 }finally{db.query=old;}
});
test('admin-only HTTP: unauthorized, non-admin, cross-origin and forbidden payload rejected',async()=>{
 const oldQuery=db.query,oldConnect=db.pool.connect,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='contract-v3288-test-secret';
 const statements=[],fake=pool();
 db.query=async(sql,args=[])=>{
  const query=String(sql);statements.push({query,args});
  if(/FROM users\s+WHERE id=\$1/.test(query)&&/LIMIT 1/.test(query)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id:String(id),username:id===1?'admin':'seller',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(query.trim().startsWith('SELECT plan_code,revision,review_state')&&!query.includes('FOR UPDATE')){
   return {rowCount:1,rows:[{...fake.row}]};
  }
  return {rowCount:0,rows:[]};
 };
 db.pool.connect=async()=>fake.pool.connect();
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',requireAuth,subscriptions);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const host='http://127.0.0.1:'+server.address().port;
 const uri=host+'/api/marketplace/subscriptions/admin/commercial/contract-drafts';
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const fetchAs=(url,id,options={})=>fetch(url,{
  ...options,headers:{...(id?token(id):{}),...(options.headers||{})}
 });
 const post=(id,data,origin=host)=>fetchAs(uri+'/professional',id,{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await fetchAs(uri,null)).status,401);
  assert.equal((await fetchAs(uri,2)).status,403);
  const res=await fetchAs(uri,1);assert.equal(res.status,200);
  const reading=await res.json();
  assert.equal(reading.drafts[0].code,'professional');assert.equal(reading.billingEnabled,false);
  assert.match(res.headers.get('x-robots-tag'),/noindex/);
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.equal((await post(null,body())).status,401);
  assert.equal((await post(2,body())).status,403);
  assert.equal((await post(1,body(),'https://evil.example')).status,403);
  assert.equal((await post(1,{...body(),stripeLive:true})).status,400);
  assert.equal((await post(1,{...body(),reviewState:'published'})).status,400);
  assert.equal(fake.history.length,0);
  const saved=await post(1,body());assert.equal(saved.status,200);
  const json=await saved.json();
  assert.equal(json.draft.revision,1);assert.equal(json.changed,true);
  assert.equal(json.consentCollected,false);assert.equal(json.liveStripeEnabled,false);
  assert.equal(fake.history[0][4],'1');
  assert.equal(statements.some(s=>/UPDATE marketplace_(?:professional_stores|seller_subscriptions|subscription_plans|listings|external_products)/i.test(s.query)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=oldQuery;db.pool.connect=oldConnect;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('seller contracting remains read-only; private text templates stay admin-only, no browser HTML injection',()=>{
 const commercial=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const adminJS=fs.readFileSync(path.join(root,'public/marketplace-contract-drafts-v3288.js'),'utf8');
 const seller=fs.readFileSync(path.join(root,'src/views/marketplace-contract-preview-v3287.html'),'utf8');
 const client=fs.readFileSync(path.join(root,'public/marketplace-contract-preview-v3287.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'public/marketplace-contract-preview-v3287.css'),'utf8');
 const api=fs.readFileSync(path.join(root,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(commercial,/id="contractDraftWorkspace"/);
 assert.match(commercial,/marketplace-contract-drafts-v3288\.js\?v=3\.2\.88/);
 assert.match(adminJS,/window\.confirm/);
 assert.match(adminJS,/expectedRevision:draft\.revision/);
 assert.match(adminJS,/contract_draft_conflict/);
 assert.match(api,/router\.use\(requireAdmin\)/);
 assert.match(api,/router\.post\('\/contract-drafts\/:planCode',limiter,checkOrigin/);
 assert.match(seller,/id="contractProgress"/);assert.match(seller,/id="progressDone"/);
 assert.match(seller,/id="understandDemo"/);assert.match(seller,/Condiciones aún no publicadas/);
 assert.match(css,/progress-step\[aria-current=step\]/);
 assert.match(client,/removeAttribute\('aria-current'\)/);
 assert.match(client,/confirmation\.addEventListener\('submit',event=>/);
 assert.doesNotMatch(client,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
 assert.doesNotMatch(client,/\.innerHTML\s*=/);
 assert.doesNotMatch(adminJS,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.doesNotThrow(()=>new vm.Script(adminJS));
 const sellerService=fs.readFileSync(path.join(root,'src/services/marketplace-contract-preview-v3287.js'),'utf8');
 assert.doesNotMatch(sellerService,/marketplace_subscription_contract_drafts|marketplace_subscription_contract_draft_history/);
});
