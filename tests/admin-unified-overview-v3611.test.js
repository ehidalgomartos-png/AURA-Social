'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const authPath=require.resolve('../src/middleware/auth');
const routePath=require.resolve('../src/routes/admin-activity-v3317');
const savedAuth=require.cache[authPath],savedRoute=require.cache[routePath];
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{
 requireAdmin:(req,res,next)=>req.headers['x-test-admin']==='true'?next():res.status(403).json({error:'admin_required'})
}};
delete require.cache[routePath];
const {createAdminActivityRouter,OVERVIEW_SQL}=require(routePath);
if(savedAuth)require.cache[authPath]=savedAuth;else delete require.cache[authPath];
if(savedRoute)require.cache[routePath]=savedRoute;else delete require.cache[routePath];

test('V3.6.11: endpoint solo admins y únicamente agregados, sin identidades ni cuerpos',async()=>{
 let hits=0;
 const mockDB={query:async sql=>{
  hits++;
  assert.equal(sql,OVERVIEW_SQL);
  return {rows:[{registrations:2,posts:3,reels:1,comments:5,open_reports:4}]};
 }};
 const app=express();
 app.use('/api/admin/activity',createAdminActivityRouter({db:mockDB}));
 const server=await new Promise(resolve=>{
  const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));
 });
 const url='http://127.0.0.1:'+server.address().port+'/api/admin/activity/summary-7d';
 try{
  const denied=await fetch(url);
  assert.equal(denied.status,403);
  assert.equal(hits,0,'sin consultas para visitantes');
  const response=await fetch(url,{headers:{'x-test-admin':'true'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(data.days,7);
  assert.equal(hits,1);
  assert.deepEqual(Object.keys(data.metrics).sort(),['comments','open_reports','posts','reels','registrations']);
  assert.equal(data.metrics.open_reports,4);
  assert.equal('items' in data,false);
  assert.doesNotMatch(JSON.stringify(data),/username|message|email|recipient|excerpt/i);
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
 assert.match(OVERVIEW_SQL,/interval '7 days'/);
 assert.doesNotMatch(OVERVIEW_SQL,/messages|body|email|sender_id|recipient_id|INSERT|UPDATE|DELETE/i);
});

test('V3.6.11: vista accesible, enlaces reales y sin fuga de datos en HTML',()=>{
 const html=read('public/admin.html'),server=read('server.js');
 const css=read('public/admin-overview-v3611.css');
 const js=read('public/admin-overview-v3611.js');
 assert.match(server,/app\.use\('\/api\/admin\/activity',createAdminActivityRouter\(\{db\}\)\)/);
 for(const id of [
  'admin-overview-v3611','refreshAdminOverviewV3611','adminOverviewStatusV3611',
  'adminOverviewSocialV3611','adminOverviewHelpV3611',
  'adminOverviewSocialStatusV3611','adminOverviewHelpStatusV3611'
 ])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/href="#admin-overview-v3611"/);
 assert.match(html,/href="\/admin\/actividad"/);
 assert.match(html,/href="\/resuelve\/admin"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/admin-overview-v3611\.js" defer/);
 assert.match(html,/admin-overview-v3611\.css"/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:375px\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotMatch(js,/\.innerHTML\s*=|localStorage|document\.cookie|method:'POST'|fetch\('\/api\/messages/i);
});

function fakeNode(){
 return {
  children:[],textContent:'',className:'',disabled:false,events:{},
  append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=[...children];},
  addEventListener(name,fn){this.events[name]=fn;}
 };
}
async function showInFakeDocument(helpUnavailable=false){
 const elements={};
 const doc={
  getElementById:id=>(elements[id]??=(fakeNode())),
  createElement:()=>fakeNode()
 };
 const calls=[];
 const days=Array.from({length:7},(_,i)=>({
  questions:i===0?2:0,answers:i===0?3:0,resolutions:i===0?1:0
 }));
 const fetchMock=async(url,options)=>{
  calls.push({url,options});
  if(url==='/api/admin/activity/summary-7d')
   return {ok:true,json:async()=>({ok:true,days:7,
    metrics:{registrations:2,posts:3,reels:1,comments:5,open_reports:4}})};
  if(url==='/api/resuelve/admin/activity-7d')
   return helpUnavailable?{ok:false,json:async()=>({})}:
    {ok:true,json:async()=>({ok:true,days})};
  throw Error('unexpected_url');
 };
 vm.runInNewContext(read('public/admin-overview-v3611.js'),{document:doc,fetch:fetchMock});
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls};
}
test('V3.6.11: tarjetas usan cuentas reales, sin sumar denuncias actuales al período',async()=>{
 const {elements,calls}=await showInFakeDocument();
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x.url),[
  '/api/admin/activity/summary-7d','/api/resuelve/admin/activity-7d'
 ]);
 assert.ok(calls.every(x=>x.options.credentials==='same-origin'&&x.options.cache==='no-store'));
 const social=elements.adminOverviewSocialV3611.children;
 const help=elements.adminOverviewHelpV3611.children;
 assert.equal(social.length,5);
 assert.equal(help.length,3);
 assert.equal(social[0].children[0].textContent,'2');
 assert.equal(social[4].children[0].textContent,'4');
 assert.match(social[4].children[1].textContent,/total actual/);
 assert.equal(help[0].children[0].textContent,'2');
 assert.equal(help[1].children[0].textContent,'3');
 assert.equal(help[2].children[0].textContent,'1');
 assert.match(elements.adminOverviewStatusV3611.textContent,/Resumen actualizado/);
 assert.equal(elements.refreshAdminOverviewV3611.disabled,false);
});
test('V3.6.11: errores de Resuelve no se convierten en cero ni borran el resumen social',async()=>{
 const {elements}=await showInFakeDocument(true);
 assert.equal(elements.adminOverviewSocialV3611.children.length,5);
 assert.equal(elements.adminOverviewHelpV3611.children.length,0);
 assert.match(elements.adminOverviewHelpStatusV3611.textContent,/No disponible/);
 assert.match(elements.adminOverviewStatusV3611.textContent,/No se muestran cifras estimadas/);
});
