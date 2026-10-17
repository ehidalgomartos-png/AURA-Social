'use strict';
// Owner-transfer regression: simulate database transactions; never touch production.
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');

test('transfer requires administrator and reassigns only an empty draft shop, with audit',async()=>{
 const origSecret=process.env.JWT_SECRET,origQuery=db.query,origConnect=db.pool.connect;
 process.env.JWT_SECRET='v32775-fixture-only-session-key';
 const changes=[];
 let state={owner:2,status:'draft',linked:false,credentials:false,targetExists:true,duplicate:false};
 db.query=async(sql,args=[])=>{
  if(/FROM users\s+WHERE id=\$1/.test(sql)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id,username:id===1?'administrator':'hidalgovalencia',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  return {rowCount:0,rows:[]};
 };
 db.pool.connect=async()=>({
  query:async(sql,args=[])=>{
   const q=String(sql);changes.push({q,args});
   if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rowCount:0,rows:[]};
   if(q.includes('FOR UPDATE OF s'))return {rowCount:1,rows:[{
    id:5,name:'MundoTaza',seller_id:state.owner,store_url:'https://mundotaza.com/',
    status:state.status,purchase_enabled:false,current_username:'hidalgovalencia'
   }]};
   if(q.includes('FROM users WHERE LOWER(username)')){
    return state.targetExists?{rowCount:1,rows:[{id:3,username:'mundotaza'}]}:{rowCount:0,rows:[]};
   }
   if(q.includes('AS has_products'))return {rowCount:1,rows:[{
    has_products:state.linked,has_woo_links:false,has_credentials:state.credentials
   }]};
   if(q.includes('FROM marketplace_professional_stores WHERE seller_id='))
    return {rowCount:state.duplicate?1:0,rows:state.duplicate?[{id:8}]:[]};
   if(q.startsWith('UPDATE marketplace_professional_stores')){
    state.owner=Number(args[1]);
    return {rowCount:1,rows:[{id:5,name:'MundoTaza',seller_id:state.owner,status:'draft',store_url:'https://mundotaza.com/'}]};
   }
   if(q.startsWith('INSERT INTO marketplace_professional_owner_audit'))return {rowCount:1,rows:[]};
   throw new Error('Unexpected test query: '+q.slice(0,150));
  },
  release(){changes.push({q:'released'});}
 });
 const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/marketplace',marketplace);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const root='http://127.0.0.1:'+server.address().port+'/api/marketplace/professional/admin/stores/5/transfer-owner';
 const bearer=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const submit=async(headers={},body={username:'mundotaza',expectedSellerId:2,confirm:true})=>{
  const res=await fetch(root,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 try{
  assert.equal((await submit()).status,401);
  assert.equal((await submit(bearer(2))).status,403);
  assert.equal((await submit(bearer(1),{username:'bad!!',expectedSellerId:2,confirm:true})).status,400);
  assert.equal((await submit(bearer(1),{username:'mundotaza',expectedSellerId:2})).status,400);
  assert.equal(changes.filter(x=>x.q==='BEGIN').length,0);
  const valid=await submit(bearer(1));
  assert.equal(valid.status,200);
  assert.equal(valid.data.store.username,'mundotaza');
  assert.equal(valid.data.store.previousUsername,'hidalgovalencia');
  assert.equal(state.owner,3);
  assert.equal(changes.some(x=>x.q.startsWith('INSERT INTO marketplace_professional_owner_audit')&&x.args[1]===1),true);
  assert.equal(changes.some(x=>x.q==='COMMIT'),true);
  assert.equal(changes.some(x=>x.q==='released'),true);

  changes.length=0;state={...state,owner:2,linked:true};
  const linked=await submit(bearer(1));
  assert.equal(linked.status,409);
  assert.equal(linked.data.error,'store_transfer_has_linked_data');
  assert.equal(changes.some(x=>x.q==='ROLLBACK'),true);
  assert.equal(changes.some(x=>x.q.startsWith('UPDATE marketplace_professional_stores')),false);
  changes.length=0;state={...state,linked:false,credentials:true};
  assert.equal((await submit(bearer(1))).data.error,'store_transfer_has_linked_data');
  changes.length=0;state={...state,credentials:false,status:'approved'};
  assert.equal((await submit(bearer(1))).data.error,'store_requires_draft');
  changes.length=0;state={...state,status:'draft',targetExists:false};
  assert.equal((await submit(bearer(1))).data.error,'target_user_not_found');
  changes.length=0;state={...state,targetExists:true,duplicate:true};
  assert.equal((await submit(bearer(1))).data.error,'target_already_has_store');
  changes.length=0;state={...state,duplicate:false};
  assert.equal((await submit(bearer(1),{username:'mundotaza',expectedSellerId:4,confirm:true})).data.error,'store_owner_changed');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=origQuery;db.pool.connect=origConnect;
  if(origSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=origSecret;
 }
});
test('admin page offers explicit confirmed transfer with a username and no automatic listing reassignment',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync('src/views/marketplace-professional-v3276.html','utf8');
 const js=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 const svc=fs.readFileSync('src/services/marketplace-store-owner-v32775.js','utf8');
 const pro=fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8');
 assert.match(html,/v=3\.2\.77\.6/);
 assert.match(js,/data-store-owner-transfer/);
 assert.match(js,/expectedSellerId/);
 assert.match(js,/confirm:true/);
 assert.match(pro,/router\.use\(requireAdmin\)/);
 assert.match(pro,/transferStoreOwner/);
 assert.match(svc,/FOR UPDATE OF s/);
 assert.match(svc,/marketplace_professional_owner_audit/);
 assert.match(svc,/store_transfer_has_linked_data/);
 assert.doesNotMatch(svc,/UPDATE marketplace_listings/);
 assert.doesNotMatch(svc,/UPDATE marketplace_external_products/);
});
