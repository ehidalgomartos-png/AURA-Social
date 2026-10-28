'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const fs=require('node:fs');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');
test('administrator submits an existing seller shop and approves only after explicit verification',async()=>{
 const previousSecret=process.env.JWT_SECRET,previousQuery=db.query,previousConnect=db.pool.connect;
 process.env.JWT_SECRET='v32777-local-test-only';
 const store={id:5,seller_id:7,status:'draft',purchase_enabled:false};
 const log=[];
 db.query=async(sql,args=[])=>{
  const q=String(sql);log.push({q,args});
  if(/FROM users\s+WHERE id=\$1/.test(q)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id,username:id===1?'admin':'mundotaza',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(q.includes("UPDATE marketplace_professional_stores SET status='pending'")){
   assert.ok(!q.includes('seller_id='),'admin submission must not require store ownership');
   if(store.id!==Number(args[0])||store.status!=='draft')return {rowCount:0,rows:[]};
   store.status='pending';store.purchase_enabled=false;
   return {rowCount:1,rows:[{id:5,status:store.status}]};
  }
  if(q.includes("UPDATE marketplace_professional_stores SET status=$2")){
   assert.equal(args.length,4);
   if(store.id!==Number(args[0])||store.status!==args[3])return {rowCount:0,rows:[]};
   store.status=args[1];store.purchase_enabled=args[2];
   return {rowCount:1,rows:[{id:store.id,status:store.status,purchase_enabled:store.purchase_enabled}]};
  }
  if(q.includes('SELECT status FROM marketplace_professional_stores WHERE id=$1')){
   return Number(args[0])===store.id?{rowCount:1,rows:[{status:store.status}]}:{rowCount:0,rows:[]};
  }
  return {rowCount:0,rows:[]}; // only schema initialization DDL
 };
 // Approval now uses an atomic PostgreSQL transaction and domain-level lock.
 // Simulate the same state transitions without contacting a real database.
 db.pool.connect=async()=>({
  query:async(sql,args=[])=>{
   const q=String(sql);log.push({q,args});
   if(q.includes("WHERE id=$1 AND status='pending' FOR UPDATE"))
    return store.status==='pending'?{rowCount:1,rows:[{id:store.id,store_url:'https://mundotaza.com/',status:store.status}]}:{rowCount:0,rows:[]};
   if(q.includes("status='approved' AND")&&q.includes('regexp_replace'))
    return {rowCount:0,rows:[]};
   if(q.includes("UPDATE marketplace_professional_stores SET status='approved'")){
    if(store.status!=='pending')return {rowCount:0,rows:[]};
    store.status='approved';store.purchase_enabled=true;
    return {rowCount:1,rows:[{id:store.id,status:store.status,purchase_enabled:true}]};
   }
   return {rowCount:0,rows:[]};
  },release:()=>{}
 });
 const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/marketplace',marketplace);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+server.address().port;
 const auth=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const post=async(url,header={},body={})=>{
  const res=await fetch(origin+url,{method:'POST',headers:{'content-type':'application/json',...header},body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 const submit='/api/marketplace/professional/stores/5/submit';
 const review='/api/marketplace/professional/admin/stores/5/review';
 try{
  assert.equal((await post(submit)).status,401);
  assert.equal((await post(submit,auth(7))).status,403);
  assert.equal((await post(review,auth(7),{status:'approved',confirmVerified:true})).status,403);
  const notConfirmed=await post(review,auth(1),{status:'approved'});
  assert.equal(notConfirmed.status,400);
  assert.equal(notConfirmed.data.error,'store_review_confirmation_required');
  assert.equal(store.status,'draft');
  const skip=await post(review,auth(1),{status:'approved',confirmVerified:true});
  assert.equal(skip.status,409);
  assert.equal(skip.data.error,'invalid_store_status_transition');
  assert.equal(store.purchase_enabled,false);
  const submitted=await post(submit,auth(1));
  assert.equal(submitted.status,200);
  assert.equal(store.status,'pending');
  assert.equal(store.seller_id,7);
  assert.equal(store.purchase_enabled,false);
  const submitAgain=await post(submit,auth(1));
  assert.equal(submitAgain.status,409);
  const reviewNotConfirmed=await post(review,auth(1),{status:'approved'});
  assert.equal(reviewNotConfirmed.status,400);
  assert.equal(store.purchase_enabled,false);
  const approved=await post(review,auth(1),{status:'approved',confirmVerified:true});
  assert.equal(approved.status,200);
  assert.equal(approved.data.store.status,'approved');
  assert.equal(approved.data.store.purchase_enabled,true);
  assert.equal(store.seller_id,7);
  const repeat=await post(review,auth(1),{status:'approved',confirmVerified:true});
  assert.equal(repeat.status,409);
  const suspended=await post(review,auth(1),{status:'suspended'});
  assert.equal(suspended.status,200);
  assert.equal(store.purchase_enabled,false);
  assert.equal((await post(review,auth(1),{status:'pending'})).status,200);
  assert.equal(store.status,'pending');
  assert.equal(store.purchase_enabled,false);
  assert.ok(log.some(x=>x.q.includes("WHERE id=$1 AND status='draft'")));
  assert.ok(log.some(x=>x.q.includes('WHERE id=$1 AND status=$4')));
  assert.ok(log.some(x=>x.q.includes('pg_advisory_xact_lock')),'cada aprobación debe bloquear su dominio');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.pool.connect=previousConnect;db.query=previousQuery;
  if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
 }
});
test('admin storefront uses review states, warns about buy links and refreshes cache',()=>{
 const js=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 const page=fs.readFileSync('src/views/marketplace-professional-v3276.html','utf8');
 const route=fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(js,/data-submit/);
 assert.match(js,/confirmVerified:approved/);
 assert.match(js,/Comprar en la tienda/);
 assert.match(page,/marketplace-professional-v3276\.js\?v=3\.4\.2\.7/);
});
