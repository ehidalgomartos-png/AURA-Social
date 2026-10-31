'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {createResuelveSeoDiagnostics,PUBLIC_TOPIC_MINIMUM,SOLUTIONS_SITEMAP_LIMIT,EDITORIAL_URLS}=
 require('../src/services/resuelve-seo-diagnostics-v3628');
const {eligibility,TOPICS}=require('../src/services/resuelve-topics-v3531');

function mockService({eligible,stages}={}){
 const calls=[];
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('GROUP BY q.topic'))return {rows:eligible??[
   {topic:'hogar',eligible_count:4},{topic:'tecnologia',eligible_count:2},{topic:null,eligible_count:1}
  ]};
  return {rows:[stages??{consented_resolved:11,awaiting_editorial:2,short_content:1,unavailable_answer:1}]};
 }};
 let ensureCount=0;
 const service=createResuelveSeoDiagnostics({db,ensureResuelve:async()=>{ensureCount++;}});
 return {service,calls,get ensures(){return ensureCount;}};
}
test('V3.6.28: aggregates real eligible public solutions with identical SQL to topic sitemap',async()=>{
 const mock=mockService();
 const result=await mock.service.summary();
 assert.equal(mock.ensures,1);
 assert.equal(mock.calls.length,2);
 const eligibleSql=mock.calls.find(c=>c.sql.includes('GROUP BY q.topic'));
 assert.ok(eligibleSql);
 assert.ok(eligibleSql.sql.includes(eligibility),'one consent/approval eligibility definition');
 assert.match(eligibleSql.sql,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(eligibleSql.sql,/q\.status='resolved'/);
 assert.match(eligibleSql.sql,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(eligibleSql.sql,/a\.status='visible'/);
 assert.match(eligibleSql.sql,/author\.status='active'/);
 assert.match(eligibleSql.sql,/respondent\.status='active'/);
 assert.match(eligibleSql.sql,/char_length\(trim\(q\.body\)\)>=50/);
 assert.match(eligibleSql.sql,/char_length\(trim\(split_part\(a\.body/);
 assert.equal(result.metrics.eligibleSolutions,7);
 assert.equal(result.metrics.consentedResolved,11);
 assert.equal(result.metrics.awaitingEditorial,2);
 assert.equal(result.metrics.shortContent,1);
 assert.equal(result.metrics.unavailableAnswer,1);
 assert.equal(result.metrics.withoutTopic,1);
 assert.equal(result.metrics.readyTopics,1);
 assert.equal(result.metrics.sitemapLimitReached,false);
 assert.equal(result.topics.length,5);
 assert.deepEqual(result.topics.map(t=>t.slug),Object.keys(TOPICS));
 assert.deepEqual(result.topics[0],{slug:'hogar',label:'Hogar',eligible:4,ready:true,missing:0});
 assert.deepEqual(result.topics[1],{slug:'tecnologia',label:'Tecnología',eligible:2,ready:false,missing:1});
 assert.equal(result.requirements.googleIndexingVerified,false);
 assert.equal(PUBLIC_TOPIC_MINIMUM,3);
 assert.equal(SOLUTIONS_SITEMAP_LIMIT,2000);
 assert.equal(result.editorialPages.length,3);
 assert.deepEqual(result.editorialPages.map(x=>x.path),EDITORIAL_URLS.map(x=>x.path));
});
test('V3.6.28: stages use only consented, resolved, non-opted-out and active owner questions',async()=>{
 const {service,calls}=mockService();
 await service.summary();
 const sql=calls.find(c=>!c.sql.includes('GROUP BY q.topic')).sql;
 assert.match(sql,/FROM resuelve_questions q/);
 assert.match(sql,/JOIN users author ON author\.id=q\.author_id AND author\.status='active'/);
 assert.match(sql,/LEFT JOIN resuelve_answers a ON a\.id=q\.accepted_answer_id AND a\.question_id=q\.id/);
 assert.match(sql,/LEFT JOIN users respondent ON respondent\.id=a\.author_id AND respondent\.status='active'/);
 assert.match(sql,/WHERE q\.status='resolved'/);
 assert.equal((sql.match(/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/g)||[]).length,4);
 assert.match(sql,/a\.status='visible'/);
 assert.match(sql,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(sql,/char_length\(trim\(q\.body\)\)<50/);
 assert.match(sql,/char_length\(trim\(split_part\(a\.body/);
 assert.doesNotMatch(sql,/SELECT\s+.*(?:email|phone|password|author_username)|\b(?:DELETE|UPDATE|INSERT)\b|messages\b/i);
});
test('V3.6.28: fails closed on missing or contradictory counts; never fabricates estimates',async()=>{
 const bad=[
  {eligible:[{topic:'hogar',eligible_count:-1}]},
  {eligible:[{topic:'hogar',eligible_count:'bad'}]},
  {eligible:[{topic:null,eligible_count:20}],stages:{consented_resolved:10,awaiting_editorial:0,short_content:0,unavailable_answer:0}},
  {stages:{consented_resolved:4,awaiting_editorial:2,short_content:1,unavailable_answer:1}}
 ];
 for(const entry of bad){
  const {service}=mockService(entry);
  await assert.rejects(()=>service.summary(),/resuelve_seo_count_invalid|resuelve_seo_counts_inconsistent/);
 }
 const large=mockService({eligible:[{topic:'hogar',eligible_count:2001}],
  stages:{consented_resolved:2001,awaiting_editorial:0,short_content:0,unavailable_answer:0}});
 const result=await large.service.summary();
 assert.equal(result.metrics.sitemapLimitReached,true);
 assert.equal(result.metrics.eligibleSolutions,2001);
 assert.deepEqual(result.topics[0],{slug:'hogar',label:'Hogar',eligible:2001,ready:true,missing:0});
});
test('V3.6.28: route denies non-admins and admin HTML remains private and noindex',()=>{
 const route=read('src/routes/resuelve-v350.js');
 const start=route.indexOf("router.get('/admin/seo-diagnostics',requireAuth");
 const end=route.indexOf("router.get('/admin/solutions/pending'",start);
 assert.ok(start>0&&end>start);
 const block=route.slice(start,end);
 assert.match(block,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 assert.match(block,/await resuelveSeoDiagnostics\.summary\(\)/);
 assert.match(block,/res\.json\(\{ok:true,\.\.\.data,asOf:new Date\(\)\.toISOString\(\)\}\)/);
 assert.doesNotMatch(block,/POST|write|req\.query|req\.body|req\.params|setSeoConsent|sendEmail/i);
 assert.match(route,/router\.get\('\/admin\/seo-diagnostics',requireAuth/);
 const server=read('server.js');
 const html=read('src/views/resuelve-admin-v3519.html');
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/id="resuelveAdminContent" hidden/);
 assert.match(html,/id="adminSeoMetrics"/);
 assert.match(html,/id="adminSeoTopics"/);
 assert.match(html,/id="adminSeoStatus"/);
 assert.match(html,/id="refreshAdminSeo"/);
 assert.match(html,/href="#seo"/);
 assert.match(html,/no significa estar indexado en Google/);
 assert.match(html,/La indexación real se comprueba en Search Console/);
 const home=read('public/resuelve.html');
 assert.doesNotMatch(home,/adminSeoMetrics|adminSeoTopics|resuelve-admin-seo-v3628/);
});
test('V3.6.28: links are only fixed known URLs, no invented Google status or crawl claims',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 for(const link of ['/sitemap-resuelve.xml','/sitemap-resuelve-temas.xml','/sitemap-resuelve-presentacion.xml',
 '/resuelve/como-funciona','/resuelve/guia-pedir-ayuda','/resuelve/guia-ayudar-personas']){
  assert.match(html,new RegExp('href="'+link.replace(/\./g,'\\.')+'"'));
 }
 assert.match(html,/https:\/\/search\.google\.com\/search-console\//);
 const js=read('public/resuelve-admin-v3519.js');
 const start=js.indexOf(' // V3.6.28 — cifras SEO internas');
 const end=js.indexOf(' const requirements=[',start);
 assert.ok(start>0&&end>start);
 const block=js.slice(start,end);
 assert.match(block,/api\('\/api\/resuelve\/admin\/seo-diagnostics'\)/);
 assert.match(block,/googleIndexingVerified!==false/);
 assert.match(block,/El diagnóstico contiene cifras inválidas/);
 assert.match(block,/Estos valores indican requisitos internos, no páginas indexadas por Google/);
 assert.match(block,/límite de 2\.000/);
 assert.doesNotMatch(block,/\.innerHTML\s*=|googleIndexed|indexedByGoogle|robots\.txt.*fetch|XMLHttpRequest/);
 const css=read('public/resuelve-admin-v3519.css');
 const section=css.slice(css.indexOf('/* V3.6.28 — informe SEO privado'));
 assert.match(section,/resuelve-seo-topics-v3628/);
 assert.match(section,/:focus-visible/);
 assert.match(section,/@media\(max-width:650px\)/);
 assert.match(section,/min-height:47px/);
 assert.doesNotMatch(section,/display:none|visibility:hidden|position:fixed/);
});
function runClient(data){
 const js=read('public/resuelve-admin-v3519.js');
 const start=js.indexOf(' async function seoDiagnostics(){');
 const end=js.indexOf(' const requirements=[',start);
 assert.ok(start>0&&end>start);
 const elements={
  refreshAdminSeo:{disabled:false},
  adminSeoMetrics:{children:[],replaceChildren(...children){this.children=children;}},
  adminSeoTopics:{children:[],replaceChildren(...children){this.children=children;}},
  adminSeoStatus:{textContent:''}
 };
 const node=(tag,cls,value)=>({tag,cls,textContent:value===undefined?'':String(value),
  children:[],append(...children){this.children.push(...children);}});
 const requests=[];
 const ctx=vm.createContext({el:id=>elements[id],node,api:async url=>{requests.push(url);return data;}});
 vm.runInContext(js.slice(start,end)+';globalThis.renderSeo=seoDiagnostics;',ctx);
 return {run:ctx.renderSeo,elements,requests};
}
test('V3.6.28: admin cards render validated values and display honest topic shortfalls',async()=>{
 const server=await mockService().service.summary();
 const simulate=runClient({ok:true,...server,asOf:'2026-10-30T20:00:00Z'});
 await simulate.run();
 const {elements}=simulate;
 assert.deepEqual(simulate.requests,['/api/resuelve/admin/seo-diagnostics']);
 assert.equal(elements.adminSeoMetrics.children.length,7);
 assert.equal(elements.adminSeoTopics.children.length,5);
 assert.equal(elements.adminSeoMetrics.children[1].children[0].textContent,'7');
 assert.match(elements.adminSeoTopics.children[1].children[2].textContent,/Faltan 1 solución apta/);
 assert.match(elements.adminSeoTopics.children[0].children[2].textContent,/Cumple el mínimo/);
 assert.match(elements.adminSeoStatus.textContent,/no páginas indexadas por Google/);
 assert.equal(elements.refreshAdminSeo.disabled,false);
 const bad=runClient({...server,metrics:{...server.metrics,eligibleSolutions:NaN}});
 await bad.run();
 assert.equal(bad.elements.adminSeoMetrics.children.length,0);
 assert.match(bad.elements.adminSeoStatus.textContent,/cifras inválidas/);
 assert.equal(bad.elements.refreshAdminSeo.disabled,false);
});
