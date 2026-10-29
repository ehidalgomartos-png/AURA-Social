'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const {previewCsv,MAX_PREVIEW_BYTES}=require('../src/services/marketplace-comparador-csv-preflight-v3451');

const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
const header='Type,Name,SKU,Description,Regular price,Images,Categories,Published,In stock?';
const row=sku=>'simple,Producto tienda ejemplo,'+sku+',Descripción completa del producto de la tienda para comprarlo con seguridad,19.90,https://example.com/foto.jpg,Electrónica,1,1';
const csv=[header,row('SKU-111'),row('SKU-111'),row('SKU-222')].join('\n');

test('preflight reutiliza el parser sin modificar precios ni crear artículos',()=>{
 const report=previewCsv(csv);
 assert.equal(report.counts.total,3);
 assert.equal(report.counts.ready,2);
 assert.equal(report.counts.duplicate,1);
 assert.equal(report.counts.invalid,0);
 assert.equal(report.items[1].state,'duplicate');
 assert.match(report.items[1].reason,/repetido/);
 assert.equal(report.truncated,false);
});
test('rechaza archivos grandes y formatos no WooCommerce de forma acotada',()=>{
 assert.throws(()=>previewCsv('X'.repeat(MAX_PREVIEW_BYTES+1)),/csv_too_large/);
 assert.throws(()=>previewCsv(''),/csv_empty/);
 assert.throws(()=>previewCsv('foo,bar\nhola,mundo'),/csv_not_woocommerce/);
 assert.throws(()=>previewCsv('foo'),/csv_invalid_header/);
});
test('un producto sin precio o sin fotografía aparece para revisión y no se inventan datos',()=>{
 const out=previewCsv([header,'simple,Producto tienda ejemplo,SKU-9,Descripción completa del artículo sin imagen,, ,Electrónica,1,1'].join('\n'));
 assert.equal(out.counts.ready,0);
 assert.equal(out.counts.invalid,1);
 assert.equal(out.items[0].state,'invalid');
});
async function withUser(fn,{authenticated=true,storeStatus='approved',storePlatform='woocommerce'}={}){
 const savedQuery=db.query,savedSecret=process.env.JWT_SECRET,calls=[];
 process.env.JWT_SECRET='test-merchant-catalog-v3451-only-secret';
 db.query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('FROM users')&&sql.includes('auth_token_version'))
   return {rowCount:1,rows:[{
    id:517,username:'comerciante',status:'active',is_admin:false,
    auth_token_version:0,age_verified:true,show_sensitive:false
   }]};
  if(sql.startsWith('SELECT id,name,platform,status,store_url FROM marketplace_professional_stores'))
   return params[0]==='18'&&params[1]===517?{rowCount:1,rows:[{
    id:18,name:'Tienda Real',platform:storePlatform,status:storeStatus,store_url:'https://mitienda.es/'
   }]}:{rowCount:0,rows:[]};
  throw Error('Unexpected SQL: '+sql);
 };
 const app=express();app.use(express.urlencoded({extended:true,limit:'200kb'}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const cookie=authenticated?'aura_token='+jwt.sign({id:517,authVersion:0},process.env.JWT_SECRET):'';
  return await fn('http://127.0.0.1:'+server.address().port,cookie,calls);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=savedQuery;
  if(savedSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=savedSecret;
 }
}
test('ruta privada rechaza anónimos sin consultar la base',async()=>{
 await withUser(async(base,_cookie,calls)=>{
  const r=await fetch(base+'/comparar/comercios/catalogo/18');
  assert.equal(r.status,401);
  assert.equal(calls.length,0);
 },{authenticated:false});
});
test('propietario ve las dos vías y el formulario sin exponer claves o activar pagos',async()=>{
 await withUser(async(base,cookie,calls)=>{
  const r=await fetch(base+'/comparar/comercios/catalogo/18',{headers:{Cookie:cookie}});
  const html=await r.text();
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'private,no-store');
  assert.equal(r.headers.get('x-robots-tag'),'noindex,nofollow');
  assert.match(html,/href="\/comparar\/comercios\/woocommerce\/18"/);
  assert.match(html,/Comprobar CSV sin guardar/);
  assert.match(html,/data-cmp-csv-file/);
  assert.match(html,/name="_csrf" value="[a-f0-9]{48}"/);
  assert.doesNotMatch(html,/name="(?:consumerKey|consumerSecret|password)"/);
  assert.match(html,/La revisión de productos y la autorización de enlaces de compra siguen siendo manuales/);
  assert.equal(calls.filter(x=>x.sql.startsWith('SELECT id,name,platform,status,store_url')).length,1);
  assert.equal(calls.filter(x=>/INSERT|UPDATE|DELETE|serpapi/i.test(x.sql)).length,0);
 });
});
test('tiendas pendientes pueden preparar CSV pero no conectar API',async()=>{
 await withUser(async(base,cookie)=>{
  const r=await fetch(base+'/comparar/comercios/catalogo/18',{headers:{Cookie:cookie}});
  const html=await r.text();
  assert.equal(r.status,200);
  assert.doesNotMatch(html,/href="\/comparar\/comercios\/woocommerce\/18"/);
  assert.match(html,/después de aprobar la tienda/);
  assert.match(html,/Comprobar CSV sin guardar/);
 },{storeStatus:'pending'});
});
test('la solicitud CSV necesita CSRF y nunca guarda productos',async()=>{
 await withUser(async(base,cookie,calls)=>{
  const page=await fetch(base+'/comparar/comercios/catalogo/18',{headers:{Cookie:cookie}});
  const html=await page.text();
  const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
  const csrf=page.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
  assert.ok(token&&csrf);
  const action=base+'/comparar/comercios/catalogo/18/validar-csv';
  const bad=await fetch(action,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({csvText:csv}).toString()});
  assert.equal(bad.status,403);
  const ok=await fetch(action,{method:'POST',headers:{
   Cookie:cookie+'; rl_compare_csrf='+csrf,'Content-Type':'application/x-www-form-urlencoded'
  },body:new URLSearchParams({_csrf:token,csvText:csv}).toString()});
  const result=await ok.text();
  assert.equal(ok.status,200);
  assert.match(result,/Resultado de la previsualización/);
  assert.match(result,/3 filas · 2 preparadas · 0 con errores · 1 repetidas/);
  assert.match(result,/SKU o ID repetido en este archivo/);
  assert.match(result,/No se ha guardado ni importado ningún producto|Esta comprobación no guarda el catálogo/);
  assert.equal(calls.filter(x=>/INSERT|UPDATE|DELETE|serpapi/i.test(x.sql)).length,0);
 });
});
test('el aislamiento por propietario rechaza tiendas inexistentes o de otra cuenta',async()=>{
 await withUser(async(base,cookie,calls)=>{
  const r=await fetch(base+'/comparar/comercios/catalogo/19',{headers:{Cookie:cookie}});
  assert.equal(r.status,404);
  assert.deepEqual(calls.filter(x=>x.sql.startsWith('SELECT id,name,platform,status')).map(x=>x.params),[['19',517]]);
 });
});
test('la vista escapa datos de CSV y las validaciones no almacenan productos',async()=>{
 const injected=[header,row('<script>alert(1)</script>')].join('\n');
 await withUser(async(base,cookie)=>{
  const p=await fetch(base+'/comparar/comercios/catalogo/18',{headers:{Cookie:cookie}});
  const token=(await p.text()).match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
  const csrf=p.headers.get('set-cookie')?.match(/rl_compare_csrf=([a-f0-9]{48})/)?.[1];
  const r=await fetch(base+'/comparar/comercios/catalogo/18/validar-csv',{
   method:'POST',headers:{Cookie:cookie+'; rl_compare_csrf='+csrf,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({_csrf:token,csvText:injected}).toString()
  });
  const html=await r.text();
  assert.equal(r.status,200);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/&lt;script&gt;/);
 });
});
test('enlaces del panel, lector local y diseño móvil no solicitan sincronizar ni subir datos solos',()=>{
 assert.match(route,/Preparar catálogo: WooCommerce y CSV/);
 assert.match(route,/requireAuth,async\(req,res,next\)=>/);
 assert.match(route,/validCsrf\(req\)/);
 const client=js.split('/* V3.4.5.1 — selección CSV local')[1];
 assert.ok(client);
 assert.match(client,/file\.text\(\)/);
 assert.match(client,/file\.size>128\*1024/);
 assert.doesNotMatch(client,/\bfetch\(|XMLHttpRequest|serpapi|autoImport/i);
 const styles=css.split('/* V3.4.5.1 — portal privado')[1];
 assert.ok(styles);
 assert.match(styles,/@media\(max-width:650px\)/);
 assert.match(styles,/:focus-visible/);
 assert.match(styles,/min-height:48px/);
 assert.doesNotMatch(styles,/position:\s*fixed|pointer-events:\s*none/);
});
