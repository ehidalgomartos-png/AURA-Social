'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const {recentImage}=require('../src/services/marketplace-comparador-recent-images-v3432');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const good='https://images1.gstatic.com/product/photo.jpg';
const newer='https://serpapi.com/images/example.png';
test('la miniatura representa el modelo y descarta averiados, variantes y enlaces de imagen no aprobados',()=>{
 const offers=[
  {title:'iPhone 12 128 GB pantalla rota para piezas',image:good,condition:'Usado'},
  {title:'iPhone 12 Pro 128 GB Nuevo',image:good,condition:'Nuevo'},
  {title:'iPhone 12 128 GB Negro',image:'https://site-inseguro.example/photo.jpg',condition:'Nuevo'},
  {title:'iPhone 12 128 GB',image:newer,condition:'Reacondicionado'}
 ];
 assert.equal(recentImage('iphone 12 128 GB',offers),newer);
 assert.equal(recentImage('iphone 12 128 GB',offers.slice(0,3)),null);
 assert.equal(recentImage('iphone 12 128 GB',null),null);
 assert.equal(recentImage('iphone 12 128 GB',[{title:'iPhone 12 128 GB',image:'http://google.com/x'}]),null);
});
test('la portada muestra logo oficial, ilustración y fotos guardadas sin nuevas consultas externas',async()=>{
 const previous=db.query,queries=[];
 db.query=async(sql)=>{
  queries.push(sql);
  if(sql.startsWith('SELECT slug,query_text,jsonb_array_length'))return {rowCount:2,rows:[
   {slug:'iphone-12-128-gb',query_text:'iphone 12 128 GB',offer_count:4,
    external_results:[{title:'iPhone 12 128 GB',image:good,condition:'Nuevo'}]},
   {slug:'armario',query_text:'armario',offer_count:3,external_results:[]}
  ]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/comparar');
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/class="cmp-brand-logo" src="\/assets\/logo-mark.svg"/);
  assert.match(html,/class="cmp-home-art" src="\/assets\/comparador-hero-v3432.svg"/);
  assert.match(html,/class="cmp-recent-card"/);
  assert.match(html,/src="https:\/\/images1.gstatic.com\/product\/photo.jpg"/);
  assert.match(html,/src="\/assets\/comparador-producto-v3432.svg"/);
  assert.match(html,/referrerpolicy="no-referrer"/);
  assert.match(html,/loading="lazy"/);
  assert.match(html,/href="\/comparar\/iphone-12-128-gb"/);
  assert.match(html,/name="_csrf"/);
  assert.equal(queries.filter(q=>q.startsWith('SELECT ')).length,2);
  assert.equal(queries.some(q=>/SerpApi|api_key|http.*google/i.test(q)),false);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=previous;
 }
});
test('las imágenes son recursos locales vectoriales válidos y la cabecera respeta tamaños móviles',()=>{
 const base=path.join(__dirname,'..');
 for(const file of ['public/assets/logo-mark.svg','public/assets/comparador-hero-v3432.svg',
  'public/assets/comparador-producto-v3432.svg']){
  const s=fs.readFileSync(path.join(base,file),'utf8');
  assert.match(s,/<svg\s/);
  assert.match(s,/<\/svg>/);
  assert.ok(s.length<18000);
 }
 const css=fs.readFileSync(path.join(base,'public/comparador-premium-v3431.css'),'utf8');
 for(const selector of ['.cmp-brand-logo','.cmp-home-art','.cmp-recent-image','@media(max-width:470px)'])
  assert.ok(css.includes(selector),selector);
});
