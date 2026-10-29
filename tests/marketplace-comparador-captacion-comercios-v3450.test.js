'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');

const routeSource=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
async function landing(){
 const oldQuery=db.query,calls=[];
 db.query=async(sql)=>{calls.push(sql);throw Error('Landing must not query database');};
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/comercios');
  return {response,html:await response.text(),calls};
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;
 }
}
test('la nueva página atrae comercios sin prometer ventas ni posiciones',async()=>{
 const {response,html,calls}=await landing();
 assert.equal(response.status,200);
 assert.equal(calls.length,0);
 assert.match(html,/Haz que descubran tu tienda mientras comparan productos/);
 assert.match(html,/No prometemos posiciones ni ventas/);
 assert.match(html,/La venta y el pago se realizan exclusivamente en tu web/);
 assert.match(html,/Sin cuota ni comisión por venta/);
 assert.match(html,/Revisión manual de las tiendas/);
});
test('los dos accesos principales llevan al formulario y al directorio existente',async()=>{
 const {html}=await landing();
 assert.match(html,/href="#solicitar-comercio">Solicitar mi tienda gratis/);
 assert.match(html,/id="solicitar-comercio" class="cmp-application-panel"/);
 assert.match(html,/href="\/comparar\/comercios\/tiendas">Ver tiendas participantes/);
 assert.match(html,/href="\/comparar\/comercios\/mi-panel">Mi panel de comercios/);
 assert.equal((html.match(/method="post" action="\/comparar\/comercios\/solicitar"/g)||[]).length,1);
});
test('formulario conserva CSRF, HTTPS, selección de plataforma y ningún dato secreto',async()=>{
 const {html}=await landing();
 assert.match(html,/name="_csrf" value="[a-f0-9]{48}"/);
 assert.match(html,/name="name" maxlength="120" minlength="3" required/);
 assert.match(html,/id="comercioWeb" type="url" name="storeUrl" maxlength="500"/);
 assert.match(html,/aria-describedby="cmp-merchant-url-hint"/);
 assert.match(html,/id="cmp-merchant-url-hint"/);
 for(const platform of ['woocommerce','prestashop','shopify','other'])
  assert.ok(html.includes('<option value="'+platform+'">'));
 assert.match(html,/Solicitar incorporación gratuita/);
 assert.match(html,/No introduzcas contraseñas ni claves/);
 assert.doesNotMatch(html,/name="(?:consumerKey|consumerSecret|password|stripeToken)"/);
});
test('explica etapas y las cuatro preguntas frecuentes sin contenido ficticio',async()=>{
 const {html}=await landing();
 assert.match(html,/Solicita el alta/);
 assert.match(html,/Verifica tu dominio/);
 assert.match(html,/Comparte tus productos/);
 assert.equal((html.match(/<details><summary>/g)||[]).length,4);
 assert.match(html,/El alta no garantiza publicación ni posicionamiento/);
 assert.match(html,/Si usas otra plataforma, revisaremos las alternativas contigo/);
 assert.match(html,/RedLibertad no gestiona el pago/);
});
test('el rediseño no activa compras, pagos, aprobación automática o búsquedas de pago',()=>{
 const page=routeSource.split("router.get('/comparar/comercios',")[1].split("router.post('/comparar/comercios/solicitar'")[0];
 assert.ok(page);
 assert.doesNotMatch(page,/\bfetch\(|serpapi|stripe\.|UPDATE marketplace_professional_stores|auto_approve/i);
 const handler=routeSource.split("router.post('/comparar/comercios/solicitar'")[1].split("// V3.4.2.7")[0];
 assert.match(handler,/VALUES\(\$1,\$2,\$3,\$4,'pending',false\)/);
 assert.match(handler,/validCsrf\(req\)/);
 assert.match(handler,/normalizeStoreUrl\(req\.body\?\.storeUrl\)/);
 assert.match(handler,/if\(!req\.user\)return res\.status\(401\)/);
});
test('la landing conserva protección privada del formulario y canonical fijo',async()=>{
 const {response,html}=await landing();
 assert.equal(response.headers.get('cache-control'),'private,no-store');
 assert.match(html,/<link rel="canonical" href="https:\/\/redlibertad\.com\/comparar\/comercios"/);
 assert.match(html,/<meta name="description" content="Solicitud gratuita para incorporar una tienda online al comparador\."/);
 assert.match(html,/aria-labelledby="cmp-merchant-hero-title"/);
 assert.match(html,/aria-labelledby="cmp-merchant-faq-title"/);
});
test('diseño táctil y responsive sin overlays ni dependencias externas',()=>{
 const part=css.split('/* V3.4.5.0 — captación gratuita de comercios')[1];
 assert.ok(part);
 assert.match(part,/\.cmp-merchant-hero/);
 assert.match(part,/grid-template-columns:minmax\(0,1\.45fr\)/);
 assert.match(part,/@media\(max-width:800px\)/);
 assert.match(part,/@media\(max-width:540px\)/);
 assert.match(part,/:focus-visible/);
 assert.match(part,/min-height:48px/);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(part,/position:\s*fixed|display:\s*none|pointer-events:\s*none|https?:\/\/|@import/i);
});
