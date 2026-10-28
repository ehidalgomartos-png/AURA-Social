'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
async function appTest(callback){
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{await callback('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('landing clarifica plataformas y dirige al panel existente sin solicitar secretos',async()=>{
 await appTest(async base=>{
  const r=await fetch(base+'/comparar/comercios');const html=await r.text();
  assert.equal(r.status,200);
  assert.match(html,/otras plataformas se revisan individualmente/);
  assert.match(html,/acceso de solo lectura/);
  assert.match(html,/Consulta el estado desde tu panel/);
  assert.match(html,/href="\/comparar\/comercios\/mi-panel"/);
  assert.match(html,/name="_csrf"/);
  assert.doesNotMatch(html,/name="(?:api_key|consumer_secret|password)"/);
 });
});
test('respuesta de alta ya existente conduce al panel, sin cobro ni nueva tienda',async()=>{
 const original=db.query,secret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='test-merchant-onboarding-secret';
 try{
  db.query=async(sql,args=[])=>{
   if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{id:91,username:'comercio',status:'active',is_admin:false,auth_token_version:0,age_verified:true,show_sensitive:false}]};
   if(sql.startsWith('INSERT INTO marketplace_professional_stores'))return {rowCount:0,rows:[]};
   return {rowCount:0,rows:[]};
  };
  await appTest(async base=>{
   const get=await fetch(base+'/comparar/comercios'),html=await get.text();
   const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
   const csrf=get.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
   assert.ok(token&&csrf);
   const auth=jwt.sign({id:91,authVersion:0},process.env.JWT_SECRET);
   const data=new URLSearchParams({_csrf:token,name:'Tienda duplicada',platform:'woocommerce',storeUrl:'https://tienda.es/'});
   const res=await fetch(base+'/comparar/comercios/solicitar',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':'aura_token='+auth+'; rl_compare_csrf='+csrf},
    body:data.toString()});
   assert.equal(res.status,409);
   const out=await res.text();
   assert.match(out,/Esta tienda ya está registrada/);
   assert.match(out,/Ver mis tiendas/);
   assert.match(out,/servicio sigue siendo gratuito/);
   assert.doesNotMatch(out,/Stripe Checkout|introduce tu tarjeta/i);
  });
 }finally{db.query=original;if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;}
});
