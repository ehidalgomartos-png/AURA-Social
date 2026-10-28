'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const compare=require('../src/routes/marketplace-comparador-v32132');

const q='iphone 12 128 GB';
const offer=(shop,price_cents,extra={})=>({
 title:'Apple iPhone 12 128 GB Negro',shop,price_cents,
 price_currency:'EUR',condition:'Usado',internal:false,
 href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/p/iphone-12',
 ...extra
});
function offerKey(o){
 return crypto.createHash('sha256').update([
  String(o.product_id||''),String(o.shop||''),String(o.title||''),String(o.price_cents||'')
 ].join('|')).digest('hex');
}
async function page(offers){
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const slug=compare.slugFor(q),sql=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:1500,slug,query_text:q,external_results:offers,
     provider_status:'ok',last_checked_at:new Date().toISOString(),
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),slug,sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
}
test('cada enlace para compartir coincide con una tarjeta real sin cambiar precios ni tiendas',async()=>{
 const rows=[offer('Tienda A',18000),offer('Tienda B',19000)];
 const {status,html,slug,sql}=await page(rows);
 assert.equal(status,200);
 for(const row of rows){
  const hash='oferta-'+offerKey(row);
  assert.match(html,new RegExp('id="'+hash+'"'));
  assert.match(html,new RegExp('data-share-comparison-offer href="/comparar/'+slug+'#'+hash+'"'));
 }
 assert.equal((html.match(/data-share-comparison-offer href=/g)||[]).length,2);
 assert.match(html,/Desde 180,00/);
 assert.match(html,/href="https:\/\/tiendaa\.example\/p\/iphone-12"/);
 assert.equal(sql.some(s=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(s)),false);
});

test('la oferta compartida de una ficha única mantiene su identificador y botón original',async()=>{
 const row=offer('Tienda Única',21500);
 const {html,status}=await page([row]);
 assert.equal(status,200);
 assert.match(html,new RegExp('id="oferta-'+offerKey(row)+'"'));
 assert.match(html,/class="compare-single-product"/);
 assert.match(html,/data-share-comparison-offer href=/);
 assert.match(html,/>Ver oferta en tienda<\/a>/);
 assert.match(html,/215,00/);
});

function browser(initialHash='',hasOffer=false){
 const listeners={};
 const location={hash:initialHash};
 const card={matches:x=>x==='li.offer',closest:x=>x==='[data-primary-offers]'?{}:null};
 const results={
  notice:null,firstChild:null,
  querySelector(x){return x==='[data-shared-offer-notice]'?this.notice:null;},
  insertBefore(element){this.notice=element;}
 };
 const document={
  querySelector:x=>x==='[data-comparison-results]'?results:null,
  getElementById:id=>hasOffer&&id==='oferta-'+'a'.repeat(64)?card:null,
  createElement:()=>{
   const elem={hidden:true,textContent:'',setAttribute(k,v){this[k]=v;}};
   return elem;
  },
  addEventListener:(name,handler)=>(listeners[name]??=[]).push(handler)
 };
 const window={addEventListener:(name,handler)=>(listeners[name]??=[]).push(handler)};
 const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 vm.runInNewContext(source,{document,window,location,navigator:{},URL},
  {filename:'comparador-v32135.js',timeout:1000});
 const on=(name)=>{
  const handler=listeners[name]?.at(-1); // Se comprueba el evento registrado, no el nombre inferido de su código.
  assert.ok(handler,name);
  handler();
 };
 return {on,results,location};
}
const validHash='#oferta-'+'a'.repeat(64);

test('muestra un aviso accesible cuando un enlace compartido ya no corresponde a una oferta',()=>{
 const b=browser(validHash,false);
 b.on('DOMContentLoaded');
 assert.ok(b.results.notice);
 assert.equal(b.results.notice.role,'status');
 assert.equal(b.results.notice.hidden,false);
 assert.match(b.results.notice.textContent,/ya no aparece en la comparación actual/);
 assert.equal(b.results.notice.className,'cmp-shared-offer-notice');
});

test('si la oferta sigue presente no muestra un aviso falso',()=>{
 const b=browser(validHash,true);
 b.on('DOMContentLoaded');
 assert.equal(b.results.notice,null);
});

test('el aviso se oculta al regresar a una oferta existente o retirar el hash',()=>{
 const b=browser(validHash,false);
 b.on('DOMContentLoaded');
 assert.equal(b.results.notice.hidden,false);
 b.location.hash='';
 b.on('hashchange');
 assert.equal(b.results.notice.hidden,true);
 b.location.hash=validHash;
 b.on('hashchange');
 assert.equal(b.results.notice.hidden,false);
});

test('los hashes externos, inesperados o malformados no generan avisos ni consultas',()=>{
 for(const bad of ['#otra-seccion','#oferta-123','#oferta-'+'<'.repeat(64),
  '#oferta-'+'A'.repeat(64),'https://tienda.example/p/iphone']){
  const b=browser(bad,false);
  b.on('DOMContentLoaded');
  assert.equal(b.results.notice,null,bad);
 }
});

test('CSS destaca solo la oferta enlazada y respeta la reducción de movimiento en móvil',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const area=css.split('/* V3.4.4.15 — Oferta compartida distinguible')[1]
  ?.split('/* V3.4.4.13 — origen verificable')[0];
 assert.ok(area);
 assert.match(area,/li\.offer:target/);
 assert.match(area,/content:"Oferta compartida"/);
 assert.match(area,/scroll-margin-top:15px/);
 assert.match(area,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(area,/cmp-shared-offer-notice/);
 assert.doesNotMatch(area,/display:\s*none|visibility:\s*hidden|pointer-events:\s*none/);
});
