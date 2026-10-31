'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {renderMap,mapStructuredData,allServices}=require('../src/services/services-map-v3645');

test('V3.6.49: metadatos, breadcrumb visible y JSON-LD válido y seguro',()=>{
 const html=renderMap();
 const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
 assert.ok(match,'The public service map should have one JSON-LD script');
 const data=JSON.parse(match[1]);
 assert.deepEqual(data,mapStructuredData());
 assert.equal(data['@context'],'https://schema.org');
 const graph=data['@graph'];
 assert.deepEqual(graph.map(x=>x['@type']),['CollectionPage','BreadcrumbList','ItemList']);
 const [page,breadcrumb,list]=graph;
 assert.equal(page.url,'https://redlibertad.com/explorar');
 assert.equal(page.breadcrumb['@id'],breadcrumb['@id']);
 assert.equal(page.mainEntity['@id'],list['@id']);
 assert.deepEqual(breadcrumb.itemListElement.map(x=>x.item),[
  'https://redlibertad.com/','https://redlibertad.com/explorar'
 ]);
 assert.match(html,/<nav class="sm-breadcrumb" aria-label="Ruta de navegación">/);
 assert.match(html,/href="\/"\>Inicio<\/a>/);
 assert.match(html,/aria-current="page">Servicios<\/span>/);
 assert.match(html,/<meta name="robots" content="index,follow/);
 assert.match(html,/<link rel="canonical" href="https:\/\/redlibertad\.com\/explorar">/);
 assert.match(html,/<meta name="twitter:card" content="summary_large_image">/);
 assert.doesNotMatch(html,/<script type="application\/ld\+json">[^]*?<\/script>[\s\S]*?<script type="application\/ld\+json">/);
});

test('V3.6.49: la lista estructurada solo contiene rutas públicas reales',()=>{
 const services=allServices().filter(s=>s.href!=='/app'&&!s.href.includes('#'));
 const list=mapStructuredData()['@graph'][2];
 assert.equal(list.numberOfItems,services.length);
 assert.equal(services.length,14);
 assert.deepEqual(list.itemListElement.map(x=>x.position),services.map((_,i)=>i+1));
 assert.deepEqual(list.itemListElement.map(x=>[x.item['@id'],x.item.name]),
  services.map(x=>['https://redlibertad.com'+x.href,x.title]));
 for(const item of list.itemListElement){
  assert.ok(item.item['@id'].startsWith('https://redlibertad.com/'));
  assert.ok(!item.item['@id'].includes('#'));
  assert.notEqual(item.item['@id'],'https://redlibertad.com/app');
 }
});

test('V3.6.49: sitemap principal conserva página Explorar, sintaxis válida y rutas públicas',()=>{
 const serverPath=path.join(__dirname,'../server.js');
 const server=fs.readFileSync(serverPath,'utf8');
 const check=spawnSync(process.execPath,['--check',serverPath],{encoding:'utf8',timeout:15000});
 assert.equal(check.status,0,check.stderr||check.error?.message);
 assert.match(server,/origin\+'\/explorar'\)\}\<\/loc>\<changefreq>weekly\<\/changefreq>\<priority>0\.9\<\/priority>\<\/url>\x60,/);
 assert.match(server,/Allow: \/explorar/);
 const css=fs.readFileSync(path.join(__dirname,'../public/services-map-v3645.css'),'utf8');
 assert.match(css,/\.sm-breadcrumb\s*\{/);
 assert.match(css,/\.sm-breadcrumb a\s*\{[^}]*min-height:44px/);
 assert.match(css,/max-width:600px/);
});
