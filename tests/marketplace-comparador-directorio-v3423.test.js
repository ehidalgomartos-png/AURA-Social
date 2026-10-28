'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
test('directorio gratis enumera solo destinos de tienda seguros y no promete patrocinio',async()=>{
 const orig=db.query,sqls=[];
 try{
  db.query=async(sql,args=[])=>{
   sqls.push(sql);
   if(sql.startsWith('SELECT s.name,s.store_url,COUNT(DISTINCT x.listing_id)'))return {rowCount:3,rows:[
    {name:'Tienda A',store_url:'https://tienda-a.es/',products:25},
    {name:'Tienda <B>',store_url:'https://tienda-b.es/',products:2},
    {name:'Engaño',store_url:'http://127.0.0.1/',products:10}
   ]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const rsp=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/comercios/tiendas');
   const html=await rsp.text();
   assert.equal(rsp.status,200);
   assert.match(html,/Tiendas participantes/);
   assert.match(html,/Tienda A/);
   assert.match(html,/Tienda &lt;B&gt;/);
   assert.match(html,/https:\/\/tienda-a\.es\//);
   assert.doesNotMatch(html,/http:\/\/127\.0\.0\.1/);
   assert.match(html,/Solicitar aparecer gratis/);
   assert.doesNotMatch(html,/Patrocinado|Suscribirse|Pagar una cuota/);
   assert.match(html,/name="robots" content="noindex,follow"/,'menos de tres tiendas indexables');
   assert.ok(sqls.some(s=>s.includes("s.status='approved'")));
   assert.ok(sqls.some(s=>s.includes("x.stock_status='in_stock'")));
   assert.ok(sqls.some(s=>s.includes("u.discoverable=true")));
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=orig;}
});
test('directorio móvil independiente sin mezclar tiendas destacadas con precios',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/cmp-commerce-directory/);
 assert.match(css,/@media\(max-width:600px\)\{\.cmp-commerce-directory/);
});
