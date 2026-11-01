'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const source=read('src/public-media-seo-v182.js');
const styles=read('public/pulso-reel-polish-v3663.css');

function detailHarness(caption){
 const routes=[];
 const row={
  id:42,user_id:7,username:'autor_publico',display_name:'Autor Público',
  media_url:'/uploads/reels/42.mp4',avatar_url:null,
  creator_verified:false,created_at:'2026-10-31T11:23:00Z',
  caption,view_count:10,like_count:2,comment_count:1,repost_count:0
 };
 const calls=[];
 const db={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('CREATE INDEX'))return {rows:[],rowCount:0};
  if(sql.includes('WHERE p.id=$1 AND'))return {rows:[row],rowCount:1};
  if(sql.includes('WHERE p.user_id=$1 AND p.id<>$2'))return {rows:[],rowCount:0};
  throw new Error('Unexpected query '+sql);
 }};
 const express={Router:()=>({
  get:(routesOrPath,handler)=>{routes.push({path:routesOrPath,handler});}
 })};
 const context={require:name=>{
  if(name==='express')return express;
  if(name==='./db')return db;
  throw new Error('Unexpected dependency '+name);
 },module:{exports:{}},process:{env:{APP_ORIGIN:'https://redlibertad.com'}},
 console:{log:()=>{},error:()=>{}},URLSearchParams,sourceRow:row};
 vm.createContext(context);
 vm.runInContext(source,context,{timeout:4000});
 const slug=vm.runInContext('slug(reelName(sourceRow))',context);
 const route=routes.find(r=>Array.isArray(r.path)&&r.path.includes('/reel/:id/:slug'))?.handler;
 assert.ok(route,'Reel route is registered');
 const res={statusCode:200,body:null,type(type){this.mime=type;return this;},
  send(body){this.body=body;return this;},
  status(status){this.statusCode=status;return this;},
  redirect(status,href){this.redirected={status,href};return this;}};
 const req={params:{id:'42',slug},protocol:'https',get:()=> 'redlibertad.com'};
 return {render:async()=>{await route(req,res);return res;},calls};
}
test('V3.6.63: ficha pública conserva el vídeo original con nuevo equilibrio de escritorio',async()=>{
 const harness=detailHarness('Pulso de la comunidad: primera publicación.');
 const response=await harness.render();
 assert.equal(response.statusCode,200);
 assert.equal(response.mime,'html');
 const html=response.body;
 assert.match(html,/class="rh reel-pulso-layout-v3661"/);
 assert.match(html,/class="rp reel-pulso-frame-v3661"><video src="https:\/\/redlibertad.com\/uploads\/reels\/42.mp4" controls playsinline preload="metadata">/);
 assert.match(html,/class="rm reel-pulso-info-v3663"/);
 assert.match(html,/REEL PÚBLICO · PULSO/);
 assert.match(html,/<h1>Pulso de la comunidad: primera publicación\.<\/h1>/);
 assert.match(html,/href="\/pulso">Explorar Pulso<\/a>/);
 assert.match(html,/href="\/reels">Ver galería de Reels<\/a>/);
 assert.match(html,/href="\/pulso">Pulso<\/a>/);
 assert.match(html,/aria-label="Acciones del Reel"/);
 assert.match(html,/data-public-share/);
 assert.match(html,/public-entry-bar-v192/);
 assert.equal(harness.calls.filter(c=>c.sql.includes('WHERE p.id=$1 AND')).length,1);
});
test('V3.6.63: texto largo mantiene lectura ampliable y el título no queda cortado a 70 caracteres',async()=>{
 const caption='¿Cansado de cuentas falsas y contenido que no te representa? Pulso es nuestro espacio de vídeos originales. '+('Experiencias reales compartidas con respeto. ').repeat(5);
 const response=await detailHarness(caption).render();
 const html=response.body;
 const headline=html.match(/<h1>([^<]+)<\/h1>/)?.[1];
 assert.ok(headline&&headline.length>72&&headline.length<=113,headline);
 assert.match(html,/<section class="reel-pulso-description-v3663"/);
 assert.match(html,/<details><summary>Leer descripción completa<\/summary>/);
 assert.match(html,/Experiencias reales compartidas con respeto/);
 assert.ok(html.indexOf('reel-pulso-actions-v3663')<html.indexOf('reel-pulso-description-v3663'));
});
test('V3.6.63: HTML de usuario se escapa también dentro del resumen y la descripción',async()=>{
 const payload='Vídeo <img src=x onerror=alert(1)> & "'+('Más contenido del autor. '.repeat(15));
 const html=(await detailHarness(payload).render()).body;
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&amp;/);
 assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
 assert.match(html,/<details><summary>Leer descripción completa<\/summary>/);
});
test('V3.6.63: los estilos específicos de Reel se cargan al final después del CSS antiguo',async()=>{
 const html=(await detailHarness('Pulso de la comunidad.').render()).body;
 const inlineEnd=html.indexOf('</style>');
 const oldStyle=html.indexOf('pulso-reel-detail-v3661.css?v=3.6.61');
 const newStyle=html.indexOf('pulso-reel-polish-v3663.css?v=3.6.63');
 assert.ok(inlineEnd>0&&oldStyle>inlineEnd&&newStyle>oldStyle);
 assert.match(styles,/grid-template-columns:minmax\(260px,420px\) minmax\(0,1fr\)/);
 assert.match(styles,/max-height:min\(76dvh,750px\)/);
 assert.match(styles,/object-fit:contain/);
 assert.match(styles,/@media\(max-width:850px\)/);
 assert.match(styles,/@media\(max-width:620px\)/);
 assert.match(styles,/reel-pulso-guest-v3663\{display:none\}/);
 assert.match(styles,/:focus-visible/);
 assert.doesNotMatch(styles,/object-fit:cover|transform:scale\(/);
});
test('V3.6.63: sin descripción extensa no se crea un desplegable vacío',async()=>{
 const html=(await detailHarness('Un Reel público real.').render()).body;
 assert.match(html,/<h1>Un Reel público real\.<\/h1>/);
 assert.doesNotMatch(html,/<details><summary>Leer descripción completa/);
 assert.match(html,/href="\/pulso">Explorar Pulso/);
});
