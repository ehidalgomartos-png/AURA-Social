'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');
const dedupe=require('../src/services/marketplace-comparador-offer-dedupe-v3446');
const seo=require('../src/services/marketplace-comparador-seo-v32132');

const q='iphone 12 128 GB';
function offer(shop,price_cents,href,title='Apple iPhone 12 128 GB Negro',extra={}){
 return {title,shop,price_cents,href,condition:'Consultar estado',
  price_currency:'EUR',internal:false,image:null,...extra};
}
const one=offer('Tienda A',18000,'https://tienda-a.example/iphone-12/'),
 two=offer('Tienda B',19000,'https://tienda-b.example/iphone-12'),
 three=offer('Tienda C',20000,'https://tienda-c.example/iphone-12');

test('conserva solo una aparición de la misma oferta, respetando orden y enlaces',()=>{
 const result=dedupe.uniqueOffers([one,{...one,href:'https://tienda-a.example/iphone-12#ficha'},
  {...one,href:'https://tienda-a.example/iphone-12'},two,three]);
 assert.deepEqual(result,[one,two,three]);
 assert.equal(dedupe.uniqueOffers([one]).length,1);
 assert.deepEqual(dedupe.uniqueOffers(null),[]);
 assert.equal(dedupe.normalizedUrl('http://tienda-a.example/iphone-12'),null);
});

test('no confunde vendedores, variantes, condiciones, productos ni URLs diferentes',()=>{
 const cases=[
  {...one,shop:'Otra tienda'},
  {...one,price_cents:18500},
  {...one,title:'Apple iPhone 12 256 GB Negro'},
  {...one,condition:'Usado'},
  {...one,href:'https://tienda-a.example/otro-iphone'},
  {...one,href:'https://tienda-a.example/iphone-12?color=azul'},
  {...one,product_id:'234567890'}
 ];
 for(const other of cases)assert.equal(dedupe.uniqueOffers([one,other]).length,2,JSON.stringify(other));
 const l1={...one,internal:true,listing_id:10,href:'/marketplace/p/10'},
  l2={...l1,listing_id:11,href:'/marketplace/p/11'};
 assert.equal(dedupe.uniqueOffers([l1,l2]).length,2);
 assert.equal(dedupe.uniqueOffers([l1,{...l1}]).length,1);
});

test('prioriza un enlace revisado entre duplicados sin alterarlo ni inventar URL',()=>{
 const reviewed={...one,manual_link:true,resolved_href:'https://tienda-a.example/producto-real',image:'https://images1.gstatic.com/iphone.jpg'};
 const result=dedupe.uniqueOffers([one,reviewed,two]);
 assert.equal(result.length,2);
 assert.equal(result[0],reviewed);
 assert.equal(result[0].resolved_href,'https://tienda-a.example/producto-real');
 assert.equal(one.resolved_href,undefined,'sin mutación del anuncio original');
});

test('el SEO no infla el número de ofertas ni el AggregateOffer por duplicaciones',()=>{
 const page={query_text:q,provider_status:'ok',last_checked_at:new Date().toISOString(),
  index_approved:false,seo_blocked:false,editorial_summary:''};
 const repeated=[one,{...one},two,three];
 const check=seo.auto.eligibleOffers(page,repeated);
 assert.equal(check.eligible,true,check.reason);
 assert.equal(check.offers.length,3);
 assert.equal(check.sellerCount,3);
 assert.equal(check.lowPriceCents,18000);
 assert.equal(check.highPriceCents,20000);
 assert.equal(seo.indexEligible(page,repeated),true);
 const graph=seo.structuredData(page,repeated,true,'/comparar/iphone-12-128');
 const product=graph['@graph'].find(x=>x['@type']==='Product');
 assert.equal(product.offers.offerCount,3);
 assert.equal(product.offers.lowPrice,'180.00');
 const onlyTwo=[one,{...one},two];
 assert.equal(seo.auto.eligibleOffers(page,onlyTwo).eligible,false);
});

test('ficha móvil y escritorio muestran tres ofertas y no cuatro, sin consultas extra a SerpApi',async()=>{
 const original=db.query,oldConfigured=provider.configured,slug=compare.slugFor(q);
 const sql=[];
 try{
  provider.configured=()=>false;
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1')){
    return {rowCount:1,rows:[{id:73,slug,query_text:q,provider_status:'ok',
     external_results:[one,{...one},two,three],index_approved:false,seo_blocked:false,
     last_checked_at:new Date().toISOString(),editorial_summary:''}]};
   }
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.equal((html.match(/<li class="offer"/g)||[]).length,3);
   assert.match(html,/Desde 180,00/);
   assert.match(html,/3 ofertas/);
   assert.equal((html.match(/href="https:\/\/tienda-a\.example\/iphone-12\/"/g)||[]).length,1);
   assert.match(html,/name="robots" content="index,follow"/);
   assert.equal(sql.some(x=>/INSERT INTO marketplace_compare_provider_usage/.test(x)),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;provider.configured=oldConfigured;}
});
