'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
test('propietario pendiente obtiene su código de verificación con CSRF sin publicar nada',async()=>{
 const oldSecret=process.env.JWT_SECRET,original=db.query;
 process.env.JWT_SECRET='v3427-test-only';
 const queries=[];
 db.query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:Number(args[0]),username:'vendedor',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
  if(sql.startsWith('UPDATE marketplace_professional_stores SET verification_token=')){
   assert.equal(String(args[0]),'12');
   assert.equal(args[1],87);
   assert.match(args[2],/^rl-verify-[0-9a-f]{32}$/);
   assert.match(sql,/seller_id=\$2 AND status='pending'/);
   assert.match(sql,/COALESCE\(verification_token,\$3\)/);
   return {rowCount:1,rows:[{id:12}]};
  }
  if(sql.includes('COUNT(DISTINCT x.listing_id) FILTER'))return {rowCount:1,rows:[{id:12,name:'Tienda de prueba',platform:'woocommerce',status:'pending',store_url:'https://tienda.es/',verification_token:null,linked_count:0,available_count:0}]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const v=app.listen(0,'127.0.0.1',()=>resolve(v));});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const cookie='aura_token='+jwt.sign({id:87,authVersion:0},process.env.JWT_SECRET);
  const panel=await fetch(base+'/comparar/comercios/mi-panel',{headers:{Cookie:cookie}});
  assert.equal(panel.status,200);
  const html=await panel.text(),csrf=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
  const c=panel.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
  assert.ok(csrf&&c);
  assert.match(html,/Obtener código de verificación/);
  assert.equal((await fetch(base+'/comparar/comercios/verificacion/12',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:'_csrf=incorrecto'})).status,403);
  const out=await fetch(base+'/comparar/comercios/verificacion/12',{method:'POST',redirect:'manual',headers:{Cookie:cookie+'; rl_compare_csrf='+c,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf}).toString()});
  assert.equal(out.status,303);
  assert.equal(out.headers.get('location'),'/comparar/comercios/mi-panel');
  assert.equal(queries.filter(x=>x.sql.startsWith('UPDATE marketplace_professional_stores SET verification_token=')).length,1);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=original;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('no permite crear pruebas de titularidad en tiendas ajenas, inexistentes o no pendientes',async()=>{
 const original=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3427-tests';
 db.query=async(sql,args=[])=>{
  if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:93,username:'vendedor',status:'active',is_admin:false,auth_token_version:0}]};
  if(sql.startsWith('UPDATE marketplace_professional_stores SET verification_token='))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const v=app.listen(0,'127.0.0.1',()=>resolve(v));});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const get=await fetch(base+'/comparar/comercios');const token=(await get.text()).match(/name="_csrf" value="([a-f0-9]{48})"/)[1];
  const csrf=get.headers.get('set-cookie').match(/rl_compare_csrf=([a-f0-9]{48})/)[1];
  const auth='aura_token='+jwt.sign({id:93,authVersion:0},process.env.JWT_SECRET);
  const result=await fetch(base+'/comparar/comercios/verificacion/17',{method:'POST',headers:{Cookie:auth+'; rl_compare_csrf='+csrf,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token}).toString()});
  assert.equal(result.status,404);
 }finally{await new Promise(resolve=>server.close(resolve));db.query=original;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
