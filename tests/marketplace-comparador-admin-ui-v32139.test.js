'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const compare=require('../src/routes/marketplace-comparador-v32132');

function record(q,override={}){
 return {
  id:1,slug:compare.slugFor(q),query_text:q,index_approved:false,seo_blocked:false,
  editorial_summary:'',provider_status:'ok',last_checked_at:new Date().toISOString(),external_count:3,
  external_results:[
   {title:'Apple iPhone 12 64 GB Negro',shop:'Tienda A',price_cents:8900,price_currency:'EUR',condition:'Usado',href:'https://shop.example/item'},
   {title:'Apple iPhone 12 128 GB Azul',shop:'Tienda B',price_cents:12500,price_currency:'EUR',condition:'Usado',href:'https://shop.example/item2'},
   {title:'Apple iPhone 12 64 GB Negro',shop:'Tienda C',price_cents:13000,price_currency:'EUR',condition:'Usado',href:'https://shop.example/item3'}
  ],...override
 };
}

test('panel SEO de RedLibertad muestra filtros y bloques comprensibles',()=>{
 const normal=record('iphone 12');
 const blocked=record('samsung s26',{id:2,seo_blocked:true,slug:compare.slugFor('samsung s26'),external_results:[]});
 const html=compare.seoAdminView([normal,blocked],'c'.repeat(48),'todas');
 assert.match(html,/SEO del comparador/);
 assert.match(html,/class="seo-admin-overview"/);
 assert.match(html,/Comparaciones/);
 assert.match(html,/Aptas para Google/);
 assert.match(html,/Por mejorar/);
 assert.match(html,/Bloqueadas/);
 assert.match(html,/data-seo-state="pendientes"/);
 assert.match(html,/data-seo-state="bloqueadas"/);
 assert.match(html,/Falta capacidad o variante exacta/);
 assert.match(html,/\/comparar\?q=iphone%2012%2064%20GB/);
 assert.match(html,/\/comparar\?q=iphone%2012%20128%20GB/);
 assert.match(html,/Ejemplos basados en anuncios existentes; no garantizan indexación/);
 assert.match(html,/value="revoke"/);
 assert.match(html,/value="unblock"/);
 assert.match(html,/Editar comentario editorial/);
 assert.match(html,/value="approve"/);
 assert.equal((html.match(/name="_csrf"/g)||[]).length,7);
 assert.match(html,/minlength="80"/);
 assert.doesNotMatch(html,/Comentario editorial opcional/);
 assert.doesNotMatch(html,/<textarea[^>]*style=/);
});

test('filtros presentan solo el estado elegido y no cambian criterios SEO',()=>{
 const normal=record('iphone 12'),blocked=record('samsung s26',{id:2,seo_blocked:true});
 const blockedHtml=compare.seoAdminView([normal,blocked],'1'.repeat(48),'bloqueadas');
 assert.match(blockedHtml,/href="\/admin\/comparador\?estado=bloqueadas"/);
 assert.ok(!blockedHtml.includes('data-seo-state="pendientes"'));
 assert.match(blockedHtml,/data-seo-state="bloqueadas"/);
 const allHtml=compare.seoAdminView([normal,blocked],'1'.repeat(48),'intrusion');
 assert.match(allHtml,/seo-filter is-active" href="\/admin\/comparador\?estado=todas"/);
});

test('sugerencias de modelo refinado provienen de ofertas existentes, no crean páginas ni gastan créditos',()=>{
 const page=record('iphone 12');
 assert.deepEqual(compare.seoRefinementSuggestions(page),['iphone 12 64 GB','iphone 12 128 GB']);
 assert.deepEqual(compare.seoRefinementSuggestions({...page,query_text:'iphone 12 128 GB'}),[]);
 assert.deepEqual(compare.seoRefinementSuggestions({...page,external_results:[{title:'iPhone 12 sin almacenamiento'}]}),[]);
 const injection=record('<script>alert(1)</script>',{id:4,slug:'unsafe',external_results:[]});
 const html=compare.seoAdminView([injection],'f'.repeat(48),'todas');
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;script&gt;/);
});

test('GET prefills the search safely, without creating a comparison or contacting SerpApi',async()=>{
 const oldQuery=db.query;
 let queries=0;
 db.query=async sql=>{
  queries++;
  if(sql.startsWith('SELECT slug,query_text,external_results'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:0};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const uri='http://127.0.0.1:'+server.address().port+'/comparar?q='+encodeURIComponent('iphone 12 128 GB');
  const res=await fetch(uri),html=await res.text();
  assert.equal(res.status,200);
  assert.match(html,/value="iphone 12 128 GB"/);
  assert.match(html,/name="_csrf"/);
  assert.equal(html.includes('Creada la comparación'),false);
  assert.ok(queries<10);
 }finally{await new Promise(resolve=>server.close(resolve));db.query=oldQuery;}
});

test('estilos móviles del panel mantienen botones de tamaño táctil y editorial oculto',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/\.seo-admin-grid/);
 assert.match(css,/\.seo-admin-editor/);
 assert.match(css,/\.seo-admin-overview/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/min-height:44px/);
});
