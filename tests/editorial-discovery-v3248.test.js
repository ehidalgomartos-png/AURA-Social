'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const utils=require('../public/editorial-discovery-v3248');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
test('news category query accepts only six finite safe categories and rejects arrays / injection',()=>{
 for(const id of utils.categories)assert.deepEqual(utils.filter(id),{valid:true,category:id});
 assert.deepEqual(utils.filter(undefined),{valid:true,category:''});
 for(const v of ['',null,1,['deportes'],'<script>','DEPORTES','deportes&x=1','toString']){
  assert.equal(utils.filter(v).valid,false);
 }
});
test('category navigation highlights only one selected item and uses canonical safe links',()=>{
 const html=utils.categoryTabs('deportes');
 assert.match(html,/aria-label="Filtrar noticias por categoría"/);
 assert.match(html,/href="\/noticias\?categoria=deportes" aria-current="page"/);
 assert.match(html,/href="\/noticias"/);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.doesNotMatch(html,/script|onclick=/);
});
test('recommendations are bounded to three, escape markup and include only explicit links',()=>{
 const rows=[
  {id:'7',title:'Noticias <script>abc</script>',summary:'<img src=x onerror=bad>'},
  {id:'8',title:'Segunda',summary:'Otra información'},
  {id:'9',title:'Tercera',summary:'Más actualidad'},
  {id:'10',title:'Cuarta',summary:'No se debe mostrar'},
  {id:'2 OR 1=1',title:'Malicious',summary:'Bad'}
 ];
 const html=utils.relatedNews(rows,'deportes');
 assert.match(html,/Más noticias de Deportes/);
 assert.match(html,/href="\/noticias\/p\/7"/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<script>|<img\b|Cuarta|Malicious/);
 assert.equal((html.match(/class="ed-related-card-v3248"/g)||[]).length,3);
 assert.equal(utils.relatedNews([],'deportes'),'');
});
test('public listing filters only live publications on server, no private content',()=>{
 const route=read('src/routes/editorial-publication-v323.js');
 assert.match(route,/discoveryV3248\.filter\(req\.query\.categoria\)/);
 assert.match(route,/AND pub\.category=\$1/);
 assert.match(route,/AND pub\.id<>\$2/);
 assert.match(route,/req\.query\.categoria/);
 assert.match(route,/return res\.redirect\(302,'\/noticias'\)/);
 assert.match(route,/discoveryV3248\.categoryTabs/);
 assert.match(route,/discoveryV3248\.relatedNews/);
 assert.match(route,/noindex:.*category/);
 assert.match(route,/LIMIT.*maxRows/);
 assert.match(route,/WHERE pub\.unpublished_at IS NULL AND ep\.status='ready'/);
 assert.doesNotMatch(route,/SELECT.+editorial_candidates.+FOR PUBLIC/);
});
test('low-friction conversation affordances are actual deep-links, never generated comments',()=>{
 const src=read('src/routes/editorial-publication-v323.js');
 assert.match(src,/Comentar noticia →/);
 assert.match(src,/#edDiscussion/);
 assert.match(src,/id="edDiscussion"/);
 assert.match(read('public/editorial-social-v324.js'),/drawComments\(Array\.isArray\(result\.data\.comments\)/);
 assert.match(read('public/editorial-v323.css'),/ed-discovery-tabs-v3248/);
 assert.match(read('public/editorial-v323.css'),/ed-related-grid-v3248/);
});
test('maintain release version and preserve current home news cadence',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.76');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.76'/);
 assert.match(read('src/routes/editorial-publication-v323.js'),/editorial-v323\.css\?v=3\.2\.63\.2/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-discovery/);
 const home=read('tests/home-clean-v3224.test.js');
 assert.match(home,/2 publicaciones|2 social posts|two posts|dos publicaciones|2 publicaciones sociales/i);
});
