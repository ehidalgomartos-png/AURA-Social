'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {assess}=require('../src/services/marketplace-comparador-merchant-followup-v3424');
const {router}=require('../src/routes/marketplace-comparador-v32132');
test('cuadro de seguimiento distingue pendientes, aprobadas, stock y sync sin cobros',()=>{
 const now=Date.parse('2026-10-28T12:00:00Z');
 const {items,summary}=assess([
  {name:'A',status:'pending',product_count:0,sync_enabled:false},
  {name:'B',status:'approved',product_count:12,sync_enabled:true,last_sync_at:'2026-10-28T10:00:00Z'},
  {name:'C',status:'approved',product_count:0,sync_enabled:true,last_sync_at:'2026-10-26T00:00:00Z',last_error:'woocommerce_partial_failure'}
 ],now);
 assert.deepEqual(summary,{total:3,pending:1,approved:2,noProducts:1,syncReview:1});
 assert.equal(items[0].needsAttention,true);
 assert.equal(items[1].needsAttention,false);
 assert.equal(items[2].syncStale,true);
 assert.equal(items[2].syncError,true);
});
test('dueño ve exclusivamente sus solicitudes; seguimiento de todas las tiendas solo admin',async()=>{
 const oldQuery=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='only-tests-merchant-dashboard-secret';
 try{
  db.query=async(sql,args=[])=>{
   if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{
    id:Number(args[0]),username:'cuenta',status:'active',is_admin:Number(args[0])===1,
    age_verified:true,show_sensitive:false,auth_token_version:0}]};
   if(sql.startsWith('SELECT id,name,platform,store_url,status FROM marketplace_professional_stores WHERE seller_id=')){
    assert.equal(Number(args[0]),22);return {rowCount:1,rows:[{id:45,name:'Mi tienda',platform:'woocommerce',store_url:'https://mitienda.es/',status:'pending'}]};
   }
   if(sql.startsWith('SELECT s.id,s.name,s.store_url,s.status,s.platform,u.username,')){
    return {rowCount:2,rows:[{name:'Ejemplo',status:'pending',username:'comerciante',product_count:0,sync_enabled:false},
    {name:'Aprobada',status:'approved',username:'otra',product_count:4,sync_enabled:true,last_sync_at:new Date().toISOString()}]};
   }
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const cookie=id=>'aura_token='+jwt.sign({id,authVersion:0},process.env.JWT_SECRET);
   const without=await fetch(base+'/admin/comparador/comercios-seguimiento');
   assert.equal(without.status,401);
   const nonAdmin=await fetch(base+'/admin/comparador/comercios-seguimiento',{headers:{Cookie:cookie(22)}});
   assert.equal(nonAdmin.status,403);
   const seller=await fetch(base+'/comparar/comercios/mi-panel',{headers:{Cookie:cookie(22)}});
   assert.equal(seller.status,200);const own=await seller.text();
   assert.match(own,/Mi tienda/);
   assert.match(own,/Pendiente de revisión/);
   assert.match(own,/noindex,follow/);
   const admin=await fetch(base+'/admin/comparador/comercios-seguimiento',{headers:{Cookie:cookie(1)}});
   assert.equal(admin.status,200);
   const html=await admin.text();
   assert.match(html,/Seguimiento de comercios/);
   assert.match(html,/Pendientes: 1/);
   assert.match(html,/Sin facturación, renovaciones automáticas/);
   assert.match(html,/noindex,follow/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
