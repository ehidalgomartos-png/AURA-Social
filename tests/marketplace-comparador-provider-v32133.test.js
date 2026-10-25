'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const seo=require('../src/services/marketplace-comparador-seo-v32132');

const sample=[
 {title:'Apple iPhone 17 Pro 256GB, negro',source:'Tienda España',price:'1.159,00 €',extracted_price:1159,thumbnail:'https://encrypted-tbn1.gstatic.com/shopping?mock=1',link:'https://shop.example/p/17pro',delivery:'Envío gratis'},
 {title:'Apple iPhone 17 Pro 256GB',source:'Otra tienda',price:'€1,100.00',extracted_price:1100,product_link:'https://www.google.com/shopping/product/123?gl=es'},
 {title:'Apple iPhone 17 Pro Max 256GB',source:'Otra tienda',price:'€900',extracted_price:900,product_link:'https://www.google.com/shopping/product/456'},
 {title:'Cargador para iPhone 17 Pro',source:'Accesorios',price:'€15',extracted_price:15,link:'https://shop.example/cargador'},
 {title:'Apple iPhone 17 Pro',source:'Moneda ajena',price:'$500',extracted_price:500,link:'https://shop.example/x'},
 {title:'Apple iPhone 17 Pro',source:'Datos erróneos',price:'€850',extracted_price:850,link:'javascript:alert(1)'}
];

test('resultados de Google Shopping: euros, modelo, foto, envío, destino y orden',()=>{
 const offers=provider.parseExternal(sample,'iphone 17 pro');
 assert.equal(offers.length,2);
 assert.equal(offers[0].price_cents,110000);
 assert.equal(offers[0].destination,'shopping-search');
 assert.equal(offers[1].shop,'Tienda España');
 assert.equal(offers[1].destination,'store');
 assert.match(offers[1].image,/gstatic.com/);
 assert.equal(offers[1].delivery,'Envío gratis');
 assert.equal(offers[1].price_currency,'EUR');
});

test('búsquedas genéricas no son el mismo producto y se excluyen accesorios',()=>{
 assert.equal(provider.isSpecificModel('iphone'),false);
 assert.equal(provider.isSpecificModel('iphone 17 pro'),true);
 const general=provider.parseExternal(sample,'iphone');
 assert.equal(general.length,3,'sin mezclar fundas ni monedas no EUR');
 assert.ok(general.some(v=>v.title.includes('Pro Max')));
 assert.equal(provider.titleMatches('iphone 17 pro','iPhone 17 Pro Max'),false);
 assert.equal(provider.titleMatches('Samsung Galaxy S26 Ultra','Samsung Galaxy S25 Ultra'),false);
 assert.equal(provider.safeImage('https://evil.example/a.webp'),null);
 assert.equal(provider.safeHttps('http://example.com'),null);
 const now=new Date().toISOString();
 const p={index_approved:true,query_text:'iphone',provider_status:'ok',editorial_summary:'Comparación editorial de varias variantes y ofertas en España, con información verificada de las distintas tiendas.',last_checked_at:now};
 assert.equal(seo.indexEligible(p,general),false);
});

test('consulta servidor: España y clave solo en backend, rechazo de respuestas sin shopping_results',async()=>{
 const env={COMPARADOR_SERPAPI_KEY:'abcdefghijklmnopqrstuvwxyz'};
 let calledUrl,calledOpts;
 const fetchMock=async(url,opts)=>{calledUrl=url;calledOpts=opts;return {ok:true,json:async()=>({shopping_results:sample})};};
 const r=await provider.fetchOffers('iphone 17 pro',fetchMock,env);
 assert.equal(r.length,2);
 const parsed=new URL(calledUrl);
 assert.equal(parsed.origin,'https://serpapi.com');
 assert.equal(parsed.searchParams.get('engine'),'google_shopping');
 assert.equal(parsed.searchParams.get('hl'),'es');
 assert.equal(parsed.searchParams.get('gl'),'es');
 assert.equal(parsed.searchParams.get('api_key'),env.COMPARADOR_SERPAPI_KEY);
 assert.ok(calledOpts.signal);
 await assert.rejects(provider.fetchOffers('iphone',async()=>({ok:true,json:async()=>({})}),env),/provider_missing_results/);
 await assert.rejects(provider.fetchOffers('iphone',fetchMock,{}),/provider_not_configured/);
});

test('cuotas limitadas y respetan parada a 0',()=>{
 assert.deepEqual(provider.budget({}),{daily:5,monthly:100});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'0',COMPARADOR_MONTHLY_LIMIT:'0'}),{daily:0,monthly:0});
 assert.deepEqual(provider.budget({COMPARADOR_DAILY_LIMIT:'1000',COMPARADOR_MONTHLY_LIMIT:'9999'}),{daily:50,monthly:250});
});
test('la interfaz protege clave y deja claro Google Shopping frente a compra directa',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const worker=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-worker-v32134.js'),'utf8');
 assert.match(worker,/reserveQuota/);
 assert.match(worker,/marketplace_compare_provider_usage/);
 assert.match(worker,/provider\.fetchOffers/);
 assert.match(source,/Ver oferta en tienda/);
 assert.match(source,/Buscar en Google/);
 assert.match(source,/provider\.safeImage/);
 assert.doesNotMatch(source,/api_key:key/);
});
