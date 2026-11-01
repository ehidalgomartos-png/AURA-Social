'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderCard,renderPage,PUBLIC_VIDEO_SQL,FOLLOWING_VIDEO_SQL}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const reel={id:'25',video:'/uploads/reels/25.mp4',avatar:null,username:'autor_real',
 displayName:'RedLibertad',caption:'Una publicación real para la comunidad.',likes:4,comments:2};
const social=read('public/pulso-social-v3659.js');
const player=read('public/pulso-v3658.js');

test('V3.6.65: no hay botón Seguir ni salto Ver vídeo y participar en los Reels públicos',()=>{
 const card=renderCard(reel);
 assert.match(card,/href="\/perfil\/autor_real"/);
 assert.match(card,/data-pulso-like="25"/);
 assert.match(card,/data-pulso-comments="25"/);
 assert.match(card,/data-pulso-share="\/reel\/25"/);
 assert.match(card,/<small>Comentar<\/small>/);
 assert.doesNotMatch(card,/data-pulso-follow|pulso-follow|Ver vídeo y participar|class="pulso-detail"/);
 assert.doesNotMatch(card,/<a[^>]+href="\/reel\/25"/);
 assert.match(renderPage([reel],false),/class="pulso-card" data-pulso-item/);
});

test('V3.6.65: los vídeos añadidos al deslizar tienen exactamente las mismas acciones',()=>{
 assert.doesNotMatch(player,/pulsoFollow|pulso-follow|Ver vídeo y participar|pulso-detail/);
 assert.match(player,/likes\.dataset\.pulsoLike=String\(item\.id\)/);
 assert.match(player,/comments\.dataset\.pulsoComments=String\(item\.id\)/);
 assert.match(player,/comments\.append\(make\('small',null,'Comentar'\)\)/);
 assert.match(player,/share\.dataset\.pulsoShare=detail/);
 assert.match(player,/card\.append\(video,shade,info,actions\)/);
 assert.match(player,/feed\.insertBefore\(fragment,footer\)/);
});

