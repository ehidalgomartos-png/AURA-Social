'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element{
 constructor(name='node'){
  this.name=name;this.children=[];this.events={};this.textContent='';
  this.value='';this.hidden=false;this.disabled=false;this.className='';
  this.href=undefined;this.type='';this.focused=false;
 }
 replaceChildren(...items){this.children=[...items];}
 append(...items){this.children.push(...items);}
 addEventListener(event,fn){this.events[event]=fn;}
 focus(){this.focused=true;}
}
const audit={
 ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-20T16:00:00Z',
 googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configurada'},
 totals:{publicListings:108,products:105,services:2,properties:1},
 limits:{recentSample:0},checks:[],informational:[],categories:[],examples:[],issueLabels:{}
};
const candidate=(id,priority='ready_recent')=>({
 id:String(id),title:'Taza '+id,category:'Regalos',path:'/marketplace/p/'+id+'/taza-'+id,
 updatedAt:'2026-10-20T11:00:00Z',
 reviewPriority:{
  code:priority,label:priority==='improve_card'?'Revisar contenido antes':'Ficha preparada, reciente',
  attention:priority==='improve_card'?['Descripción original breve']:[],
  why:'Nota larga que no hace falta repetir en la tarjeta.'
 }
});
const pending={
 ok:true,source:'public_products_without_recent_saved_manual_inspection',
 page:1,order:'priority',products:[candidate(10),candidate(11,'improve_card'),candidate(12),candidate(13)],
 totalPublicSaleProducts:105,withoutRecentInspection:103,inspectedInWindow:2,
 hasPrevious:false,hasNext:true
};
const history={
 ok:true,source:'stored_manual_search_console_inspections',
 products:[
  {id:'5',title:'Taza Roblox',path:'/marketplace/p/5/taza-roblox',
   status:'discovered',label:'Descubierto',checkedAt:'2026-10-20T16:00:00Z'},
  {id:'6',title:'Taza Día de la Madre',path:'/marketplace/p/6/taza-madre',
   status:'indexed',label:'Indexado',checkedAt:'2026-10-19T12:00:00Z'},
  {id:'7',title:'Anuncio oculto',path:'https://evil.example/secret',
   status:'indexed',checkedAt:'2026-10-19T10:00:00Z'}
 ],
 counts:{indexed:1,discovered:1,crawled:0,technical:0,excluded:0,unknown:0}
};
async function createPage({list=pending,stored=history,listStatus=200,historyStatus=200,googleConfigured=true}={}){
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 get('auditPendingOrder').value='priority';
 const calls=[];
 const fetch=async(url,opt)=>{
  calls.push({url,opt});
  let data,status=200;
  if(url.includes('/gsc/pendientes')){data=list;status=listStatus;}
  else if(url.includes('/gsc/seguimiento')){data=stored;status=historyStatus;}
  else if(url.includes('/gsc/inspeccionar'))
   throw Error('Google POST should never be invoked by daily summary');
  else data={...audit,googleSearchConsole:{
    ...audit.googleSearchConsole,configured:googleConfigured
   }};
  return {ok:status>=200&&status<300,status,
   headers:{get:()=>null},json:async()=>data};
 };
 const script=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 vm.runInNewContext(script,{document:{getElementById:get,createElement:t=>new Element(t)},
  fetch,Intl,Date,Number,String,Array,Object,Error,Promise});
 for(let i=0;i<20;i++)await Promise.resolve();
 return {get,calls};
}
test('V3.2.129 summary is visible above detailed audit and advanced controls remain accessible in semantic details',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 assert.match(html,/marketplace-seo-audit-v32120\.js\?v=3\.2\.[0-9]+(?:\.[0-9]+)?/);
 for(const id of [
  'auditDailyTitle','auditDailyLoad','auditDailyMetrics','auditDailyStatus',
  'auditDailyNext','auditDailyHistory','auditDailyBrief','auditAdvanced',
  'auditExamplesAdvanced','auditGscTitle','auditPendingTitle','auditFollowupTitle'
 ])assert.match(html,new RegExp('id="'+id+'"'),id);
 const summary=html.indexOf('id="auditDailyBrief"');
 const advanced=html.indexOf('id="auditAdvanced"');
 const google=html.indexOf('id="auditGscTitle"');
 const pending=html.indexOf('id="auditPendingTitle"');
 assert.ok(summary>0&&summary<advanced&&advanced<google&&google<pending);
 assert.match(html,/<details class="audit-advanced" id="auditAdvanced">/);
 assert.match(html,/<details class="audit-advanced" id="auditExamplesAdvanced">/);
 assert.match(html,/Solo «Inspeccionar en Google» consume cuota/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/audit-daily-columns/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|eval\(/);
 assert.doesNotMatch(js,/setInterval|setTimeout/);
});
test('V3.2.129 daily summary performs no requests until clicked, then only two existing private GET APIs',async()=>{
 const {get,calls}=await createPage();
 assert.equal(calls.length,1); // Existing admin audit GET only.
 assert.equal(calls[0].url,'/api/admin/marketplace/seo/auditoria');
 assert.equal(get('auditDailyMetrics').children.length,0);
 assert.equal(get('auditDailyLoad').disabled,false);
 await get('auditDailyLoad').events.click();
 assert.equal(calls.length,3);
 assert.deepEqual(calls.slice(1).map(c=>c.url),[
  '/api/admin/marketplace/seo/gsc/pendientes?pagina=1&q=&orden=priority',
  '/api/admin/marketplace/seo/gsc/seguimiento'
 ]);
 for(const call of calls.slice(1)){
  assert.equal(call.opt.method,'GET');
  assert.equal(call.opt.credentials,'same-origin');
  assert.equal(call.opt.cache,'no-store');
 }
 assert.equal(get('auditDailyMetrics').children.length,3);
 assert.equal(get('auditDailyMetrics').children[0].children[0].textContent,'105');
 assert.equal(get('auditDailyMetrics').children[1].children[0].textContent,'103');
 assert.equal(get('auditDailyMetrics').children[2].children[0].textContent,'2');
 assert.equal(get('auditDailyNext').children.length,3);
 assert.equal(get('auditDailyHistory').children.length,2); // External path skipped.
 assert.match(get('auditDailyStatus').textContent,/Resumen local actualizado/);
 assert.match(get('auditDailyHistory').children[0].children.at(-1).textContent,/enlaces internos/);
 assert.equal(get('auditDailyLoad').disabled,false);
 assert.ok(calls.every(c=>c.opt.method==='GET'));
});
test('V3.2.129 candidate shortcut adds to the existing six-item review queue without inspecting Google',async()=>{
 const {get,calls}=await createPage();
 await get('auditDailyLoad').events.click();
 const first=get('auditDailyNext').children[0];
 assert.equal(first.children[0].href,'/marketplace/p/10/taza-10');
 assert.match(first.children[0].textContent,/Taza 10/);
 const add=first.children.at(-1);
 assert.equal(add.textContent,'Añadir a mi lista');
 add.events.click();
 assert.equal(get('auditQueueItems').children.length,1);
 assert.equal(get('auditQueueCount').textContent,'1/6');
 assert.match(get('auditDailyStatus').textContent,/no consulta Google/);
 add.events.click();
 assert.equal(get('auditQueueItems').children.length,1); // Duplicate prevented.
 get('auditQueuePrepare').events.click();
 assert.equal(get('auditGscId').value,'10');
 assert.equal(get('auditGscId').focused,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.opt.method==='GET'));
});
test('V3.2.129 partial local failure preserves useful results and never invents Google status',async()=>{
 const {get,calls}=await createPage({historyStatus:503});
 await get('auditDailyLoad').events.click();
 assert.equal(calls.length,3);
 assert.equal(get('auditDailyMetrics').children.length,3);
 assert.equal(get('auditDailyNext').children.length,3);
 assert.match(get('auditDailyStatus').textContent,/Resumen parcial/);
 assert.match(get('auditDailyHistory').children[0].textContent,/No se pudo consultar el historial/);
 assert.doesNotMatch(get('auditDailyStatus').textContent,/producto indexado/i);
 assert.ok(calls.every(c=>c.opt.method==='GET'));
});
test('V3.2.129 missing pending list does not misstate total coverage; saved inspection section still works',async()=>{
 const {get}=await createPage({listStatus:503});
 await get('auditDailyLoad').events.click();
 assert.equal(get('auditDailyMetrics').children.length,0);
 assert.equal(get('auditDailyHistory').children.length,2);
 assert.match(get('auditDailyStatus').textContent,/Resumen parcial/);
});
test('V3.2.129 no data or malformed URLs/IDs still show honest empty state',async()=>{
 const empty={
  ...pending,products:[
   {...candidate('5;DROP TABLE'),path:'/marketplace/p/5/taza-5'},
   {...candidate(6),path:'https://evil.example/x'},
   {...candidate(7),path:'/marketplace/p/999/taza-999'}
  ],
  withoutRecentInspection:0,inspectedInWindow:0,totalPublicSaleProducts:0
 };
 const noHistory={...history,products:[]};
 const {get,calls}=await createPage({list:empty,stored:noHistory});
 await get('auditDailyLoad').events.click();
 assert.equal(get('auditDailyNext').children.length,1);
 assert.match(get('auditDailyNext').children[0].textContent,/No hay fichas pendientes/);
 assert.equal(get('auditDailyHistory').children.length,1);
 assert.match(get('auditDailyHistory').children[0].textContent,/Aún no hay inspecciones/);
 assert.equal(calls.filter(x=>x.url.includes('inspeccionar')).length,0);
});
