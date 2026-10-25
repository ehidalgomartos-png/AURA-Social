'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const manual=require('../src/services/marketplace-comparador-manual-links-v32147');
const compare=require('../src/routes/marketplace-comparador-v32132');

const offer=(price=25900)=>({title:'iPhone 12 128 GB morado - Reacondicionado',shop:'Pixmania',
 condition:'Reacondicionado',price_cents:price,price_currency:'EUR',
 product_id:'123456789012345678',href:'https://www.google.com/shopping/product/123456789012345678'});
const pro={...offer(22500),title:'iPhone 12 Pro 128 GB dorado - Reacondicionado'};
const page=()=>({id:4,slug:compare.slugFor('iphone 12 128 GB'),query_text:'iphone 12 128 GB',
 external_results:[pro,offer()],provider_status:'ok',index_approved:false,seo_blocked:false,
 editorial_summary:'',created_at:new Date().toISOString(),last_checked_at:new Date().toISOString(),external_count:2});

test('identidad persiste al cambiar precio y distingue Pro, tienda y modelo',()=>{
 assert.equal(manual.identityKey(offer(25900)),manual.identityKey(offer(28900)));
 assert.notEqual(manual.identityKey(offer()),manual.identityKey(pro));
 assert.notEqual(manual.identityKey(offer()),manual.identityKey({...offer(),shop:'Otra tienda'}));
 assert.equal(manual.findOffer(page(),manual.identityKey(pro)),null);
 assert.equal(manual.findOffer(page(),manual.identityKey(offer())).title,offer().title);
});

test('acepta URL exacta HTTPS y rechaza dominios ajenos, privados o de Google',()=>{
 assert.equal(manual.merchantUrl('https://www.pixmania.com/es/iphone-12','Pixmania'),'https://www.pixmania.com/es/iphone-12');
 assert.equal(manual.merchantUrl('https://amazon.es/dp/B0001','Amazon.es'),'https://amazon.es/dp/B0001');
 for(const address of [
  'http://pixmania.com/iphone','https://pixmania.com.evil.com/item','https://notpixmania.com/item',
  'https://www.google.com/url?q=https%3A%2F%2Fpixmania.com%2Fitem',
  'https://user:password@pixmania.com/item','https://pixmania.com:9999/item',
  'https://127.0.0.1/item','https://pixmania.local/item','https://pixmania.com/',
  'https://pixmania.com/item#anchor','https://pixmania.com/item ',
  'https://bit.ly/redirect','javascript:alert(1)'
 ])assert.equal(manual.merchantUrl(address,'Pixmania'),null,'Enlace inseguro: '+address);
 assert.equal(manual.merchantUrl('https://pixmania.com/item','Otra tienda'),null);
});

test('la revisión manual vence a la caché Google y persiste con otra tarifa',()=>{
 const item=offer(),key=manual.identityKey(item),updated=offer(28900);
 assert.equal(provider.resolveOfferLink(item).destination,'shopping-search');
 manual.applyManualLinks(page(),[updated],[{offer_key:key,href:'https://pixmania.com/es/iphone-12'}]);
 assert.equal(updated.manual_link,true);
 assert.equal(provider.resolveOfferLink(updated).destination,'store');
 assert.equal(provider.resolveOfferLink(updated).href,'https://pixmania.com/es/iphone-12');
});

test('panel administrativo solo cuenta una oferta correspondiente al modelo base',()=>{
 const p=page(),key=manual.identityKey(offer()),cache=new Map([['4:'+key,{
  offer_key:key,href:'https://pixmania.com/es/iphone-12'
 }]]);
 const html=compare.seoAdminView([p],'c'.repeat(48),'todas',null,new Map(),cache);
 assert.match(html,/1 oferta coincidente/);
 assert.doesNotMatch(html,/2 ofertas guardadas/);
 assert.match(html,/Enlace revisado por administración/);
 assert.match(html,/Guardar enlace directo/);
 assert.match(html,/Quitar enlace manual/);
 assert.doesNotMatch(html,/iPhone 12 Pro 128 GB dorado/);
});

