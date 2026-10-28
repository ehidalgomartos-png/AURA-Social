'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const cookieParser=require('cookie-parser');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');
const query='iphone 12 128 GB',slug=compare.slugFor(query);
const item={title:'Apple iPhone 12 128gb Negro',shop:'rebuy.es',price_cents:16799,
 price_currency:'EUR',condition:'Reacondicionado',internal:false,
 product_id:'123456789012345678',href:'https://www.google.com/search?q=iphone+12+rebuy',
 image:'https://images1.gstatic.com/iphone-12.png'};
const hash=crypto.createHash('sha256').update([item.product_id,item.shop,item.title,
 String(item.price_cents)].join('|')).digest('hex');
const original={query:db.query,configured:provider.configured,
 lookup:provider.fetchDirectRetailer,quota:worker.quotaStatus,
 reserve:worker.reserveQuota,enqueue:worker.enqueue};
function cleanup(){
 db.query=original.query;provider.configured=original.configured;
 provider.fetchDirectRetailer=original.lookup;worker.quotaStatus=original.quota;
 worker.reserveQuota=original.reserve;worker.enqueue=original.enqueue;
}
async function setup({verifiedHref=null}={}){
 let status=null,href=null,calls=0,credits=0;
 const current=()=>({rowCount:status?1:0,rows:status?[{status,href,offer_key:hash}]:[]});
 provider.configured=()=>true;worker.enqueue=async()=>false;
 worker.quotaStatus=async()=>({available:true});worker.reserveQuota=async()=>{credits++;return true;};
 provider.fetchDirectRetailer=async()=>{calls++;return verifiedHref?{href:verifiedHref}:null;};
 db.query=async(sql)=>{
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {
   rowCount:1,rows:[{id:78,slug,query_text:query,provider_status:'ok',
    index_approved:false,seo_blocked:false,last_checked_at:new Date().toISOString(),
    created_at:new Date().toISOString(),editorial_summary:'',external_results:[item]}]};
  if(sql.startsWith('SELECT slug,external_results FROM marketplace_compare_pages'))
   return {rowCount:1,rows:[{slug,external_results:[item]}]};
  if(sql.startsWith('SELECT offer_key,href,status FROM marketplace_compare_merchant_links'))return current();
  if(sql.startsWith('SELECT status,href FROM marketplace_compare_merchant_links'))return current();
  if(sql.startsWith('INSERT INTO marketplace_compare_merchant_links')){
   status='checking';href=null;return {rowCount:1,rows:[{offer_key:hash}]};
  }
  if(sql.startsWith('UPDATE marketplace_compare_merchant_links SET status=$2')){
   const args=arguments[1]; // not required by this mock: use capture below instead
   return {rowCount:1,rows:[]};
  }
  return {rowCount:0,rows:[]};
 };
 // Capture the status of the link update as the actual handler sees it.
 const q=db.query;
 db.query=async(sql,args=[])=>{
  if(sql.startsWith('UPDATE marketplace_compare_merchant_links SET status=$2')){
   status=args[1];href=args[2];return {rowCount:1,rows:[]};
  }
  return q(sql,args);
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/comparar/'+slug);
 const html=await r.text();
 assert.equal(r.status,200);
 const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
 const cookie=r.headers.get('set-cookie')?.split(';')[0];
 assert.ok(token&&cookie);
 return {base,server,token,cookie,html,
  get calls(){return calls;},get credits(){return credits;}};
}
async function post(ctx,ajax=true){
 return fetch(ctx.base+'/comparar/tienda/'+slug+'/'+hash,{
  method:'POST',redirect:'manual',
  headers:{cookie:ctx.cookie,'content-type':'application/x-www-form-urlencoded',
   ...(ajax?{'X-Requested-With':'XMLHttpRequest',Accept:'application/json'}:{})},
  body:new URLSearchParams({_csrf:ctx.token}).toString()
 });
}
test('rebuy sin URL verificada: aviso JSON in situ, Google visible y no repetir crédito',async()=>{
 let ctx;
 try{
  ctx=await setup();
  assert.match(ctx.html,/Consultar enlace de la tienda/);
  assert.match(ctx.html,/Buscar en Google/);
  const r=await post(ctx);
  assert.equal(r.status,200);
  const result=await r.json();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'unavailable');
  assert.match(result.message,/No se ha encontrado una página/);
  assert.equal(ctx.calls,1);
  assert.equal(ctx.credits,1);
  const again=await post(ctx);
  assert.equal((await again.json()).ok,false);
  assert.equal(ctx.calls,1,'no repetir SerpApi durante cache negativa');
  assert.equal(ctx.credits,1);
  const refresh=await (await fetch(ctx.base+'/comparar/'+slug)).text();
  assert.match(refresh,/Enlace directo de esta oferta|No se ha confirmado un enlace directo de esta oferta/);
  assert.doesNotMatch(refresh,/Consultar enlace de la tienda/);
  assert.match(refresh,/Buscar en Google/);
  assert.match(refresh,new RegExp('id="oferta-'+hash+'"'));
  const classic=await post(ctx,false);
  assert.equal(classic.status,303);
  assert.equal(classic.headers.get('location'),
   '/comparar/'+slug+'?enlace=sin-verificar#precios-y-tiendas');
 }finally{
  if(ctx)await new Promise(resolve=>ctx.server.close(resolve));
  cleanup();
 }
});
test('enlace verificado: respuesta JSON de éxito y caché reutilizable',async()=>{
 let ctx;
 const href='https://www.rebuy.es/i/iphone-12-128-gb';
 try{
  ctx=await setup({verifiedHref:href});
  const found=await post(ctx);
  assert.equal(found.status,200);
  assert.deepEqual(await found.json(),{ok:true,href});
  const again=await post(ctx);
  assert.deepEqual(await again.json(),{ok:true,href});
  assert.equal(ctx.calls,1);
  assert.equal(ctx.credits,1);
  const html=await (await fetch(ctx.base+'/comparar/'+slug)).text();
  assert.match(html,/Ver oferta en tienda/);
  assert.match(html,/rebuy\.es\/i\/iphone-12-128-gb/);
  assert.doesNotMatch(html,/Consultar enlace de la tienda/);
 }finally{
  if(ctx)await new Promise(resolve=>ctx.server.close(resolve));
  cleanup();
 }
});
test('frontend conserva navegación sin JS y trata AJAX sin recargar ni seguir URLs inseguras',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(js,/form\.offer-lookup/);
 assert.match(js,/event\.preventDefault\(\)/);
 assert.match(js,/X-Requested-With/);
 assert.match(js,/window\.location\.assign/);
 assert.match(js,/url\.protocol!=='https:'/);
 assert.match(js,/form\.replaceWith\(p\)/);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/\.offer-lookup-feedback/);
 assert.match(css,/@media\(max-width:760px\)/);
});
