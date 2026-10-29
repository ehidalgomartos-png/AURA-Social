'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
async function renderHome(withRecent=false,url='/comparar'){
 const original=db.query;
 const queries=[];
 try{
  db.query=async sql=>{
   queries.push(sql);
   if(sql.includes('SELECT slug,query_text,jsonb_array_length(external_results) AS offer_count'))
    return {rowCount:withRecent?1:0,rows:withRecent?[{
     slug:'prueba-reciente-123',query_text:'Producto de prueba reciente',
     external_results:[],offer_count:1
    }]:[]};
   return {rowCount:0,rows:[]};
  };
  const app=express();app.use(router);
  const server=await new Promise(resolve=>{
   const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));
  });
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+url);
   return {status:response.status,html:await response.text(),queries};
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=original;}
}
test('Comparaciones recientes aparece antes de Compara por categoría con productos guardados',async()=>{
 const result=await renderHome(true);
 assert.equal(result.status,200);
 const recent=result.html.indexOf('<h2 id="cmp-recent-title">Comparaciones recientes</h2>');
 const category=result.html.indexOf('<h2>Compara por categoría</h2>');
 const merchant=result.html.indexOf('class="cmp-commerce-cta"');
 assert.ok(recent>0,'falta sección recientes');
 assert.ok(category>recent,'categorías debe aparecer más abajo');
 assert.ok(merchant>recent && merchant<category,'enlace a comercios debe seguir visible');
 assert.match(result.html,/Producto de prueba reciente/);
 assert.match(result.html,/Guías de marcas y modelos/);
 assert.match(result.html,/href="\/comparar\/categorias\/moviles"/);
});
test('También se mantiene el orden cuando no hay comparaciones recientes',async()=>{
 const result=await renderHome(false);
 assert.equal(result.status,200);
 assert.ok(result.html.indexOf('Comparaciones recientes')<
  result.html.indexOf('Compara por categoría'));
 assert.match(result.html,/Todavía no hay comparaciones con ofertas guardadas/);
});
test('El orden tampoco cambia si se abre una búsqueda preparada',async()=>{
 const result=await renderHome(false,'/comparar?q=PlayStation%205%20Pro');
 assert.equal(result.status,200);
 assert.match(result.html,/Búsqueda preparada:/);
 assert.ok(result.html.indexOf('<h2 id="cmp-recent-title">')<
  result.html.indexOf('<h2>Compara por categoría</h2>'));
 assert.match(result.html,/rel="canonical" href="https:\/\/redlibertad.com\/comparar"/);
 assert.ok(result.queries.every(sql=>!/serpapi\.com|INSERT INTO marketplace_compare_provider_usage/i.test(sql)));
});
