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
const paid=require('../src/services/marketplace-comparador-sponsored-v3447');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const q='iphone 12 128 GB';
const offer=(shop,price_cents,more={})=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents,price_currency:'EUR',
 href:'https://'+shop.toLowerCase().replace(/\s+/g,'-')+'.example/p/iphone-12',
 condition:'Consultar estado',image:null,internal:false,...more
});
const ad=offer('Tienda Promo',5500,{sponsored:true,source_type:'google_shopping_ad'});
const used=offer('Tienda A',19000);
const second=offer('Tienda B',20000);
const third=offer('Tienda C',21000);

test('separa exclusivamente patrocinados declarados y conserva objetos, orden y URLs',()=>{
 const rows=[ad,used,second,{...third,sponsored:false}];
 const result=paid.splitPaidOffers(rows);
 assert.deepEqual(result.ordinary,[used,second,rows[3]]);
 assert.deepEqual(result.sponsored,[ad]);
 assert.equal(result.sponsored[0],ad);
 assert.deepEqual(paid.splitPaidOffers(null),{ordinary:[],sponsored:[]});
 assert.equal(paid.splitPaidOffers([offer('Tienda D',22000)]).sponsored.length,0);
});

async function render(offers){
 const oldQuery=db.query,oldConfigured=provider.configured,slug=compare.slugFor(q),sql=[];
 try{
  provider.configured=()=>false;
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1')){
    return {rowCount:1,rows:[{
     id:900,slug,query_text:q,external_results:offers,index_approved:false,seo_blocked:false,
     last_checked_at:new Date().toISOString(),created_at:new Date().toISOString(),
     provider_status:'ok',editorial_summary:''
    }]};
   }
   return {rowCount:0,rows:[]};
  };
  const app=express();
  app.use(express.urlencoded({extended:true}));
  app.use(cookieParser());
  app.use(compare.router);
  const server=await new Promise(resolve=>{
   const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
  });
  try{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:res.status,html:await res.text(),sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;}
}

test('un anuncio de 55 € nunca destaca frente al precio ordinario de 190 €',async()=>{
 const {status,html,sql}=await render([ad,used,second,third]);
 assert.equal(status,200);
 assert.match(html,/Desde 190,00/);
 assert.match(html,/3 ofertas/);
 assert.match(html,/Publicidad \(1\)/);
 assert.match(html,/5(?:5),00/);
 assert.match(html,/class="offer-sponsored">Publicidad<\/span>/);
 const primary=html.match(/<ol class="comparison-list cmp-primary-offers"[^>]*>[\s\S]*?<\/ol>/)?.[0];
 assert.ok(primary);
 assert.equal((primary.match(/<li class="offer"/g)||[]).length,3);
 assert.doesNotMatch(primary,/55,00|Tienda Promo/);
 assert.match(html,/https:\/\/tienda-promo\.example\/p\/iphone-12/);
 assert.match(html,/name="robots" content="index,follow"/);
 const ld=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(ld);
 const product=JSON.parse(ld)['@graph'].find(x=>x['@type']==='Product');
 assert.equal(product.offers.lowPrice,'190.00');
 assert.equal(product.offers.offerCount,3);
 assert.ok(!sql.some(x=>/(?:INSERT INTO|UPDATE)\s+marketplace_compare_provider_usage|INSERT INTO marketplace_compare_jobs/.test(x)),
  'crear o leer tablas de cuotas no equivale a gastar una consulta');
 assert.ok(!sql.some(x=>/^\s*SELECT\b[\s\S]*\bFROM\s+marketplace_compare_price_history/i.test(x)),
  'no mostrar historial antiguo potencialmente mezclado con publicidad');
});

test('si hay solo publicidad no inventa mínimo de producto ni una oferta independiente',async()=>{
 const {status,html}=await render([ad]);
 assert.equal(status,200);
 assert.match(html,/Solo hay ofertas publicitarias/);
 assert.match(html,/Publicidad \(1\)/);
 assert.match(html,/55,00/);
 assert.doesNotMatch(html,/class="cmp-detail-hero"/);
 assert.doesNotMatch(html,/class="cmp-start-price"|Precio desde|Desde 55,00/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/"@type":"AggregateOffer"/);
 assert.equal((html.match(/<li class="offer"/g)||[]).length,1);
});

test('el SEO sigue ignorando la publicidad y mantiene las tres tiendas no patrocinadas',()=>{
 const page={query_text:q,provider_status:'ok',last_checked_at:new Date().toISOString(),
  index_approved:false,seo_blocked:false,editorial_summary:''};
 const eligible=seo.auto.eligibleOffers(page,[ad,used,second,third]);
 assert.equal(eligible.eligible,true,eligible.reason);
 assert.equal(eligible.offers.length,3);
 assert.equal(eligible.lowPriceCents,19000);
 assert.equal(seo.indexEligible(page,[ad,used,second,third]),true);
 assert.equal(seo.auto.eligibleOffers(page,[ad,used,second]).eligible,false);
});

test('diseño publicitario compacto reutiliza la sección accesible en móvil',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(html,/cmp-noncomparable-section cmp-sponsored-section/);
 assert.match(css,/V3\.4\.4\.7/);
 assert.match(css,/\.cmp-sponsored-section \.comparison-list/);
 assert.match(css,/@media\(max-width:540px\)/);
});
