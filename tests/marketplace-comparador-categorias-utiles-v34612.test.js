'use strict';
// V3.4.6.12 — páginas de categoría con contenido real, sin indexar todo por defecto.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const categories=require('../src/services/marketplace-comparador-categorias-seo-v34612');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const compare=require('../src/routes/marketplace-comparador-v32132');
function offer(shop,title,price,extra={}){
 return {shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
  href:'https://'+shop.toLowerCase().replace(/[^a-z0-9]/g,'')+'.example/producto',
  internal:false,sponsored:false,...extra};
}
function page(query,rows,more={}){
 return {id:34612,query_text:query,slug:compare.slugFor(query),
  external_results:rows,index_approved:false,seo_blocked:false,provider_status:'ok',
  editorial_summary:'',last_checked_at:new Date().toISOString(),
  updated_at:new Date().toISOString(),...more};
}
const skechers=[
 offer('Tienda 1','Skechers Go Walk mujer zapatillas negro',6700),
 offer('Tienda 2','Skechers Arch Fit mujer zapatillas blanco',8900),
 offer('Tienda 3','Skechers Uno mujer zapatillas gris',7200),
 offer('Tienda 4',"Skechers D'Lites zapatillas mujer",9000)
];
test('una categoría Skechers específica puede ser indexable con líneas diferentes reales',()=>{
 const q='zapatillas skechers mujer',p=page(q,skechers);
 assert.equal(seo.discovery.classifyQuery(q),'category');
 assert.equal(categories.evidence(q,skechers).eligible,true);
 const result=seo.discovery.evaluate(p,skechers);
 assert.equal(result.eligible,true,result.reason);
 assert.equal(result.kind,'category');
 assert.deepEqual(result.modelLines.sort(),["D'Lites",'Arch Fit','Go Walk','Uno'].sort());
 assert.equal(seo.indexEligible(p,skechers),true);
 assert.equal(audit.audit([p],[p]).counts['en-sitemap'],1);
 assert.equal(seo.structuredData(p,skechers,true,'/comparar/'+p.slug)['@graph']
  .some(x=>x['@type']==='Product'),false);
 assert.match(seo.discovery.summary(p,result),/modelos, tallas o versiones diferentes/);
});
test('categoría Skechers no acepta anuncios de hombre, infantiles, sin modelo, alquiler ni accesorios',()=>{
 const q='zapatillas skechers mujer';
 for(const bad of [
  offer('Tienda 5','Skechers Go Walk hombre',6000),
  offer('Tienda 5','Skechers niño Arch Fit',4500),
  offer('Tienda 5','Skechers mujer zapatillas sin modelo',6000),
  offer('Tienda 5','Skechers Arch Fit mujer funda',4000),
  offer('Grover','Skechers Uno mujer zapatillas',899),
  offer('Tienda 5','Skechers Arch Fit mujer zapatillas',7200,{condition:'Usado'})
 ])assert.equal(categories.suitable(q,bad)&&
  quality.rentalReason(bad)===null&&
  !quality.repairReason(bad),false,bad.title);
 const few=skechers.slice(0,2);
 assert.equal(seo.indexEligible(page(q,few),few),false);
 const clone=[...skechers.slice(0,2),{...skechers[2],shop:'Tienda 1'}, {...skechers[3],shop:'Tienda 1'}];
 assert.equal(seo.indexEligible(page(q,clone),clone),false);
 const sameLine=skechers.map(o=>({...o,title:'Skechers Arch Fit mujer zapatillas'}));
 assert.equal(seo.indexEligible(page(q,sameLine),sameLine),false);
 assert.equal(seo.discovery.classifyQuery('zapatillas mujer'),null);
 assert.equal(seo.discovery.classifyQuery('skechers'),null);
});
test('chaqueta North Face hombre es una categoría concreta solo si hay prendas y líneas reales',()=>{
 const q='chaqueta north face hombre',rows=[
  offer('Comercio 1','The North Face Antora Chaqueta hombre',11500),
  offer('Comercio 2','The North Face Quest Jacket hombre',9500),
  offer('Comercio 3','Chaqueta The North Face Resolve hombre',14500),
  offer('Comercio 4','The North Face Nuptse Jacket hombre',26900)
 ];
 assert.equal(categories.evidence(q,rows).eligible,true);
 assert.equal(seo.indexEligible(page(q,rows),rows),true);
 const women=offer('Comercio 5','The North Face Quest Chaqueta Mujer',9500);
 assert.equal(categories.suitable(q,women),false);
 assert.equal(seo.indexEligible(page(q,[rows[0],women]),[rows[0],women]),false);
 const oneStore=rows.map(o=>({...o,shop:'Comercio 1'}));
 assert.equal(seo.indexEligible(page(q,oneStore),oneStore),false);
});
test('familia ASUS ROG Strix G15/G16/G17 con precios distintos NO es un mismo SKU',()=>{
 const q='portatil asus rog strix gaming',rows=[
  offer('Tienda Uno','Portatil ASUS ROG Strix Gaming G15',40000),
  offer('Tienda Dos','Portatil ASUS ROG Strix Gaming G16',145000),
  offer('Tienda Tres','Portatil ASUS ROG Strix Gaming G17',220000),
  offer('Tienda Cuatro','Portatil ASUS ROG Strix Gaming G18',260000)
 ];
 const p=page(q,rows),result=seo.discovery.evaluate(p,rows);
 assert.equal(result.eligible,true,result.reason);
 assert.equal(result.kind,'family');
 assert.deepEqual(result.modelLines,['G15','G16','G17','G18']);
 assert.equal(seo.indexEligible(p,rows),true);
 assert.equal(seo.structuredData(p,rows,true,'/comparar/'+p.slug)['@graph']
  .some(x=>x['@type']==='Product'),false);
 const unknown=[...rows.slice(0,3),offer('Tienda Cuatro','Portatil ASUS ROG Strix Gaming',200000)];
 assert.equal(seo.indexEligible(page(q,unknown),unknown),false);
 const cheap=[...rows.slice(0,3),offer('Tienda Cuatro','Portatil ASUS ROG Strix Gaming G18',5900)];
 assert.equal(seo.indexEligible(page(q,cheap),cheap),false);
});
test('Roborock S8 base se separa de Pro/Plus/Ultra y solo se indexa si queda oferta comparable',()=>{
 const q='robot aspirador roborock s8';
 const rows=[
  offer('Tienda A','Robot Aspirador Roborock S8 Negro',48900),
  offer('Tienda B','Robot Aspirador Roborock S8 Negro',51900),
  offer('Tienda C','Robot Aspirador Roborock S8 Pro Ultra',69900),
  offer('Tienda D','Robot Aspirador Roborock S8+',62000)
 ];
 const grouped=quality.groupOffers(q,rows);
 assert.equal(grouped.main.length,2);
 assert.equal(grouped.review.length,2);
 assert.equal(seo.indexEligible(page(q,rows),rows),true);
 assert.equal(seo.indexEligible(page(q,rows.slice(2)),rows.slice(2)),false);
 assert.equal(quality.roborockCompatible('Roborock S8 MaxV Ultra'),false);
 assert.equal(seo.indexEligible(page(q,rows,{seo_blocked:true}),rows),false);
});
test('página de categoría ofrece una guía propia; sitemap y robots conservan la misma validación',async()=>{
 const q='zapatillas skechers mujer',p=page(q,[...skechers,
  offer('Tienda 5','Skechers Go Walk hombre',7000)]);
 const old=db.query,oldConfigured=provider.configured,sql=[];
 try{
  provider.configured=()=>false;
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rows:[p],rowCount:1};
   if(statement===audit.SITEMAP_CANDIDATES_SQL)return {rows:[p],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const root='http://127.0.0.1:'+server.address().port;
   const html=await (await fetch(root+'/comparar/'+p.slug)).text();
   const xml=await (await fetch(root+'/sitemap-comparador.xml')).text();
   assert.match(html,/<meta name="robots" content="index,follow">/);
   assert.match(html,/Modelos incluidos en esta selección/);
   assert.match(html,/Los precios corresponden a productos y variantes diferentes/);
   assert.match(html,/Go Walk/);
   assert.match(html,/Otra categoría o modelo no identificado/);
   assert.match(xml,new RegExp('<loc>https://redlibertad.com/comparar/'+p.slug+'</loc>'));
   assert.ok(sql.every(s=>!/https:\/\/serpapi\.com|INSERT INTO marketplace_compare_provider_usage/i.test(s)));
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=old;provider.configured=oldConfigured;}
});
test('ninguna categoría puede saltarse vetos administrativos, caducidad o errores de proveedor',()=>{
 const q='zapatillas skechers mujer';
 for(const flags of [{seo_blocked:true},{provider_status:'unavailable'},
  {provider_status:'limit_reached'},{last_checked_at:'2021-01-01T00:00:00Z'}])
  assert.equal(seo.indexEligible(page(q,skechers,flags),skechers),false);
 const code=fs.readFileSync(path.join(__dirname,
  '../src/services/marketplace-comparador-categorias-seo-v34612.js'),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|\bdb\.query|reserveQuota|enqueue|serpapi\.com/i);
});
