'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {domainKey,approvePendingStore}=require('../src/services/marketplace-comparador-domain-approval-v3426');
const professional=require('../src/routes/marketplace-professional-v3276');

function fakePool({duplicate=false,missing=false,invalid=false,throwOnUpdate=false}={}){
 const queries=[];let released=false;
 const client={
  query:async(sql,args=[])=>{
   queries.push({sql,args});
   if(sql.includes("WHERE id=$1 AND status='pending' FOR UPDATE"))return missing?{rowCount:0,rows:[]}:{
    rowCount:1,rows:[{id:13,store_url:invalid?'https://127.0.0.1/':'https://www.tienda.es/',status:'pending'}]};
   if(sql.includes("status='approved' AND"))return duplicate?{rowCount:1,rows:[{id:88}]}:{rowCount:0,rows:[]};
   if(sql.startsWith('UPDATE marketplace_professional_stores')){
    if(throwOnUpdate)throw new Error('db-down');
    return {rowCount:1,rows:[{id:13,status:'approved',purchase_enabled:true}]};
   }
   return {rowCount:0,rows:[]};
  },
  release:()=>{released=true;}
 };
 return {pool:{connect:async()=>client},queries,wasReleased:()=>released};
}
test('normalizar www y rechazar hosts privados o URLs no HTTPS',()=>{
 assert.equal(domainKey('https://www.tienda.es/'),'tienda.es');
 assert.equal(domainKey('https://TIENDA.es/'),'tienda.es');
 assert.equal(domainKey('http://tienda.es/'),null);
 assert.equal(domainKey('https://127.0.0.1/'),null);
});
test('aprobación detecta otro dominio ya aprobado sin habilitar compras',async()=>{
 const mock=fakePool({duplicate:true});
 const result=await approvePendingStore(13,mock.pool);
 assert.equal(result.state,'domain_already_approved');
 assert.ok(mock.queries.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.deepEqual(mock.queries.find(x=>x.sql.includes('regexp_replace')).args,[13,'tienda.es/']);
 assert.ok(mock.queries.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!mock.queries.some(x=>x.sql.startsWith('UPDATE marketplace_professional_stores')));
 assert.equal(mock.wasReleased(),true);
});
test('aprobación transaccional única exige pendiente y libera bloqueo',async()=>{
 const mock=fakePool();
 const result=await approvePendingStore(13,mock.pool);
 assert.equal(result.state,'approved');
 assert.equal(result.store.purchase_enabled,true);
 assert.equal(mock.queries[0].sql,'BEGIN');
 assert.ok(mock.queries.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(mock.queries.some(x=>x.sql.startsWith('UPDATE marketplace_professional_stores')));
 assert.equal(mock.queries.at(-1).sql,'COMMIT');
 assert.equal(mock.wasReleased(),true);
 const missing=fakePool({missing:true});
 assert.equal((await approvePendingStore(13,missing.pool)).state,'not_pending');
 assert.equal(missing.queries.at(-1).sql,'ROLLBACK');
 const invalid=fakePool({invalid:true});
 assert.equal((await approvePendingStore(13,invalid.pool)).state,'invalid_domain');
 assert.ok(!invalid.queries.some(x=>x.sql.startsWith('UPDATE marketplace_professional_stores')));
});
test('si falla la base de datos, se revierte la transacción y nunca se aprueba a medias',async()=>{
 const mock=fakePool({throwOnUpdate:true});
 await assert.rejects(()=>approvePendingStore(13,mock.pool),/db-down/);
 assert.equal(mock.queries.at(-1).sql,'ROLLBACK');
 assert.equal(mock.wasReleased(),true);
});
test('API admin no permite doble aprobación y exige verificación humana',async()=>{
 const oldSecret=process.env.JWT_SECRET,oldDbQuery=db.query,oldConnect=db.pool.connect;
 process.env.JWT_SECRET='v3426-private-test-secret';
 let connects=0;
 try{
  db.query=async(sql,args=[])=>{
   if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{
    id:Number(args[0]),username:'tester',is_admin:Number(args[0])===1,
    status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
   return {rowCount:0,rows:[]};
  };
  db.pool.connect=async()=>{connects++;return (await fakePool({duplicate:true}).pool.connect());};
  const app=express();app.use(cookieParser());app.use(express.json());
  app.use('/api/marketplace/professional',professional.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const auth=id=>({Authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET),'Content-Type':'application/json'});
   const request=(id,confirmVerified)=>fetch(base+'/api/marketplace/professional/admin/stores/13/review',{
    method:'POST',headers:auth(id),body:JSON.stringify({status:'approved',confirmVerified})});
   assert.equal((await request(2,true)).status,403);
   assert.equal((await request(1,false)).status,400);
   assert.equal(connects,0);
   const denied=await request(1,true);
   assert.equal(denied.status,409);
   assert.equal((await denied.json()).error,'store_domain_already_approved');
   assert.equal(connects,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.pool.connect=oldConnect;db.query=oldDbQuery;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('el administrador recibe un mensaje entendible cuando el dominio ya está aprobado',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/marketplace-professional-v3276.js'),'utf8');
 assert.match(js,/store_domain_already_approved/);
 assert.match(js,/revisa la titularidad/i);
});
