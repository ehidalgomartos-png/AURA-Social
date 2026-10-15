'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const source=read('src/routes/marketplace-seo-v3251.js');
const publicCss=read('public/marketplace-seo-v3251.css');
const authPage=read('public/marketplace.html');
const retire=read('public/marketplace-pwa-retire-v3266.js');
test('V3.2.70.1 is consistently declared in package, health and HTML caches',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.70.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.70\.1'/);
 assert.match(authPage,/marketplace-v3250\.css\?v=3\.2\.70\.1/);
 assert.match(source,/marketplace-seo-v3251\.css\?v=3\.2\.70\.1/);
});
test('Guest catalogue has a clear product link and a useful back action',()=>{
 assert.match(source,/market-card-cta/);
 assert.match(source,/Ver anuncio →/);
 assert.match(source,/backHref:'\/app\?view=explore&marketReturn=1'/);
 assert.match(source,/Buscar productos o anuncios/);
 assert.match(publicCss,/\.market-card-cta/);
});
test('No independent installer is advertised in public, signed-in or import screens',()=>{
 for(const file of ['src/routes/marketplace-seo-v3251.js','public/marketplace.html','public/marketplace-import-v3260.html']){
  const text=read(file);
  assert.doesNotMatch(text,/<link rel="manifest" href="\/marketplace\/manifest\.webmanifest"/);
 }
 assert.doesNotMatch(source,/Instala un acceso directo independiente|marketPwaInstall/);
 assert.doesNotMatch(authPage,/Instala una app independiente|marketPwaInstall/);
 assert.match(source,/market-public-footer/);
 assert.match(read('public/manifest.webmanifest'),/"id": "\/app"/);
});
test('Legacy worker retirement targets only the exact marketplace scope',()=>{
 assert.match(retire,/new URL\('\/marketplace\/',location\.origin\)\.href/);
 assert.match(retire,/registration\.scope===oldScope/);
 assert.match(retire,/registration\.unregister\(\)/);
 assert.doesNotMatch(retire,/\/sw\.js|caches\.delete/);
});
test('SEO public discovery and product identity remain intact',()=>{
 assert.match(source,/router\.get\('\/marketplace\/explorar'/);
 assert.match(source,/router\.get\('\/marketplace\/p\/:id\/:slug\?'/);
 assert.match(source,/sitemap-marketplace\.xml/);
 assert.match(authPage,/marketSellerTools/);
 assert.match(authPage,/marketplace\/importar/);
});

test('Public catalogues use compact image-safe cards on mobile without altering listing detail',()=>{
 assert.match(source,/class="cards market-public-grid"/);
 assert.match(source,/bodyClass:'market-public-catalog'/);
 assert.match(publicCss,/\.market-public-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px\}/);
 assert.match(publicCss,/\.market-public-grid \.thumb\{aspect-ratio:4\/3;height:auto/);
 assert.match(publicCss,/\.market-public-grid \.thumb img\{[^}]*object-fit:contain/);
 assert.match(publicCss,/@media\(max-width:359px\)/);
 assert.match(publicCss,/\.market-public-catalog>main\{flex:none/);
 assert.match(source,/market-card-cta/);
});
