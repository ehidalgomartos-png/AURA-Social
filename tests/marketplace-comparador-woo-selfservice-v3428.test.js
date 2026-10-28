'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
test('WooCommerce solo permite al dueño de una tienda aprobada abrir formulario de lectura',async()=>{
 const savedQuery=db.query,oldSecret=process.env.JWT_SECRET,seen=[];
 process.env.JWT_SECRET='v3428-test-merchant-woo';
 try{
  db.query=async(sql,args=[])=>{
   seen.push({sql,args});
   if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:Number(args[0]),username:'comercio',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
   if(sql.includes("(c.credentials_encrypted IS NOT NULL) AS connected"))return Number(args[1])===77?
    {rowCount:1,rows:[{id:9,name:'Tienda de prueba',store_url:'https://tienda.es/',status:'approved',platform:'woocommerce',connected:false}]}:
    {rowCount:0,rows:[]};
   if(sql.includes("WHERE id=$1 AND seller_id=$2 AND status='approved' AND platform='woocommerce'"))
    return {rowCount:0,rows:[]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const cookie=id=>'aura_token='+jwt.sign({id,authVersion:0},process.env.JWT_SECRET);
   assert.equal((await fetch(base+'/comparar/comercios/woocommerce/9')).status,401);
   const other=await fetch(base+'/comparar/comercios/woocommerce/9',{headers:{Cookie:cookie(81)}});
   assert.equal(other.status,404);
   const mine=await fetch(base+'/comparar/comercios/woocommerce/9',{headers:{Cookie:cookie(77)}});
   assert.equal(mine.status,200);
   const html=await mine.text();
   assert.match(html,/Conectar WooCommerce/);
   assert.match(html,/solo lectura/);
   assert.match(html,/name="_csrf"/);
   assert.match(html,/type="password" name="consumerKey"/);
   assert.match(html,/sincronización automática permanece desactivada/i);
   assert.doesNotMatch(html,/ck_[A-Za-z0-9]{25}|cs_[A-Za-z0-9]{25}/);
   const scoped=seen.find(x=>x.sql.includes("(c.credentials_encrypted IS NOT NULL) AS connected"));
   assert.ok(scoped);assert.match(scoped.sql,/s.seller_id=\$2 AND s.status='approved'/);
   const csrf=(html.match(/name="_csrf" value="([a-f0-9]{48})"/)||[])[1];
   const csrfCookie=mine.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
   const request=await fetch(base+'/comparar/comercios/woocommerce/9',{method:'POST',headers:{Cookie:cookie(77)+'; rl_compare_csrf='+csrfCookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,consumerKey:'clave_incorrecta',consumerSecret:'invalido'}).toString()});
   assert.equal(request.status,400);
   assert.equal(seen.some(x=>x.sql.startsWith('INSERT INTO marketplace_woocommerce_connections')),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=savedQuery;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
test('usuarios no aprobados no pueden guardar credenciales aun con token CSRF válido',async()=>{
 const savedQuery=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3428-tests-private';
 let writes=0;
 try{
  db.query=async(sql,args=[])=>{
   if(/FROM users\s+WHERE id=\$1/.test(sql))return {rowCount:1,rows:[{id:55,username:'vendedor',status:'active',is_admin:false,auth_token_version:0}]};
   if(sql.startsWith('INSERT INTO marketplace_woocommerce_connections'))writes++;
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const initial=await fetch(base+'/comparar/comercios');
   const token=(await initial.text()).match(/name="_csrf" value="([a-f0-9]{48})"/)[1];
   const csrf=initial.headers.get('set-cookie').match(/rl_compare_csrf=([a-f0-9]{48})/)[1];
   const cookie='aura_token='+jwt.sign({id:55,authVersion:0},process.env.JWT_SECRET);
   const response=await fetch(base+'/comparar/comercios/woocommerce/42',{method:'POST',headers:{Cookie:cookie+'; rl_compare_csrf='+csrf,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token,consumerKey:'ck_'+('a'.repeat(28)),consumerSecret:'cs_'+('b'.repeat(28))}).toString()});
   assert.equal(response.status,404);
   assert.equal(writes,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=savedQuery;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
