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
const quality=require('../src/services/marketplace-comparador-offer-quality-v3419');

const q='iphone 12 128 GB',slug=compare.slugFor(q);
function offer(title,price,shop='Wallapop',condition='Usado',image='https://images1.gstatic.com/iphone.png'){
 return {title,price_cents:price,shop,condition,price_currency:'EUR',image,
  href:'https://www.google.com/search?q=iphone+12',internal:false};
}
const broken=offer('iPhone 12 128GB Negro (No Funciona)',5500);
const used=offer('iPhone 12 128GB Negro',9000,'Wallapop','Usado','https://images1.gstatic.com/used.png');
const refurbished=offer('iPhone 12 128GB Violeta - Reacondicionado',16799,'Pixmania',
 'Reacondicionado','https://images1.gstatic.com/refurb.png');

test('identifica averías explícitas pero no asume que un usado sin información funcione',()=>{
 for(const title of ['iPhone 12 128 GB No funciona','iPhone 12 128 GB para piezas',
  'Móvil sin funcionar','No enciende, iPhone 12','Teléfono averiado',
  'iPhone para reparar','iPhone pantalla rota','iPhone 12 defective faulty',
  'iPhone dañado','iPhone en despiece']){
  assert.ok(quality.repairReason({title}),title);
 }
 for(const title of ['iPhone 12 128 GB Usado','iPhone 12 128 GB como nuevo',
  'iPhone 12 128 GB Reacondicionado','iPhone 12 128 GB funciona perfectamente']){
  assert.equal(quality.repairReason({title}),null,title);
 }
});
test('para una búsqueda genérica separa anuncios para reparar y no pierde resultados',()=>{
 const grouped=quality.groupOffers(q,[broken,used,refurbished]);
 assert.deepEqual(grouped.main,[used,refurbished]);
 assert.deepEqual(grouped.repair,[broken]);
 assert.equal(quality.groupOffers('iphone 12 no funciona',[broken,used]).repair.length,0);
 assert.equal(quality.groupOffers('iphone 12 para piezas',[broken]).main.length,1);
 assert.equal(quality.groupOffers(q,[broken]).main.length,0);
});
test('imagen del hero no depende del precio más barato: prioriza oferta de tienda reacondicionada',()=>{
 const hero=detail.heroMarkup(q,[used,refurbished],new Date().toISOString(),false,1);
 assert.match(hero,/>iphone 12 128 GB<\/h2>/);
 assert.match(hero,/https:\/\/images1\.gstatic\.com\/refurb\.png/);
 assert.doesNotMatch(hero,/https:\/\/images1\.gstatic\.com\/used\.png/);
 assert.match(hero,/Precio desde/);
 assert.match(hero,/90,00/);
 assert.match(hero,/Oferta más económica: usado/);
 assert.match(hero,/1 anuncio aparte con avería declarada/);
 assert.match(hero,/Fotografía de una oferta/);
 assert.doesNotMatch(hero,/No Funciona|no funciona|55,00/);
 assert.equal(detail.heroMarkup(q,[],null),'');
});
test('atributos compartidos por variantes, sin atribuir colores/estados de una a todas',()=>{
 assert.deepEqual(detail.commonFacts(q,[used,refurbished]),[{label:'Capacidad',value:'128 GB'}]);
 const specs=detail.specificationsMarkup(q,[used,refurbished]);
 assert.match(specs,/<dt>Capacidad<\/dt><dd>128 GB<\/dd>/);
 assert.doesNotMatch(specs,/<dt>Color<\/dt>|<dt>Estado<\/dt>/);
 const single=detail.specificationsMarkup(q,[refurbished]);
 assert.match(single,/Violeta/);
 assert.match(single,/Reacondicionado/);
});
async function render(offers,query=q){
 const oldQuery=db.query,oldConfigured=provider.configured;
 const slug=compare.slugFor(query);
 try{
  provider.configured=()=>false;
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {
    rows:[{id:61,slug,query_text:query,index_approved:false,seo_blocked:false,
     provider_status:'ok',last_checked_at:new Date().toISOString(),
     created_at:new Date().toISOString(),external_results:offers,editorial_summary:''}],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text()};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}
test('ficha real: 55 € no es precio desde, se ve apartado para reparar',async()=>{
 const {status,html}=await render([broken,used,refurbished]);
 assert.equal(status,200);
 const hero=html.match(/<section class="cmp-detail-hero"[\s\S]+?<\/section>/)?.[0];
 assert.ok(hero);
 assert.match(hero,/>iphone 12 128 GB<\/h2>/);
 assert.match(hero,/refurb\.png/);
 assert.match(hero,/90,00/);
 assert.doesNotMatch(hero,/55,00|No Funciona/);
 assert.match(html,/Precios encontrados/);
 assert.match(html,/Desde 90,00/);
 assert.match(html,/2 ofertas/);
 assert.match(html,/Ver 1 anuncio averiado o para piezas/);
 assert.match(html,/No funciona|No Funciona/);
 assert.match(html,/55,00/);
 assert.match(html,/Para reparar|avería o venta para piezas/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/"@type":"AggregateOffer"/);
 assert.equal((html.match(/class="offer"/g)||[]).length,3);
 assert.equal((html.match(/class="best-offer"/g)||[]).length,1);
});
test('si solo aparecen averiados, no anuncia un teléfono funcional ni un precio general engañoso',async()=>{
 const {status,html}=await render([broken]);
 assert.equal(status,200);
 assert.doesNotMatch(html,/class="cmp-detail-hero"/);
 assert.match(html,/Solo se han encontrado anuncios para reparar/);
 assert.match(html,/Ver 1 anuncio averiado o para piezas/);
 assert.match(html,/55,00/);
 assert.doesNotMatch(html,/Precio desde|Desde 55,00|Precio más bajo mostrado/);
});
test('quien busca un teléfono averiado expresamente sí puede ver esos precios',async()=>{
 const query='iphone 12 128 GB no funciona';
 const faulty=offer('iPhone 12 128 GB No Funciona',5500);
 const grouped=quality.groupOffers(query,[faulty]);
 assert.equal(grouped.main.length,1);
 assert.equal(grouped.repair.length,0);
 const {status,html}=await render([faulty],query);
 assert.equal(status,200);
 assert.match(html,/55,00/);
 assert.match(html,/cmp-detail-hero/);
 assert.doesNotMatch(html,/cmp-repair-section/);
});
test('móvil: fecha de precio en ancho completo y cartel de reparación separado',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/cmp-repair-section/);
 assert.match(css,/cmp-detail-photo-source/);
 assert.match(css,/offer-price-date\{grid-column:1\/-1;text-align:left/);
 assert.match(css,/@media\(max-width:540px\)/);
});

