'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
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
function offerId(o){
 return crypto.createHash('sha256').update([
  String(o.product_id||''),String(o.shop||''),String(o.title||''),String(o.price_cents||'')
 ].join('|')).digest('hex');
}
async function publicPage(offers){
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const slug=compare.slugFor(q),sql=[];
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'not_configured'});
  db.query=async statement=>{
   sql.push(statement);
   if(statement.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1')){
    return {rowCount:1,rows:[{id:1441,slug,query_text:q,external_results:offers,
     provider_status:'ok',last_checked_at:new Date().toISOString(),
     index_approved:false,seo_blocked:false,editorial_summary:''}]};
   }
   return {rowCount:0,rows:[]};
  };
  const app=express();
  app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   return {status:response.status,html:await response.text(),slug,sql};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
}

test('enlaces individuales a las ofertas se apoyan en las anclas reales y no exponen la tienda',async()=>{
 const rows=[offer('Comercio Uno',18000),offer('Comercio Dos',19500)];
 const {status,html,slug,sql}=await publicPage(rows);
 assert.equal(status,200);
 for(const item of rows){
  const hash='oferta-'+offerId(item);
  assert.match(html,new RegExp('id="'+hash+'"'));
  assert.match(html,new RegExp('data-share-comparison-offer href="/comparar/'+slug+'#'+hash+'"'));
 }
 assert.equal((html.match(/data-share-comparison-offer href=/g)||[]).length,2);
 assert.equal((html.match(/data-share-offer-feedback role="status" hidden/g)||[]).length,2);
 assert.match(html,/Desde 180,00/);
 assert.match(html,/href="https:\/\/comerciouno\.example\/p\/iphone-12"/);
 assert.equal(sql.some(x=>/INSERT INTO marketplace_compare_provider_usage|google_product|serpapi/i.test(x)),false);
});

test('una sola oferta se puede compartir, sin botones en publicidad',async()=>{
 const independent=offer('Tienda Real',19000);
 const sponsored=offer('Anuncio',5500,{sponsored:true});
 const one=await publicPage([independent]);
 assert.equal(one.status,200);
 assert.equal((one.html.match(/data-share-comparison-offer href=/g)||[]).length,1);
 const both=await publicPage([sponsored,independent]);
 assert.equal(both.status,200);
 assert.match(both.html,/Publicidad \(1\)/);
 assert.equal((both.html.match(/data-share-comparison-offer href=/g)||[]).length,1);
 assert.match(both.html,/Desde 190,00/);
});

test('los nombres de comercio se escapan en el atributo accesible al compartir',async()=>{
 const row=offer('Tienda <script>alert(1)</script>',21000);
 const {html,status}=await publicPage([row]);
 assert.equal(status,200);
 assert.match(html,/aria-label="Compartir esta oferta de Tienda &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
 assert.doesNotMatch(html,/aria-label="Compartir esta oferta de Tienda <script>/);
});

function browser({share,copy}={}){
 const callbacks={};
 const feedback={hidden:true,textContent:''};
 const document={
  querySelector:()=>null,
  addEventListener:(type,handler)=>{(callbacks[type]??=[]).push(handler);}
 };
 const navigator={};
 if(share!==undefined)navigator.share=share;
 if(copy!==undefined)navigator.clipboard={writeText:copy};
 const page='https://redlibertad.com/comparar/iphone-12-128';
 const state={document,navigator,location:{origin:'https://redlibertad.com',href:page},URL};
 const source=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 vm.runInNewContext(source,state,{filename:'comparador-v32135.js',timeout:1000});
 const cb=callbacks.click.find(handler=>handler.toString().includes('data-share-comparison-offer'));
 assert.ok(cb,'delegación de clics en compartir ofertas');
 const link={
  href:page+'#oferta-'+'a'.repeat(64),
  parentElement:{querySelector:s=>s==='[data-share-offer-feedback]'?feedback:null}
 };
 let prevented=false;
 function click(linkOverride=link){
  const event={
   target:{closest:selector=>selector==='a[data-share-comparison-offer]'?linkOverride:null},
   preventDefault:()=>{prevented=true;}
  };
  return cb(event);
 }
 return {click,link,feedback,wasPrevented:()=>prevented};
}

test('móvil con Web Share comparte solo la ficha de RedLibertad y nunca la URL del comercio',async()=>{
 const shared=[];
 const b=browser({share:async details=>shared.push(details)});
 await b.click();
 assert.equal(b.wasPrevented(),true);
 assert.equal(shared.length,1);
 assert.equal(shared[0].url,b.link.href);
 assert.equal(shared[0].title,'Oferta en RedLibertad');
 assert.doesNotMatch(shared[0].url,/tienda.*example/);
 assert.equal(b.feedback.hidden,true);
});

test('si no existe Web Share se copia el enlace y se informa solo cuando la copia termina',async()=>{
 const copied=[];
 const b=browser({copy:async value=>copied.push(value)});
 await b.click();
 assert.equal(b.wasPrevented(),true);
 assert.deepEqual(copied,[b.link.href]);
 assert.equal(b.feedback.hidden,false);
 assert.equal(b.feedback.textContent,'Enlace copiado para compartir.');
});

test('sin APIs, la navegación con enlace HTML sigue disponible; no se interceptan URLs de otras webs',async()=>{
 const without=browser();
 await without.click();
 assert.equal(without.wasPrevented(),false);
 let copies=0;
 const b=browser({copy:async()=>{copies++;}});
 await b.click({...b.link,href:'https://tienda-ajena.example/#oferta-'+'a'.repeat(64)});
 assert.equal(b.wasPrevented(),false);
 assert.equal(copies,0);
});

test('cancelar el panel nativo no muestra un falso mensaje de enlace copiado',async()=>{
 let copies=0;
 const b=browser({
  share:async()=>{const err=new Error('cancel');err.name='AbortError';throw err;},
  copy:async()=>{copies++;}
 });
 await b.click();
 assert.equal(b.wasPrevented(),true);
 assert.equal(copies,0);
 assert.equal(b.feedback.hidden,true);
});

test('el diseño mantiene la acción secundaria discreta y táctil en móvil',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const block=css.split('/* V3.4.4.14 — Acción secundaria')[1]?.split('/* V3.4.4.2 — pulido mobile-first')[0];
 assert.ok(block);
 assert.match(block,/cmp-share-offer/);
 assert.match(block,/min-height:46px/);
 assert.match(block,/@media\(max-width:760px\)/);
 assert.match(block,/cmp-share-feedback\[hidden\]/);
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(source,/index>=0\?'<a class="cmp-share-offer"/);
});
