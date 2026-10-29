'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {models}=require('../src/services/marketplace-comparador-model-suggestions-v3462');
const {seoAdminView}=require('../src/routes/marketplace-comparador-v32132');
const offer=(title,shop='Tienda A',more={})=>({
 title,shop,href:'https://tienda.es/producto',price_cents:130000,
 price_currency:'EUR',condition:'Nuevo',internal:false,...more
});
const page=(query,offers)=>({
 id:29,slug:'prueba-29',query_text:query,provider_status:'ok',
 last_checked_at:new Date().toISOString(),external_results:offers,
 seo_blocked:false,index_approved:false
});
test('sugiere únicamente modelos observados de familias y los ordena por tiendas distintas',()=>{
 const p=page('portatil asus rog strix gaming',[
  offer('Portatil ASUS ROG Strix Gaming G16 16 pulgadas','Tienda Uno'),
  offer('Portatil ASUS ROG Strix Gaming G16 16 pulgadas','Tienda Dos'),
  offer('Portatil ASUS ROG Strix Gaming G16 16 pulgadas','Tienda Uno'),
  offer('Portatil ASUS ROG Strix Gaming G17 17 pulgadas','Tienda Tres'),
  offer('Portatil ASUS ROG Strix Gaming G18 18 pulgadas','Tienda Cuatro',{sponsored:true}),
  offer('Portatil ASUS ROG Strix Gaming G19','Tienda Cinco',{price_cents:null})
 ]);
 const suggestions=models(p);
 assert.equal(suggestions.length,2);
 assert.equal(suggestions[0].query,'portatil asus rog strix gaming G16');
 assert.equal(suggestions[0].sellerCount,2);
 assert.equal(suggestions[1].query,'portatil asus rog strix gaming G17');
 assert.ok(suggestions.every(s=>s.query.length<=100));
});
test('no convierte componentes y variantes dudosas en nuevas búsquedas ni confunde validación SEO',()=>{
 const p=page('portatil asus rog strix gaming',[
  offer('Portatil ASUS ROG Strix Gaming RTX4060','Tienda Uno'),
  offer('Funda para Portatil ASUS ROG Strix Gaming G16','Tienda Dos'),
  offer('Portatil ASUS ROG Strix Gaming G17 averiado','Tienda Tres'),
  offer('Portatil ASUS ROG Strix Gaming G18','Tienda Cuatro',{href:'javascript:alert(1)'})
 ]);
 assert.deepEqual(models(p),[]);
 assert.deepEqual(models(page('portatil asus rog strix G16',p.external_results)),[]);
 assert.deepEqual(models(page('zapatillas skechers mujer',[])),[]);
 assert.deepEqual(models(null),[]);
});
test('sugerencias para familias Samsung incluyen almacenamiento observado, no inventado',()=>{
 const p=page('samsung galaxy',[
  offer('Samsung Galaxy S26 256 GB Smartphone','Tienda A'),
  offer('Samsung Galaxy S26 128 GB Smartphone','Tienda B'),
  offer('Samsung Galaxy S26 256 GB Smartphone','Tienda C')
 ]);
 const r=models(p);
 assert.ok(r.some(x=>/S26 256 GB$/.test(x.query)));
 assert.ok(r.some(x=>/S26 128 GB$/.test(x.query)));
 assert.ok(r.every(x=>/S26 \d+ GB$/.test(x.query)));
});
test('panel admin ofrece búsqueda manual, no creación automática ni promesas de indexación',()=>{
 const p=page('portatil asus rog strix gaming',[
  offer('Portatil ASUS ROG Strix Gaming G16','Tienda Uno'),
  offer('Portatil ASUS ROG Strix Gaming G17','Tienda Dos')
 ]);
 const html=seoAdminView([p],'c'.repeat(48),'todas');
 assert.match(html,/Modelos concretos encontrados en ofertas guardadas/);
 assert.match(html,/\/comparar\?q=portatil%20asus%20rog%20strix%20gaming%20G16/);
 assert.match(html,/Al abrir la búsqueda no se consultará SerpApi hasta enviarla/);
 assert.doesNotMatch(html,/name="action" value="publish"/);
});
test('no añade consultas ni cambia sitemap o indexación',()=>{
 const src=fs.readFileSync(path.join(__dirname,
  '../src/services/marketplace-comparador-model-suggestions-v3462.js'),'utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|db\.query|worker\.enqueue|serpapi\.search/i);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/V3\.4\.6\.2/);
});