test('V3.6.65: Me gusta y comentarios funcionan en Pulso, y seguir sigue en los perfiles',()=>{
 assert.doesNotMatch(social,/toggleFollow|data-pulso-follow|pulsoFollow/);
 assert.match(social,/async function toggleLike\(button\)/);
 assert.match(social,/async function openComments\(id\)/);
 assert.match(social,/feed\.addEventListener\('click',event=>\{/);
 assert.match(social,/const comments=event\.target\.closest\('\[data-pulso-comments\]'\)/);
 assert.match(social,/void openComments\(String\(comments\.dataset\.pulsoComments\|\|''\)\)/);
 assert.match(social,/\/api\/posts\/'\+id\+'\/comments'/);
 assert.match(social,/function showAuth\(publishing=false\)/);
 assert.match(FOLLOWING_VIDEO_SQL,/EXISTS\(SELECT 1 FROM follows f/);
 assert.match(PUBLIC_VIDEO_SQL,/p\.audience='public'/);
 assert.doesNotMatch(social,/\.innerHTML\s*=|Math\.random|sendBeacon/);
});

test('V3.6.65: error del vídeo mantiene enlace seguro sin mostrar enlace extra en el feed',()=>{
 const navigation=read('public/pulso-navigation-v3664.js');
 assert.match(navigation,/const reelId=String\(card\.dataset\.reelId\|\|''\)/);
 assert.match(navigation,/\/\^\[1-9\]\[0-9\]\{0,15\}\$\/\.test\(reelId\)/);
 assert.match(navigation,/link\.textContent='Abrir la publicación'/);
 assert.doesNotMatch(navigation,/a\.pulso-detail/);
});

async function reelDetail({caption='Vídeo de prueba real',counts={}}={}){
 const routes=[];
 const row={
  id:25,user_id:7,username:'autor_real',display_name:'RedLibertad',
  media_url:'/uploads/reels/25.mp4',avatar_url:null,
  creator_verified:false,created_at:'2026-11-01T11:00:00Z',
  caption,view_count:0,like_count:0,comment_count:0,repost_count:0,...counts
 };
 const db={query:async(sql)=>{
  if(sql.startsWith('CREATE INDEX'))return {rows:[],rowCount:0};
  if(sql.includes('WHERE p.id=$1 AND'))return {rows:[row],rowCount:1};
  if(sql.includes('WHERE p.user_id=$1 AND p.id<>$2'))return {rows:[],rowCount:0};
  throw Error('Unexpected SQL '+sql);
 }};
 const express={Router:()=>({get:(route,fn)=>routes.push({route,fn})})};
 const ctx={
  require:name=>name==='express'?express:name==='./db'?db:(()=>{throw Error(name)})(),
  module:{exports:{}},process:{env:{APP_ORIGIN:'https://redlibertad.com'}},
  console:{log:()=>{},error:()=>{}},URLSearchParams,row
 };
 vm.createContext(ctx);
 vm.runInContext(read('src/public-media-seo-v182.js'),ctx,{timeout:4000});
 const slug=vm.runInContext('slug(reelName(row))',ctx);
 const handler=routes.find(x=>Array.isArray(x.route)&&x.route.includes('/reel/:id/:slug'))?.fn;
 assert.ok(handler);
 const res={
  statusCode:200,body:null,
  type(type){this.mime=type;return this;},
  send(s){this.body=s;return this;},
  status(code){this.statusCode=code;return this;},
  redirect(code,href){this.redirect={code,href};return this;}
 };
 await handler({params:{id:'25',slug},protocol:'https',get:()=> 'redlibertad.com'},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.mime,'html');
 return res.body;
}
test('V3.6.65: ficha compartida Reel 25 minimalista, con retorno a Pulso',async()=>{
 const html=await reelDetail();
 assert.match(html,/<h1>Vídeo de RedLibertad<\/h1>/);
 assert.match(html,/reel-pulso-actions-v3665/);
 assert.match(html,/href="\/pulso">Volver a Pulso<\/a>/);
 assert.match(html,/>Entrar para comentar<\/a>/);
 assert.match(html,/>Compartir Reel<\/button>/);
 assert.doesNotMatch(html,/Ver galería de Reels|Crear cuenta para participar|Entrar y volver aquí/);
 assert.doesNotMatch(html,/>0 vistas|>0 me gusta|>0 comentarios|>0 republicaciones/);
 assert.match(html,/name="robots" content="index,follow/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad\.com\/reel\/25/);
 assert.match(html,/pulso-reel-clean-v3665\.css\?v=3\.6\.65/);
 const links=html.match(/href="\/pulso">Volver a Pulso<\/a>/g)||[];
 assert.equal(links.length,1);
});

test('V3.6.65: la descripción completa está disponible y los contadores positivos son reales',async()=>{
 const caption='¿Cansado de cuentas falsas? '+('Te damos la bienvenida a Pulso. ').repeat(14);
 const html=await reelDetail({caption,counts:{like_count:3,comment_count:1,view_count:13}});
 assert.match(html,/<details><summary>Leer descripción completa<\/summary>/);
 assert.match(html,/3 me gusta/);
 assert.match(html,/1 comentarios/);
 assert.match(html,/13 vistas/);
 assert.doesNotMatch(html,/0 republicaciones/);
 assert.match(html,/Vídeo de RedLibertad/);
 const injected=await reelDetail({caption:'<img src=x onerror=alert(1)> & '+caption});
 assert.match(injected,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(injected,/<img src=x onerror=/);
});

test('V3.6.65: controles móviles sin duplicar registro y estilos de ficha cargados al final',()=>{
 const css=read('public/pulso-reel-clean-v3665.css');
 assert.match(css,/\.reel-pulso-actions-v3663\.reel-pulso-actions-v3665/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.reel-pulso-actions-v3665 \.reel-pulso-guest-v3663\{display:none\}/);
 assert.match(css,/:first-child/);
 assert.match(css,/min-height:48px/);
 assert.doesNotMatch(css,/object-fit:cover|position:fixed|transform:scale\(/);
 const socialCss=read('public/pulso-social-v3659.css');
 assert.doesNotMatch(socialCss,/\.pulso-follow/);
 const source=read('src/public-media-seo-v182.js');
 const cssSource=source.indexOf('pulso-reel-polish-v3663.css?v=3.6.63');
 const cssNew=source.indexOf('pulso-reel-clean-v3665.css?v=3.6.65');
 assert.ok(cssSource>0&&cssNew>cssSource);
});
