'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');

const organic={title:'Samsung Galaxy S26 256 GB',shop:'Tienda España',price_cents:79900,href:'https://www.google.com/shopping/product/100',destination:'shopping-search',internal:false};
const inline=[
 {title:'Samsung Galaxy S26 256 GB',source:'Tienda España',price:'799,00 €',extracted_price:799,link:'https://tienda.example/samsung-s26'},
 {title:'Samsung Galaxy S26 256 GB',source:'Otra Tienda',price:'850 €',extracted_price:850,link:'https://otrat.example/samsung'},
 {title:'Samsung Galaxy S25 Ultra',source:'Tienda Excluida',price:'699 €',extracted_price:699,link:'https://seller.example/other'},
 {title:'Samsung Galaxy S26 Cargador',source:'Accesorios',price:'19 €',extracted_price:19,link:'https://seller.example/cargador'},
 {title:'Samsung Galaxy S26 256 GB',source:'Solo Google',price:'780 €',extracted_price:780,link:'https://www.google.com/aclk?x=y'},
 {title:'Samsung Galaxy S26 256 GB',source:'Sin enlace',price:'700 €',extracted_price:700,tracking_link:'https://www.google.com/aclk?x=y'},
 {title:'Samsung Galaxy S26 256 GB',source:'USD',price:'$600',extracted_price:600,link:'https://seller.example/us'},
 {title:'Samsung Galaxy S26 256 GB',source:'Inseguro',price:'810 €',extracted_price:810,link:'javascript:alert(1)'}
];

test('solo anuncios con enlace HTTPS directo a tienda y precios EUR',()=>{
 const r=provider.parseInlineStores(inline,'samsung s26');
 assert.equal(r.length,2);
 assert.equal(r[0].price_cents,79900);
 assert.equal(r[1].price_cents,85000);
 for(const offer of r){
  assert.equal(offer.destination,'store');
  assert.equal(offer.sponsored,true);
  assert.equal(offer.source_type,'google_shopping_ad');
  assert.ok(offer.href.startsWith('https://'));
 }
});
test('un enlace directo sustituye a la ficha Google del mismo vendedor y producto',()=>{
 const ad=provider.parseInlineStores(inline,'samsung s26')[0];
 const out=provider.mergeOffers([organic],[ad]);
 assert.equal(out.length,1);
 assert.equal(out[0].href,'https://tienda.example/samsung-s26');
 assert.equal(out[0].sponsored,true);
});
test('no gastar consultas adicionales al reutilizar inline_shopping_results',async()=>{
 const apiKey='abcdefghijklmnopqrstuvwxyz';
 let calls=0;
 const r=await provider.fetchOffers('samsung s26',async(_url,opts)=>{
  calls++;
  assert.ok(opts.signal);
  return {ok:true,json:async()=>({shopping_results:[
   {title:'Samsung Galaxy S26 256 GB',source:'Tienda España',price:'799 €',extracted_price:799,product_link:'https://www.google.com/shopping/product/100'}
  ],inline_shopping_results:inline})};
 },{COMPARADOR_SERPAPI_KEY:apiKey});
 assert.equal(calls,1);
 assert.equal(r.length,2);
 assert.equal(r.find(x=>x.shop==='Tienda España').destination,'store');
});
test('publicidad identificada y no usada para SEO de producto',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(source,/offer-sponsored/);
 const destinationSource=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-destinations-v3449.js'),'utf8');
 assert.match(source,/describeDestination/);
 assert.match(destinationSource,/Publicidad de Google/);
 assert.match(source,/rel="noopener noreferrer nofollow/);
 const page={query_text:'samsung s26',index_approved:true,provider_status:'ok',
   editorial_summary:'Comparativa editorial de modelos exactos con análisis original de diferencias y valor para compradores de España.',
   last_checked_at:new Date().toISOString()};
 assert.equal(seo.indexEligible(page,provider.parseInlineStores(inline,'samsung s26')),false);
 assert.match(seo.APPROVED_SQL,/sponsored/);
});
