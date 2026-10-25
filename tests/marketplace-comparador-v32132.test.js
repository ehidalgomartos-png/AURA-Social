'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(base,'server.js'),'utf8');
const source=fs.readFileSync(path.join(base,'src/routes/marketplace-comparador-v32132.js'),'utf8');
const market=fs.readFileSync(path.join(base,'public/marketplace.html'),'utf8');
const mod=require('../src/routes/marketplace-comparador-v32132');

test('normalized queries reuse persistent unique page and stable slug',()=>{
 assert.equal(mod.queryKey('  SAMSUNG   Galaxy S26 Últra '),'samsung galaxy s26 ultra');
 assert.equal(mod.slugFor('SAMSUNG Galaxy S26 Últra'),mod.slugFor('samsung galaxy s26 ultra'));
 assert.ok(source.includes('UNIQUE'));
 assert.ok(source.includes('ON CONFLICT (query_key) DO UPDATE'));
 assert.ok(source.includes("res.redirect(303,'/comparar/'"));
 assert.ok(source.includes('index_approved BOOLEAN NOT NULL DEFAULT false'));
});
test('invalid and dangerous input is rejected',()=>{
 for(const s of ['','a','https://example.com','www.example.com','hello@demo.com','<script>','{test}','a'.repeat(101)])assert.equal(mod.cleanQuery(s),null,s);
 assert.equal(mod.cleanQuery('  iPhone   17 Pro  '),'iPhone 17 Pro');
});
test('external offers must match model numbers and have safe https destinations',()=>{
 const offers=mod.parseExternal([
 {title:'Samsung Galaxy S26 Ultra 256 GB',source:'Prueba A',extracted_price:1150,price:'€1,150',link:'https://example.com/p1'},
 {title:'Samsung Galaxy S25 Ultra 256 GB',source:'Prueba B',extracted_price:950,price:'€950',link:'https://example.com/p2'},
 {title:'Samsung Galaxy S26 Ultra 256 GB',source:'Prueba C',extracted_price:1100,price:'€1,100',link:'javascript:alert(1)'},
 {title:'Samsung Galaxy S26 Ultra',source:'Prueba D',extracted_price:1200,price:'€1,200',link:'http://example.com/p4'}],'Samsung Galaxy S26 Ultra');
 assert.equal(offers.length,1);
 assert.equal(offers[0].price_cents,115000);
 assert.equal(mod.safeHref('javascript:alert(1)'),null);
 assert.equal(mod.safeHref('http://example.com'),null);
});
test('public routes are mounted and marketplace includes entry',()=>{
 assert.match(server,/app\.use\(marketplaceComparadorV32132\.router\)/);
 assert.match(server,/sitemap-comparador\.xml/);
 assert.match(market,/href="\/comparar"/);
 assert.match(source,/res\.send\(shell\(/);
 assert.match(source,/noindex,follow/);
});
test('no fake offers, automatic SEO quality controls and no login requirement',()=>{
 assert.match(source,/SELECT l\.id,l\.title/);
 assert.match(source,/l\.moderation_status='published'/);
 assert.match(source,/u\.discoverable=true/);
 assert.match(require('node:fs').readFileSync(require('node:path').join(base,'src/services/marketplace-comparador-provider-v32133.js'),'utf8'),/COMPARADOR_SERPAPI_KEY/);
 assert.match(source,/last_checked_at/);
 assert.match(source,/index_approved=true/);
 assert.doesNotMatch(source,/router\.use\(requireAuth\)/);
});

const seo=require('../src/services/marketplace-comparador-seo-v32132');
test('SEO pages need editorial content, recent external offers and distinct vendors',()=>{
 const now=Date.now();
 const page={index_approved:true,provider_status:'ok',editorial_summary:'Comparación detallada de características, compatibilidad y condiciones reales de este producto para España, revisada editorialmente.',last_checked_at:new Date(now).toISOString(),query_text:'Samsung Galaxy S26 Ultra'};
 const offers=[{title:'Samsung Galaxy S26 Ultra',shop:'Tienda A',price_cents:115000,internal:false},{title:'Samsung Galaxy S26 Ultra',shop:'Tienda B',price_cents:120000,internal:false}];
 assert.equal(seo.indexEligible(page,offers,now),true);
 assert.equal(seo.indexEligible({...page,editorial_summary:''},offers,now),false);
 assert.equal(seo.indexEligible({...page,last_checked_at:new Date(now-49*3600000).toISOString()},offers,now),false);
 assert.equal(seo.indexEligible(page,[offers[0],{...offers[1],shop:'Tienda A'}],now),false);
 const graph=seo.structuredData(page,offers,true,'/comparar/samsung-galaxy-s26-ultra');
 // No publicar AggregateOffer de una página editada si no sabemos si los
 // enlaces son directos ni que todas las tiendas vendan la misma variante.
 assert.equal(graph['@graph'].length,3);
 assert.equal(seo.structuredData(page,offers,false,'/comparar/test')['@graph'].length,3);
});
test('JSON-LD avoids raw HTML injection',()=>{
 assert.match(seo.jsonLd({value:'</script><img src=x>'}),/\\u003c/);
 assert.match(source,/requireAdmin/);
 assert.match(source,/router\.post\('\/admin\/comparador\/:id\/seo'/);
 assert.match(source,/og:title/);
 assert.match(source,/sitemap-comparador\.xml/);
});
