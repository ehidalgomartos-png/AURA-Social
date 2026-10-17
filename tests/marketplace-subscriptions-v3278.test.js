'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const path=require('node:path');
const db=require('../src/db');
const {effectiveAccount,planView,DDL}=require('../src/services/marketplace-subscriptions-v3278');
const {router}=require('../src/routes/marketplace-subscriptions-v3278');
const seo=require('../src/routes/marketplace-seo-v3251').router;

test('existing approved store remains pilot without subscription or expiry; particular remains free',()=>{
 const pilot=effectiveAccount(null,[{status:'approved'}]);
 assert.deepEqual(pilot,{planCode:'professional',status:'pilot',periodStartsAt:null,periodEndsAt:null,cancelAtPeriodEnd:false,grandfathered:true});
 const free=effectiveAccount(null,[{status:'draft'}]);
 assert.equal(free.planCode,'particular');assert.equal(free.status,'free');
 const active=effectiveAccount({plan_code:'professional_plus',status:'active',period_starts_at:null,period_ends_at:null,cancel_at_period_end:false},[{status:'approved'}]);
 assert.equal(active.planCode,'professional_plus');assert.equal(active.grandfathered,false);
});
test('schema is additive, draft paid plans do not activate billing and no existing listings are updated',()=>{
 const text=DDL.join('\n');
 assert.match(text,/CREATE TABLE IF NOT EXISTS marketplace_subscription_plans/);
 assert.match(text,/CREATE TABLE IF NOT EXISTS marketplace_seller_subscriptions/);
 assert.match(text,/CREATE TABLE IF NOT EXISTS marketplace_subscription_audit/);
 assert.match(text,/ON CONFLICT \(code\) DO NOTHING/);
 assert.match(text,/\('professional','Profesional',NULL,'draft',false/);
 assert.doesNotMatch(text,/DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE marketplace_listings|UPDATE marketplace_professional_stores/i);
 const view=planView({code:'professional',name:'Profesional',monthly_price_cents:null,currency:'EUR',pricing_state:'draft',available:false,store_limit:1,product_limit:null});
 assert.equal(view.monthlyPriceCents,null);assert.equal(view.available,false);
 const rt=fs.readFileSync(require.resolve('../src/routes/marketplace-subscriptions-v3278'),'utf8');
 assert.doesNotMatch(rt,/router\.(post|put|patch|delete)\(/);
 assert.match(rt,/entitlementsEnforced:false/);
});
test('vendor UI is private, mobile-first and isolated from admin WooCommerce controls',()=>{
 const seoText=fs.readFileSync(require.resolve('../src/routes/marketplace-seo-v3251'),'utf8');
 const marketplace=fs.readFileSync(require.resolve('../src/routes/marketplace-v3250'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'..','public','marketplace-v3250.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','src','views','marketplace-subscriptions-v3278.html'),'utf8');
 assert.match(seoText,/router\.get\('\/marketplace\/mi-tienda',requireAuth/);
 assert.match(marketplace,/router\.use\('\/subscriptions'/);
 assert.match(client,/href='\/marketplace\/mi-tienda'/);
 assert.match(html,/viewport-fit=cover/);assert.match(html,/noindex,nofollow/);
 assert.equal(fs.existsSync(path.join(__dirname,'..','public','marketplace-subscriptions-v3278.html')),false);
 assert.match(fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8'),/router\.use\(requireAdmin\)/);
});
test('seller API enforces authentication, owner scoping and admin separation',async()=>{
 const prior=process.env.JWT_SECRET;const saved=db.query;
 process.env.JWT_SECRET='tests-only-v3278';
 const queried=[];
 db.query=async(sql,args=[])=>{
  const text=String(sql);queried.push({text,args});
  if(/FROM users\s+WHERE id=\$1/.test(text)){
   const id=Number(args[0]);return {rowCount:1,rows:[{id,username:id===1?'admin':id===2?'mundotaza':'other',is_admin:id===1,status:'active',auth_token_version:0,age_verified:true,show_sensitive:false}]};
  }
  if(/SELECT username FROM users WHERE id=\$1/.test(text)){
   return {rowCount:1,rows:[{username:Number(args[0])===2?'mundotaza':'other'}]};
  }
  if(/SELECT id,name,platform,store_url,status,purchase_enabled FROM marketplace_professional_stores WHERE seller_id=\$1/.test(text)){
   const id=Number(args[0]);
   const rows=id===2?[{id:8,name:'MundoTaza',platform:'woocommerce',store_url:'https://mundotaza.com/',status:'approved',purchase_enabled:true}]:[];
   return {rowCount:rows.length,rows};
  }
  if(/FROM marketplace_seller_subscriptions WHERE seller_id=\$1/.test(text))return {rowCount:0,rows:[]};
  if(/SELECT code,name,monthly_price_cents,currency,pricing_state,available,store_limit,product_limit/.test(text))return {rowCount:1,rows:[{code:'particular',name:'Particular',monthly_price_cents:0,currency:'EUR',pricing_state:'approved',available:true,store_limit:null,product_limit:null}]};
  if(/SELECT u\.id AS seller_id/.test(text))return {rowCount:1,rows:[{seller_id:2,username:'mundotaza',plan_code:null,subscription_status:null,period_ends_at:null,store_count:1,approved_count:1}]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.json(),cookieParser());
 app.use('/api/marketplace/subscriptions',require('../src/middleware/auth').requireAuth,router);
 app.use(seo);app.use(express.static(path.join(__dirname,'..','public')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const headers=id=>({authorization:'Bearer '+jwt.sign({id,authVersion:0},process.env.JWT_SECRET)});
 const call=async(u,id,method='GET')=>{
  const resp=await fetch(base+u,{method,headers:id?headers(id):{},redirect:'manual'});
  return {status:resp.status,body:await resp.text(),cache:resp.headers.get('cache-control')};
 };
 try{
  assert.equal((await call('/marketplace/mi-tienda')).status,401);
  assert.equal((await call('/api/marketplace/subscriptions/mine')).status,401);
  const page=await call('/marketplace/mi-tienda',2);
  assert.equal(page.status,200);assert.match(page.cache,/no-store/);
  const owned=await call('/api/marketplace/subscriptions/mine',2);
  assert.equal(owned.status,200);assert.match(owned.cache,/no-store/);
  const parsed=JSON.parse(owned.body);
  assert.equal(parsed.account.status,'pilot');assert.equal(parsed.stores[0].name,'MundoTaza');
  assert.equal(parsed.billingEnabled,false);assert.equal(parsed.entitlementsEnforced,false);
  const other=JSON.parse((await call('/api/marketplace/subscriptions/mine?sellerId=2',3)).body);
  assert.equal(other.account.status,'free');assert.deepEqual(other.stores,[]);
  assert.equal((await call('/api/marketplace/subscriptions/admin/overview',2)).status,403);
  assert.equal((await call('/api/marketplace/subscriptions/admin/overview',1)).status,200);
  assert.equal((await call('/api/marketplace/subscriptions/mine',2,'POST')).status,404);
  assert.ok(queried.some(q=>/FROM marketplace_professional_stores WHERE seller_id=\$1/.test(q.text)&&q.args[0]===3));
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=saved;
  if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;
 }
});
