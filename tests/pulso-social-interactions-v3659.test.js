'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const {createPulsoRouter,PULSO_STATE_SQL,requestedPublicIds,renderCard,renderPage}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const reel={
 id:'41',username:'autor_real',displayName:'Autor Real',
 video:'/uploads/reels/41.mp4',avatar:null,likes:13,comments:3,
 caption:'Compartiendo un vídeo real.'
};
async function serve(db,auth,fn){
 const app=express();
 app.use(createPulsoRouter({db,auth}));
 const server=await new Promise(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 try{await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}

test('V3.6.59: estado personal requiere sesión; no se filtra a visitantes',async()=>{
 const queries=[];
 const db={query:async(sql,params)=>{queries.push({sql,params});return {rows:[]};}};
 const auth=(req,res,next)=>req.headers['x-test-user']==='yes'?(req.user={id:10},next()):res.status(401).json({error:'authentication_required'});
 await serve(db,auth,async base=>{
  const guest=await fetch(base+'/api/pulso/state?ids=41');
  assert.equal(guest.status,401);
  assert.deepEqual(await guest.json(),{error:'authentication_required'});
  assert.equal(queries.length,0);
 });
});
test('V3.6.59: comprobación de sesión permite publicar aun sin vídeos en el feed',async()=>{
 const db={query:async()=>{throw Error('No se debe consultar publicaciones');}};
 const auth=(req,res,next)=>req.headers['x-test-user']==='yes'?(req.user={id:10},next()):res.status(401).json({error:'authentication_required'});
 await serve(db,auth,async base=>{
  const guest=await fetch(base+'/api/pulso/session');
  assert.equal(guest.status,401);
  const member=await fetch(base+'/api/pulso/session',{headers:{'x-test-user':'yes'}});
  assert.equal(member.status,200);
  assert.equal(member.headers.get('cache-control'),'no-store');
  assert.equal(member.headers.get('x-robots-tag'),'noindex,nofollow');
  assert.deepEqual(await member.json(),{authenticated:true});
 });
});
test('V3.6.59: estado por lote no incluye datos de otros usuarios ni vídeos no solicitados',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{
  calls.push({sql,params});
  assert.equal(sql,PULSO_STATE_SQL);
  return {rows:[
   {id:'41',author_id:'21',liked:true,following:false,body:'SECRETO'},
   {id:'42',author_id:'10',liked:false,following:false,private_message:'SECRETO'},
   {id:'999',author_id:'88',liked:true,following:true},
   {id:'12',author_id:'NO!',liked:true,following:true}
  ]};
 }};
 const auth=(req,res,next)=>{req.user={id:10};next();};
 await serve(db,auth,async base=>{
  const res=await fetch(base+'/api/pulso/state?ids=41,42,12');
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-robots-tag'),'noindex,nofollow');
  const json=await res.json();
  assert.deepEqual(json,{
   authenticated:true,
   states:{
    '41':{authorId:'21',liked:true,following:false,own:false},
    '42':{authorId:'10',liked:false,following:false,own:true}
   }
  });
  assert.doesNotMatch(JSON.stringify(json),/SECRETO|private_message|body|999/);
 });
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].params,[10,['41','42','12']]);
});
test('V3.6.59: rechaza identificadores manipulados y lotes excesivos antes de consultar BD',async()=>{
 const db={query:async()=>{throw Error('No se debería consultar BD');}};
 const auth=(req,res,next)=>{req.user={id:3};next();};
 await serve(db,auth,async base=>{
  for(const raw of ['', '0', '-1','1;DROP','1,0','1,', '01', '1e2',
   Array.from({length:13},(_,i)=>i+1).join(',')]){
   const res=await fetch(base+'/api/pulso/state?ids='+encodeURIComponent(raw));
   assert.equal(res.status,400,raw);
   assert.equal((await res.json()).error,'invalid_video_ids');
  }
 });
 assert.deepEqual(requestedPublicIds('41,42,41'),['41','42']);
 assert.equal(requestedPublicIds(['41','42']),null);
});
test('V3.6.59: SELECT solo admite Reels públicos y protege bloqueos y silencios',()=>{
 for(const text of [
  "p.moderation_status='published'","p.audience='public'",
  "p.content_level='normal'","p.post_kind='reel'","p.media_type='video'",
  "u.status='active'","u.is_admin=false","u.discoverable=true",
  "FROM blocks b","FROM mutes m","p.id=ANY($2::bigint[])","l.user_id=$1",
  "f.follower_id=$1","LIMIT 12"
 ])assert.ok(PULSO_STATE_SQL.includes(text),text);
 assert.doesNotMatch(PULSO_STATE_SQL,/SELECT \*|email|phone|message_body|password/);
});
test('V3.6.59: servidor presenta controles reales, diálogo de comentarios y acceso a crear Reel',()=>{
 const card=renderCard(reel);
 assert.match(card,/data-pulso-like="41"/);
 assert.doesNotMatch(card,/data-pulso-follow|>Seguir</);
 assert.match(card,/data-pulso-comments="41"/);
 assert.match(card,/aria-pressed="false"/);
 assert.match(card,/data-pulso-share="\/reel\/41"/);
 const html=renderPage([reel],false);
 assert.match(html,/id="pulsoAuthDialog"/);
 assert.match(html,/id="pulsoCommentsDialog"/);
 assert.match(html,/id="pulsoCommentsList"/);
 assert.match(html,/id="pulsoCommentForm"/);
 assert.match(html,/id="pulsoCommentBody"/);
 assert.match(html,/id="pulsoSocialNotice"/);
 assert.match(html,/href="\/app\?view=reels&crear=reel"[^>]*data-pulso-create/);
 assert.match(html,/pulso-social-v3659\.js\?v=3.6.59/);
 assert.match(html,/pulso-social-v3659\.css\?v=3.6.59/);
 assert.match(html,/Crear cuenta gratis/);
});
test('V3.6.59: app recibe enlace seguro de Pulso y abre el editor de Reel existente',()=>{
 const app=read('public/social.js');
 const h=read('public/app.html');
 assert.match(app,/if\(view==='reels' && params\.get\('crear'\)==='reel'\)/);
 assert.match(app,/await openModal\('reel'\)/);
 assert.match(app,/selectComposerModeV3227\(mode\)/);
 assert.match(app,/if\(kind\)kind\.value=next==='reel'\?'reel':'post'/);
 assert.match(h,/id="reelsView"/);
 assert.match(h,/id="composerReelTabV3228"/);
});
test('V3.6.59: el visor SSR y los vídeos cargados comparten los mismos controles',()=>{
 const publicJs=read('public/pulso-v3658.js');
 const client=read('public/pulso-social-v3659.js');
 assert.match(publicJs,/likes\.dataset\.pulsoLike=String\(item\.id\)/);
 assert.match(publicJs,/comments\.dataset\.pulsoComments=String\(item\.id\)/);
 assert.doesNotMatch(publicJs,/pulsoFollow|pulso-detail|Ver vídeo y participar/);
 assert.match(client,/MutationObserver/);
 assert.match(client,/\/api\/pulso\/session/);
 assert.match(client,/void checkSession\(\)\.then/);
 assert.match(client,/\/api\/pulso\/state\?ids=/);
 assert.match(client,/\/api\/posts\/'\+id\+'\/like'/);
 assert.match(client,/\/api\/posts\/'\+id\+'\/comments'/);
 assert.doesNotMatch(client,/toggleFollow|data-pulso-follow|\/api\/profiles\/'\+state\.authorId/);
 assert.match(client,/async function toggleLike\(button\)/);
 assert.match(client,/async function openComments\(id\)/);
 assert.match(client,/function enterGuestV3682\(\)\{[\s\S]*?states\.clear\(\);[\s\S]*?paintGuest\(\)/);
 assert.match(client,/commentStatus\.textContent='Comentario publicado\.'/);
 assert.match(client,/article\.append\(el\('p',null,String\(comment\.body/);
 assert.doesNotMatch(client,/\.innerHTML\s*=|localStorage|sessionStorage|Math\.random|sendBeacon/);
});
test('V3.6.59: comentarios con formulario móvil accesible, sin abrir cuentas nuevas',()=>{
 const css=read('public/pulso-social-v3659.css');
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/\#pulsoCommentBody\{[^}]*font-size:16px/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/\.pulso-dialog::backdrop/);
 assert.match(css,/#pulsoCommentForm button/);
});
