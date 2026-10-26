'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const links=require('../src/services/marketplace-comparador-link-diagnostics-v32146');
const compare=require('../src/routes/marketplace-comparador-v32132');

const token='eyJwcm9kdWN0IjoiSXBob25lMTIxMjhHQiIsIm9mZmVyIjoiMTIzIn0=';
// The admin SEO view uses Date.now(), so the verified-cache fixture must also be current.
// Frozen dates beyond the cache TTL incorrectly appear stale while production remains correct.
const NOW=Date.now();
const offer=(shop='Pixmania',over={})=>({
 title:'iPhone 12 128 GB morado - Reacondicionado',shop,price_cents:25900,price_currency:'EUR',
 condition:'Reacondicionado',href:'https://www.google.com/shopping/product/123',
 ...over
});
function page(offers,over={}){return {
 id:4,slug:compare.slugFor('iphone 12 128 GB'),query_text:'iphone 12 128 GB',
 index_approved:false,seo_blocked:false,editorial_summary:'',provider_status:'ok',external_count:offers.length,
 external_results:offers,created_at:new Date(NOW).toISOString(),last_checked_at:new Date(NOW).toISOString(),...over
};}

test('Google Product admite page_token sin product_id, sin consultas duplicadas',async()=>{
 assert.equal(provider.hasProductReference(offer('Pixmania',{page_token:token})),true);
 assert.equal(provider.hasProductReference(offer('Pixmania',{product_id:'12345678901234567'})),true);
 assert.equal(provider.hasProductReference(offer()),false);
 assert.equal(provider.hasProductReference(offer('Pixmania',{page_token:'invalid'})),false);
 let calls=0;
 const item=offer('Pixmania',{page_token:token});
 const result=await provider.fetchDirectRetailer(item,async(url)=>{
  calls++;
  const u=new URL(url);
  assert.equal(u.searchParams.get('engine'),'google_product');
  assert.equal(u.searchParams.get('page_token'),token);
  assert.equal(u.searchParams.get('product_id'),null);
  return {ok:true,json:async()=>({sellers_results:{online_sellers:[
   {name:'Pixmania',base_price:'259,00 €',direct_link:'https://pixmania.com/iphone-12-128gb'}
  ]}})};
 },{COMPARADOR_SERPAPI_KEY:'a_long_test_api_key_value'});
 assert.equal(calls,1);
 assert.equal(result.href,'https://pixmania.com/iphone-12-128gb');
});
test('conservar un resultado que trae token exacto pero no product_link',()=>{
 const list=provider.parseExternal([{
  title:'iPhone 12 128 GB morado',source:'Pixmania',extracted_price:259,
  immersive_product_page_token:token,thumbnail:'https://encrypted-tbn0.gstatic.com/img'
 }],'iphone 12 128 GB');
 assert.equal(list.length,1);
 assert.equal(list[0].page_token,token);
 assert.equal(list[0].destination,'shopping-search');
 assert.match(list[0].href,/google.com\/search/);
});
test('diagnósticos distinguen tienda directa, caché verificada, particular, pendiente, agotada y sin identificador',()=>{
 const item=offer(),signed=links.keyFor(item);
 assert.equal(signed.length,64);
 assert.equal(links.diagnosis({...item,href:'https://pixmania.com/iphone-12'},null,null,NOW).status,'direct');
 assert.equal(links.diagnosis(item,{
  status:'ok',href:'https://pixmania.com/iphone-12',checked_at:new Date(NOW-60000)
 },null,NOW).status,'verified');
 assert.equal(links.diagnosis(offer('Wallapop'),null,null,NOW).status,'peer');
 assert.equal(links.diagnosis(item,null,{available:true},NOW).status,'identifier');
 assert.equal(links.diagnosis({...item,page_token:token},null,{available:false,reason:'daily'},NOW).status,'quota');
 assert.equal(links.diagnosis({...item,page_token:token},null,{available:true},NOW).status,'ready');
 assert.equal(links.diagnosis({...item,page_token:token},null,{available:false,reason:'disabled'},NOW).status,'disabled');
 assert.equal(links.diagnosis({...item,page_token:token},{status:'unavailable',checked_at:new Date(NOW-60000)},null,NOW).status,'unavailable');
 assert.equal(links.diagnosis({...item,page_token:token},{status:'checking',checked_at:new Date(NOW-60000)},null,NOW).status,'checking');
});
test('entradas de caché caducadas no anuncian enlaces activos ni bloqueos',()=>{
 const item=offer('Pixmania',{product_id:'12345678901234567'});
 assert.equal(links.diagnosis(item,{status:'ok',href:'https://pixmania.com/iphone',checked_at:new Date(NOW-25*3600000)},null,NOW).status,'ready');
 assert.equal(links.diagnosis(item,{status:'checking',checked_at:new Date(NOW-3*60000)},null,NOW).status,'ready');
 assert.equal(links.diagnosis(item,{status:'ok',href:'javascript:alert(1)',checked_at:new Date(NOW-60000)},null,NOW).status,'unavailable');
});
test('administración informa del problema de Pixmania y no muestra tokens, datos inseguros ni botones públicos',()=>{
 const item=offer('Pixmania',{page_token:token});
 const doc=compare.seoAdminView([page([item])],'c'.repeat(48),'todas',
  {available:true,daily:12,monthly:220,dailyUsed:4,monthlyUsed:8},new Map());
 assert.match(doc,/SEO del comparador/);
 assert.match(doc,/Enlaces de tienda · 0 directos · 1 comprobables/);
 assert.match(doc,/Comprobación disponible/);
 assert.match(doc,/Requiere una consulta voluntaria/);
 assert.doesNotMatch(doc,new RegExp(token.slice(0,20)));
 assert.match(doc,/Editar comentario editorial/);
 assert.equal((doc.match(/name="_csrf"/g)||[]).length,3);
 const hostile=offer('<script>mal</script>',{title:'iPhone 12 128 GB <img src=x onerror=alert(1)>'});
 const html=compare.seoAdminView([page([hostile])],'d'.repeat(48),'todas');
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.doesNotMatch(html,/<script>mal<\/script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('caché de enlaces se consulta en lote sin gastar SerpApi',()=>{
 const good=offer('Pixmania',{page_token:token}),bad=offer('Wallapop');
 const cached=new Map([[links.keyFor(good),{
  offer_key:links.keyFor(good),status:'ok',href:'https://pixmania.com/es/iphone12',
  checked_at:new Date(NOW-60*1000)
 }]]);
 const diagnostics=links.pageDiagnostics(page([good,bad]),cached,{available:true},NOW);
 assert.deepEqual(diagnostics.map(x=>x.status),['verified','peer']);
 const keys=links.keysToCheck([page([good,bad]),page([good])]);
 assert.equal(keys.length,2);
 const html=compare.seoAdminView([page([good,bad])],'c'.repeat(48),'todas',null,cached);
 assert.match(html,/1 directos/);
 assert.match(html,/Enlace comprobado/);
 assert.match(html,/Sin enlace individual/);
 assert.match(html,/noopener noreferrer nofollow/);
 assert.doesNotMatch(html,/COMPARADOR_SERPAPI_KEY/);
});
test('una oferta sin ID numérico pero con page_token ofrece comprobación voluntaria en la ficha',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const slug=compare.slugFor('iphone 12 128 GB'),now=new Date().toISOString(),item=offer('Pixmania',{page_token:token});
 try{
  provider.configured=()=>true;
  worker.quotaStatus=async()=>({available:true,daily:12,monthly:220,dailyUsed:2,monthlyUsed:9});
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rows:[{
    ...page([item]),slug,created_at:now,last_checked_at:now
   }],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/Consultar enlace de la tienda/);
   assert.match(html,/Buscar en Google/);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.doesNotMatch(html,new RegExp(token.slice(0,20)));
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
});
test('estilos del diagnóstico privado accesibles desde móvil',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/\.seo-link-details/);
 assert.match(css,/\.seo-link-state-verified/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/min-height:42px/);
});
