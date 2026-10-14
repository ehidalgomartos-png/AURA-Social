'use strict';
// V3.2.55 — directly invoke the public Express handlers using stubbed SQL:
// prevents a 503 ("No disponible") due to an undefined request variable.
const test=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/db');
const {publicRouter}=require('../src/routes/editorial-publication-v323');

function handler(path){
  const layer=publicRouter.stack.find(x=>x.route?.path===path&&x.route?.methods?.get);
  assert.ok(layer,'GET '+path+' should exist');
  return layer.route.stack.find(x=>x.method==='get').handle;
}
function response(){
  return {statusCode:200,headers:{},body:null,location:null,
    status(n){this.statusCode=n;return this;},
    type(t){this.headers.type=t;return this;},
    send(body){this.body=body;return this;},
    redirect(code,url){this.statusCode=code;this.location=url;return this;}};
}
const liveArticle={
 id:21,title:'Publicación de deportes contrastada',summary:'Resumen original de una publicación editorial disponible y con contexto informativo',
 category:'deportes',published_at:'2026-10-13T20:00:00Z',
 source_url:'https://example.com/articulo',source_name:'Medio autorizado',
 profile_slug:'redlibertad-deportes',profile_name:'RedLibertad Deportes',
 image_url:null,image_origin:null
};
test('GET /noticias renders 200 with no query and no database mutation',async()=>{
 const old=db.query,calls=[];
 try{
  db.query=async(sql,params)=>{calls.push({sql,params});return {rows:[liveArticle],rowCount:1};};
  const res=response();
  await handler('/')({query:{}},res);
  assert.equal(res.statusCode,200);
  assert.match(res.body,/Noticias y actualidad/);
  assert.match(res.body,/Filtrar noticias por categoría/);
  assert.match(res.body,/Publicación de deportes contrastada/);
  assert.match(res.body,/Comentar noticia →/);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,[]);
  assert.match(calls[0].sql,/pub.unpublished_at IS NULL AND ep.status='ready'/);
 }finally{db.query=old;}
});
test('GET /noticias?categoria=deportes returns 200 and safe server-side category query',async()=>{
 const old=db.query,calls=[];
 try{
  db.query=async(sql,params)=>{calls.push({sql,params});return {rows:[liveArticle],rowCount:1};};
  const res=response();
  await handler('/')({query:{categoria:'deportes'}},res);
  assert.equal(res.statusCode,200);
  assert.match(res.body,/Noticias de Deportes/);
  assert.match(res.body,/categoria=deportes" aria-current="page"/);
  assert.match(res.body,/noindex,follow/);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,['deportes']);
  assert.match(calls[0].sql,/AND pub.category=\$1/);
 }finally{db.query=old;}
});
test('GET /noticias invalid category redirects before reading SQL',async()=>{
 const old=db.query;
 try{
  db.query=async()=>{throw Error('Should not query for an invalid filter');};
  for(const category of ['invalid','<script>', ['deportes','tecnologia']]){
   const res=response();
   await handler('/')({query:{categoria:category}},res);
   assert.equal(res.statusCode,302);
   assert.equal(res.location,'/noticias');
  }
 }finally{db.query=old;}
});
test('GET /noticias/p/:id still loads live-only article and up to 3 related publications',async()=>{
 const old=db.query,calls=[];
 try{
  db.query=async(sql,params)=>{
   calls.push({sql,params});
   return calls.length===1?{rows:[liveArticle],rowCount:1}:{rows:[],rowCount:0};
  };
  const res=response();
  await handler('/p/:id')({params:{id:'21'},query:{}},res);
  assert.equal(res.statusCode,200);
  assert.match(res.body,/Deportes para conversar/);
  assert.match(res.body,/edDiscussion/);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].params,['21']);
  assert.deepEqual(calls[1].params,['deportes','21']);
  assert.match(calls[1].sql,/pub.unpublished_at IS NULL AND ep.status='ready'/);
 }finally{db.query=old;}
});
test('version label is 3.2.55 and the route uses the injected req variable',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const route=read('src/routes/editorial-publication-v323.js');
 assert.match(route,/publicRouter.get\('\/',async\(req,res\)=>\{/);
 assert.doesNotMatch(route,/publicRouter.get\('\/',async\(_req,res\)=>\{/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.55');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.55'/);
});
