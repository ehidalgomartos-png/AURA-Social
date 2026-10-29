'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const failures=require('../src/services/marketplace-comparador-failures-v34572');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const env={COMPARADOR_SERPAPI_KEY:'valid-test-api-key-not-real'};
const response=payload=>async()=>({ok:true,json:async()=>payload});
test('SerpApi Success sin productos no es fallo: cero ofertas, sin precio inventado',async()=>{
 const empty=[
  {search_metadata:{status:'Success'},search_information:{shopping_results_state:'Fully empty'},error:"Google hasn't returned any results for this query."},
  {search_metadata:{status:'Success'},shopping_results:[],error:"Google hasn't returned any results for this query."},
  {search_metadata:{status:'Success'},shopping_results:[],inline_shopping_results:[]}
 ];
 for(const payload of empty)assert.deepEqual(await provider.fetchOffers('auriculares apple airpods pro',response(payload),env),[]);
 await assert.rejects(provider.fetchOffers('airpods pro',response({search_metadata:{status:'Error'},error:"We couldn't get valid results for this search."}),env),/provider_error/);
 await assert.rejects(provider.fetchOffers('airpods pro',response({}),env),/provider_missing_results/);
});
test('códigos del proveedor: no registrar mensajes arbitrarios, direcciones ni claves',async()=>{
 const errors=[
  ['Your API key is invalid.','provider_invalid_key'],
  ['Your searches per month limit reached.','provider_remote_quota'],
  ['Too many requests','provider_rate_limit']
 ];
 for(const [message,expected] of errors)
  await assert.rejects(provider.fetchOffers('apple airpods pro',response({search_metadata:{status:'Error'},error:message}),env),new RegExp(expected));
 for(const input of [
  {name:'TimeoutError',message:'Timeout after URL https://serpapi.com/search?api_key=SECRET'},
  {message:'provider_http_429'},{message:'provider_http_503'},
  {name:'TypeError',message:'fetch failed'},
  {message:'provider_missing_results'},
  {message:'provider_error'},
  {message:'very sensitive api_key=SECRET'}
 ]){
  const code=failures.category(input);
  assert.ok(failures.explain(code).label);
  assert.doesNotMatch(JSON.stringify(failures.explain(code)),/SECRET|serpapi\.com\/search|api_key/);
 }
 assert.equal(failures.category({name:'TimeoutError'}),'provider_timeout');
 assert.equal(failures.category({message:'provider_http_429'}),'provider_rate_limit');
 assert.equal(failures.category({message:'provider_http_503'}),'provider_http_5xx');
 assert.equal(failures.category({message:'provider_http_401'}),'provider_invalid_key');
 assert.equal(failures.category({message:'provider_http_402'}),'provider_remote_quota');
});
test('worker registra categoría sanitizada solo en errores, no aumenta llamadas ni presupuestos',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldFetch=provider.fetchOffers,oldConnect=db.pool.connect,oldBudget=provider.budget;
 const statements=[];
 try{
  provider.configured=()=>true;
  provider.budget=()=>({daily:2,monthly:2});
  provider.fetchOffers=async()=>{throw new Error('provider_http_503 https://serpapi.com?api_key=SECRET');};
  db.pool.connect=async()=>({query:async()=>({rowCount:1}),release(){}});
  db.query=async(sql,params=[])=>{
   statements.push([sql,params]);
   if(sql.startsWith("UPDATE marketplace_compare_jobs SET status='running'"))
    return {rowCount:1,rows:[{page_id:7,attempts:1}]};
   if(sql.startsWith('SELECT id,query_text,last_checked_at'))
    return {rowCount:1,rows:[{id:7,query_text:'apple airpods pro',last_checked_at:null,provider_status:'queued'}]};
   return {rowCount:1,rows:[]};
  };
  assert.equal(await worker.processOne(),true);
  const failure=statements.find(([sql])=>sql.includes('failure_code=$3'));
  assert.ok(failure);
  assert.deepEqual(failure[1],[7,'failed','provider_unknown']);
  assert.ok(statements.some(([sql])=>sql.startsWith("ALTER TABLE marketplace_compare_jobs ADD COLUMN IF NOT EXISTS failure_code")));
  assert.equal(statements.some(([sql,params])=>JSON.stringify([sql,params]).includes('SECRET')),false);
  assert.ok(!statements.some(([sql])=>sql.includes('https://serpapi.com/search.json?')));
 }finally{
  db.query=oldQuery;db.pool.connect=oldConnect;provider.configured=oldConfigured;provider.fetchOffers=oldFetch;provider.budget=oldBudget;
 }
});
test('diagnóstico privado del admin: filtra producto y evita fugas y consultas al proveedor',async()=>{
 const route=router.stack.find(l=>l.route?.path==='/admin/comparador/errores');
 assert.ok(route);
 const handler=route.route.stack.at(-1).handle;
 const oldQuery=db.query,oldEnsure=worker.ensureSchema;
 const calls=[];
 try{
  worker.ensureSchema=async()=>{};
  db.query=async(sql,args=[])=>{
   calls.push([sql,args]);
   if(sql.includes('FROM marketplace_compare_jobs j JOIN marketplace_compare_pages p')){
    return {rows:[{id:14,slug:'apple-airpods-pro',query_text:'Auriculares <script>x</script> AirPods Pro',
     provider_status:'unavailable',failure_code:'provider_timeout',finished_at:'2026-10-29T12:00:00Z',attempts:1}],rowCount:1};
   }
   throw Error('Unexpected SQL: '+sql);
  };
  const headers={},res={
   set(key,value){headers[key]=value;return this;},
   send(html){this.html=html;return this;}
  };
  let err=null;
  await handler({query:{q:'airpods%'}},res,e=>{err=e;});
  assert.equal(err,null);
  assert.equal(headers['Cache-Control'],'private,no-store');
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.match(res.html,/Errores de búsquedas externas/);
  assert.match(res.html,/Consulta externa agotó el tiempo/);
  assert.match(res.html,/Auriculares &lt;script&gt;x&lt;\/script&gt; AirPods Pro/);
  assert.doesNotMatch(res.html,/<script>x<\/script>/);
  assert.match(res.html,/href="\/comparar\/apple-airpods-pro"/);
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/LIMIT 80/);
  assert.match(calls[0][0],/ESCAPE/);
  assert.deepEqual(calls[0][1],['airpods%','%airpods\\%%']);
  assert.ok(calls.every(([sql])=>sql.startsWith('SELECT')));
 }finally{db.query=oldQuery;worker.ensureSchema=oldEnsure;}
});
test('visitantes sin sesión no acceden al diagnóstico ni provocan consultas SQL',async()=>{
 let queries=0;const old=db.query;
 db.query=async()=>{queries++;return {rows:[],rowCount:0};};
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/errores?q=airpods');
  assert.equal(r.status,401);
  assert.equal(queries,0);
 }finally{db.query=old;await new Promise(resolve=>server.close(resolve));}
});
test('el panel usa clases responsive y solo enlaces de diagnóstico',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const region=script.split("// V3.4.5.7.2 — fallos recientes")[1].split("router.get('/admin/comparador'")[0];
 assert.match(region,/requireAdmin/);
 assert.match(region,/failureReport\.explain/);
 assert.doesNotMatch(region,/provider\.fetchOffers|resend|stripe|sendEmail|setInterval/);
 assert.match(css,/\/\* V3\.4\.5\.7\.2/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/:focus-visible/);
});
