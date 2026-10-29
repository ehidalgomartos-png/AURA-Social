'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const media=require('../src/services/marketplace-comparador-media-link-audit-v3461');
const {seoAdminView}=require('../src/routes/marketplace-comparador-v32132');
function offer(title,shop,href,image){
 return {title,shop,href,image,price_cents:60000,price_currency:'EUR',condition:'Nuevo',internal:false};
}
function page(id,query,offers){
 return {id,query_text:query,slug:'comp-'+id,external_results:offers,provider_status:'ok',
  last_checked_at:new Date().toISOString(),seo_blocked:false,index_approved:false};
}
test('distingue fotos verificadas, candidatas para revisión y destinos directos reales',()=>{
 const valid=offer('Samsung Galaxy S26 256 GB Smartphone','Tienda A','https://tienda-a.es/samsung-s26',
  'https://images1.gstatic.com/products/samsung-s26-front.jpg');
 const opaque=offer('Samsung Galaxy S26 256 GB Smartphone','Tienda B',
  'https://www.google.com/shopping/product/123','https://images1.gstatic.com/images?q=tbn:opaque');
 const p=page(5,'samsung s26 256 GB',[valid,opaque]);
 const r=media.summary(p);
 assert.equal(r.total,2);
 assert.equal(r.photoCount,1);
 assert.equal(r.directCount,1);
 assert.equal(r.noPhoto,false);
 assert.equal(r.noDirect,false);
 assert.equal(r.vendorCount,2);
 assert.ok(r.candidateCount>=1);
});
test('categorías genéricas con 24 ofertas no simulan fotos verificadas ni enlaces',()=>{
 const offers=Array.from({length:24},(_,i)=>offer('Zapatillas Skechers mujer talla '+i,'Tienda '+i,
  'https://www.google.com/search?q=skechers',''));
 const p=page(6,'zapatillas skechers mujer',offers);
 const result=media.summary(p);
 assert.equal(result.total,24);
 assert.equal(result.photoCount,0);
 assert.equal(result.directCount,0);
 assert.equal(result.noPhoto,true);
 assert.equal(result.noDirect,true);
 assert.match(result.photoAction,/ilustración de categoría/);
 assert.match(result.linkAction,/URLs comprobadas del vendedor/);
 assert.equal(media.summary({...p,external_results:null}).total,0);
});
test('filtros sin foto y sin enlace operan sobre datos ya guardados',()=>{
 const rows=[
  {audit:{noPhoto:true,noDirect:true},p:{id:1}},
  {audit:{noPhoto:false,noDirect:false},p:{id:2}},
  {audit:{noPhoto:false,noDirect:true},p:{id:3}},
  {audit:{noPhoto:true,noDirect:false},p:{id:4}}
 ];
 const q=media.queue(rows,'sin-foto');
 assert.deepEqual(q.counts,{todas:4,'sin-foto':2,'sin-enlace':2});
 assert.deepEqual(q.rows.map(i=>i.p.id),[1,4]);
 assert.deepEqual(media.queue(rows,'sin-enlace').rows.map(i=>i.p.id),[1,3]);
 assert.equal(media.queue(rows,'error').selected,'todas');
 assert.deepEqual(rows.map(i=>i.p.id),[1,2,3,4]);
});
test('panel admin muestra filtros y acciones, mantiene enlace manual y no inventa fotos',()=>{
 const off=offer('samsung s26 256 GB','Tienda A',
  'https://www.google.com/shopping/product/123','');
 const rows=[page(1,'samsung s26 256 GB',[off]),page(2,'iphone 12 128 GB',
  [offer('Apple iPhone 12 128 GB','Tienda B','https://ejemplo.es/iphone',null)])];
 const html=seoAdminView(rows,'a'.repeat(48),'todas');
 assert.match(html,/Sin foto fiable <span>2<\/span>/);
 assert.match(html,/Sin enlace directo <span>1<\/span>/);
 assert.match(html,/Fotografías y enlaces/);
 assert.match(html,/Fotos verificadas: 0/);
 assert.match(html,/Revisar imágenes/);
 assert.match(html,/href="#seo-links-1"/);
 assert.match(html,/id="seo-links-1"/);
 assert.match(html,/seo-link-details/);
 const filtered=seoAdminView(rows,'a'.repeat(48),'sin-enlace');
 assert.match(filtered,/id="comparacion-1"/);
 assert.doesNotMatch(filtered,/id="comparacion-2"/);
 assert.match(html,/Aptas para Google/);
});
test('servicio opera solo con valores guardados, y estilos móviles con foco visible',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-media-link-audit-v3461.js'),'utf8');
 assert.doesNotMatch(source,/fetch\(|db\.query|worker\.enqueue|SerpApi\.search|resend|stripe/i);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/V3\.4\.6\.1/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/:focus-visible/);
});
