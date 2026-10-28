'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const {normalizeStoreUrl}=require('../src/services/marketplace-professional-v3276');

test('rechaza dominios sin HTTPS, credenciales y hosts privados',()=>{
 for(const value of ['http://tienda.es/','https://127.0.0.1/','https://usuario:clave@tienda.es/','https://localhost/'])
  assert.equal(normalizeStoreUrl(value),null);
 assert.equal(normalizeStoreUrl('https://www.tienda.es/'),'https://www.tienda.es/');
});
test('landing de comercio es gratuita y formulario usa token CSRF, sin checkout',async()=>{
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/comparar/comercios');
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/sin cuota, sin comisiones/);
  assert.match(html,/name="_csrf"/);
  assert.match(html,/action="\/comparar\/comercios\/solicitar"/);
  assert.match(html,/Solicitar incorporación gratuita/);
  assert.match(html,/Entrar o crear cuenta/);
  const noLogin=await fetch(base+'/comparar/comercios/solicitar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'name=Ejemplo&platform=woocommerce&storeUrl=https%3A%2F%2Fejemplo.es%2F'});
  assert.equal(noLogin.status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('usuario autenticado solicita su propia tienda, siempre pendiente, sin cobros',async()=>{
 const savedQuery=db.query,savedSecret=process.env.JWT_SECRET;
 const calls=[];process.env.JWT_SECRET='test-local-merchant-validation-secret';
 try{
  db.query=async(sql,args=[])=>{
   calls.push({sql,args});
   if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{id:517,username:'comerciante',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
   if(sql.startsWith('INSERT INTO marketplace_professional_stores'))return {rowCount:1,rows:[{id:70}]};
   return {rowCount:0,rows:[]};
  };
  const cookie='aura_token='+jwt.sign({id:517,authVersion:0},process.env.JWT_SECRET);
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const get=await fetch(base+'/comparar/comercios');
   const html=await get.text();
   const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
   const csrf=get.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
   assert.ok(token&&csrf);
   const form=new URLSearchParams({name:'Tienda Ejemplo',storeUrl:'https://ejemplo.es/',platform:'woocommerce',_csrf:token});
   const post=await fetch(base+'/comparar/comercios/solicitar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie+'; rl_compare_csrf='+csrf},body:form.toString()});
   assert.equal(post.status,201);
   assert.match(await post.text(),/Solicitud registrada/);
   const insert=calls.find(x=>x.sql.startsWith('INSERT INTO marketplace_professional_stores'));
   assert.ok(insert);
   assert.match(insert.sql,/pending',false/);
   assert.deepEqual(insert.args,[517,'Tienda Ejemplo','woocommerce','https://ejemplo.es/']);
   assert.doesNotMatch(insert.sql,/stripe|subscription|payment|checkout/i);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=savedQuery;if(savedSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=savedSecret;}
});
