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
const photoReview=require('../src/services/marketplace-comparador-photo-review-v3441');
const keys=require('../src/services/marketplace-comparador-link-diagnostics-v32146');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');

const q='iphone 12 128 GB';
const offer={title:'Apple iPhone 12 128 GB Negro',shop:'Tienda legítima',
 price_cents:16799,price_currency:'EUR',condition:'Reacondicionado',
 href:'https://tienda-legitima.es/iphone-12',
 image:'https://images1.gstatic.com/iphone-12-negro.jpg'};
test('selección manual se limita a fotos seguras de ofertas del modelo exacto',()=>{
 const good=offer,accessory={...offer,title:'Funda iPhone 12 128 GB',image:'https://images1.gstatic.com/funda.jpg'};
 const faulty={...offer,title:'iPhone 12 128 GB No funciona',image:'https://images1.gstatic.com/roto.jpg'};
 const wrong={...offer,title:'iPhone 12 Pro 128 GB',image:'https://images1.gstatic.com/pro.jpg'};
 const badSrc={...offer,image:'https://ejemplo-desconocido.es/iphone.jpg'};
 const imgs=photoReview.candidates({query_text:q,external_results:[good,accessory,faulty,wrong,badSrc]});
 assert.equal(imgs.length,1);
 assert.equal(imgs[0].key,keys.keyFor(good));
 assert.equal(imgs[0].image,good.image);
 assert.deepEqual(photoReview.candidates({query_text:'armario',external_results:[good]}),[]);
});
test('la revisión deja de aplicarse si cambia el identificador o la URL de la oferta',()=>{
 const page={query_text:q};
 const record={offer_key:keys.keyFor(offer),image_url:offer.image};
 assert.deepEqual(photoReview.selected(page,record,[offer]),{
  image:offer.image,title:offer.title,reviewed:true
 });
 assert.equal(photoReview.selected(page,{...record,image_url:'https://images1.gstatic.com/otra.jpg'},[offer]),null);
 assert.equal(photoReview.selected(page,record,[{...offer,price_cents:18000}]),null);
 assert.equal(photoReview.selected(page,record,[]),null);
});
test('la ficha distingue foto seleccionada de una miniatura automática sin alterar el precio',()=>{
 const chosen=photoReview.selected({query_text:q},{
  offer_key:keys.keyFor(offer),image_url:offer.image
 },[offer]);
 const html=detail.heroMarkup(q,[offer],null,false,0,chosen);
 assert.match(html,/Fotografía revisada por RedLibertad/);
 assert.match(html,/167,99/);
 assert.match(html,/https:\/\/images1.gstatic.com\/iphone-12-negro.jpg/);
 const automatic=detail.heroMarkup(q,[offer],null,false,0);
 assert.doesNotMatch(automatic,/Fotografía revisada por RedLibertad/);
});
test('el panel es privado y requiere acción humana y CSRF antes de guardar fotografía',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(s,/router\.get\('\/admin\/comparador\/fotos\/:slug',requireAdmin/);
 assert.match(s,/router\.post\('\/admin\/comparador\/:id\/foto',requireAdmin/);
 assert.match(s,/if\(!validCsrf\(req\)\)return res\.sendStatus\(403\)/);
 assert.match(s,/req\.body\?\.confirmed!=='yes'/);
 assert.match(s,/photoReview\.candidates\(page\)\.find/);
 assert.match(s,/marketplace_compare_photo_reviews/);
 assert.match(s,/X-Robots-Tag','noindex,nofollow/);
 assert.doesNotMatch(s,/gpt-image-1.*foto/i);
});
test('la ruta pública utiliza la revisión vigente de forma conservadora',async()=>{
 const slug=compare.slugFor(q);
 const orig=db.query,configured=provider.configured,quota=worker.quotaStatus;
 try{
  provider.configured=()=>false;worker.quotaStatus=async()=>({available:false});
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug=$1'))
    return {rowCount:1,rows:[{id:11,slug,query_text:q,index_approved:false,seo_blocked:false,
      provider_status:'ok',last_checked_at:new Date().toISOString(),
      external_results:[offer],editorial_summary:''}]};
   if(sql.startsWith('SELECT offer_key,image_url,reviewed_at FROM marketplace_compare_photo_reviews'))
    return {rowCount:1,rows:[{offer_key:keys.keyFor(offer),image_url:offer.image}]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(cookieParser());app.use(express.urlencoded({extended:true}));app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await response.text();
   assert.equal(response.status,200);
   assert.match(html,/Fotografía revisada por RedLibertad/);
   assert.match(html,/167,99/);
   assert.match(html,/name="robots" content="noindex,follow"/);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=orig;provider.configured=configured;worker.quotaStatus=quota;}
});
