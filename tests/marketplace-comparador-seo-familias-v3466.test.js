'use strict';
// V3.4.6.6 — agrupación segura de calzado y capacidad obligatoria en Redmi.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const compare=require('../src/routes/marketplace-comparador-v32132');
const DAY=86400000;
function make(query,offers,overrides={}){
 return {id:36,slug:compare.slugFor(query),query_text:query,external_results:offers,
  provider_status:'ok',seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString(),...overrides};
}
const offer=(shop,title,price,more={})=>({
 shop,title,price_cents:price,price_currency:'EUR',condition:'Nuevo',
 internal:false,sponsored:false,href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/producto',...more
});
const women=[
 offer('Tienda Uno','New Balance 530 Mujer Blanco Talla 37',8900),
 offer('Tienda Dos','New Balance 530 Mujer Gris Talla 38',9600),
 offer('Tienda Tres','New Balance 530 Unisex Azul Talla 39',9900)
];
test('New Balance 530 mujer con varios colores y tallas es familia, no SKU estricto',()=>{
 const p=make('new balance 530 mujer',women);
 assert.equal(seo.discovery.footwearFamily(p.query_text),true);
 assert.equal(seo.discovery.classifyQuery(p.query_text),'family');
 assert.equal(seo.discovery.evaluate(p,women).eligible,true);
 assert.equal(seo.indexEligible(p,p.external_results),true);
 const result=audit.audit([p],[p]);
 assert.equal(result.counts['en-sitemap'],1);
 const graph=seo.structuredData(p,women,true,'/comparar/'+p.slug)['@graph'];
 assert.equal(graph.some(e=>e['@type']==='Product'),false,
  'gama de colores/tallas no se presenta como AggregateOffer de un SKU');
 assert.match(seo.discovery.summary(p,seo.discovery.evaluate(p,women)),/Pueden corresponder a distintas versiones/);
});
test('variantes de calzado excluyen sexo contrario, modelos distintos y falsas tiendas',()=>{
 const q='new balance 530 mujer';
 assert.equal(seo.discovery.footwearGenderCompatible(q,'New Balance 530 Hombre Negro'),false);
 assert.equal(seo.discovery.footwearGenderCompatible(q,'New Balance 530 Mujer Negro'),true);
 assert.equal(seo.discovery.footwearGenderCompatible(q,'New Balance 530 Unisex Negro'),true);
 for(const list of [
  women.slice(0,2),
  [...women.slice(0,2),offer('Tienda Tres','New Balance 530 Hombre Negro',9900)],
  [...women.slice(0,2),offer('Tienda Tres','New Balance 574 Mujer',9900)],
  [women[0],{...women[1],shop:'Tienda Uno'}, {...women[2],shop:'Tienda Uno'}],
  women.map(o=>({...o,sponsored:true})),
  women.map(o=>({...o,condition:'Usado'})),
  women.map(o=>({...o,href:'javascript:alert(1)'}))
 ]){
  const p=make(q,list);
  assert.equal(seo.indexEligible(p,list),false);
 }
 // No ampliar categorías genéricas solo para ganar tráfico.
 assert.equal(seo.discovery.classifyQuery('zapatillas mujer'),null);
 assert.equal(seo.discovery.classifyQuery('new balance'),null);
});
test('Xiaomi Redmi Note 14 Pro requiere capacidad y separa variantes 128/256 GB',()=>{
 const q='xiaomi redmi note 14 pro';
 assert.equal(quality.isPhoneSearch(q),true);
 assert.equal(quality.isPhoneSearch('poco f6 pro'),true);
 const mixed=[
  offer('Tienda A','Xiaomi Redmi Note 14 Pro 128 GB Negro',22000),
  offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Negro',25500),
  offer('Tienda C','Xiaomi Redmi Note 14 Pro 256 GB Negro',26000)
 ];
 const p=make(q,mixed);
 assert.equal(seo.indexEligible(p,mixed),false);
 assert.match(seo.discovery.evaluate(p,mixed).reason,/Especifica la capacidad/);
 assert.match(audit.reason(p),/Especifica la capacidad/);
 const exact=make(q+' 256 GB',mixed);
 assert.equal(seo.discovery.evaluate(exact,mixed).eligible,true);
 assert.equal(seo.indexEligible(exact,mixed),true);
 assert.equal(seo.indexEligible(make(q+' 128 GB',mixed),mixed),false,
  'no basta una única tienda para 128 GB');
 const wrongColor=make(q+' 256 GB',[
  offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Negro',25500),
  offer('Tienda C','Xiaomi Redmi Note 14 Pro 256 GB Azul',26000)
 ]);
 assert.equal(seo.indexEligible(wrongColor,wrongColor.external_results),false);
});
test('no cambian vetos: sin fecha, errores de proveedor, bloques y precios incoherentes',()=>{
 const p=make('new balance 530 mujer',women);
 for(const extra of [
  {seo_blocked:true},{provider_status:'unavailable'},{provider_status:'limit_reached'},
  {last_checked_at:new Date(Date.now()-8*DAY).toISOString()},
  {last_checked_at:null}
 ]){
  assert.equal(seo.indexEligible({...p,...extra},women),false);
 }
 const wild=[women[0],women[1],{...women[2],price_cents:190000}];
 assert.equal(seo.indexEligible(make(p.query_text,wild),wild),false);
});
test('auditoría privada sugiere capacidades existentes pero no crea páginas ni consultas',async()=>{
 const layer=compare.router.stack.find(x=>x.route?.path==='/admin/comparador/indexacion');
 assert.ok(layer);
 const handler=layer.route.stack.at(-1).handle;
 const p=make('xiaomi redmi note 14 pro',[
  offer('Tienda A','Xiaomi Redmi Note 14 Pro 128 GB Negro',20000),
  offer('Tienda B','Xiaomi Redmi Note 14 Pro 256 GB Negro',24000),
  offer('Tienda C','Xiaomi Redmi Note 14 Pro 256 GB Negro',25000)
 ]);
 const queries=[],old=db.query;
 db.query=async sql=>{
  queries.push(sql);
  if(sql===audit.SITEMAP_CANDIDATES_SQL)return {rows:[p],rowCount:1};
  if(sql===audit.SAMPLE_SQL)return {rows:[p],rowCount:1};
  return {rows:[],rowCount:0};
 };
 const headers={},res={set(k,v){headers[k]=v;return this;},
  send(v){this.html=v;return this;}};
 let err=null;
 try{
  await handler({query:{estado:'todas'}},res,e=>{err=e;});
  assert.equal(err,null);
  assert.match(res.html,/Especifica la capacidad/);
  assert.match(res.html,/Opciones más precisas basadas en ofertas guardadas/);
  assert.match(res.html,/xiaomi%20redmi%20note%2014%20pro%20256%20GB/);
  assert.match(res.html,/solo enviarlo solicita precios externos/);
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.ok(queries.includes(audit.SAMPLE_SQL));
  assert.ok(queries.every(q=>!/marketplace_compare_provider_usage|serpapi|INSERT INTO marketplace_compare_pages/i.test(q)));
  assert.doesNotMatch(res.html,/form method="post"/);
 }finally{db.query=old;}
});
test('las reglas siguen centralizadas para HTML y sitemap sin nuevo consumo',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const discovery=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-index-discovery-v3458.js'),'utf8');
 assert.match(css,/V3\.4\.6\.6/);
 assert.match(discovery,/footwearGenderCompatible/);
 assert.match(discovery,/sellerCount:sellers.size/);
 assert.doesNotMatch(discovery,/\bfetch\s*\(|reserveQuota|db\.query|serpapi\.search/i);
});