test('SEO y esquema no convierten averiados en productos ordinarios ni por llamada directa',()=>{
 const seo=require('../src/services/marketplace-comparador-seo-v32132');
 const now=new Date().toISOString();
 const page={query_text:q,provider_status:'ok',last_checked_at:now,index_approved:true,seo_blocked:false,
  editorial_summary:'Comparación verificada del mismo modelo, con información comprobada de vendedores y precios claramente diferenciados.'};
 const offers=['Tienda A','Tienda B','Tienda C'].map((shop,i)=>({
  ...offer('Apple iPhone 12 128 GB Negro',19000+i*500,shop,'Consultar estado'),
  href:'https://tienda'+i+'.example/product',price_currency:'EUR'
 }));
 const faulty={...offers[0],title:'Apple iPhone 12 128 GB Negro No funciona',price_cents:5500,shop:'Piezas'};
 const eligible=seo.auto.eligibleOffers(page,[faulty,...offers]);
 assert.equal(eligible.eligible,true);
 assert.equal(eligible.lowPriceCents,19000);
 assert.equal(eligible.offers.length,3);
 assert.equal(seo.indexEligible(page,[faulty,...offers]),true);
 const product=seo.structuredData(page,[faulty,...offers],true,'/comparar/iphone-12')['@graph'].find(x=>x['@type']==='Product');
 assert.equal(product.offers.lowPrice,'190.00');
 const repairPage={...page,query_text:'iphone 12 128 GB no funciona'};
 assert.equal(seo.indexEligible(repairPage,[faulty,...offers]),false);
 assert.equal(seo.auto.eligibleOffers(repairPage,[faulty,...offers]).eligible,false);
 assert.equal(seo.structuredData(repairPage,[faulty,...offers],true,'/comparar/roto')['@graph'].some(x=>x['@type']==='Product'),false);
});
test('foto principal elige imagen segura aunque oferta mejor valorada no tenga imagen',()=>{
 const withNoImage={...refurbished,image:null,condition:'Nuevo'};
 const hero=detail.heroMarkup(q,[used,withNoImage],null);
 assert.match(hero,/used\\.png/);
 assert.doesNotMatch(hero,/cmp-detail-noimage/);
});
test('historial anterior con mínimos contaminados no se muestra junto a anuncios averiados',async()=>{
 const original=db.query,oldConfigured=provider.configured;
 try{
  provider.configured=()=>false;
  db.query=async(sql)=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {rowCount:1,rows:[{
    id:61,slug,query_text:q,index_approved:false,seo_blocked:false,provider_status:'ok',
    last_checked_at:new Date().toISOString(),external_results:[broken,used,refurbished],editorial_summary:''
   }]};
   if(sql.includes('marketplace_compare_price_history'))throw Error('No debe leerse historial mezclado');
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   assert.equal(response.status,200);
   assert.doesNotMatch(await response.text(),/Evolución de precios verificados/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=oldConfigured;}
});
