'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.27: trust report summary is private, aggregated and read only',()=>{
 const service=read('src/services/resuelve-v350.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(service,/async function adminTrustSummary\(\)/);
 assert.match(service,/count\(\*\)::int AS pending/);
 assert.match(service,/WHERE r\.status='pending'/);
 assert.match(service,/JOIN resuelve_answers a ON a\.id=r\.answer_id AND a\.status='visible'/);
 assert.match(service,/JOIN resuelve_questions q ON q\.id=a\.question_id AND q\.status<>'hidden'/);
 assert.match(service,/GROUP BY r\.reason/);
 assert.match(service,/Object\.fromEntries\(REPORT_REASONS\.map\(reason=>\[reason,0\]\)\)/);
 assert.match(routes,/router\.get\('\/admin\/trust-summary',requireAuth/);
 assert.match(routes,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 assert.match(routes,/service\.adminTrustSummary\(\)/);
 const queryBlock=service.slice(service.indexOf('async function adminTrustSummary()'),service.indexOf('async function pendingAnswerReports'));
 assert.doesNotMatch(queryBlock,/UPDATE\s|DELETE\s|INSERT\s|email|reporter_id/i);
});

test('V3.5.27: summaries use actual database counts for supported reasons, not invented values',async()=>{
 const db=require('../src/db'),original=db.query;
 const queries=[];
 db.query=async sql=>{
  queries.push(sql);
  if(sql.includes('GROUP BY r.reason'))return {rows:[
   {reason:'publicidad_encubierta',pending:4},
   {reason:'cualificacion_falsa',pending:2},
   {reason:'desconocido',pending:999}
  ],rowCount:3};
  return {rows:[],rowCount:0};
 };
 try{
  const service=require('../src/services/resuelve-v350');
  const result=await service.adminTrustSummary();
  assert.equal(result.pendingByReason.publicidad_encubierta,4);
  assert.equal(result.pendingByReason.cualificacion_falsa,2);
  assert.equal(result.pendingByReason.datos_personales,0);
  assert.equal(result.totalPending,6);
  assert.ok(!Object.hasOwn(result.pendingByReason,'desconocido'));
  assert.ok(queries.some(q=>q.includes('GROUP BY r.reason')));
 }finally{db.query=original;}
});

test('V3.5.27: review is explicitly human; no automatic hiding or sanctions',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 const js=read('public/resuelve-admin-v3519.js');
 assert.match(html,/id="adminTrustMetrics"/);
 assert.match(html,/id="refreshAdminTrust"/);
 assert.match(html,/Un aviso no demuestra culpabilidad/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/async function trustSummary\(\)/);
 assert.match(js,/\/api\/resuelve\/admin\/trust-summary/);
 assert.match(js,/await trustSummary\(\)/);
 assert.match(js,/trustSummary\(\)\]\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});