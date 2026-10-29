'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const cookieParser=require('cookie-parser');
const db=require('../src/db');
const compare=require('../src/routes/marketplace-comparador-v32132');

test('CSRF de comparación usa cookie protegida y valida token en tiempo constante',()=>{
 const issued={};
 const req={secure:true,cookies:{},body:{}};
 const res={cookie(name,value,options){issued.name=name;issued.value=value;issued.options=options;}};
 const token=compare.issueCsrf(req,res);
 assert.match(token,/^[a-f0-9]{48}$/);
 assert.equal(issued.name,'__Host-rl_compare_csrf');
 assert.deepEqual([issued.options.httpOnly,issued.options.secure,issued.options.sameSite,issued.options.path],[true,true,'lax','/']);
 const validReq={...req,cookies:{[issued.name]:token},body:{_csrf:token},get(name){return name==='sec-fetch-site'?'cross-site':null;}};
 assert.equal(compare.validCsrf(validReq),true,'el token propio evita falsos bloqueos por cabeceras de proxy');
 assert.equal(compare.validCsrf({...validReq,body:{_csrf:'0'.repeat(48)}}),false);
 assert.equal(compare.validCsrf({...validReq,cookies:{}}),false);
 assert.equal(compare.validCsrf({...validReq,body:{_csrf:'<script>'}}),false);
 assert.equal(compare.validCsrf({...validReq,body:{_csrf:[token]}}),false);
});

test('GET comparador, POST real y página permanente; rechazo seguro de POST sin token',async()=>{
 const oldQuery=db.query;
 const oldNodeEnv=process.env.NODE_ENV;
 const oldProvider=process.env.COMPARADOR_SERPAPI_KEY;
 delete process.env.COMPARADOR_SERPAPI_KEY;
 process.env.NODE_ENV='test';
 let count=0;
 const created=new Date().toISOString();
 const page={
  id:1,slug:compare.slugFor('iphone'),query_text:'iphone',
  created_at:created,last_checked_at:null,index_approved:false,
  provider_status:'not_configured',external_results:[],editorial_summary:''
 };
 db.query=async(sql,params=[])=>{
  if(/INSERT INTO marketplace_compare_pages/.test(sql)){
   count++;
   return {rowCount:1,rows:[{id:page.id,slug:page.slug,query_text:page.query_text}]};
  }
  if(/SELECT \* FROM marketplace_compare_pages/.test(sql)){
   return {rowCount:params[0]===page.slug?1:0,rows:params[0]===page.slug?[page]:[]};
  }
  return {rowCount:0,rows:[]};
 };
 const app=express();
 app.use(express.urlencoded({extended:true}));
 app.use(cookieParser());
 app.use(compare.router);
 const server=await new Promise((resolve,reject)=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  s.once('error',reject);
 });
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const start=await fetch(base+'/comparar',{redirect:'manual'});
  assert.equal(start.status,200);
  assert.match(start.headers.get('cache-control'),/no-store/);
  const html=await start.text();
  assert.match(html,/name="_csrf"/);
  assert.match(html,/Comparaciones recientes/);
  const cookie=start.headers.get('set-cookie').split(';')[0];
  assert.match(cookie,/rl_compare_csrf=/);
  const token=html.match(/name="_csrf" value="([a-f0-9]{48})"/)?.[1];
  assert.ok(token);
  const blocked=await fetch(base+'/comparar/buscar',{
   method:'POST',redirect:'manual',
   headers:{'content-type':'application/x-www-form-urlencoded',cookie,origin:'https://redlibertad.com'},
   body:'q=iphone'
  });
  assert.equal(blocked.status,403,'rechazar POST sin token del formulario');
  assert.equal(count,0,'no persistir búsquedas con CSRF inválido');
  const ok=await fetch(base+'/comparar/buscar',{
   method:'POST',redirect:'manual',
   headers:{'content-type':'application/x-www-form-urlencoded',cookie,origin:'https://redlibertad.com','sec-fetch-site':'cross-site'},
   body:new URLSearchParams({q:'iphone',_csrf:token}).toString()
  });
  assert.equal(ok.status,303);
  assert.equal(ok.headers.get('location'),'/comparar/'+page.slug);
  assert.equal(count,1);
  const item=await fetch(base+'/comparar/'+page.slug,{headers:{cookie}});
  assert.equal(item.status,200);
  const itemHtml=await item.text();
  assert.match(itemHtml,/Comparar iphone/);
  assert.match(itemHtml,/name="_csrf"/);
  assert.match(itemHtml,/noindex,follow/);
  assert.match(itemHtml,/La consulta de tiendas externas no está disponible/);
  assert.match(itemHtml,/Puedes consultar otras comparaciones/);
  assert.doesNotMatch(itemHtml,/Límite de consultas externas/);
  const again=await fetch(base+'/comparar/buscar',{
   method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',cookie},
   body:new URLSearchParams({q:'IPHONE',_csrf:token}).toString()
  });
  assert.equal(again.headers.get('location'),'/comparar/'+page.slug);
  assert.equal(count,2);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=oldQuery;
  if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;
  if(oldProvider===undefined)delete process.env.COMPARADOR_SERPAPI_KEY;else process.env.COMPARADOR_SERPAPI_KEY=oldProvider;
 }
});
