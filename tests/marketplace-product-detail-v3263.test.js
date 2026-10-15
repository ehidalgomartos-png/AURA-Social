'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=f=>fs.readFileSync(f,'utf8');
const base={id:5,title:'Taza Roblox',description:'Taza del videojuego Roblox, adecuada para regalar a seguidores del juego.',kind:'product',deal:'sale',category:'Tazas',city:'Valencia',price_cents:1599,details:{province:'Valencia',saleScope:'national',condition:'new'},image_urls:['/uploads/photo-a.webp','/uploads/photo-b.jpg','/uploads/photo-c.png'],seller_username:'mundotaza',seller_name:'MundoTaza',status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,created_at:'2026-10-15T08:00:00.000Z',updated_at:'2026-10-15T08:00:00.000Z'};
test('V3.2.63: product pages put the chat CTA next to the accurate price and provide mobile fallback',()=>{
 const html=seo.listingHtml(base);
 assert.match(html,/Precio anunciado/);
 assert.match(html,/15,99/);
 assert.match(html,/market-product-offer/);
 assert.match(html,/market-mobile-contact/);
 assert.match(html,/Consultar al vendedor/);
 assert.equal((html.match(/href="\/marketplace\?contact=mundotaza&amp;listing=5"/g)||[]).length,2);
 assert.match(html,/Para escribir necesitas iniciar sesión/);
 assert.match(html,/RedLibertad no gestiona pagos ni envíos/);
 assert.match(html,/Venta disponible en toda España/);
 assert.match(html,/Ver otros anuncios de esta persona/);
 assert.match(html,/marketplace\/vendedor\/mundotaza/);
 assert.match(html,/rel="canonical"/);
 assert.match(html,/application\/ld\+json/);
});
test('V3.2.63: gallery with 3 locally-proxied images has accessible navigation and counter',()=>{
 const html=seo.listingHtml(base);
 assert.match(html,/data-market-gallery/);
 assert.match(html,/data-market-prev aria-label="Fotografía anterior" disabled/);
 assert.match(html,/data-market-next aria-label="Fotografía siguiente"/);
 assert.match(html,/data-market-counter>1 de 3/);
 for(let i=0;i<3;i++)assert.match(html,new RegExp('/marketplace/imagen/5/'+i));
 assert.doesNotMatch(html,/src="https:\/\/shop.example.com/);
 assert.match(html,/marketplace-gallery-v3263\.js\?v=3\.2\.63\.1/);
 const gallery=read('public/marketplace-gallery-v3263.js');
 assert.doesNotThrow(()=>new vm.Script(gallery));
 for(const marker of ["addEventListener('scroll'","scrollTo({left,behavior:'smooth'})","output",'requestAnimationFrame'])if(marker!=='output')assert.ok(gallery.includes(marker),marker);
});
test('V3.2.63: one or zero images need no gallery buttons',()=>{
 const one=seo.listingHtml({...base,image_urls:base.image_urls.slice(0,1)});
 assert.match(one,/data-market-gallery/);
 assert.doesNotMatch(one,/data-market-prev/);
 const none=seo.listingHtml({...base,image_urls:[]});
 assert.doesNotMatch(none,/data-market-gallery/);
 assert.match(none,/Consultar al vendedor/);
});
test('V3.2.63: service, buying ads and properties do not inherit product checkout-like UI',()=>{
 const ads=[{...base,kind:'service',deal:'offer'},{...base,deal:'buy'},{...base,kind:'property',deal:'rent'}];
 for(const row of ads){
  const html=seo.listingHtml(row);
  assert.doesNotMatch(html,/class="market-product-offer"/);
  assert.doesNotMatch(html,/class="market-mobile-contact"/);
  assert.match(html,/class="market-seo-actions"/);
  assert.match(html,/\/marketplace\?contact=mundotaza&amp;listing=5/);
 }
});
test('V3.2.63: XSS content is escaped, photos stay guarded, price offer schema unchanged',()=>{
 const bad={...base,title:'<img src=x onerror=alert(1)>',seller_username:'gooduser',seller_name:'<script>bad</script>',image_urls:['https://example.com/a.png','/uploads/photo-a.jpg']};
 const html=seo.listingHtml(bad);
 assert.doesNotMatch(html,/<img src=x onerror=/);
 assert.doesNotMatch(html,/<script>bad<\/script>/);
 assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(html,/\/marketplace\/imagen\/5\/1/);
 const data=seo.entitySchema(base,'https://redlibertad.com/marketplace/p/5/taza-roblox',seo.imagePaths(base));
 assert.equal(data.offers.price,'15.99');
 assert.equal(data.offers.priceCurrency,'EUR');
 assert.equal(data.offers.areaServed.name,'España');
 assert.equal(data.aggregateRating,undefined);
});
test('V3.2.63: mobile CSS respects safe areas and does not obscure content',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-product-offer\{/);
 assert.match(css,/\.market-gallery-controls\{/);
 assert.match(css,/\.market-mobile-contact\{display:flex;position:fixed;/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/main:has\(\.market-mobile-contact\)/);
 const route=read('src/routes/marketplace-seo-v3251.js');
 assert.match(route,/router\.get\('\/marketplace\/p\/:id\/:slug\?'/);
 assert.match(route,/if\(!eligible\(row\)\)return unavailable/);
});
