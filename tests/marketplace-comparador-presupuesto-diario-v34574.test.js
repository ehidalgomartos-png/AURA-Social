'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const info=require('../src/services/marketplace-comparador-budget-info-v34574');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('el límite por defecto es 35/día y 220/mes, pero no ignora una configuración de Coolify',()=>{
 assert.deepEqual(provider.budget({}),{daily:35,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'12'}),{daily:12,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'50'}),{daily:50,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'0'}),{daily:0,monthly:220});
 assert.deepEqual(provider.budget({COMPARADOR_MONTHLY_LIMIT:'100'}),{daily:35,monthly:100});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'999',COMPARADOR_MONTHLY_LIMIT:'999'}),
  {daily:50,monthly:220});
});
test('cuota interna: 12 consumidas hoy ya no bloquean cuando el límite es 35',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldBudget=provider.budget;
 let usedToday=12,usedMonth=45;
 try{
  provider.configured=()=>true;
  provider.budget=()=>({daily:35,monthly:220});
  const now=new Date('2026-10-29T13:04:00Z');
  const keys=worker.periodKeys(now);
  db.query=async(sql,args=[])=>{
   assert.match(sql,/marketplace_compare_provider_usage/);
   assert.deepEqual(args,[[keys.day,keys.month]]);
   return {rows:[{period_key:keys.day,used:usedToday},
    {period_key:keys.month,used:usedMonth}]};
  };
  const available=await worker.quotaStatus(now);
  assert.equal(available.available,true);
  assert.equal(available.reason,null);
  assert.equal(info.describe(available).remainingToday,23);
  assert.equal(info.describe(available).remainingMonth,175);
  usedToday=35;
  const daily=await worker.quotaStatus(now);
  assert.equal(daily.available,false);
  assert.equal(daily.reason,'daily');
  assert.match(info.describe(daily).message,/medianoche en Europe\/Madrid/);
  usedToday=12;usedMonth=220;
  const monthly=await worker.quotaStatus(now);
  assert.equal(monthly.available,false);
  assert.equal(monthly.reason,'monthly');
  assert.match(info.describe(monthly).message,/próximo mes/);
 }finally{
  db.query=oldQuery;
  provider.configured=oldConfigured;
  provider.budget=oldBudget;
 }
});
test('el resumen de administrador explica exactamente la pausa y el saldo disponible',()=>{
 const common={daily:35,monthly:220,dailyUsed:12,monthlyUsed:45,available:true};
 const html=compare.seoAdminView([], 'c'.repeat(48),'todas',common);
 assert.match(html,/12 \/ 35/);
 assert.match(html,/45 \/ 220/);
 assert.match(html,/Hay presupuesto interno disponible/);
 assert.match(html,/Disponibles según RedLibertad/);
 assert.match(html,/23<\/strong> hoy/);
 assert.match(html,/175<\/strong> este mes/);
 assert.match(html,/COMPARADOR_DAILY_LIMIT/);
 assert.match(html,/Otras aplicaciones podrían consumir el mismo plan SerpApi/);
 assert.doesNotMatch(html,/SerpApi.*205 consultas/);
 const paused=compare.seoAdminView([], 'c'.repeat(48),'todas',
  {...common,dailyUsed:35,available:false,reason:'daily'});
 assert.match(paused,/Se ha alcanzado el límite diario interno/);
 const stopped=info.describe({daily:35,monthly:220,available:false,reason:'not_configured'});
 assert.equal(stopped.remainingToday,null);
 assert.match(stopped.message,/Coolify/);
 assert.match(info.describe({daily:0,monthly:220,available:false,reason:'disabled'}).message,/desactivado/);
});
test('la aplicación sigue limitando transaccionalmente por día y mes; no se añaden consultas extras',()=>{
 const workerSource=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-worker-v32134.js'),'utf8');
 const providerSource=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-provider-v32133.js'),'utf8');
 assert.match(workerSource,/await client\.query\('BEGIN'\)/);
 assert.match(workerSource,/used<\$2 RETURNING used/);
 assert.match(workerSource,/const m=await client\.query\(q,\[keys\.month,monthly\]\)/);
 assert.match(workerSource,/const d=await client\.query\(q,\[keys\.day,daily\]\)/);
 assert.match(workerSource,/if\(!m\.rowCount\)/);
 assert.match(workerSource,/if\(!d\.rowCount\)/);
 assert.match(providerSource,/GOOGLE_SHOPPING_TIMEOUT_MS=45000/);
 assert.doesNotMatch(providerSource,/new URL\(.*COMPARADOR_DAILY_LIMIT/);
});
