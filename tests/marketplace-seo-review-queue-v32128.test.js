'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element{
 constructor(name='node'){
  this.name=name;this.children=[];this.events={};this.textContent='';
  this.value='';this.hidden=false;this.disabled=false;this.href=undefined;
  this.className='';this.type='';this.focused=false;
 }
 replaceChildren(...items){this.children=[...items];}
 append(...items){this.children.push(...items);}
 addEventListener(name,handler){this.events[name]=handler;}
 focus(){this.focused=true;}
}
const audit={
 ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-20T12:00:00Z',
 googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configurada'},
 totals:{publicListings:18,products:18,services:0,properties:0},
 limits:{recentSample:0},checks:[],informational:[],categories:[],examples:[],issueLabels:{}
};
function product(id){
 return {
  id:String(id),title:'Taza '+id,category:'Regalos',
  path:'/marketplace/p/'+id+'/taza-'+id,
  updatedAt:'2026-10-20T10:00:00Z',
  reviewPriority:{
   code:'ready_recent',label:'Ficha preparada, reciente',
   why:'Esta descripción larga se repite y debe ocultarse.',
   attention:[],note:'No procede de Google.'
  }
 };
}
function pending(page,order='priority'){
 const items=page===1?
  Array.from({length:8},(_,i)=>product(i+1)):
  [product(9),product(10),{...product(11),id:'11;DROP TABLE',path:'/marketplace/p/11/taza-11'}];
 return {
  ok:true,source:'public_products_without_recent_saved_manual_inspection',
  page,order,products:items,priorityNote:'Prioridad orientativa, no Google.',
  totalPublicSaleProducts:11,withoutRecentInspection:11,inspectedInWindow:0,
  hasPrevious:page>1,hasNext:page===1
 };
}
async function runClient({configured=true}={}){
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,new Element(id));
  return elements.get(id);
 };
 get('auditPendingOrder').value='priority';
 const calls=[];
 const fetch=async(url,options)=>{
  calls.push({url,options});
  const data=url.includes('/gsc/pendientes')
   ?pending(url.includes('pagina=2')?2:1,url.includes('orden=priority')?'priority':'recent')
   :url.includes('/gsc/inspeccionar')
    ?{ok:true,inspection:{
      source:'google_search_console_url_inspection',
      inspectionUrl:'https://redlibertad.com/marketplace/p/9/taza-9',
      verdict:'NEUTRAL',coverageState:'Google does not recognize URL',
      sitemaps:[]
     },followupSaved:true}
    :{...audit,googleSearchConsole:{...audit.googleSearchConsole,configured}};
  return {
   ok:true,status:200,
   headers:{get:()=>null},
   json:async()=>data
  };
 };
 const code=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 vm.runInNewContext(code,{document:{getElementById:get,createElement:n=>new Element(n)},
  fetch,Intl,Date,Number,String,Array,Object,Error,Promise});
 for(let i=0;i<15;i++)await Promise.resolve();
 return {get,calls};
}
function queueAdd(get,index){
 const card=get('auditPendingItems').children[index];
 const actions=card.children.at(-1);
 const button=actions.children[0];
 button.events.click();
 return button;
}
test('V3.2.128 private simplified SEO panel remains accessible and does not claim Google indexation',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 for(const id of [
  'auditQueueTitle','auditQueueCount','auditQueueStatus','auditQueueItems',
  'auditQueueClear','auditQueuePrepare','auditPendingLoad','auditPendingSearch','auditPendingOrder'
 ])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Lista de revisión|Mi lista de revisión/);
 assert.match(html,/Pendiente de revisión no significa que Google no los conozca o indexe/);
 assert.match(html,/la inspección real sigue siendo/i);
 assert.match(html,/v=3\.2\.128/);
 assert.match(css,/audit-pending-queue/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|eval\(/);
 assert.match(js,/const MAX_REVIEW_QUEUE=6/);
 assert.match(js,/reviewQueue=\[\]/);
 assert.match(js,/safeReviewProduct/);
 assert.match(js,/renderReviewQueue/);
 assert.match(js,/removeReviewAfterInspection\(id\)/);
 const source=js.slice(js.indexOf(' // V3.2.126:'),js.indexOf(' // V3.2.124:'));
 assert.doesNotMatch(source,/fetch\(['"]\/api\/admin\/marketplace\/seo\/gsc\/inspeccionar/);
 assert.doesNotMatch(source,/Promise\.all.*fetch|setInterval|setTimeout/);
});
test('V3.2.128 selection is in memory, capped at six, guarded against duplicate, and causes NO Google calls',async()=>{
 const {get,calls}=await runClient();
 assert.equal(calls.length,1);
 assert.equal(get('auditQueueCount').textContent,'0/6');
 assert.equal(get('auditQueuePrepare').disabled,true);
 assert.equal(get('auditQueueClear').disabled,true);
 get('auditPendingSearch').value='taza';
 await get('auditPendingLoad').events.click();
 assert.equal(calls.length,2);
 assert.equal(get('auditPendingItems').children.length,8);
 for(let i=0;i<6;i++){
  queueAdd(get,i);
  assert.equal(get('auditQueueItems').children.length,i+1);
  assert.equal(calls.length,2);
 }
 assert.equal(get('auditQueueCount').textContent,'6/6');
 assert.equal(get('auditQueuePrepare').disabled,false);
 assert.equal(get('auditQueueClear').disabled,false);
 const seventh=get('auditPendingItems').children[6].children.at(-1).children[0];
 assert.equal(seventh.disabled,true);
 seventh.events.click(); // browser won't fire when disabled; handler still prevents abuse
 assert.equal(get('auditQueueItems').children.length,6);
 queueAdd(get,0); // duplicate
 assert.equal(get('auditQueueItems').children.length,6);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.options.method==='GET'));
 get('auditQueuePrepare').events.click();
 assert.equal(get('auditGscId').value,'1');
 assert.equal(get('auditGscId').focused,true);
 assert.equal(calls.length,2); // preparing never POSTs to Google.
 assert.match(get('auditQueueStatus').textContent,/no se ha realizado ninguna inspección/);
 assert.equal(get('auditPendingItems').children[0].children.at(-1).children.at(-1).textContent,
  'Preparar inspección individual');
});
test('V3.2.128 queue spans multiple pages, supports removing and clearing, and rejects malicious listing identifiers',async()=>{
 const {get,calls}=await runClient();
 await get('auditPendingLoad').events.click();
 queueAdd(get,0);
 queueAdd(get,1);
 assert.equal(get('auditQueueCount').textContent,'2/6');
 await get('auditPendingNext').events.click();
 assert.equal(calls.length,3);
 assert.equal(get('auditPendingItems').children.length,3);
 queueAdd(get,0);
 assert.equal(get('auditQueueCount').textContent,'3/6');
 assert.equal(get('auditQueueItems').children[2].children[0].href,'/marketplace/p/9/taza-9');
 const bad=get('auditPendingItems').children[2];
 assert.ok(!bad.children.some(x=>x.className==='audit-pending-actions'));
 assert.equal(calls.length,3);
 const firstRemove=get('auditQueueItems').children[0].children.at(-1);
 firstRemove.events.click();
 assert.equal(get('auditQueueCount').textContent,'2/6');
 assert.equal(get('auditQueueItems').children[0].children[0].textContent,'Taza 2');
 get('auditQueueClear').events.click();
 assert.equal(get('auditQueueCount').textContent,'0/6');
 assert.equal(get('auditQueueItems').children.length,0);
 assert.equal(get('auditQueuePrepare').disabled,true);
 assert.equal(get('auditQueueClear').disabled,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.options.method==='GET'));
});
test('V3.2.128 only a conscious POST to Google inspects; a successful response removes selected item, with no background batch',async()=>{
 const {get,calls}=await runClient();
 await get('auditPendingLoad').events.click();
 await get('auditPendingNext').events.click();
 queueAdd(get,0); // id 9, page 2
 assert.equal(get('auditQueueCount').textContent,'1/6');
 get('auditQueuePrepare').events.click();
 assert.equal(get('auditGscId').value,'9');
 assert.equal(calls.length,3);
 await get('auditGscInspect').events.click();
 assert.equal(calls.length,4);
 assert.equal(calls[3].options.method,'POST');
 assert.equal(calls[3].url,'/api/admin/marketplace/seo/gsc/inspeccionar');
 assert.deepEqual(JSON.parse(calls[3].options.body),{id:'9'});
 assert.equal(get('auditQueueItems').children.length,0);
 assert.equal(get('auditQueuePrepare').disabled,true);
 assert.match(get('auditQueueStatus').textContent,/Inspección manual completada/);
 assert.equal(get('auditGscResult').hidden,false);
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
});
test('V3.2.128 disconnected Google leaves selection possible but cannot prepare through list control',async()=>{
 const {get,calls}=await runClient({configured:false});
 assert.equal(get('auditGscInspect').disabled,true);
 await get('auditPendingLoad').events.click();
 queueAdd(get,0);
 assert.equal(get('auditQueueItems').children.length,1);
 assert.equal(get('auditQueuePrepare').disabled,true);
 get('auditQueuePrepare').events.click();
 assert.equal(get('auditGscId').value,'');
 assert.equal(calls.length,2);
});
