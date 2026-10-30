'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {TOPICS,validTopic,publishedTopic,topicSummary,eligibility}=
 require('../src/services/resuelve-topics-v3531');
const {renderTopicPage,xmlTopicsSitemap}=require('../src/routes/resuelve-topics-v3531');

test('V3.5.31: topic taxonomy is explicit, validated and never auto-inferred from question text',()=>{
 const service=read('src/services/resuelve-v350.js');
 const api=read('src/routes/resuelve-v350.js');
 assert.deepEqual(Object.keys(TOPICS),['hogar','tecnologia','tramites','estudios','vida-cotidiana']);
 assert.equal(validTopic('hogar'),true);
 for(const bad of ['foo','<script>','HOGAR',{},null])assert.equal(validTopic(bad),false);
 assert.match(service,/ADD COLUMN IF NOT EXISTS topic VARCHAR\(24\)/);
 assert.match(service,/CHECK\(topic IS NULL OR topic IN/);
 assert.match(service,/professional_help_requested,topic\) VALUES\(\$1,\$2,\$3,\$4,\$5,\$6\)/);
 assert.match(service,/data\.topic\|\|null/);
 assert.match(api,/service\.TOPICS\.includes\(req\.body\?\.topic\)/);
 assert.match(api,/router\.post\('\/questions\/:id\/topic',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(api,/service\.setQuestionTopic\(req\.params\.id,req\.user\.id,topic\|\|null\)/);
 assert.match(service,/WHERE id=\$1 AND author_id=\$2 AND status IN \('open','resolved'\) RETURNING id,topic/);
 assert.doesNotMatch(service.slice(service.indexOf('async function setQuestionTopic('),service.indexOf('// V3.5.24')),/seo_public_opt_in\s*=/);
});

test('V3.5.31: all public topic queries enforce consent and editorial approval',()=>{
 assert.match(eligibility,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(eligibility,/q\.status='resolved'/);
 assert.match(eligibility,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(eligibility,/a\.status='visible'/);
 assert.match(eligibility,/author\.status='active'/);
 assert.match(eligibility,/respondent\.status='active'/);
 assert.match(eligibility,/char_length\(trim\(split_part\(a\.body/);
 assert.match(eligibility,/char_length\(trim\(q\.body\)\)>=50/);
 const sql=read('src/services/resuelve-topics-v3531.js');
 assert.match(sql,/AND q\.topic=\$1/);
 assert.match(sql,/GROUP BY q\.topic/);
 assert.match(sql,/ORDER BY q\.solved_at DESC,q\.id DESC LIMIT 16/);
 assert.doesNotMatch(eligibility,/email|phone|password|reporter_id/);
});

test('V3.5.31: database counts reflect only matching approved topic solutions',async()=>{
 const db=require('../src/db');
 const original=db.query;
 const calls=[];
 db.query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('GROUP BY q.topic'))return {rows:[
   {topic:'hogar',approved_count:3},{topic:'estudios',approved_count:1},
   {topic:'inexistente',approved_count:100}
  ],rowCount:3};
  if(sql.includes('ORDER BY q.solved_at DESC,q.id DESC LIMIT 16'))return {rows:[
   {id:'7',title:'Ayuda',solution:'Respuesta pública aprobada',solved_at:'2026-10-20'}
  ],rowCount:1};
  return {rows:[],rowCount:0};
 };
 try{
  const counts=await topicSummary();
  assert.deepEqual(counts,{
   hogar:3,tecnologia:0,tramites:0,estudios:1,'vida-cotidiana':0
  });
  const items=await publishedTopic('hogar');
  assert.equal(items.length,1);
  assert.deepEqual(calls.find(c=>c.sql.includes('ORDER BY q.solved_at DESC,q.id DESC LIMIT 16')).args,['hogar']);
  assert.equal(await publishedTopic('no-existe'),null);
 }finally{db.query=original;}
});

test('V3.5.31: thin topics never index, public text is escaped and sitemap excludes them',()=>{
 const item={id:'15',title:'Ayuda <script>alert(1)</script>',
  solution:'Una persona compartió <img src=x onerror=alert(1)> una solución práctica.'};
 const one=renderTopicPage('hogar',[item],1);
 assert.match(one,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(one,/<script>alert\(1\)<\/script>|<img src=x onerror=/);
 assert.match(one,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 const three=renderTopicPage('hogar',[item,{...item,id:'16'},{...item,id:'17'}],3);
 assert.match(three,/name="robots" content="index,follow"/);
 assert.match(three,/\"@type\":\"CollectionPage\"/);
 assert.doesNotMatch(three,/aggregateRating|ratingValue|\"reviewCount\"/);
 const xml=xmlTopicsSitemap({hogar:3,tecnologia:1,tramites:0,estudios:4,'vida-cotidiana':2});
 assert.match(xml,/\/resuelve\/temas\/hogar/);
 assert.match(xml,/\/resuelve\/temas\/estudios/);
 assert.doesNotMatch(xml,/\/resuelve\/temas\/tecnologia|\/resuelve\/temas\/tramites|\/resuelve\/temas\/vida-cotidiana/);
 assert.throws(()=>renderTopicPage('desconocido',[],3),/tema_invalido/);
});

test('V3.5.31: topic pages and sitemap are public but fail closed on empty or unavailable data',()=>{
 const topicRoute=read('src/routes/resuelve-topics-v3531.js');
 const server=read('server.js');
 assert.match(topicRoute,/if\(!topics\.validTopic\(topic\)\)return res\.status\(404\)/);
 assert.match(topicRoute,/if\(!items\.length\)return res\.status\(404\)/);
 assert.match(topicRoute,/items\.length>=3&&counts\[topic\]>=3/);
 assert.match(topicRoute,/res\.set\('X-Robots-Tag','noindex,follow'\)/);
 assert.match(topicRoute,/res\.set\('Cache-Control','no-store'\)/);
 assert.match(server,/app\.use\('\/resuelve',resuelveTopicsV3531\)/);
 assert.match(server,/app\.get\('\/sitemap-resuelve-temas\.xml',topicsSitemapHandler\)/);
 assert.match(server,/Sitemap: \$\{origin\}\/sitemap-resuelve-temas\.xml/);
 assert.match(server,/escapeHtml\(origin\+'\/sitemap-resuelve-temas\.xml'\)/);
 assert.ok(server.indexOf("app.use('/resuelve',resuelveTopicsV3531)")<server.indexOf("app.get('*',"));
});

test('V3.5.31: optional topic selection and links do not override SEO consent',()=>{
 const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js');
 for(const key of ['hogar','tecnologia','tramites','estudios','vida-cotidiana'])
  assert.ok(html.includes('<option value="'+key+'">'));
 assert.match(html,/id="resuelveTopicsLinks"/);
 assert.match(js,/async function loadTopicHubs\(\)/);
 assert.match(js,/if\(count<3\)continue/);
 assert.match(js,/request\('\/api\/resuelve\/topics\/summary'\)/);
 assert.match(js,/write\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(q\.id\)\+'\/topic',\{topic:selector\.value\|\|null\}\)/);
 assert.match(js,/Cambiar el tema no activa el permiso para Google/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});
