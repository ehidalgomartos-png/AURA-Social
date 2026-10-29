'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const {merchantNextAction,sellerProgress}=require('../src/services/marketplace-comparador-merchant-guide-v3425');
const {router}=require('../src/routes/marketplace-comparador-v32132');

function store(overrides={}){
 return {id:19,name:'Mi tienda',platform:'woocommerce',status:'approved',
  purchase_enabled:true,linked_count:12,available_count:8,
  sync_enabled:true,connected:true,verification_token:null,...overrides};
}
test('un único siguiente paso por estado, sin ofrecer aprobaciones o pagos',()=>{
 const data=[
  [store({status:'pending',verification_token:null}),'code','form'],
  [store({status:'pending',verification_token:'codigo-publico'}),'verify','link'],
  [store({status:'draft'}),'draft','link'],
  [store({status:'suspended'}),'suspended',null],
  [store({status:'approved',purchase_enabled:false}),'purchase','link'],
  [store({linked_count:0,available_count:0}),'catalog','link'],
  [store({available_count:0}),'products','link'],
  [store(),'ready','link']
 ];
 for(const [row,key,mode] of data){
  const result=merchantNextAction(row);
  assert.equal(result.key,key);
  assert.equal(result.control?.mode||null,mode,key);
  assert.ok(result.title.length>8);
  assert.ok(result.description.length>15);
  assert.doesNotMatch(result.description,/garantizamos ventas|automáticamente aprobado/i);
 }
 assert.match(sellerProgress(store()).next,/cuando coinciden exactamente/);
});
test('rutas propiedad de cada comercio y entradas no seguras jamás se interpolan',()=>{
 assert.deepEqual(merchantNextAction(store({id:44,linked_count:0})).control,
  {mode:'link',href:'/comparar/comercios/catalogo/44',label:'Preparar catálogo'});
 assert.equal(merchantNextAction(store({id:44,available_count:0})).control.href,
  '/comparar/comercios/productos/44');
 assert.equal(merchantNextAction(store({id:44})).control.href,
  '/comparar/comercios/estadisticas/44');
 assert.equal(merchantNextAction(store({id:"19?x=<script>",available_count:0})).control,null);
 assert.equal(merchantNextAction(store({id:"/admin",status:'pending'})).control,null);
 assert.equal(merchantNextAction(store({id:0,linked_count:0})).control,null);
});
test('una tienda no aprobada no ofrece importación como acción principal',()=>{
 for(const status of ['draft','pending','suspended']){
  const action=merchantNextAction(store({status,linked_count:0,available_count:0}));
  assert.notEqual(action.key,'catalog');
  assert.ok(!action.control?.href?.includes('/catalogo/'));
 }
 assert.match(merchantNextAction(store({purchase_enabled:false})).description,/no están habilitadas/);
});
test('panel autenticado muestra CTA correspondiente con datos de la propia cuenta',async()=>{
 const original=db.query,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='v3457-only-test-secret';
 const queries=[];
 db.query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes('FROM users')&&sql.includes('auth_token_version'))return {rowCount:1,rows:[{
   id:42,username:'merchant42',is_admin:false,status:'active',
   auth_token_version:0,age_verified:true,show_sensitive:false
  }]};
  if(sql.includes('COUNT(DISTINCT x.listing_id) FILTER'))return {rowCount:3,rows:[
   store({id:19,status:'pending',name:'Empresa <script>x</script>',linked_count:0,available_count:0,verification_token:null}),
   store({id:20,linked_count:0,available_count:0}),
   store({id:21,available_count:0})
  ]};
  return {rowCount:0,rows:[]};
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const cookie='aura_token='+jwt.sign({id:42,authVersion:0},process.env.JWT_SECRET);
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/comparar/comercios/mi-panel',{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/private,no-store/);
  assert.match(r.headers.get('x-robots-tag'),/noindex,nofollow/);
  const html=await r.text();
  assert.equal((html.match(/class="cmp-merchant-next-step"/g)||[]).length,3);
  assert.match(html,/Tu siguiente paso/);
  assert.match(html,/Obtener código de verificación/);
  assert.match(html,/action="\/comparar\/comercios\/verificacion\/19"/);
  assert.match(html,/name="_csrf"/);
  assert.match(html,/href="\/comparar\/comercios\/catalogo\/20"/);
  assert.match(html,/href="\/comparar\/comercios\/productos\/21"/);
  assert.match(html,/Empresa &lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(html,/Empresa <script>x<\/script>/);
  assert.doesNotMatch(html,/consumerSecret|credentials_encrypted|stripe_checkout/);
  const q=queries.find(x=>x.sql.includes('COUNT(DISTINCT x.listing_id) FILTER'));
  assert.ok(q);assert.deepEqual(q.args,[42]);assert.match(q.sql,/WHERE s.seller_id=\$1/);
  assert.match(q.sql,/s.purchase_enabled/);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.query=original;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
});
test('en espera con código se ven instrucciones sin crear código nuevo',async()=>{
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const region=route.split("router.get('/comparar/comercios/mi-panel'")[1].split("router.get('/comparar/:slug'")[0];
 assert.match(region,/id="verificacion-/);
 assert.match(region,/class="cmp-merchant-next-form"/);
 assert.match(region,/esc\(store.verification_token\)/);
 assert.match(region,/merchantNextAction\(store\)/);
 assert.match(region,/Otras herramientas de/);
 assert.doesNotMatch(region,/UPDATE marketplace_professional_stores|stripe\.|resend\.|sendEmail/);
 assert.match(css,/\/\* V3\.4\.5\.7/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/min-height:46px/);
});