test('solo admin con CSRF y confirmación puede guardar y retirar enlace; persiste tras renovar precio',async()=>{
 const originalQuery=db.query,originalConfigured=provider.configured,oldSecret=process.env.JWT_SECRET;
 const slug=page().slug,key=manual.identityKey(offer()),stored=new Map(),writes=[];
 let productPrice=25900;
 try{
  process.env.JWT_SECRET='test-only-secret-for-comparator-admin-manual-links';
  provider.configured=()=>false;
  db.query=async(sql,args=[])=>{
   if(sql.includes('FROM users')&&sql.includes('WHERE id=$1'))
    return {rows:[{id:99,username:'admin',is_admin:true,status:'active',auth_token_version:0}],rowCount:1};
   if(sql.startsWith('SELECT id,query_text,external_results FROM marketplace_compare_pages WHERE id=$1'))
    return {rows:[{...page(),external_results:[pro,offer(productPrice)]}],rowCount:1};
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rows:[{...page(),external_results:[pro,offer(productPrice)]}],rowCount:1};
   if(sql.startsWith('SELECT offer_key,href FROM marketplace_compare_manual_links'))
    return {rows:[...stored].map(([offer_key,href])=>({offer_key,href})),rowCount:stored.size};
   if(sql.startsWith('INSERT INTO marketplace_compare_manual_links')){
    stored.set(args[1],args[2]);writes.push('save');return {rows:[],rowCount:1};
   }
   if(sql.startsWith('DELETE FROM marketplace_compare_manual_links')){
    stored.delete(args[1]);writes.push('remove');return {rows:[],rowCount:1};
   }
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const url=base+'/admin/comparador/4/enlace';
   const anonymous=await fetch(url,{method:'POST',redirect:'manual'});
   assert.equal(anonymous.status,401);
   const auth=jwt.sign({id:99,authVersion:0},process.env.JWT_SECRET);
   const publicResponse=await fetch(base+'/comparar/'+slug);
   const html=await publicResponse.text(),csrf=html.match(/name="_csrf" value="([a-f0-9]{48})"/)[1];
   const cookie='aura_token='+auth+'; rl_compare_csrf='+csrf;
   const send=data=>fetch(url,{method:'POST',redirect:'manual',headers:{
    cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
   assert.equal((await send({_csrf:'0'.repeat(48),offer_key:key,action:'save',confirmed:'yes',url:'https://pixmania.com/item'})).status,403);
   assert.equal((await send({_csrf:csrf,offer_key:key,action:'save',confirmed:'yes',url:'https://evil.com/item'})).status,400);
   assert.equal((await send({_csrf:csrf,offer_key:key,action:'save',url:'https://pixmania.com/item'})).status,400);
   assert.equal((await send({_csrf:csrf,offer_key:manual.identityKey(pro),action:'save',confirmed:'yes',url:'https://pixmania.com/pro'})).status,404);
   assert.equal(stored.size,0);
   const save=await send({_csrf:csrf,offer_key:key,action:'save',confirmed:'yes',url:'https://pixmania.com/es/iphone-12-128gb'});
   assert.equal(save.status,303);
   assert.match(save.headers.get('location'),/enlace=guardado/);
   assert.deepEqual(writes,['save']);
   let pageHtml=await (await fetch(base+'/comparar/'+slug)).text();
   assert.match(pageHtml,/Ver oferta en tienda/);
   assert.match(pageHtml,/Enlace revisado por administración/);
   productPrice=28900;
   pageHtml=await (await fetch(base+'/comparar/'+slug)).text();
   assert.match(pageHtml,/289,00/);
   assert.match(pageHtml,/https:\/\/pixmania.com\/es\/iphone-12-128gb/);
   const remove=await send({_csrf:csrf,offer_key:key,action:'remove'});
   assert.equal(remove.status,303);
   assert.deepEqual(writes,['save','remove']);
   pageHtml=await (await fetch(base+'/comparar/'+slug)).text();
   assert.doesNotMatch(pageHtml,/Enlace revisado por administración/);
   assert.match(pageHtml,/Buscar en Google/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  db.query=originalQuery;provider.configured=originalConfigured;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
