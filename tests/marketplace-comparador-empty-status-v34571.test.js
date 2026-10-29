'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const {emptyState}=require('../src/services/marketplace-comparador-empty-state-v34571');
const {router,slugFor}=require('../src/routes/marketplace-comparador-v32132');

test('los estados de la cola son mensajes diferentes, sin convertir fallos en espera eterna',()=>{
 const expected={
  queued:/Buscando precios y tiendas/,
  checking:/Buscando precios y tiendas/,
  ok:/No hemos encontrado ofertas coincidentes/,
  unavailable:/No hemos podido completar la consulta/,
  not_configured:/La consulta de tiendas externas no está disponible/,
  limit_reached:/búsquedas externas están temporalmente en pausa/,
  invalid:/Todavía no hay ofertas verificadas/
 };
 for(const [state,title] of Object.entries(expected)){
  const result=emptyState(state);
  assert.match(result.title,title);
  assert.equal(result.pending,['queued','checking'].includes(state),state);
  assert.ok(result.description.length>60);
 }
 assert.deepEqual(emptyState('queued',false),emptyState('not_configured',true));
 assert.deepEqual(emptyState('checking',false),emptyState('not_configured',true));
 assert.equal(emptyState('unavailable').status,'unavailable');
});
test('no hay consultas de pago ni información privada en esta transformación',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-empty-state-v34571.js'),'utf8');
 assert.doesNotMatch(source,/db\.query|fetch\(|SerpApi|api_key|mensajes privados/);
});
test('las fichas sin ofertas muestran error o pausa real y buscador abierto',async()=>{
 const prev=db.query,configured=provider.configured,enqueue=worker.enqueue;
 const slug=slugFor('iphone 12 128 GB');
 let status='unavailable',providerReady=true,calls=[];
 provider.configured=()=>providerReady;
 worker.enqueue=async()=>false; // Sin consultas externas ni trabajo de cola durante la prueba.
 db.query=async(sql)=>{
  calls.push(sql);
  if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rowCount:1,rows:[{
   id:99,slug,query_text:'iphone 12 128 GB',provider_status:status,
   last_checked_at:null,external_results:[],editorial_summary:'',
   seo_blocked:false,index_approved:false
  }]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const base='http://127.0.0.1:'+server.address().port+'/comparar/'+slug;
  for(const [value,ready,title] of [
   ['unavailable',true,'No hemos podido completar la consulta de precios'],
   ['limit_reached',false,'Las búsquedas externas están temporalmente en pausa'],
   ['not_configured',false,'La consulta de tiendas externas no está disponible'],
   ['ok',true,'No hemos encontrado ofertas coincidentes'],
   ['queued',false,'La consulta de tiendas externas no está disponible']
  ]){
   status=value;providerReady=ready;calls=[];
   const response=await fetch(base);
   assert.equal(response.status,200,value);
   const html=await response.text();
   assert.ok(html.includes(title),value);
   assert.match(html,/id="cambiar-producto" open/);
   assert.match(html,/href="#cambiar-producto">Cambiar producto<\/a>/);
   assert.match(html,/Ver otras comparaciones/);
   assert.doesNotMatch(html,/Estamos preparando esta comparación/);
   assert.doesNotMatch(html,/compare-awaiting-spinner|compare-progress-note/);
   assert.doesNotMatch(html,/api_key|SerpApi|consumerSecret/);
   assert.ok(calls.some(q=>q.startsWith('SELECT * FROM marketplace_compare_pages')),value);
   assert.ok(!calls.some(q=>/INSERT INTO marketplace_compare_jobs|UPDATE marketplace_compare_jobs|INSERT INTO marketplace_compare_provider_usage/.test(q)),value);
  }
  providerReady=true;status='queued';
  const html=await (await fetch(base)).text();
  assert.match(html,/data-comparison-status="queued"/);
  assert.match(html,/compare-awaiting-spinner/);
  assert.match(html,/Esta página se actualiza automáticamente/);
  assert.doesNotMatch(html,/id="cambiar-producto" open/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=prev;provider.configured=configured;worker.enqueue=enqueue;
 }
});
test('sondeo abre el formulario si termina sin ofertas, sin pedir otra consulta',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(script,/if\(!target.querySelector\?\.\('\.cmp-primary-offers'\)\)/);
 assert.match(script,/changeSearch\.open=true/);
 assert.match(route,/emptyState\(page.provider_status,provider.configured\(\)\)/);
 assert.match(route,/id="cambiar-producto"/);
 assert.doesNotMatch(route,/Actualizar resultados manualmente/);
 assert.match(css,/compare-awaiting-actions/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(css,/:focus-visible/);
});
