'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const pending=require('../src/services/marketplace-gsc-uninspected-v32126');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');

test('V3.2.126 only strict public sale products without a manual inspection saved in 90 days, no Google claim',()=>{
 assert.equal(pending.TABLE,followup.TABLE);
 assert.equal(pending.PAGE_SIZE,20);
 assert.equal(pending.MAX_PAGE,250);
 assert.equal(pending.MAX_QUERY,70);
 const combined=pending.COUNT_SQL+' '+pending.PAGE_SQL;
 for(const predicate of [
  "l.kind='product'","l.deal='sale'","l.status='active'",
  "l.moderation_status='published'","u.status='active'","u.discoverable=true",
  'JOIN users u ON u.id=l.seller_id'
 ])assert.ok(combined.includes(predicate),predicate);
 assert.match(combined,/NOT EXISTS/);
 assert.match(combined,/s\.listing_id=l\.id/);
 assert.match(combined,/90 days/);
 assert.match(pending.PAGE_SQL,/ORDER BY l\.updated_at DESC,l\.id DESC LIMIT \$2 OFFSET \$3/);
 assert.match(pending.COUNT_SQL,/COUNT\(\*\) FILTER/);
 assert.doesNotMatch(combined,/s\.status_code='indexed'|WHERE .*?indexable|DELETE|UPDATE marketplace_listings/i);
 const service=fs.readFileSync('src/services/marketplace-gsc-uninspected-v32126.js','utf8');
 assert.doesNotMatch(service,/fetch\(|oauth2\.googleapis|searchconsole\.googleapis|index:inspect|api\/indexing|Stripe|sk_live_/);
});
test('V3.2.126 strict validation prevents huge pages, malformed searches or arbitrary SQL filters',()=>{
 assert.equal(pending.parsePage(undefined),1);
 assert.equal(pending.parsePage(''),1);
 assert.equal(pending.parsePage('1'),1);
 assert.equal(pending.parsePage('250'),250);
 for(const value of ['0','251','-1','1.1','00','01','99999','1;DROP TABLE',[],{}])
  assert.equal(pending.parsePage(value),null,String(value));
 assert.equal(pending.parseSearch(undefined),'');
 assert.equal(pending.parseSearch('  Taza Roblox '),'Taza Roblox');
 assert.equal(pending.parseSearch('taza%_'),'taza%_');
 assert.equal(pending.parseSearch('X'.repeat(71)),null);
 assert.equal(pending.parseSearch('taza\nborrar'),null);
 assert.equal(pending.parseSearch(['taza']),null);
 assert.equal(pending.parseSearch({q:'taza'}),null);
});
test('V3.2.126 listing returns bounded, safe pages, truthful counts, client search as literal argument',async()=>{
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql===pending.COUNT_SQL)
   return {rows:[{eligible_total:46,pending_total:38}]};
  if(sql===pending.PAGE_SQL)
   return {rows:Array.from({length:21},(_,i)=>({
    id:String(i+1),title:'Taza '+(i+1),category:'Regalos',
    updated_at:'2026-10-20T10:00:00Z'
   }))};
  throw Error('unexpected SQL');
 }};
 const data=await pending.pending(db,{listingPath:seo.listingPath,page:2,search:'taza%_'});
 assert.equal(data.ok,true);
 assert.equal(data.source,'public_products_without_recent_saved_manual_inspection');
 assert.equal(data.page,2);
 assert.equal(data.pageSize,20);
 assert.equal(data.products.length,20);
 assert.equal(data.totalPublicSaleProducts,46);
 assert.equal(data.withoutRecentInspection,38);
 assert.equal(data.inspectedInWindow,8);
 assert.equal(data.hasPrevious,true);
 assert.equal(data.hasNext,true);
 assert.equal(data.search,'taza%_');
 assert.equal(data.products[0].path,'/marketplace/p/1/taza-1');
 assert.equal(data.products[0].updatedAt,'2026-10-20T10:00:00.000Z');
 assert.deepEqual(calls.find(c=>c.sql===pending.COUNT_SQL).args,['taza%_']);
 assert.deepEqual(calls.find(c=>c.sql===pending.PAGE_SQL).args,['taza%_',21,20]);
 assert.match(data.note,/NO significa que Google desconozca la URL/);
 assert.match(data.note,/No se consulta Google/);
 assert.equal(JSON.stringify(data).includes('indexado:false'),false);
 const emptyDb={query:async(sql)=>sql===pending.COUNT_SQL
  ?{rows:[{eligible_total:0,pending_total:0}]}:{rows:[]}};
 const empty=await pending.pending(emptyDb,{listingPath:seo.listingPath});
 assert.equal(empty.products.length,0);
 assert.equal(empty.hasPrevious,false);
 assert.equal(empty.hasNext,false);
 await assert.rejects(pending.pending(db,{listingPath:seo.listingPath,page:999}),/invalid_pending_arguments/);
 await assert.rejects(pending.pending(db,{listingPath:seo.listingPath,search:' X '}),/invalid_pending_arguments/);
});
test('V3.2.126 server admin endpoint only reads public product list; uses no-store and rejects invalid filters',()=>{
 const route=fs.readFileSync('src/routes/marketplace-gsc-v32123.js','utf8');
 assert.match(route,/router\.get\('\/pendientes',requireAdmin/);
 assert.match(route,/uninspected\.parsePage\(req\.query\?\.pagina\)/);
 assert.match(route,/uninspected\.parseSearch\(req\.query\?\.q\)/);
 assert.match(route,/await followup\.ensureSchema\(db\)/);
 assert.match(route,/uninspected\.pending\(db,\{listingPath,page,search\}\)/);
 const section=route.slice(route.indexOf("router.get('/pendientes'"),route.indexOf("router.get('/seguimiento'"));
 assert.match(section,/Cache-Control','private,no-store'/);
 assert.match(section,/X-Robots-Tag','noindex,nofollow'/);
 assert.doesNotMatch(section,/router\.post|gsc\.inspect|fetch\(|await followup\.save|INSERT INTO marketplace_listings/);
});
test('V3.2.126 admin mobile UI only loads on a click; page/search have no Google calls, and prepare never inspects',async()=>{
 class Element{
  constructor(name='node'){
   this.name=name;this.children=[];this.events={};this.textContent='';this.value='';
   this.hidden=false;this.disabled=false;this.href=undefined;
  }
  replaceChildren(...items){this.children=[...items];}
  append(...items){this.children.push(...items);}
  addEventListener(name,handler){this.events[name]=handler;}
 }
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,new Element(id));
  return elements.get(id);
 };
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 for(const id of [
  'auditPendingLoad','auditPendingSearch','auditPendingStatus','auditPendingCounts','auditPendingItems',
  'auditPendingPagination','auditPendingPrevious','auditPendingNext','auditPendingPage'
 ])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/Esto NO significa que Google desconozca esas URLs/);
 assert.match(html,/v=3\.2\.126/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|eval\(/);
 const audit={
  ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-20T10:00:00Z',
  googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configuración válida'},
  totals:{publicListings:40,products:38,services:1,properties:1},
  limits:{recentSample:0},checks:[],informational:[],categories:[],examples:[],issueLabels:{}
 };
 const list=(page)=>({
  ok:true,source:'public_products_without_recent_saved_manual_inspection',
  page,products:page===1?Array.from({length:20},(_,i)=>({
   id:String(i+10),title:'Taza '+(i+10),category:'Regalos',
   path:'/marketplace/p/'+(i+10)+'/taza-'+(i+10),updatedAt:'2026-10-20T10:00:00Z'
  })):[{id:'30',title:'Armario Turín',category:'Armarios',
   path:'/marketplace/p/30/armario-turin',updatedAt:'2026-10-20T10:00:00Z'}],
  hasPrevious:page>1,hasNext:page===1,totalPublicSaleProducts:38,withoutRecentInspection:21,
  inspectedInWindow:17
 });
 const calls=[],fetch=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,status:200,json:async()=>url.includes('/gsc/pendientes')
   ?list(url.includes('pagina=2')?2:1):audit};
 };
 const context={document:{getElementById:get,createElement:name=>new Element(name)},
  fetch,Intl,Date,Number,String,Array,Object,Error,Promise};
 vm.runInNewContext(js,context);
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/admin/marketplace/seo/auditoria');
 assert.equal(get('auditGscInspect').disabled,false);
 get('auditPendingSearch').value='taza';
 await get('auditPendingLoad').events.click();
 assert.equal(calls.length,2);
 assert.match(calls[1].url,/\/gsc\/pendientes\?pagina=1&q=taza/);
 assert.equal(calls[1].opts.method,'GET');
 assert.equal(get('auditPendingItems').children.length,20);
 assert.equal(get('auditPendingNext').disabled,false);
 assert.match(get('auditPendingStatus').textContent,/21 sin inspección manual guardada reciente/);
 const first=get('auditPendingItems').children[0];
 const prepare=first.children.at(-1);
 prepare.events.click();
 assert.equal(get('auditGscId').value,'10');
 assert.equal(calls.length,2);
 await get('auditPendingNext').events.click();
 assert.equal(calls.length,3);
 assert.match(calls[2].url,/pagina=2&q=taza/);
 assert.equal(get('auditPendingItems').children.length,1);
 assert.equal(get('auditPendingPrevious').disabled,false);
 await get('auditPendingPrevious').events.click();
 assert.equal(calls.length,4);
 assert.match(calls[3].url,/pagina=1&q=taza/);
 assert.equal(get('auditPendingItems').children.length,20);
 assert.ok(calls.every(x=>x.opts.method==='GET'));
});
