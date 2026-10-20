'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');

const make=(coverageState,verdict='NEUTRAL',other={})=>({
 source:'google_search_console_url_inspection',verdict,coverageState,
 pageFetchState:'SUCCESSFUL',robotsTxtState:'ALLOWED',
 ...other
});

test('V3.2.125 classify only grounded Google verdict and coverage, including discovered Taza Roblox',()=>{
 const cases=[
  [make('Submitted and indexed','PASS'),'indexed'],
  [make('Indexada', 'PASS'),'indexed'],
  [make('Discovered - currently not indexed'),'discovered'],
  [make('Descubierta: actualmente sin indexar'),'discovered'],
  [make('Crawled - currently not indexed'),'crawled'],
  [make('Rastreada: sin indexar'),'crawled'],
  [make('Blocked by robots.txt','FAIL'),'technical'],
  [make('Some issue','FAIL',{pageFetchState:'BLOCKED_ROBOTS_TXT'}),'technical'],
  [make('Server error (5xx)','FAIL'),'technical'],
  [make('Duplicate, Google chose different canonical','NEUTRAL'),'excluded'],
  [make('Alternate page with proper canonical tag'),'excluded'],
  [make('Not yet classified'),'unknown'],
  [make('Submitted and indexed','NEUTRAL'),'unknown'],
  [make('','VERDICT_UNSPECIFIED'),'unknown']
 ];
 for(const [inspection,expected] of cases){
  assert.equal(followup.classify(inspection),expected,inspection.coverageState);
  const summary=followup.interpretation(inspection);
  assert.equal(summary.code,expected);
  assert.ok(summary.label.length>8);
  assert.ok(summary.advice.length>40);
  assert.match(summary.note,/versión guardada por Google/);
  assert.doesNotMatch(summary.advice,/garantiza la indexación|te indexará/i);
 }
 assert.equal(followup.classify(make('Unclear','NEUTRAL',{robotsTxtState:'DISALLOWED'})),'technical');
 assert.deepEqual(followup.STATUS_KEYS,['indexed','discovered','crawled','technical','excluded','unknown']);
});
test('V3.2.125 manual success stores only explicitly allowlisted fields, no raw payload or credentials',async()=>{
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql===followup.INSERT_SQL)return {rows:[{checked_at:'2026-10-20T11:00:00Z'}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const inspection=make('Discovered - currently not indexed');
 inspection.lastCrawlTime=null;
 inspection.googleCanonical='https://evil.example/?secret=NO';
 inspection.access_token='sensitive-token';
 inspection.private_key='private-key-sensitive';
 inspection.sitemap=['https://another.example/sitemap.xml'];
 const saved=await followup.save(db,{listingId:'5',inspection});
 assert.equal(saved.status,'discovered');
 assert.equal(calls.length,followup.DDL.length+2);
 assert.equal(calls.filter(x=>x.sql===followup.INSERT_SQL).length,1);
 assert.equal(calls.filter(x=>x.sql===followup.PRUNE_SQL).length,1);
 assert.deepEqual(calls.find(x=>x.sql===followup.INSERT_SQL).args,
  ['5','discovered','NEUTRAL','Discovered - currently not indexed',null]);
 const sqlJson=JSON.stringify(calls);
 assert.doesNotMatch(sqlJson,/sensitive-token|private-key-sensitive|evil\.example|another\.example|GoogleCanonical/);
 assert.match(followup.DDL[0],/ON DELETE CASCADE/);
 assert.match(followup.DDL[0],/status_code IN \('indexed'/);
 assert.match(followup.PRUNE_SQL,/90 days/);
 assert.match(followup.PRUNE_SQL,/LIMIT 8/);
 assert.match(followup.HISTORY_SQL,/LIMIT 30/);
 await assert.rejects(followup.save(db,{listingId:'1',inspection:{...inspection,source:'fabricated'}}),/gsc_followup_invalid_source/);
 await assert.rejects(followup.save(db,{listingId:'../1',inspection}),/gsc_followup_invalid_source/);
 assert.equal(calls.length,followup.DDL.length+2);
 assert.equal(followup.safeCrawlTime('2026-10-20T14:00:00Z'),'2026-10-20T14:00:00.000Z');
 assert.equal(followup.safeCrawlTime('not-a-date'),null);
});
test('V3.2.125 history returns bounded visible listing links, previous state and no Google requests',async()=>{
 const requests=[];
 const db={query:async(sql)=>{
  requests.push(sql);
  if(sql===followup.HISTORY_SQL)return {rows:[
   {
    listing_id:'5',listing_title:'Taza Roblox',status_code:'indexed',
    previous_status_code:'discovered',coverage_state:'Submitted and indexed',
    checked_at:'2026-10-20T10:00:00.000Z',last_crawl_time:'2026-10-19T07:00:00Z'
   },
   {
    listing_id:'11',listing_title:'Armario Turín',status_code:'crawled',
    previous_status_code:'crawled',coverage_state:'Crawled - currently not indexed',
    checked_at:'2026-10-19T08:00:00.000Z',last_crawl_time:null
   }
  ]};
  return {rows:[]};
 }};
 const report=await followup.history(db,{listingPath:seo.listingPath});
 assert.equal(report.ok,true);
 assert.equal(report.source,'stored_manual_search_console_inspections');
 assert.equal(report.retentionDays,90);
 assert.equal(report.maximumProducts,30);
 assert.equal(report.products.length,2);
 assert.deepEqual(report.products.map(x=>x.status),['indexed','crawled']);
 assert.deepEqual(report.products.map(x=>x.changed),[true,false]);
 assert.equal(report.products[0].previousStatus,'discovered');
 assert.equal(report.products[0].path,'/marketplace/p/5/taza-roblox');
 assert.equal(report.counts.indexed,1);
 assert.equal(report.counts.crawled,1);
 assert.equal(report.counts.discovered,0);
 assert.match(report.note,/NO llama a Google/);
 assert.equal(requests.at(-1),followup.HISTORY_SQL);
 assert.match(followup.HISTORY_SQL,/l\.status='active'/);
 assert.match(followup.HISTORY_SQL,/l\.moderation_status='published'/);
 assert.match(followup.HISTORY_SQL,/u\.status='active'/);
 assert.match(followup.HISTORY_SQL,/u\.discoverable=true/);
 assert.match(followup.HISTORY_SQL,/l\.kind='product'/);
 assert.match(followup.HISTORY_SQL,/l\.deal='sale'/);
 assert.doesNotMatch(JSON.stringify(report),/access_token|private_key|seller_email|user\.password|bearer/i);
 await assert.rejects(followup.history(db),/listing_path_required/);
});
test('V3.2.125 history is admin-only and no background Google calls or arbitrary ad IDs',()=>{
 const route=fs.readFileSync('src/routes/marketplace-gsc-v32123.js','utf8');
 const service=fs.readFileSync('src/services/marketplace-gsc-followup-v32125.js','utf8');
 assert.match(route,/router\.get\('\/seguimiento',requireAdmin/);
 assert.match(route,/router\.post\('\/inspeccionar',requireAdmin,sameOriginJson,limiter/);
 assert.match(route,/followup\.history\(db,\{listingPath\}\)/);
 assert.match(route,/followup\.save\(db,\{listingId:id,inspection\}\)/);
 assert.match(route,/rows\.rows\[0\]\.kind==='product'&&rows\.rows\[0\]\.deal==='sale'/);
 assert.match(route,/Cache-Control','private,no-store'/);
 assert.match(route,/X-Robots-Tag','noindex,nofollow'/);
 assert.match(service,/ON DELETE CASCADE/);
 assert.doesNotMatch(service,/fetch\(|https:\/\/oauth2|index:inspect|INSERT INTO marketplace_listings|UPDATE marketplace_listings|Stripe|sk_live_/);
});
test('V3.2.125 mobile followup GET happens only upon explicit click, and existing Google inspection stays manual',async()=>{
 class Element{
  constructor(name){this.name=name;this.children=[];this.events={};this.textContent='';this.value='todos';this.hidden=false;this.disabled=false;}
  replaceChildren(...v){this.children=[...v];}
  append(...v){this.children.push(...v);}
  addEventListener(n,fn){this.events[n]=fn;}
 }
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 for(const id of ['auditFollowupLoad','auditFollowupFilter','auditFollowupStatus','auditFollowupCounts','auditFollowupEntries','auditGscInterpretation'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/Consultar este historial no llama a Google ni gasta cuota/);
 assert.match(html,/v=3\.2\.125/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|eval\(/);
 node('auditExampleFilter').value='todos';
 const audit={
  ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-20T10:00:00Z',
  googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configurado'},
  limits:{recentSample:0},totals:{publicListings:2,products:2,services:0,properties:0},
  checks:[],informational:[],categories:[],examples:[],issueLabels:{}
 };
 const rows=[
  {id:'5',title:'Taza Roblox',path:'/marketplace/p/5/taza-roblox',
   status:'indexed',previousStatus:'discovered',changed:true,label:'Indexado según Google',
   advice:'Revisar en Search Console',coverageState:'Submitted and indexed',checkedAt:'2026-10-20T10:00:00Z'},
  {id:'12',title:'Taza Azul',path:'/marketplace/p/12/taza-azul',
   status:'discovered',previousStatus:null,changed:false,label:'Descubierto',
   advice:'Esperar rastreo',coverageState:'Discovered - currently not indexed',checkedAt:'2026-10-19T10:00:00Z'}
 ];
 const saved={
  ok:true,source:'stored_manual_search_console_inspections',products:rows,
  counts:{indexed:1,discovered:1,crawled:0,technical:0,excluded:0,unknown:0}
 };
 const inspection={
  source:'google_search_console_url_inspection',
  inspectionUrl:'https://redlibertad.com/marketplace/p/5/taza-roblox',
  verdict:'PASS',coverageState:'Submitted and indexed',sitemaps:[]
 };
 const response={ok:true,inspection,followup:followup.interpretation(inspection),followupSaved:true};
 const calls=[];
 const fetch=async(url,opt)=>{
  calls.push({url,opt});
  return {ok:true,status:200,json:async()=>{
   if(url.includes('/gsc/seguimiento'))return saved;
   if(url.includes('/gsc/inspeccionar'))return response;
   return audit;
  }};
 };
 vm.runInNewContext(js,{
  document:{getElementById:node,createElement:tag=>new Element(tag)},
  fetch,Intl,Date,Number,String,Array,Object,Error,Promise
 });
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls.length,1);
 assert.equal(calls[0].opt.method,'GET');
 assert.equal(node('auditGscInspect').disabled,false);
 await node('auditFollowupLoad').events.click();
 assert.equal(calls.length,2);
 assert.equal(calls[1].opt.method,'GET');
 assert.equal(calls[1].url,'/api/admin/marketplace/seo/gsc/seguimiento');
 assert.equal(node('auditFollowupEntries').children.length,2);
 assert.match(node('auditFollowupStatus').textContent,/2 de 2 productos/);
 node('auditFollowupFilter').value='discovered';
 node('auditFollowupFilter').events.change();
 assert.equal(node('auditFollowupEntries').children.length,1);
 node('auditFollowupFilter').value='todos';
 node('auditFollowupFilter').events.change();
 const historyButton=node('auditFollowupEntries').children[0].children.at(-1);
 historyButton.events.click();
 assert.equal(node('auditGscId').value,'5');
 assert.equal(calls.length,2);
 await node('auditGscInspect').events.click();
 assert.equal(calls.length,3);
 assert.equal(calls[2].url,'/api/admin/marketplace/seo/gsc/inspeccionar');
 assert.equal(calls[2].opt.method,'POST');
 assert.equal(calls[2].opt.credentials,'same-origin');
 assert.equal(calls[2].opt.body,JSON.stringify({id:'5'}));
 assert.equal(node('auditGscInterpretation').hidden,false);
 assert.match(node('auditGscInterpretation').children[0].textContent,/Indexado/);
 assert.equal(node('auditGscResult').hidden,false);
});
