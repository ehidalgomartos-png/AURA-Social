'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');

const phone={title:'iPhone 12 128 GB morado, desbloqueado - Reacondicionado - Excelente estado',
 price_cents:25900,price_currency:'EUR',shop:'Pixmania',condition:'Reacondicionado',
 image:'https://images1.gstatic.com/iphone-12.png',href:'https://pixmania.com/es/iphone-12-128',
 internal:false};
const cabinet={title:'Muebles Pitarch armario bajo auxiliar Tibet color blanco soft 2 puertas 2 estantes 120x74x33 cm',
 shop:'Tienda real',price_cents:12999,price_currency:'EUR',image:'https://images1.gstatic.com/pitarch.png',
 condition:'Nuevo',href:'https://tienda.es/armario-tibet'};

test('extrae características solo de títulos y datos reales: móvil y muebles',()=>{
 assert.deepEqual(detail.facts('iphone 12 128 GB',phone),[
  {label:'Capacidad',value:'128 GB'},
  {label:'Color',value:'Morado'},
  {label:'Estado',value:'Reacondicionado'}
 ]);
 assert.deepEqual(detail.facts('armario bajo tibet blanco 120x74x33 cm',cabinet),[
  {label:'Dimensiones',value:'120 × 74 × 33 cm'},
  {label:'Color',value:'Blanco'},
  {label:'Puertas',value:'2'},
  {label:'Estantes',value:'2'},
  {label:'Estado',value:'Nuevo'}
 ]);
});
test('no inventa GTIN, descuentos, valoraciones, ancho/alto ni fichas técnicas',()=>{
 const f=detail.facts('armario blanco', {...cabinet,title:'Armario blanco',condition:'No indicado'});
 assert.deepEqual(f,[{label:'Color',value:'Blanco'}]);
 const html=detail.specificationsMarkup('armario blanco',[{...cabinet,title:'Armario blanco',condition:'No indicado'}]);
 assert.doesNotMatch(html,/EAN|GTIN|Reseñas|Descuento|Ancho|Alto/);
 assert.equal(detail.specificationsMarkup('artículo', [{title:'Artículo',condition:'No indicado'}]),'');
 assert.equal(detail.specificationsMarkup('artículo',[]),'');
});
test('EAN/GTIN solo se muestran si fuente lo proporciona y el código es válido',()=>{
 const valid={...cabinet,gtin:'8414740011073'};
 const f=detail.facts('armario',valid);
 // El ejemplo aportado por el usuario puede no tener checksum válido;
 // el validador protege de atribuirlo erróneamente a una oferta.
 const code='8414740011073',numbers=code.split('').map(Number);
 const checksum=(10-numbers.slice(0,12).reduce((a,d,i)=>a+d*(i%2?3:1),0)%10)%10;
 assert.equal(f.some(x=>x.label==='EAN / GTIN'),checksum===numbers[12]);
 const bad=detail.facts('armario',{...cabinet,gtin:'8414740011070'});
 assert.equal(bad.some(x=>x.label==='EAN / GTIN'),false);
});
test('cabecera y especificaciones tienen marca RedLibertad, precio correcto y enlaces internos',()=>{
 const hero=detail.heroMarkup('iphone 12 128 GB',[phone],new Date().toISOString());
 assert.match(hero,/class="cmp-detail-hero"/);
 assert.match(hero,/Ficha del producto · RedLibertad/);
 assert.match(hero,/259,00/);
 assert.match(hero,/1 oferta · 1 vendedor/);
 assert.match(hero,/href="#precios-y-tiendas"/);
 assert.match(hero,/img class="cmp-detail-photo"/);
 assert.match(hero,/images1\.gstatic\.com/);
 assert.match(hero,/Precios orientativos/);
 assert.doesNotMatch(hero,/Producto original garantizado|Oferta disponible hoy|precio anterior|descuento/);
 const specs=detail.specificationsMarkup('iphone 12 128 GB',[phone]);
 assert.match(specs,/Características del producto/);
 assert.match(specs,/<dt>Capacidad<\/dt><dd>128 GB<\/dd>/);
 assert.match(specs,/<dt>Estado<\/dt><dd>Reacondicionado<\/dd>/);
 assert.match(detail.heroMarkup('iphone 12',[phone],null,true),/Último precio registrado/);
 assert.equal(detail.heroMarkup('iphone 12',[],null),'');
});
test('escapa datos externos no confiables y limita enlaces relacionados a URLs seguras',()=>{
 const evil={...phone,title:'<img src=x onerror=alert(1)> iPhone 12 128 GB',shop:'Tienda'};
 const hero=detail.heroMarkup('iphone 12 128 GB',[evil],null);
 assert.doesNotMatch(hero,/<img src=x onerror/);
 assert.match(hero,/&lt;img src=x onerror=alert\(1\)&gt;/);
 const rows=[
  {slug:'iphone-13-128gb',query_text:'iPhone 13 128 GB'},
  {slug:'../admin',query_text:'Panel privado'},
  {slug:'iphone-12-pro',query_text:'iPhone 12 Pro & Max'},
  {slug:'iphone-12',query_text:'<svg onload=alert(1)>'},
  {slug:'iphone-12',query_text:'repetido'}
 ];
 const result=detail.relatedMarkup(rows,'iphone-12');
 assert.match(result,/href="\/comparar\/iphone-13-128gb"/);
 assert.match(result,/iPhone 12 Pro &amp; Max/);
 assert.doesNotMatch(result,/href="\/comparar\/\.\./);
 assert.doesNotMatch(result,/<svg/);
 assert.doesNotMatch(result,/repetido/);
 assert.equal(detail.relatedMarkup([],'whatever'),'');
});
async function render({q='iphone 12 128 GB',offers=[phone],related=[],lastCheckedAt=new Date().toISOString()}={}){
 const oldQuery=db.query,oldConfigured=provider.configured;
 const slug=compare.slugFor(q);
 let relatedQueryCalled=false;
 try{
  provider.configured=()=>false;
  db.query=async(sql,args=[])=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {
    rowCount:1,rows:[{id:51,slug,query_text:q,index_approved:false,seo_blocked:false,
     created_at:new Date().toISOString(),last_checked_at:lastCheckedAt,external_results:offers,
     provider_status:'ok',editorial_summary:''}]};
   if(sql.startsWith('SELECT slug,query_text FROM marketplace_compare_pages')){relatedQueryCalled=true;return {rowCount:related.length,rows:related};}
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),relatedQueryCalled};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}
test('GET permanente integra ficha visual, enlace real de tienda, características y SEO existente',async()=>{
 const {status,html,relatedQueryCalled}=await render({
  related:[{slug:'iphone-13-128gb',query_text:'iPhone 13 128 GB'}]
 });
 assert.equal(status,200);
 assert.equal(relatedQueryCalled,true);
 assert.match(html,/cmp-rich-comparison/);
 assert.match(html,/cmp-detail-hero/);
 assert.match(html,/cmp-detail-specifications/);
 assert.match(html,/cmp-detail-related/);
 assert.match(html,/Ver la oferta/);
 assert.match(html,/Ver oferta en tienda/);
 assert.match(html,/Pixmania/);
 assert.match(html,/259,00/);
 assert.match(html,/Capacidad/);
 assert.match(html,/Precios consultados:/);
 assert.match(html,/href="\/comparar\/iphone-13-128gb"/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/rel="canonical"/);
 assert.equal((html.match(/class="offer"/g)||[]).length,1);
});
test('cuando no hay ofertas no presenta una ficha ficticia ni consulta relacionados',async()=>{
 const {html,relatedQueryCalled}=await render({offers:[]});
 assert.equal(relatedQueryCalled,false);
 assert.doesNotMatch(html,/cmp-detail-hero|cmp-detail-specifications/);
 assert.match(html,/No hemos encontrado ofertas coincidentes/);
});
test('la ficha de muebles presenta las dimensiones reales sin inferir su orden',async()=>{
 const {status,html}=await render({q:'armario bajo tibet blanco 120x74x33 cm',offers:[cabinet]});
 assert.equal(status,200);
 assert.match(html,/120 × 74 × 33 cm/);
 assert.match(html,/>Puertas<\/dt><dd>2<\/dd>/);
 assert.match(html,/>Estantes<\/dt><dd>2<\/dd>/);
 assert.doesNotMatch(html,/Ancho:\s*120|Alto:\s*74|GTIN/);
});
test('el CSS integra hero de producto, comparador de vendedores y versión móvil',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 for(const t of ['.cmp-detail-hero','.cmp-detail-photo','.cmp-detail-price','.cmp-detail-specifications',
   '.cmp-detail-related','.comparison-list',':not(.compare-single-product)','max-width:540px'])
  assert.ok(css.includes(t),t);
});
