'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const comparison=require('../src/routes/marketplace-comparador-v32132');

test('Google Shopping admite una respuesta de 23,29 segundos: timeout de 45 s, sin retry implícito',async()=>{
 const original=AbortSignal.timeout,configured={COMPARADOR_SERPAPI_KEY:'this-is-only-a-test-key'};
 const deadlines=[],urls=[];
 try{
  AbortSignal.timeout=function(ms){deadlines.push(ms);return original.call(AbortSignal,ms);};
  const offers=await provider.fetchOffers('auriculares wireless apple airpods pro',async(url,opts)=>{
   urls.push(url);
   assert.ok(opts.signal);
   assert.equal(opts.signal.aborted,false);
   return {ok:true,json:async()=>({shopping_results:[]})};
  },configured);
  assert.deepEqual(offers,[]);
  assert.equal(provider.GOOGLE_SHOPPING_TIMEOUT_MS,45000);
  assert.deepEqual(deadlines,[45000]);
  assert.equal(urls.length,1,'no se repite la petición al proveedor');
  const parsed=new URL(urls[0]);
  assert.equal(parsed.searchParams.get('engine'),'google_shopping');
  assert.equal(parsed.searchParams.get('q'),'auriculares wireless apple airpods pro');
 }finally{AbortSignal.timeout=original;}
});
test('Google Product mantiene límite separado de 12 segundos',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-provider-v32133.js'),'utf8');
 const direct=source.split('async function fetchDirectRetailer(')[1].split('function configured(')[0];
 const shopping=source.split('async function fetchOffers(')[1].split('module.exports=')[0];
 assert.match(direct,/AbortSignal\.timeout\(12000\)/);
 assert.match(shopping,/AbortSignal\.timeout\(GOOGLE_SHOPPING_TIMEOUT_MS\)/);
 assert.equal((shopping.match(/fetchFn\(/g)||[]).length,1);
});
test('solo el POST explícito permite reabrir un error reciente, nunca la visita GET',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;
 const seen=[];
 try{
  provider.configured=()=>true;
  db.query=async(sql,args=[])=>{
   if(sql.startsWith('INSERT INTO marketplace_compare_jobs'))seen.push({sql,args});
   return {rowCount:0,rows:[]};
  };
  assert.equal(await worker.enqueue({id:7,provider_status:'unavailable'},async()=>{}),false);
  assert.equal(await worker.enqueue({id:7,provider_status:'unavailable'},async()=>{},true),false);
  assert.equal(seen.length,2);
  assert.deepEqual(seen[0].args,['7',false]);
  assert.deepEqual(seen[1].args,['7',true]);
  assert.match(seen[0].sql,/OR \(\$2::boolean AND marketplace_compare_jobs\.finished_at<now\(\)-interval '2 minutes'/);
  assert.match(seen[0].sql,/q\.provider_status='unavailable'/);
  assert.match(seen[0].sql,/marketplace_compare_jobs\.finished_at<now\(\)-interval '2 hours'/);
  assert.match(seen[0].sql,/marketplace_compare_jobs\.status IN \('done','failed'\)/);
  assert.match(seen[0].sql,/failure_code=NULL/);
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});
test('la reconsulta manual conserva cupos 12 diarios y 220 mensuales',()=>{
 assert.deepEqual(provider.budget({}),{daily:12,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'999',COMPARADOR_MONTHLY_LIMIT:'999'}),{daily:50,monthly:220});
 const workerSource=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-worker-v32134.js'),'utf8');
 assert.match(workerSource,/if\(!await reserveQuota\(\)\)/);
 assert.match(workerSource,/timer=setInterval\(\(\)=>\{processOne\(\)/);
 assert.match(workerSource,/started_at<now\(\)-interval '2 minutes'/);
 assert.doesNotMatch(workerSource,/setTimeout\(\(\)=>enqueue/);
});
test('POST CSRF envía intención de reintento, GET no vuelve a consumir API',async()=>{
 const oldQuery=db.query,oldEnqueue=worker.enqueue,oldConfigured=provider.configured;
 const called=[],slug=comparison.slugFor('auriculares wireless apple airpods pro');
 db.query=async(sql)=>{
  if(sql.startsWith('INSERT INTO marketplace_compare_pages'))return {rowCount:1,rows:[{
   id:77,slug,query_text:'auriculares wireless apple airpods pro'
  }]};
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
   id:77,slug,query_text:'auriculares wireless apple airpods pro',provider_status:'unavailable',
   external_results:[],index_approved:false,seo_blocked:false,editorial_summary:''
  }]};
  return {rowCount:0,rows:[]};
 };
 provider.configured=()=>false;
 worker.enqueue=async(_page,_schema,manualRetry=false)=>{called.push(manualRetry);return false;};
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(comparison.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const home=await fetch(base+'/comparar');
  assert.equal(home.status,200);
  const html=await home.text(),cookie=home.headers.get('set-cookie').split(';')[0];
  const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
  assert.ok(token);
  const post=await fetch(base+'/comparar/buscar',{
   method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',cookie},
   body:new URLSearchParams({q:'auriculares wireless apple airpods pro',_csrf:token}).toString()
  });
  assert.equal(post.status,303);
  assert.equal(post.headers.get('location'),'/comparar/'+slug);
  const after=await fetch(base+'/comparar/'+slug,{headers:{cookie}});
  assert.equal(after.status,200);
  assert.deepEqual(called,[true,false]);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;worker.enqueue=oldEnqueue;provider.configured=oldConfigured;
 }
});
