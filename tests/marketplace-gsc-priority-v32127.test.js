'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const pending=require('../src/services/marketplace-gsc-uninspected-v32126');
const priority=require('../src/services/marketplace-gsc-priority-v32127');
const followup=require('../src/services/marketplace-gsc-followup-v32125');
const seo=require('../src/routes/marketplace-seo-v3251');

const sale=(id,changes={})=>({
 id:String(id),title:'Taza artesana personalizada '+id,
 description:'Taza de cerámica con fotografías originales y descripción detallada del producto.',
 category:'Tazas',created_at:'2026-09-20T10:00:00.000Z',updated_at:'2026-10-19T10:00:00.000Z',
 image_urls:['/uploads/taza-'+id+'.webp'],priority_band:0,...changes
});
test('V3.2.127 SQL ranks entire public SALE uninspected catalogue before LIMIT/OFFSET, never only a single page',()=>{
 const sql=pending.PRIORITY_PAGE_SQL;
 for(const clause of [
  "l.kind='product'","l.deal='sale'","l.status='active'",
  "l.moderation_status='published'","u.status='active'","u.discoverable=true",
  'JOIN users u ON u.id=l.seller_id','NOT EXISTS',
  "s.checked_at>=now()-interval '90 days'",'photo.url ~*',
  "l.created_at <= now()-interval '7 days'",
  'ORDER BY priority_band ASC,l.created_at ASC,l.id ASC LIMIT $2 OFFSET $3'
 ])assert.ok(sql.includes(clause),clause);
 assert.match(sql,/CASE WHEN NOT \(/);
 assert.match(sql,/jsonb_array_elements_text/);
 assert.match(sql,/char_length\(btrim\(COALESCE\(l\.description,''\)\)\) >= 35/);
 assert.match(sql,/char_length\(btrim\(COALESCE\(l\.title,''\)\)\) >= 10/);
 assert.doesNotMatch(sql,/condition='new'|details->>'condition'|brand|gtin|seller_email|stripe/);
 assert.equal(pending.PAGE_SQL.includes('ORDER BY l.updated_at DESC,l.id DESC'),true);
 assert.equal(priority.AGE_DAYS,7);
 assert.equal(priority.TITLE_MIN,10);
 assert.equal(priority.DESCRIPTION_MIN,35);
 assert.equal(pending.PAGE_SIZE,20);
 assert.equal(followup.RETENTION_DAYS,90);
});
test('V3.2.127 priority advice is transparent and based on original photo, title, description and category',()=>{
 const a=priority.guidance(sale(1));
 assert.equal(a.code,'review_first');
 assert.equal(a.label,'Revisar primero');
 assert.deepEqual(a.attention,[]);
 assert.match(a.note,/NO es una puntuación/);
 const b=priority.guidance(sale(2,{priority_band:1}));
 assert.equal(b.code,'ready_recent');
 assert.deepEqual(b.attention,[]);
 assert.match(b.why,/menos de siete días/);
 const c=priority.guidance(sale(3,{
  priority_band:2,title:'Taza',description:'Breve',category:'',
  image_urls:['https://external.example/private.jpg']
 }));
 assert.equal(c.code,'improve_card');
 assert.equal(c.attention.length,4);
 assert.match(c.attention.join(' '),/fotografía|fotografia/i);
 assert.match(c.attention.join(' '),/Título original/);
 assert.match(c.attention.join(' '),/Descripción original/);
 assert.match(c.attention.join(' '),/Categoría/);
 assert.doesNotMatch(c.attention.join(' '),/GTIN|marca|nuevo|usado/);
 const d=priority.guidance(sale(4,{priority_band:0,image_urls:['/uploads/x.jpg','/uploads/x.jpg']}));
 assert.equal(d.code,'review_first');
 assert.deepEqual(d.attention,[]);
 const e=priority.guidance(sale(5,{priority_band:0,image_urls:[]}));
 assert.equal(e.code,'improve_card'); // Defensive rendering of inconsistent DB rows.
 assert.equal(e.attention[0],'Sin fotografía local reconocida');
 const f=priority.guidance(sale(6,{priority_band:2,title:'Taza Cuphead',
  description:'Taza Cuphead personalizada artesanal con un diseño original único.',category:'Dibujos Animados'}));
 assert.equal(f.attention.length,0);
 assert.equal(f.code,'improve_card'); // Stored SQL priority is authoritative.
});
test('V3.2.127 order selector is allowlisted and preserves legacy recent query',async()=>{
 assert.equal(pending.parseOrder(undefined),'recent');
 assert.equal(pending.parseOrder(''),'recent');
 assert.equal(pending.parseOrder('recent'),'recent');
 assert.equal(pending.parseOrder('priority'),'priority');
 for(const value of ['random','google','indexed','recent;DROP TABLE','Priority',[],{},null,1]){
  if(value===null)assert.equal(pending.parseOrder(value),'recent');
  else assert.equal(pending.parseOrder(value),null,String(value));
 }
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql===pending.COUNT_SQL)return {rows:[{eligible_total:55,pending_total:50}]};
  if([pending.PAGE_SQL,pending.PRIORITY_PAGE_SQL].includes(sql))
   return {rows:Array.from({length:21},(_,i)=>sale(i+1,{priority_band:i%3}))};
  throw Error('Unexpected DB query');
 }};
 const ranked=await pending.pending(db,{listingPath:seo.listingPath,page:2,search:'taza',order:'priority'});
 assert.equal(ranked.order,'priority');
 assert.match(ranked.priorityNote,/Orden editorial de revisión/);
 assert.equal(ranked.products.length,20);
 assert.equal(ranked.products[0].reviewPriority.code,'review_first');
 assert.equal(ranked.products[1].reviewPriority.code,'ready_recent');
 assert.equal(ranked.products[2].reviewPriority.code,'improve_card');
 assert.equal(ranked.products[0].path,'/marketplace/p/1/taza-artesana-personalizada-1');
 assert.deepEqual(calls.at(-1).args,['taza',21,20]);
 assert.equal(calls.at(-1).sql,pending.PRIORITY_PAGE_SQL);
 assert.equal(ranked.withoutRecentInspection,50);
 assert.equal(ranked.inspectedInWindow,5);
 const legacy=await pending.pending(db,{listingPath:seo.listingPath,page:1,search:'taza'});
 assert.equal(legacy.order,'recent');
 assert.equal(calls.at(-1).sql,pending.PAGE_SQL);
 assert.ok(!Object.hasOwn(legacy.products[0],'reviewPriority'));
 await assert.rejects(pending.pending(db,{listingPath:seo.listingPath,order:'indexed'}),/invalid_pending_arguments/);
 assert.doesNotMatch(JSON.stringify(ranked),/image_urls|description|seller_id|personal_token|OAuth/);
});
test('V3.2.127 server endpoint keeps administrator restriction and never calls Google or changes listings',()=>{
 const route=fs.readFileSync('src/routes/marketplace-gsc-v32123.js','utf8');
 const service=fs.readFileSync('src/services/marketplace-gsc-priority-v32127.js','utf8');
 const fragment=route.slice(route.indexOf("router.get('/pendientes'"),route.indexOf("router.get('/seguimiento'"));
 assert.match(fragment,/router\.get\('\/pendientes',requireAdmin/);
 assert.match(fragment,/const order=uninspected\.parseOrder\(req\.query\?\.orden\)/);
 assert.match(fragment,/uninspected\.pending\(db,\{listingPath,page,search,order\}\)/);
 assert.match(fragment,/Cache-Control','private,no-store'/);
 assert.match(fragment,/X-Robots-Tag','noindex,nofollow'/);
 assert.doesNotMatch(fragment,/fetch\(|gsc\.inspect|router\.post|followup\.save|INSERT INTO marketplace_listings/);
 assert.doesNotMatch(service,/fetch\(|https:\/\/oauth2|index:inspect|INSERT INTO marketplace_listings|UPDATE marketplace_listings|DELETE FROM marketplace_listings|sk_live_/);
});
test('V3.2.127 mobile priorities visible, search and page preserve user order, no Google requests',async()=>{
 class Element{
  constructor(name='node'){
   this.name=name;this.children=[];this.events={};this.textContent='';
   this.value='';this.hidden=false;this.disabled=false;this.href=undefined;
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
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 assert.match(html,/id="auditPendingOrder"/);
 assert.match(html,/<option value="priority" selected>/);
 assert.match(html,/No es una puntuación de Google/);
 assert.match(html,/v=3\.2\.127/);
 assert.match(css,/audit-pending-priority-improve_card/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|eval\(/);
 get('auditPendingOrder').value='priority';
 const audit={
  ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-20T12:00:00Z',
  googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configurada'},
  totals:{publicListings:10,products:10,services:0,properties:0},
  limits:{recentSample:0},checks:[],informational:[],categories:[],examples:[],issueLabels:{}
 };
 const rows=page=>({
  ok:true,source:'public_products_without_recent_saved_manual_inspection',
  order:page.order,priorityNote:'Prioridad editorial para revisión, no Google.',
  page:page.page,products:page.page===1?[
   {...sale(5),path:'/marketplace/p/5/taza-5',
    reviewPriority:priority.guidance(sale(5))},
   {...sale(6,{priority_band:2,title:'Taza',image_urls:[],description:'Breve'}),
    path:'/marketplace/p/6/taza',
    reviewPriority:priority.guidance(sale(6,{priority_band:2,title:'Taza',image_urls:[],description:'Breve'}))}
  ]:[{...sale(7),path:'/marketplace/p/7/taza-7',
   reviewPriority:priority.guidance(sale(7))}],
  hasPrevious:page.page>1,hasNext:page.page===1,
  totalPublicSaleProducts:10,withoutRecentInspection:10,inspectedInWindow:0
 });
 const calls=[],fetch=async(url,opt)=>{
  calls.push({url,opt});
  const query=url.includes('/gsc/pendientes');
  const page=url.includes('pagina=2')?2:1;
  const order=url.includes('orden=priority')?'priority':'recent';
  return {ok:true,status:200,json:async()=>query?rows({page,order}):audit};
 };
 vm.runInNewContext(js,{document:{getElementById:get,createElement:name=>new Element(name)},
  fetch,Intl,Date,Number,String,Array,Object,Error,Promise});
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls.length,1);
 get('auditPendingSearch').value='taza';
 await get('auditPendingLoad').events.click();
 assert.equal(calls.length,2);
 assert.match(calls[1].url,/pagina=1&q=taza&orden=priority/);
 assert.equal(get('auditPendingItems').children.length,2);
 const first=get('auditPendingItems').children[0];
 assert.ok(first.children.some(x=>x.className?.includes('audit-pending-priority-review_first')));
 const second=get('auditPendingItems').children[1];
 assert.ok(second.children.some(x=>x.className?.includes('audit-pending-priority-improve_card')));
 second.children.at(-1).children.at(-1).events.click(); // manual inspection prep, never a Google request
 assert.equal(get('auditGscId').value,'6');
 assert.equal(calls.length,2);
 await get('auditPendingNext').events.click();
 assert.equal(calls.length,3);
 assert.match(calls[2].url,/pagina=2&q=taza&orden=priority/);
 get('auditPendingOrder').value='recent';
 await get('auditPendingLoad').events.click();
 assert.equal(calls.length,4);
 assert.match(calls[3].url,/pagina=1&q=taza&orden=recent/);
 assert.equal(get('auditPendingItems').children.length,2);
 assert.ok(!get('auditPendingItems').children[0].children.some(x=>
  x.className?.includes('audit-pending-priority')));
 assert.ok(calls.every(x=>x.opt.method==='GET'));
});
