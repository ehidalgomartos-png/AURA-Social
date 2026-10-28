'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {diagnoseProduct,summary}=require('../src/services/marketplace-comparador-catalog-diagnostics-v3429');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const now=new Date().toISOString();
const good={listing_id:30,title:'Taza de prueba',kind:'product',deal:'sale',listing_status:'active',
 moderation_status:'published',store_status:'approved',purchase_enabled:true,
 stock_status:'in_stock',source:'manual',product_url:'https://tienda.es/producto/taza',
 store_url:'https://tienda.es/',last_checked_at:now};
test('diagnóstico distingue estado, stock, sincronización, enlaces y no falsea ventas',()=>{
 assert.equal(diagnoseProduct(good).state,'ready');
 assert.equal(diagnoseProduct({...good,store_status:'pending'}).state,'review');
 assert.equal(diagnoseProduct({...good,moderation_status:'hidden'}).state,'review');
 assert.equal(diagnoseProduct({...good,stock_status:'out_of_stock'}).state,'stock');
 assert.equal(diagnoseProduct({...good,stock_status:'unknown'}).state,'stock');
 assert.equal(diagnoseProduct({...good,source:'api',last_checked_at:'2020-01-01T00:00:00Z'}).state,'sync');
 assert.equal(diagnoseProduct({...good,product_url:'https://otro.es/producto/taza'}).state,'link');
 assert.deepEqual(summary([good,{...good,stock_status:'out_of_stock'},{...good,source:'api',last_checked_at:'2020-01-01T00:00:00Z'}]),
 {total:3,ready:1,needsReview:0,stock:1,sync:1,invalidLink:0});
});
test('solo el propietario ve su catálogo y no se modifican productos',async()=>{
 const savedQuery=db.query,savedSecret=process.env.JWT_SECRET,seen=[];
 process.env.JWT_SECRET='v3429-test-isolated';
 try{
  db.query=async(sql,args=[])=>{
   seen.push({sql,args});
   if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:Number(args[0]),username:'seller',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
   if(sql.startsWith('SELECT id,name,store_url,status,purchase_enabled FROM marketplace_professional_stores WHERE id=$1 AND seller_id=$2'))
    return Number(args[1])===55?{rowCount:1,rows:[{id:9,name:'Mi tienda',store_url:'https://tienda.es/',status:'approved',purchase_enabled:true}]}:{rowCount:0,rows:[]};
   if(sql.startsWith('SELECT x.listing_id,l.title,l.kind,l.deal,l.status AS listing_status'))return {rowCount:1,rows:[good]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const cookie=id=>'aura_token='+jwt.sign({id,authVersion:0},process.env.JWT_SECRET);
   assert.equal((await fetch(base+'/comparar/comercios/productos/9')).status,401);
   assert.equal((await fetch(base+'/comparar/comercios/productos/9',{headers:{Cookie:cookie(67)}})).status,404);
   const response=await fetch(base+'/comparar/comercios/productos/9',{headers:{Cookie:cookie(55)}});
   assert.equal(response.status,200);
   assert.match(response.headers.get('x-robots-tag'),/noindex/);
   const html=await response.text();
   assert.match(html,/Diagnóstico de productos/);
   assert.match(html,/1 disponibles/);
   assert.match(html,/Disponible para mostrar/);
   assert.doesNotMatch(html,/stripe|contraseña de tienda|consumerSecret/i);
   const scoped=seen.find(x=>x.sql.startsWith('SELECT x.listing_id,l.title,l.kind,l.deal,l.status AS listing_status'));
   assert.ok(scoped);assert.match(scoped.sql,/s.seller_id=\$2 AND x.seller_id=s.seller_id/);
   assert.equal(seen.filter(x=>/^INSERT|^UPDATE|^DELETE/i.test(x.sql)).length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=savedQuery;if(savedSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=savedSecret;}
});
