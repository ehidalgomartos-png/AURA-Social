'use strict';
// Security regression: unauthorized users cannot access professional store management.
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const seoRouter=require('../src/routes/marketplace-seo-v3251').router;
const marketplaceRouter=require('../src/routes/marketplace-v3250');

test('private professional HTML and endpoints require a server-verified admin role',async()=>{
 const oldSecret=process.env.JWT_SECRET;
 const originalQuery=db.query;
 const statements=[];
 process.env.JWT_SECRET='tests-only-marketplace-professional-admin';
 db.query=async(sql,args=[])=>{
   statements.push(String(sql));
   if(/FROM users\s+WHERE id=\$1/.test(sql)){
     const id=Number(args[0]);
     return {rowCount:1,rows:[{id,username:id===1?'admin':'regular',is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
   }
   return {rowCount:0,rows:[]};
 };
 const app=express();
 app.use(express.json());
 app.use(cookieParser());
 app.use('/api/marketplace',marketplaceRouter);
 app.use(seoRouter);
 app.use(express.static(path.join(__dirname,'..','public')));
 const server=await new Promise(resolve=>{
   const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));
 });
 const base='http://127.0.0.1:'+server.address().port;
 const auth=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const call=async(uri,headers={},method='GET',data=null)=>{
   const response=await fetch(base+uri,{method,headers:{...headers,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});
   return {status:response.status,body:await response.text(),headers:response.headers};
 };
 try{
   assert.equal((await call('/marketplace/tiendas')).status,401);
   const member=await call('/marketplace/tiendas',auth(2));
   assert.equal(member.status,403);
   assert.doesNotMatch(member.body,/storeForm|Registrar tienda/);
   const adminPage=await call('/marketplace/tiendas',auth(1));
   assert.equal(adminPage.status,200);
   assert.match(adminPage.body,/storeForm/);
   assert.match(adminPage.headers.get('cache-control'),/no-store/);
   assert.equal((await call('/marketplace-professional-v3276.html')).status,404);
   for(const uri of ['/api/marketplace/professional/mine','/api/marketplace/professional/products','/api/marketplace/professional/admin/stores']){
     assert.equal((await call(uri)).status,401,uri+' anonymous');
     assert.equal((await call(uri,auth(2))).status,403,uri+' nonadmin');
   }
   assert.equal((await call('/api/marketplace/professional/stores',auth(2),'POST',{name:'Example shop',platform:'woocommerce',storeUrl:'https://example.es/'})).status,403);
   assert.equal(statements.some(sql=>/INSERT INTO marketplace_professional_stores/.test(sql)),false);
   const authorized=await call('/api/marketplace/professional/mine',auth(1));
   assert.equal(authorized.status,200);
   assert.deepEqual(JSON.parse(authorized.body).stores,[]);
 }finally{
   await new Promise(resolve=>server.close(resolve));
   db.query=originalQuery;
   if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});

test('private admin page is not in static assets; privileged navigation is conditional',()=>{
 assert.equal(fs.existsSync(path.join(__dirname,'..','public','marketplace-professional-v3276.html')),false);
 assert.equal(fs.existsSync(path.join(__dirname,'..','src','views','marketplace-professional-v3276.html')),true);
 const html=fs.readFileSync(path.join(__dirname,'..','public','marketplace.html'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'..','public','marketplace-v3250.js'),'utf8');
 const routes=fs.readFileSync(path.join(__dirname,'..','src','routes','marketplace-professional-v3276.js'),'utf8');
 assert.doesNotMatch(html,/href="\/marketplace\/tiendas"/);
 assert.match(script,/if\(state\.admin\)/);
 assert.match(script,/link\.href='\/marketplace\/tiendas'/);
 assert.match(routes,/router\.use\(requireAdmin\)/);
});
