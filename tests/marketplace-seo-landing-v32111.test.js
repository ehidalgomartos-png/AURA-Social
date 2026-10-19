'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const landing=require('../src/marketplace-landing-v32111');
const source=()=>fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
test('canonical Marketplace landing targets human-readable second-hand and classified intent',()=>{
 assert.equal(landing.URL,'https://redlibertad.com/marketplace/explorar');
 assert.match(landing.TITLE,/segunda mano y compraventa en España/i);
 assert.match(landing.DESCRIPTION,/productos nuevos y usados, servicios e inmuebles/);
 assert.ok(landing.TITLE.length<75);
 assert.ok(landing.DESCRIPTION.length<180);
 assert.doesNotMatch(landing.TITLE+' '+landing.DESCRIPTION,/Wallapop|Milanuncios|número uno|miles de anuncios/i);
});
test('hero gives one H1, mobile-friendly CTAs and a real existing search anchor',()=>{
 const hero=landing.hero();
 assert.equal((hero.match(/<h1\b/g)||[]).length,1);
 assert.match(hero,/<h1 id="marketLandingTitle">Anuncios de segunda mano y compraventa en España<\/h1>/);
 assert.match(hero,/href="#marketBuscador"/);
 assert.match(hero,/href="\/marketplace\?publicar=1"/);
 assert.match(hero,/Explora sin registrarte/);
 assert.doesNotMatch(hero,/comprar ahora|pagar en redlibertad/i);
});
test('all category navigation stays on real public filtered catalogue; no doorway routes',()=>{
 const html=landing.categories();
 assert.equal(landing.CATEGORIES.length,6);
 assert.equal((html.match(/class="market-landing-category"/g)||[]).length,6);
 assert.match(html,/href="\/marketplace\/explorar\?tipo=product&amp;categoria=Hogar\+y\+muebles"/);
 assert.match(html,/href="\/marketplace\/explorar\?tipo=product&amp;operacion=sale&amp;nacional=1"/);
 for(const item of landing.CATEGORIES){
  const href=landing.categoryHref(item.filters);
  assert.equal(new URL(href,landing.URL).pathname,'/marketplace/explorar');
 }
 assert.doesNotMatch(html,/\/marketplace\/(madrid|barcelona|valencia)"/i);
});
test('realistic guide and FAQ never imply internal payment or universal free publication',()=>{
 const html=landing.ending();
 assert.match(html,/¿Puedo consultar los anuncios sin registrarme\?/);
 assert.match(html,/la compra se realiza exclusivamente en la web del vendedor/);
 assert.match(html,/RedLibertad no cobra ni gestiona pagos o envíos/);
 assert.match(html,/Venta en toda España/);
 assert.doesNotMatch(html,/publica gratis|envío garantizado|pago seguro en redlibertad/i);
 assert.equal((html.match(/<details>/g)||[]).length,landing.QUESTIONS.length);
});
test('CollectionPage JSON-LD matches canonical and does not pretend to be a merchant listing',()=>{
 const seo=landing.structuredData();
 assert.equal(seo['@context'],'https://schema.org');
 const [site,page,crumbs]=seo['@graph'];
 assert.equal(site['@type'],'WebSite');
 assert.equal(page['@type'],'CollectionPage');
 assert.equal(page.url,landing.URL);
 assert.equal(page.description,landing.DESCRIPTION);
 assert.equal(crumbs['@type'],'BreadcrumbList');
 assert.equal(crumbs.itemListElement[1].item,landing.URL);
 assert.doesNotMatch(JSON.stringify(seo),/FAQPage|"@type":"Product"|"@type":"Offer"|aggregateRating/);
});
test('SSR only upgrades canonical unfiltered first page; retains noindex for filtered searches',()=>{
 const src=source();
 const segment=src.slice(src.indexOf("router.get('/marketplace/explorar'"),src.indexOf("router.get('/sitemap-marketplace.xml'"));
 assert.match(segment,/const landingHome=page===1&&!params\.size/);
 assert.match(segment,/marketplaceLandingV32111\.hero\(\)/);
 assert.match(segment,/marketplaceLandingV32111\.categories\(\)/);
 assert.match(segment,/marketplaceLandingV32111\.ending\(\)/);
 assert.match(segment,/schema:landingHome\?marketplaceLandingV32111\.structuredData\(\):null/);
 assert.match(segment,/robots:searching\?'noindex,follow':'index,follow,max-image-preview:large'/);
 assert.match(segment,/id="anuncios"/);
 assert.match(segment,/id="marketBuscador"/);
 assert.match(segment,/WHERE l\.status='active' AND l\.moderation_status='published'/);
 assert.match(src,/marketplace-landing-v32111\.css\?v=3\.2\.111/);
 assert.match(fs.readFileSync('server.js','utf8'),/app\.use\(marketplaceSeoV3251\.router\)/);
 assert.match(fs.readFileSync('server.js','utf8'),/marketplace\/explorar/);
});
test('narrow phone layout, focus and mobile tap targets remain accessible',()=>{
 const css=fs.readFileSync('public/marketplace-landing-v32111.css','utf8');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.doesNotMatch(css,/position:fixed/);
});
