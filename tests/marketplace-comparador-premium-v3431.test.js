'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');

async function withApp(fn){
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{return await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('portada comercial premium: hero, navegación accesible y buscador original con CSRF',async()=>{
 const original=db.query;
 db.query=async(sql)=>{
  if(sql.startsWith('SELECT slug,query_text,jsonb_array_length'))return {rowCount:1,rows:[{slug:'iphone-12-128-gb',query_text:'iphone 12 128 GB',offer_count:24}]};
  return {rowCount:0,rows:[]};
 };
 try{
  await withApp(async base=>{
   const res=await fetch(base+'/comparar');const html=await res.text();
   assert.equal(res.status,200);
   assert.match(html,/class="cmp-premium"/);
   assert.match(html,/href="#contenido">Saltar al contenido/);
   assert.match(html,/aria-label="Navegación del comparador"/);
   assert.match(html,/comparador-premium-v3431\.css/);
   assert.match(html,/class="cmp-home-hero"/);
   assert.match(html,/<h1 id="cmp-home-title">Comparador de precios<\/h1>/);
   assert.match(html,/<form class="compare-search" action="\/comparar\/buscar" method="post">/);
   assert.match(html,/name="_csrf"/);
   assert.match(html,/iphone 12 128 GB/);
   assert.match(html,/Comparaciones recientes/);
   assert.match(html,/Tiendas participantes/);
   assert.match(html,/class="cmp-site-footer"/);
   assert.doesNotMatch(html,/Stripe Checkout|Pagar suscripción/);
  });
 }finally{db.query=original;}
});
test('alta de comercios muestra pasos y formulario conservando método, protección CSRF y modalidad gratuita',async()=>{
 await withApp(async base=>{
  const res=await fetch(base+'/comparar/comercios');
  assert.equal(res.status,200);
  const html=await res.text();
  assert.match(html,/cmp-application-page/);
  assert.match(html,/cmp-application-panel/);
  assert.match(html,/cmp-application-note/);
  assert.match(html,/Solicitar incorporación gratuita/);
  assert.match(html,/name="_csrf"/);
  assert.match(html,/<form class="compare-search cmp-commerce-form" method="post" action="\/comparar\/comercios\/solicitar">/);
  assert.match(html,/cmp-commerce-steps/);
  assert.match(html,/no gestionamos|no cobra ninguna comisión|sin cuotas/i);
 });
});
test('directorio: tarjetas reales sin logotipos inventados y sin cambiar URLs externas',async()=>{
 const original=db.query;
 db.query=async(sql)=>{
  if(sql.startsWith('SELECT s.name,s.store_url,COUNT(DISTINCT x.listing_id)'))return {
   rowCount:1,rows:[{name:'MundoTaza',store_url:'https://mundotaza.com/',products:46}]};
  return {rowCount:0,rows:[]};
 };
 try{
  await withApp(async base=>{
   const r=await fetch(base+'/comparar/comercios/tiendas'),html=await r.text();
   assert.equal(r.status,200);
   assert.match(html,/cmp-directory-page/);
   assert.match(html,/class="cmp-store-icon"[^>]*>M<\/span>/);
   assert.match(html,/Comercio aprobado/);
   assert.match(html,/46 productos disponibles/);
   assert.match(html,/href="https:\/\/mundotaza\.com\/" target="_blank" rel="noopener noreferrer nofollow"/);
   assert.match(html,/cmp-directory-toolbar/);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.doesNotMatch(html,/Patrocinado|Comprar en RedLibertad/);
  });
 }finally{db.query=original;}
});
test('las fichas muestran el precio de producto real y mantienen acción de consulta',()=>{
 const offer={title:'Apple iPhone 12 128 GB Negro',shop:'Tienda real',condition:'Usado',
   price_cents:9000,href:'https://tienda.es/iphone',image:'https://images1.gstatic.com/iphone.png'};
 const hero=detail.heroMarkup('iphone 12 128 GB',[offer],new Date().toISOString(),false,1);
 assert.match(hero,/cmp-detail-hero/);
 assert.match(hero,/90,00/);
 assert.match(hero,/id="cmp-detail-name"/);
 assert.match(hero,/href="#precios-y-tiendas"/);
 assert.match(hero,/avería declarada/);
});
test('el sistema visual incluye movilidad, foco visible y preferencias de movimiento reducidas',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 for(const token of ['.cmp-home-hero','.cmp-site-header','.cmp-rich-comparison','.cmp-store-icon',
   '.cmp-commerce-steps','.cmp-application-panel','.cmp-dashboard-note','@media(max-width:470px)',
   ':focus-visible','prefers-reduced-motion:reduce'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/\.offer\s*\{[^}]*display:none/);
});
