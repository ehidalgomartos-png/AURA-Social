'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderMap,allServices}=require('../src/services/services-map-v3645');

test('V3.6.48: los seis accesos por necesidad abren directamente servicios existentes',()=>{
 const html=renderMap();
 const quick=html.match(/<div class="sm-intent-grid">([\s\S]*?)<\/div><\/section>/)?.[1]||'';
 const links=[...quick.matchAll(/<a class="sm-intent" href="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span><span class="sm-intent-arrow"/g)];
 const expected=[
  ['/resuelve','Necesito ayuda'],
  ['/resuelve#questions','Quiero ayudar'],
  ['/noticias','Quiero informarme'],
  ['/marketplace/explorar','Comprar o vender'],
  ['/comparar','Comparar productos'],
  ['/perfiles','Conectar con personas']
 ];
 assert.equal(links.length,expected.length);
 assert.deepEqual(links.map(m=>[m[1],m[2]]),expected);
 const valid=new Set(allServices().map(s=>s.href));
 for(const [url] of expected){
  assert.ok(valid.has(url),url+' debe ser un servicio real');
  assert.match(url,/^\/(?!\/)/,'no se permiten enlaces externos');
 }
 assert.doesNotMatch(quick,/href="#(?:ayuda|informacion|comercio|comunidad)"/);
});

test('V3.6.48: el resto del mapa conserva categorías, buscador y atajos accesibles',()=>{
 const html=renderMap();
 assert.match(html,/id="sm-search" type="search"/);
 assert.equal((html.match(/data-service-id="/g)||[]).length,17);
 assert.equal((html.match(/class="sm-intent" href="/g)||[]).length,6);
 assert.match(html,/href="#sm-intents" class="sm-hero-secondary"/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad\.com\/explorar"/);
});
