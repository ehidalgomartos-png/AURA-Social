'use strict';
// Regression: professional store admin screen is global, not restricted to admin-owned shops.
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const fs=require('node:fs');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');

test('admin sees another seller shop, can inspect Woo connection, and public users cannot',async()=>{
 const previousSecret=process.env.JWT_SECRET,previousQuery=db.query;
 process.env.JWT_SECRET='v32774-fixture-server-only';
 const seen=[];
 db.query=async(sql,args=[])=>{
  const q=String(sql);seen.push({q,args});
  if(/FROM users\s+WHERE id=\$1/.test(q)){
   const id=Number(args[0]);
   return {rowCount:1,rows:[{id,username:id===1?'administrator':'mundotaza',
    is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(q.includes('FROM marketplace_professional_stores s JOIN users u')){
   return {rowCount:1,rows:[{id:5,seller_id:7,name:'MundoTaza',platform:'woocommerce',
     store_url:'https://mundotaza.com/',status:'pending',purchase_enabled:false,username:'mundotaza'}]};
  }
  if(q.includes('FROM marketplace_professional_stores s LEFT JOIN marketplace_woocommerce_connections c')){
   // Store belongs to seller 7, while current admin is 1.
   if(String(args[0])!=='5'||args[1]!==null)return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{id:5,seller_id:7,store_url:'https://mundotaza.com/',
    status:'pending',platform:'woocommerce',credentials_encrypted:null,sync_enabled:false,
    last_sync_at:null,last_error:null}]};
  }
  if(q.includes('FROM marketplace_external_products x JOIN marketplace_professional_stores s')&&q.includes('JOIN users u')){
   return {rowCount:1,rows:[{listing_id:20,store_id:5,product_url:'https://mundotaza.com/producto/taza/',
     title:'Taza de prueba',source:'manual',stock_status:'unknown',seller_username:'mundotaza'}]};
  }
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/marketplace',marketplace);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const host='http://127.0.0.1:'+server.address().port;
 const token=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const get=async(uri,header={})=>{
  const r=await fetch(host+uri,{headers:header});
  return {status:r.status,body:await r.json()};
 };
 try{
  const admin=token(1),member=token(7);
  assert.equal((await get('/api/marketplace/professional/admin/stores')).status,401);
  assert.equal((await get('/api/marketplace/professional/admin/stores',member)).status,403);
  assert.equal((await get('/api/marketplace/professional/woocommerce/stores/5/status',member)).status,403);
  const oldMine=await get('/api/marketplace/professional/mine',admin);
  assert.deepEqual(oldMine.body.stores,[],'old seller-filtered view was empty');
  const all=await get('/api/marketplace/professional/admin/stores',admin);
  assert.equal(all.status,200);
  assert.equal(all.body.stores[0].username,'mundotaza');
  assert.equal(all.body.stores[0].store_url,'https://mundotaza.com/');
  const woo=await get('/api/marketplace/professional/woocommerce/stores/5/status',admin);
  assert.equal(woo.status,200);
  assert.equal(woo.body.connected,false);
  assert.equal(woo.body.storeId,5);
  const links=await get('/api/marketplace/professional/admin/products',admin);
  assert.equal(links.status,200);
  assert.equal(links.body.items[0].seller_username,'mundotaza');
  assert.equal(seen.some(x=>x.q.includes('marketplace_woocommerce_connections c')&&x.args[1]===null),true);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=previousQuery;
  if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
 }
});
test('admin frontend shows every shop and owner; duplicate registration reloads instead of losing records',()=>{
 const js=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-professional-v3276.html','utf8');
 const routes=fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8');
 const woo=fs.readFileSync('src/routes/marketplace-woocommerce-v3277.js','utf8');
 const sync=fs.readFileSync('src/services/marketplace-woocommerce-sync-v3277.js','utf8');
 assert.match(js,/api\('\/api\/marketplace\/professional\/admin\/stores'\)/);
 assert.match(js,/Propietario de la tienda/);
 assert.match(js,/r\.error==='store_already_registered'/);
 assert.match(js,/await load\(\);say\('Esta tienda ya estaba registrada/);
 assert.match(js,/api\('\/api\/marketplace\/professional\/admin\/products'\)/);
 assert.match(routes,/router\.use\(requireAdmin\)/);
 assert.match(routes,/router\.get\('\/admin\/products'/);
 assert.match(woo,/loadConnection\(req\.params\.id,null\)/);
 assert.match(sync,/\(\$2::bigint IS NULL OR s\.seller_id=\$2\)/);
 assert.match(html,/2\. Todas las tiendas/);
 assert.match(html,/marketplace-professional-v3276\.js\?v=3\.4\.2\.7/);
 assert.doesNotMatch(routes,/credentials_encrypted AS/);
});
