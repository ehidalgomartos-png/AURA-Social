'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const authPath=require.resolve('../src/middleware/auth');
const routePath=require.resolve('../src/routes/admin-alerts-v215');
const savedAuth=require.cache[authPath],savedRoute=require.cache[routePath];
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{
 requireAdmin:(req,res,next)=>req.headers['x-test-admin']==='true'?next():res.status(403).json({error:'admin_required'})
}};
delete require.cache[routePath];
const {createOperationalAlertAdminRoutes,ALERT_PRIORITY_SQL}=require(routePath);
if(savedAuth)require.cache[authPath]=savedAuth;else delete require.cache[authPath];
if(savedRoute)require.cache[routePath]=savedRoute;else delete require.cache[routePath];

test('V3.6.12: resumen técnico solo para administradores y sin detalles o identidad',async()=>{
 let queries=0,schemas=0;
 const db={query:async sql=>{
  queries++;
  assert.equal(sql,ALERT_PRIORITY_SQL);
  return {rows:[{open_alerts:3,critical_active:1,monitoring_alerts:2}]};
 }};
 const service={ensureSchema:async()=>{schemas++;}};
 const app=express();
 app.use('/api/admin',createOperationalAlertAdminRoutes({db,service}));
 const server=await new Promise(resolve=>{
  const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));
 });
 const url='http://127.0.0.1:'+server.address().port+'/api/admin/ops/alerts/summary';
 try{
  const anonymous=await fetch(url);
  assert.equal(anonymous.status,403);
  assert.equal(queries,0);
  assert.equal(schemas,0);
  const response=await fetch(url,{headers:{'x-test-admin':'true'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(data.scope,'current_instance_signals');
  assert.deepEqual(Object.keys(data.metrics).sort(),['critical_active','monitoring_alerts','open_alerts']);
  assert.equal(data.metrics.open_alerts,3);
  assert.equal(queries,1);
  assert.equal(schemas,1);
  assert.doesNotMatch(JSON.stringify(data),/title|detail|email|username|message|user_id/i);
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
 assert.match(ALERT_PRIORITY_SQL,/is_active=TRUE/);
 assert.doesNotMatch(ALERT_PRIORITY_SQL,/INSERT|UPDATE|DELETE|detail|title|email|messages|user_id/i);
});
test('V3.6.12: interfaz separada, accesible y revisión humana',()=>{
 const html=read('public/admin.html'),js=read('public/admin-priorities-v3612.js'),
  css=read('public/admin-priorities-v3612.css'),resuelve=read('src/routes/resuelve-v350.js');
 for(const id of ['admin-priorities-v3612','priorityRefreshV3612','priorityTechCardV3612',
  'priorityHelpCardV3612','priorityTechStatusV3612','priorityHelpStatusV3612','priorityGlobalStatusV3612']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/href="#admin-priorities-v3612"/);
 assert.match(html,/href="#admin-alerts-v3610"/);
 assert.match(html,/href="\/resuelve\/admin#avisos"/);
 assert.match(html,/no sustituyen la comprobación externa de Coolify/);
 assert.match(html,/una? .* no demuestra una infracción/i);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/:focus-visible/);
 assert.match(resuelve,/router\.get\('\/admin\/trust-summary',requireAuth/);
 assert.match(resuelve,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotMatch(js,/innerHTML|localStorage|document\.cookie|method:'POST'|method:'DELETE'/);
});
function node(){
 return {
  textContent:'',className:'',disabled:false,events:{},
  addEventListener(type,fn){this.events[type]=fn;}
 };
}
async function loadView(techFails=false){
 const elements={},calls=[];
 const document={getElementById:id=>(elements[id]??=node())};
 const fetch=async(url,opts)=>{
  calls.push({url,opts});
  if(url==='/api/admin/ops/alerts/summary')
   return techFails?{ok:false,json:async()=>({})}:
    {ok:true,json:async()=>({ok:true,scope:'current_instance_signals',
     metrics:{open_alerts:3,critical_active:1,monitoring_alerts:2}})};
  if(url==='/api/resuelve/admin/trust-summary')
   return {ok:true,json:async()=>({ok:true,totalPending:4})};
  throw Error('unexpected_url');
 };
 vm.runInNewContext(read('public/admin-priorities-v3612.js'),{document,fetch});
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls};
}
test('V3.6.12: muestra números reales, sin confundir avisos y sanciones',async()=>{
 const {elements,calls}=await loadView();
 assert.deepEqual(calls.map(x=>x.url),[
  '/api/admin/ops/alerts/summary','/api/resuelve/admin/trust-summary'
 ]);
 assert.ok(calls.every(x=>x.opts.credentials==='same-origin'&&x.opts.cache==='no-store'));
 assert.equal(elements.priorityTechCountV3612.textContent,'3');
 assert.equal(elements.priorityHelpCountV3612.textContent,'4');
 assert.match(elements.priorityTechStatusV3612.textContent,/Críticas activas: 1/);
 assert.match(elements.priorityHelpStatusV3612.textContent,/revisión humana/);
 assert.match(elements.priorityTechCardV3612.className,/is-attention-v3612/);
 assert.equal(elements.priorityRefreshV3612.disabled,false);
});
test('V3.6.12: fallo técnico no se convierte en cero ni oculta los avisos Resuelve',async()=>{
 const {elements}=await loadView(true);
 assert.equal(elements.priorityTechCountV3612.textContent,'—');
 assert.match(elements.priorityTechStatusV3612.textContent,/No disponible/);
 assert.equal(elements.priorityHelpCountV3612.textContent,'4');
 assert.match(elements.priorityGlobalStatusV3612.textContent,/Resumen parcial/);
});
