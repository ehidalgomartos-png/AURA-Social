'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {suspectedDuplicateLinks}=require('../src/services/marketplace-comparador-catalog-diagnostics-v3429');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const sample=(listing_id,product_url)=>({listing_id,product_url,title:'Producto '+listing_id,
 kind:'product',deal:'sale',listing_status:'active',moderation_status:'published',
 store_status:'approved',purchase_enabled:true,stock_status:'in_stock',source:'manual',
 last_checked_at:new Date().toISOString(),store_url:'https://tienda.es/'});
test('detecta enlaces idénticos sin eliminar variantes o contar anuncios repetidos',()=>{
 const data=[sample(1,'https://tienda.es/producto/taza/'),
 sample(2,'https://tienda.es/producto/taza'),
 sample(3,'https://tienda.es/producto/taza?color=rojo'),
 sample(1,'https://tienda.es/producto/taza/')];
 const out=suspectedDuplicateLinks(data);
 assert.equal(out.groups,1);
 assert.equal(out.items,2);
 assert.deepEqual([...out.listingIds].sort(),['1','2']);
 assert.equal(data.length,4);
});
test('descarta URLs no HTTPS, sin identificador, y variantes con consulta distinta',()=>{
 const out=suspectedDuplicateLinks([sample(1,'http://tienda.es/taza'),
 sample(2,'https://tienda.es/taza?color=negro'),
 sample(3,'https://tienda.es/taza?color=blanco'),
 sample(null,'https://tienda.es/taza')]);
 assert.equal(out.groups,0);
 assert.equal(out.items,0);
});
test('solo el propietario ve el aviso privado de posibles duplicados; sin escrituras',async()=>{
 const prior=db.query,secret=process.env.JWT_SECRET,sql=[];
 process.env.JWT_SECRET='catalog-diagnostic-duplicate-test';
 try{
  db.query=async(query,args=[])=>{
   sql.push(query);
   if(/FROM users\s+WHERE id=\$1/.test(query))return {rowCount:1,rows:[{id:Number(args[0]),username:'seller',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
   if(query.startsWith('SELECT id,name,store_url,status,purchase_enabled FROM marketplace_professional_stores WHERE id=$1 AND seller_id=$2'))
    return Number(args[1])===55?{rowCount:1,rows:[{id:9,name:'Tienda',store_url:'https://tienda.es/',status:'approved',purchase_enabled:true}]}:{rowCount:0,rows:[]};
   if(query.startsWith('SELECT x.listing_id,l.title,l.kind,l.deal,l.status AS listing_status'))
    return {rowCount:2,rows:[sample(11,'https://tienda.es/taza/'),sample(12,'https://tienda.es/taza')]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const cookie=id=>'aura_token='+jwt.sign({id,authVersion:0},process.env.JWT_SECRET);
   assert.equal((await fetch(base+'/comparar/comercios/productos/9')).status,401);
   assert.equal((await fetch(base+'/comparar/comercios/productos/9',{headers:{Cookie:cookie(77)}})).status,404);
   const response=await fetch(base+'/comparar/comercios/productos/9',{headers:{Cookie:cookie(55)}});
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/2 anuncios comparten enlaces de compra en 1 grupo/);
   assert.match(html,/Posible duplicado/);
   assert.match(response.headers.get('x-robots-tag'),/noindex/);
   assert.equal(sql.filter(s=>/^INSERT|^UPDATE|^DELETE/i.test(s)).length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=prior;if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;}
});
