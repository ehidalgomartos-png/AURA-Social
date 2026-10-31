'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const authPath=require.resolve('../src/middleware/auth');
const routePath=require.resolve('../src/routes/admin-activity-v3317');
const prior=require.cache[authPath];
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{
 requireAdmin:(req,res,next)=>req.headers['x-test-admin']==='true'?next():res.status(403).json({error:'admin_required'})
}};
const {createAdminActivityRouter,RESUELVE_SERVICES_SQL,VOICES_SERVICES_SQL,safeServiceCount}=require(routePath);
if(prior)require.cache[authPath]=prior;else delete require.cache[authPath];

async function serve(db,run){
 const app=express();app.use('/api/admin/activity',createAdminActivityRouter({db}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 try{await run('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
function dbStub({voicesDown=false}={}){
 const queries=[];
 const db={query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql===RESUELVE_SERVICES_SQL)return {rows:[{open_questions:9,unanswered_questions:4,visible_replies:6,author_id:17,body:'DO_NOT_RETURN'}]};
  if(sql===VOICES_SERVICES_SQL){
   if(voicesDown)throw new Error('relation does not exist');
   return {rows:[{published_articles:3,recent_articles:1,author_user_id:17,title:'DO_NOT_RETURN'}]};
  }
  throw new Error('unexpected_sql');
 }};
 return {db,queries};
}
test('V3.6.52: servicios solo accesibles para administradores y con períodos permitidos',async()=>{
 const {db,queries}=dbStub();
 await serve(db,async origin=>{
  const unauth=await fetch(origin+'/api/admin/activity/services-summary');
  assert.equal(unauth.status,403);
  const invalid=await fetch(origin+'/api/admin/activity/services-summary?days=365',{headers:{'x-test-admin':'true'}});
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).error,'invalid_period');
 });
 assert.equal(queries.length,0);
});
test('V3.6.52: cuenta datos reales sin exponer títulos, texto ni identidades',async()=>{
 const {db,queries}=dbStub();
 await serve(db,async origin=>{
  const response=await fetch(origin+'/api/admin/activity/services-summary?days=7',{headers:{'x-test-admin':'true'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow');
  const json=await response.json();
  assert.deepEqual(json.metrics,{
   resuelve_open:9,resuelve_unanswered:4,resuelve_replies_period:6,
   voices_published:3,voices_published_period:1
  });
  assert.equal(json.days,7);
  assert.doesNotMatch(JSON.stringify(json),/DO_NOT_RETURN|author_id|author_user_id|body|title/);
 });
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>JSON.stringify(q.params)==='[7]'));
});
test('V3.6.52: faltas de esquema muestran no disponible, no cero inventado',async()=>{
 const {db}=dbStub({voicesDown:true});
 await serve(db,async origin=>{
  const response=await fetch(origin+'/api/admin/activity/services-summary?days=1',{headers:{'x-test-admin':'true'}});
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.metrics.resuelve_open,9);
  assert.equal(json.metrics.voices_published,null);
  assert.equal(json.metrics.voices_published_period,null);
 });
 assert.equal(safeServiceCount(null),null);
 assert.equal(safeServiceCount(undefined),null);
 assert.equal(safeServiceCount(-4),null);
 assert.equal(safeServiceCount('5'),5);
});
test('V3.6.52: SQL solo cuenta actividad pública o visible y no selecciona datos privados',()=>{
 assert.match(RESUELVE_SERVICES_SQL,/q.status='open'/);
 assert.match(RESUELVE_SERVICES_SQL,/a.status='visible'/);
 assert.match(RESUELVE_SERVICES_SQL,/NOT EXISTS/);
 assert.match(VOICES_SERVICES_SQL,/p.unpublished_at IS NULL/);
 assert.match(VOICES_SERVICES_SQL,/s.author_publish_consent_at IS NOT NULL/);
 assert.match(VOICES_SERVICES_SQL,/u.status='active'/);
 for(const sql of [RESUELVE_SERVICES_SQL,VOICES_SERVICES_SQL]){
  assert.doesNotMatch(sql,/\bSELECT\s+(?:[a-z]+\.)?(?:body|email|title|username)\b/i);
  assert.match(sql,/\$1::int/);
 }
});
test('V3.6.52: centro móvil presenta el resumen sin datos sensibles ni inyección HTML',()=>{
 const html=read('src/views/admin-activity-v3317.html'),js=read('public/admin-activity-v3317.js');
 const css=read('public/admin-activity-v3317.css'),route=read('src/routes/admin-activity-v3317.js');
 assert.match(html,/id="serviceStatsV3652"/);
 assert.match(html,/id="serviceStatusV3652"/);
 assert.match(html,/solo se muestran cantidades reales/i);
 assert.match(html,/content="noindex,nofollow"/);
 assert.match(route,/router.use\(requireAdmin\)/);
 assert.match(js,/service[s]?-summary\?days=/);
 assert.match(js,/renderServiceStatsV3652/);
 assert.match(js,/number!==null&&Number\.isSafeInteger\(number\)/);
 assert.match(js,/replaceChildren\(\.\.\.cards\)/);
 assert.doesNotMatch(js,/innerHTML/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(css,/\.activity-service-links-v3652 a:focus-visible/);
 assert.match(html,/admin-activity-v3317\.js\?v=3\.6\.52/);
});
