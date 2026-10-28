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
const compare=require('../src/routes/marketplace-comparador-v32132');
const access=require('../src/services/marketplace-comparador-direct-access-v3439');

const q='iphone 12 128 GB';
function offer(title,price_cents,shop,href,extra={}){
 return {title,shop,price_cents,href,condition:'Reacondicionado',
  price_currency:'EUR',image:null,...extra};
}
test('clasifica destinos reales sin confiar en Google ni URLs inseguras',()=>{
 const direct=offer('Apple iPhone 12 128 GB',18000,'Tienda', 'https://tienda.es/iphone12');
 const google=offer('Apple iPhone 12 128 GB',9000,'rebuy.es','https://www.google.com/search?q=iphone12');
 const manual={...google,resolved_href:'https://www.rebuy.es/producto/iphone',manual_link:true};
 const partner={...direct,partner_store:true,href:'https://mundotaza.com/producto/telefono'};
 assert.equal(access.isDirectStore(direct),true);
 assert.equal(access.isDirectStore(google),false);
 assert.equal(access.isDirectStore(manual),true);
 assert.equal(access.isDirectStore(partner),true);
 assert.equal(access.isDirectStore({...direct,internal:true}),false);
 assert.equal(access.isDirectStore({...direct,href:'http://tienda.es/iphone'}),false);
 assert.equal(access.isDirectStore({...direct,href:'https://google.com/shopping'}),false);
 assert.equal(access.isDirectStore({...direct,partner_store:true,href:'javascript:alert(1)'}),false);
 assert.deepEqual(access.summary([google,direct,manual]),{direct:2,other:1,total:3});
 assert.deepEqual(access.summary(null),{direct:0,other:0,total:0});
});
async function render(offers){
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const slug=compare.slugFor(q);
 provider.configured=()=>false;worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
 const queries=[];
 db.query=async sql=>{
  queries.push(sql);
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))return {rowCount:1,rows:[{
   id:31,slug,query_text:q,index_approved:false,seo_blocked:false,
   provider_status:'ok',last_checked_at:new Date().toISOString(),external_results:offers,editorial_summary:''
  }]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
  return {status:response.status,html:await response.text(),queries};
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;
 }
}
test('filtro de acceso directo no altera orden por precio, enlaces ni mínimo',async()=>{
 const a=offer('Apple iPhone 12 128 GB',9000,'Vendedor sin ficha','https://www.google.com/search?q=iphone+12');
 const b=offer('Apple iPhone 12 128 GB',16799,'Rebuy','https://www.rebuy.es/producto/iphone12');
 const c=offer('Apple iPhone 12 128 GB',17799,'Tienda B','https://tienda-b.es/producto/iphone12');
 const {html,status,queries}=await render([c,a,b]);
 assert.equal(status,200);
 assert.match(html,/class="cmp-access-toolbar" data-direct-filter/);
 assert.match(html,/2 ofertas con enlace directo/);
 assert.match(html,/1 oferta sin enlace directo/);
 assert.match(html,/data-access-choice="direct" aria-pressed="false"/);
 assert.equal((html.match(/data-offer-access="direct"/g)||[]).length,2);
 assert.equal((html.match(/data-offer-access="alternate"/g)||[]).length,1);
 assert.match(html,/Desde 90,00/);
 assert.match(html,/Acceso directo a tienda/);
 assert.match(html,/href="https:\/\/www.rebuy.es\/producto\/iphone12"/);
 assert.match(html,/Buscar en Google/);
 const prices=[...html.matchAll(/class="offer-side"><div class="price">([0-9.,]+)\s*€/g)].map(m=>m[1]);
 assert.deepEqual(prices,['90,00','167,99','177,99']);
 assert.equal(queries.some(t=>/UPDATE marketplace_compare_pages|INSERT INTO marketplace_compare_provider_usage/.test(t)),false);
});
test('sin URLs directas el comprador sigue viendo todas las alternativas',async()=>{
 const {html,status}=await render([
  offer('Apple iPhone 12 128 GB',9000,'Wallapop','https://www.google.com/search?q=iphone+12'),
  offer('Apple iPhone 12 128 GB',10000,'Rebuy','https://www.google.com/search?q=iphone+12+rebuy')
 ]);
 assert.equal(status,200);
 assert.match(html,/0 ofertas con enlace directo/);
 assert.doesNotMatch(html,/data-access-choice="direct"/);
 assert.equal((html.match(/data-offer-access="alternate"/g)||[]).length,2);
});
test('filtrado progresivo tiene controles accesibles, móvil y no afecta apartados separados',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(js,/data-access-choice/);
 assert.match(js,/data-primary-offers/);
 assert.match(js,/item\.hidden=!show/);
 assert.match(js,/mode==='all'\|\|item\.dataset\.offerAccess==='direct'/);
 assert.match(js,/aria-pressed/);
 assert.doesNotMatch(js,/fetch\(.*[Ss]erp[Aa]pi/);
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/\.cmp-primary-offers>li\[hidden\]/);
 assert.match(css,/\.cmp-direct-tag/);
 assert.match(css,/@media\(max-width:720px\)/);
});
