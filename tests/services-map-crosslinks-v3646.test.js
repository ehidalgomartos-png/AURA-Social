'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('V3.6.46: readers can reach services map from all four major product areas',()=>{
 const news=read('src/routes/editorial-publication-v323.js');
 const resuelve=read('public/resuelve.html');
 const market=read('public/marketplace.html');
 const compare=read('src/routes/marketplace-comparador-v32132.js');
 assert.match(news,/<footer class="ed-footer">[^\n]*<a href="\/explorar">Mapa de servicios<\/a>/);
 assert.match(resuelve,/<footer class="foot">[^\n]*href="\/explorar">Explorar todos los servicios<\/a>/);
 assert.match(market,/<footer class="site-foot">[^\n]*href="\/explorar">Mapa de servicios<\/a>/);
 assert.match(compare,/<footer class="cmp-site-footer">[^\n]*href="\/explorar">Mapa de servicios<\/a>/);
 for(const [file,source] of [['Noticias',news],['Resuelve',resuelve],['Marketplace',market],['Comparador',compare]]){
  assert.ok(source.includes('href="/explorar"'),file+' must link to the same canonical service hub');
 }
});
test('V3.6.46: no extra mobile dock tabs, no popups, no new permissions',()=>{
 const news=read('src/routes/editorial-publication-v323.js');
 const resuelve=read('public/resuelve.html');
 const market=read('public/marketplace.html');
 const compare=read('src/routes/marketplace-comparador-v32132.js');
 const app=read('public/app.html');
 const marketStyles=read('public/marketplace-v3250.css');
 assert.match(marketStyles,/\.site-foot\{[^}]*flex-wrap:wrap/);
 assert.match(app,/services-map-explore-entry-v3645/);
 assert.match(app,/services-map-side-link-v3645/);
 assert.match(news,/class="ed-mobile-nav"/);
 assert.match(resuelve,/id="viewQuestionsLink"/);
 assert.match(market,/id="newListing"/);
 assert.match(compare,/href="\/comparar">Comparador/);
 assert.equal((news.match(/href="\/explorar"/g)||[]).length,1);
 assert.equal((resuelve.match(/href="\/explorar"/g)||[]).length,1);
 assert.equal((market.match(/href="\/explorar"/g)||[]).length,1);
 assert.equal((compare.match(/href="\/explorar"/g)||[]).length,1);
 assert.doesNotMatch(resuelve,/<iframe|onload=|onclick=/);
});
test('V3.6.46: shared map is canonical, indexable and linked from public landing',()=>{
 const server=read('server.js'),homepage=read('public/index.html');
 const {renderMap}=require('../src/services/services-map-v3645');
 const html=renderMap();
 assert.match(server,/app\.use\(servicesMapV3645\)/);
 assert.match(server,/Allow: \/explorar/);
 assert.match(homepage,/href="\/explorar">Ver todos los servicios<\/a>/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/explorar"/);
 assert.match(html,/meta name="robots" content="index,follow/);
 assert.doesNotMatch(html,/meta name="robots" content="noindex/);
});
