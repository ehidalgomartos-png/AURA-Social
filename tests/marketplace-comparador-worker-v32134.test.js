'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');

test('las cuotas diarias se guardan en horario de Madrid, también en cambio de mes',()=>{
 assert.deepEqual(worker.periodKeys(new Date('2026-10-25T23:30:00Z')),{month:'m:2026-10',day:'d:2026-10-26'});
 assert.deepEqual(worker.periodKeys(new Date('2026-10-31T23:30:00Z')),{month:'m:2026-11',day:'d:2026-11-01'});
});

test('la cuota reserva día y mes en transacción o deshace todo',async()=>{
 const oldConnect=db.pool.connect,oldConfigured=provider.configured,oldBudget=provider.budget;
 let statements=[],released=false,blockDaily=false;
 try{
  provider.configured=()=>true;
  provider.budget=()=>({daily:5,monthly:100});
  db.pool.connect=async()=>({
   query:async(sql,args=[])=>{
    statements.push([sql,args]);
    if(blockDaily&&String(args[0]).startsWith('d:'))return {rowCount:0};
    return {rowCount:1};
   },
   release(){released=true;}
  });
  assert.equal(await worker.reserveQuota(new Date('2026-10-25T10:00:00Z')),true);
  assert.deepEqual(statements.map(x=>x[0]==='BEGIN'?'BEGIN':x[0]==='COMMIT'?'COMMIT':x[1][0]),['BEGIN','m:2026-10','d:2026-10-25','COMMIT']);
  assert.equal(released,true);
  statements=[];blockDaily=true;
  assert.equal(await worker.reserveQuota(new Date('2026-10-25T10:00:00Z')),false);
  assert.equal(statements.at(-1)[0],'ROLLBACK');
  provider.budget=()=>({daily:0,monthly:0});
  statements=[];
  assert.equal(await worker.reserveQuota(),false);
  assert.equal(statements.length,0);
 }finally{
  db.pool.connect=oldConnect; provider.configured=oldConfigured;provider.budget=oldBudget;
 }
});

test('encolar no consulta la API; solicitudes repetidas reutilizan el mismo trabajo',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured;
 const seen=[];
 try{
  provider.configured=()=>true;
  db.query=async(sql,params=[])=>{
   seen.push([sql,params]);
   if(sql.startsWith('INSERT INTO marketplace_compare_jobs'))return {rowCount:1,rows:[{page_id:7}]};
   return {rowCount:0,rows:[]};
  };
  assert.equal(await worker.enqueue({id:7},async()=>{}),true);
  assert.equal(seen.some(x=>x[0].includes("ON CONFLICT(page_id) DO UPDATE")),true);
  assert.equal(seen.some(x=>x[0].includes("last_checked_at<now()-interval '24 hours'")),true);
  assert.equal(seen.some(x=>x[0].includes("provider_status='queued'")),true);
  assert.equal(seen.some(x=>x[0].includes("https://serpapi.com")),false);
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
});

test('worker procesa ofertas reales fuera de la petición web sin descartar resultados',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldBudget=provider.budget,
  oldFetch=provider.fetchOffers,oldConnect=db.pool.connect;
 const seen=[];const offers=[{title:'iPhone 17 Pro',shop:'Tienda España',price_cents:105000,href:'https://tienda.example/iphone17pro',internal:false}];
 try{
  provider.configured=()=>true;provider.budget=()=>({daily:5,monthly:100});
  provider.fetchOffers=async()=>offers;
  db.pool.connect=async()=>({query:async()=>({rowCount:1}),release(){}});
  db.query=async(sql,params=[])=>{
   seen.push([sql,params]);
   if(sql.startsWith('UPDATE marketplace_compare_jobs SET status='+"'running'"))return {rowCount:1,rows:[{page_id:7,attempts:1}]};
   if(sql.startsWith('SELECT id,query_text,last_checked_at'))return {rowCount:1,rows:[{id:7,query_text:'iphone 17 pro',last_checked_at:null}]};
   return {rowCount:1,rows:[]};
  };
  assert.equal(await worker.processOne(),true);
  const saved=seen.find(x=>x[0].includes('SET external_results='));
  assert.ok(saved,'precios guardados en PostgreSQL');
  assert.deepEqual(JSON.parse(saved[1][1]),offers);
  assert.ok(seen.some(x=>x[0].includes("status='running'")));
  assert.ok(seen.some(x=>x[0].includes('finished_at=now()')));
  assert.equal(await worker.processOne(),true);
 }finally{
  db.query=oldQuery; db.pool.connect=oldConnect;
  provider.configured=oldConfigured;provider.budget=oldBudget;provider.fetchOffers=oldFetch;
 }
});

test('la API de búsqueda no se llama directamente desde la petición POST',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(source,/await compareWorker\.enqueue\(row\.rows\[0\],ensureSchema,true\)/);
 assert.doesNotMatch(source,/await provider\.fetchOffers/);
 assert.match(source,/startBackgroundWorker/);
 assert.match(server,/marketplaceComparadorV32132\.startBackgroundWorker\(\)/);
 assert.match(server,/marketplaceComparadorV32132\.stopBackgroundWorker\(\)/);
 assert.match(source,/Esta página se actualiza automáticamente/);
 assert.doesNotMatch(source,/Actualizar resultados manualmente/);
});
