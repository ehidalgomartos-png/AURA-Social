'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {sellerProgress}=require('../src/services/marketplace-comparador-merchant-guide-v3425');
const {router}=require('../src/routes/marketplace-comparador-v32132');

test('el siguiente paso procede del estado real de aprobación y catálogo',()=>{
 const pending=sellerProgress({status:'pending',platform:'woocommerce',linked_count:0});
 assert.equal(pending.label,'Pendiente de revisión');
 assert.match(pending.next,/Todavía no se habilitan enlaces/);
 const empty=sellerProgress({status:'approved',platform:'woocommerce',linked_count:0,available_count:0});
 assert.match(empty.next,/desde Administración/);
 const noStock=sellerProgress({status:'approved',linked_count:3,available_count:0});
 assert.match(noStock.next,/ninguno con existencias aptas/);
 const ready=sellerProgress({status:'approved',linked_count:3,available_count:2,platform:'woocommerce',connected:true,sync_enabled:true});
 assert.equal(ready.available,2);
 assert.match(ready.next,/cuando coinciden exactamente/);
 assert.doesNotMatch(ready.next,/Sincronización automática está desactivada/);
 const stopped=sellerProgress({status:'suspended',linked_count:5,available_count:5});
 assert.match(stopped.next,/enlaces externos de compra permanecen deshabilitados/);
});
test('el formulario anónimo explica cómo iniciar sesión, sin revelar ni registrar tiendas',async()=>{
 const orig=db.query;
 let writes=0;
 db.query=async(sql)=>{if(/^INSERT/i.test(sql))writes++;return {rows:[],rowCount:0};};
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const resp=await fetch(base+'/comparar/comercios/solicitar',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:'name=Mi+Tienda&platform=woocommerce&storeUrl=https%3A%2F%2Fmitienda.es%2F'});
  assert.equal(resp.status,401);
  const html=await resp.text();
  assert.match(html,/Inicia sesión para continuar/);
  assert.match(html,/href="\/app"/);
  assert.match(html,/sigue siendo gratuita/);
  assert.equal(writes,0);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=orig;
 }
});
test('panel privado informa existencias sin exponer datos de otras tiendas ni credenciales',async()=>{
 const original=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3425-test-secret';
 const queries=[];
 try{
  db.query=async(sql,args=[])=>{
   queries.push({sql,args});
   if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{
    id:42,username:'comercio',is_admin:false,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false
   }]};
   if(sql.includes('COUNT(DISTINCT x.listing_id) FILTER'))return {rowCount:1,rows:[{
    id:19,name:'Mi tienda',platform:'woocommerce',status:'approved',store_url:'https://mitienda.es/',
    linked_count:17,available_count:13,connected:true,sync_enabled:false
   }]};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  try{
   const cookie='aura_token='+jwt.sign({id:42,authVersion:0},process.env.JWT_SECRET);
   const resp=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/comercios/mi-panel',{headers:{Cookie:cookie}});
   assert.equal(resp.status,200);
   assert.match(resp.headers.get('x-robots-tag'),/noindex/);
   const html=await resp.text();
   assert.match(html,/17 productos vinculados/);
   assert.match(html,/13 con existencias aptas/);
   assert.match(html,/sincronización automática está desactivada/i);
   assert.doesNotMatch(html,/consumerSecret|credentials_encrypted|stripe_checkout/i);
   const scoped=queries.find(q=>q.sql.includes('COUNT(DISTINCT x.listing_id) FILTER'));
   assert.ok(scoped);
   assert.match(scoped.sql,/WHERE s.seller_id=\$1/);
   assert.deepEqual(scoped.args,[42]);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
