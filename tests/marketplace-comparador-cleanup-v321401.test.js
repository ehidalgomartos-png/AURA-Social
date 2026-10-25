'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const worker=require('../src/services/marketplace-comparador-worker-v32134');
const provider=require('../src/services/marketplace-comparador-provider-v32133');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('comparador muestra una sola alerta de cuota y compacta 6 variantes sin ocultar ofertas',async()=>{
 const oldQuery=db.query,oldConfigured=provider.configured,oldQuota=worker.quotaStatus;
 const now=new Date().toISOString(),q='iphone 12',slug=compare.slugFor(q);
 const offers=[
  ['iPhone 12 64 GB Azul Usado',7800,'Usado'],
  ['iPhone 12 64 GB Rojo Reacondicionado',10200,'Reacondicionado'],
  ['iPhone 12 128 GB Azul Usado',12000,'Usado'],
  ['iPhone 12 128 GB Negro Reacondicionado',15000,'Reacondicionado'],
  ['iPhone 12 256 GB Azul Usado',17500,'Usado'],
  ['iPhone 12 256 GB Negro Reacondicionado',19000,'Reacondicionado']
 ].map(([title,price,condition],i)=>({
  title,shop:'Vendedor '+i,price_cents:price,price_currency:'EUR',condition,
  href:'https://www.google.com/shopping/product/'+String(123456789012345678+i),
  product_id:String(123456789012345678+i),internal:false
 }));
 try{
  provider.configured=()=>false;
  worker.quotaStatus=async()=>({available:false,reason:'daily',daily:5,monthly:100,dailyUsed:5,monthlyUsed:5});
  db.query=async sql=>{
   if(sql.startsWith('SELECT * FROM marketplace_compare_pages WHERE slug'))return {rows:[{id:1,slug,query_text:q,created_at:now,last_checked_at:now,
    updated_at:now,provider_status:'ok',external_results:offers,index_approved:false,seo_blocked:false,editorial_summary:''}],rowCount:1};
   return {rows:[],rowCount:0};
  };
  const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(compare.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/'+slug);
   const html=await r.text();
   assert.equal(r.status,200);
   assert.match(html,/name="robots" content="noindex,follow"/);
   assert.match(html,/Desde 78,00/);
   assert.match(html,/· usado · 6 ofertas/);
   assert.equal((html.match(/Consultas externas agotadas por hoy/g)||[]).length,0,'no mostrar presupuesto interno a visitantes');
   assert.equal((html.match(/comprobación directa de esta tienda está temporalmente limitada/g)||[]).length,0);
   assert.equal((html.match(/Envío a confirmar/g)||[]).length,0);
   assert.match(html,/Ver las otras 2 versiones/);
   assert.equal((html.match(/class="compare-variant"/g)||[]).length,6);
   assert.equal((html.match(/class="offer"/g)||[]).length,6);
   assert.equal((html.match(/Buscar en Google/g)||[]).length,6);
   assert.doesNotMatch(html,/Consultar enlace de la tienda/);
   assert.equal((html.match(/Última consulta al proveedor/g)||[]).length,0,'fecha sin duplicar');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{db.query=oldQuery;provider.configured=oldConfigured;worker.quotaStatus=oldQuota;}
});

test('estilos adaptables de lista corta y detalles nativos de versiones',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.css'),'utf8');
 assert.match(css,/\.compare-more-variants/);
 assert.match(css,/\.compare-status-summary/);
 assert.match(css,/@media\(max-width:600px\)/);
});
