'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const {
 createPulsoRouter,PUBLIC_VIDEO_SQL,FOLLOWING_VIDEO_SQL,renderPage,fetchFollowingVideos,
 PAGE_SIZE,MAX_PAGE
}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const reel=(id=42)=>({id,caption:'Una historia real',media_url:'/uploads/reels/'+id+'.mp4',
 username:'creador_real',display_name:'Creador real',avatar_url:null,like_count:0,comment_count:0});
async function serve(db,run){
 const app=express();
 const auth=(req,res,next)=>req.headers['x-test-user']==='yes'?(req.user={id:13},next()):res.status(401).json({error:'authentication_required'});
 const optionalAuth=(req,res,next)=>{if(req.headers['x-test-user']==='yes')req.user={id:13};next();};
 app.use(createPulsoRouter({db,auth,optionalAuth}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 try{await run('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}

test('V3.6.62: Siguiendo solo muestra Reels públicos de cuentas seguidas, sin bloqueos ni silencios',()=>{
 for(const condition of [
  "p.moderation_status='published'","p.audience='public'",
  "p.content_level='normal'","p.post_kind='reel'","p.media_type='video'",
  "u.status='active'","u.is_admin=false","u.discoverable=true",
  "EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id)",
  "NOT EXISTS(SELECT 1 FROM blocks b","NOT EXISTS(SELECT 1 FROM mutes m",
  "ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3"
 ])assert.ok(FOLLOWING_VIDEO_SQL.includes(condition),condition);
 assert.doesNotMatch(FOLLOWING_VIDEO_SQL,/SELECT \*|email|phone|password|private_message|paid_recommendation/);
 assert.match(PUBLIC_VIDEO_SQL,/ORDER BY p.created_at DESC,p.id DESC LIMIT \$1 OFFSET \$2/);
 assert.equal(PAGE_SIZE,12);assert.equal(MAX_PAGE,20);
});

test('V3.6.62: pestañas visibles, etiqueta activa y transparencia del feed para visitantes',()=>{
 const html=renderPage([{
  id:'42',caption:'',video:'/uploads/reels/42.mp4',avatar:null,
  displayName:'Creador',username:'creador_real',likes:1,comments:0
 }],true);
 assert.match(html,/<nav class="pulso-tabs-v3662" aria-label="Elegir vídeos">/);
 assert.match(html,/<a href="\/pulso" aria-current="page">Para ti<\/a>/);
 assert.match(html,/<a href="\/pulso\?tab=siguiendo">Siguiendo<\/a>/);
 assert.match(html,/data-pulso-mode="para-ti"/);
 assert.match(html,/Reels públicos recientes de la comunidad/);
 assert.match(html,/pulso-tabs-v3662\.css\?v=3\.6\.62/);
 assert.match(html,/class="pulso-card" data-pulso-item/);
 assert.match(html,/name="robots" content="index,follow,max-video-preview:-1"/);
 const css=read('public/pulso-tabs-v3662.css');
 assert.match(css,/\[aria-current="page"\]/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/min-height:46px/);
});

test('V3.6.62: Siguiendo exige sesión y jamás consulta perfiles privados sin autenticar',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[reel()]};}};
 await serve(db,async base=>{
  const guest=await fetch(base+'/pulso?tab=siguiendo');
  assert.equal(guest.status,200);
  assert.match(guest.headers.get('cache-control'),/private.*no-store/);
  assert.equal(guest.headers.get('x-robots-tag'),'noindex,nofollow');
  const html=await guest.text();
  assert.match(html,/Entra para ver a quién sigues/);
  assert.match(html,/href="\/\?next=%2Fpulso%3Ftab%3Dsiguiendo#acceso">Entrar en RedLibertad/);
  assert.match(html,/aria-current="page">Siguiendo<\/a>/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html,/class="pulso-card"/);
  assert.equal(calls.length,0);
  const api=await fetch(base+'/api/pulso/following?page=1');
  assert.equal(api.status,401);
  assert.equal(calls.length,0);
  const invalidTab=await fetch(base+'/pulso?tab=mis-privados',{redirect:'manual'});
  assert.equal(invalidTab.status,302);
  assert.equal(invalidTab.headers.get('location'),'/pulso');
 });
});

test('V3.6.62: visitante conserva feed Para ti público y sin personalización artificial',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[reel(42)]};}};
 await serve(db,async base=>{
  const page=await fetch(base+'/pulso');
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/aria-current="page">Para ti<\/a>/);
  assert.match(html,/data-pulso-mode="para-ti"/);
  assert.match(html,/class="pulso-card" data-pulso-item/);
  assert.doesNotMatch(html,/recomendaciones personalizadas por IA/);
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].sql,PUBLIC_VIDEO_SQL);
 assert.deepEqual(calls[0].params,[PAGE_SIZE+1,0]);
});

test('V3.6.62: miembro ve solo sus Reels seguidos y paginación limitada con privacidad',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{
  calls.push({sql,params});
  assert.equal(sql,FOLLOWING_VIDEO_SQL);
  return {rows:[reel(51),reel(52)]};
 }};
 await serve(db,async base=>{
  const page=await fetch(base+'/pulso?tab=siguiendo',{headers:{'x-test-user':'yes'}});
  assert.equal(page.status,200);
  assert.match(page.headers.get('cache-control'),/private.*no-store/);
  const html=await page.text();
  assert.match(html,/aria-current="page">Siguiendo<\/a>/);
  assert.match(html,/data-pulso-mode="siguiendo"/);
  assert.match(html,/id="pulsoFeed"/);
  assert.match(html,/class="pulso-card" data-pulso-item/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  const api=await fetch(base+'/api/pulso/following?page=2',{headers:{'x-test-user':'yes'}});
  assert.equal(api.status,200);
  assert.match(api.headers.get('cache-control'),/private.*no-store/);
  assert.equal(api.headers.get('x-robots-tag'),'noindex,nofollow');
  const data=await api.json();
  assert.deepEqual(data,{items:[
    {id:'51',video:'/uploads/reels/51.mp4',avatar:null,username:'creador_real',displayName:'Creador real',caption:'Una historia real',likes:0,comments:0},
    {id:'52',video:'/uploads/reels/52.mp4',avatar:null,username:'creador_real',displayName:'Creador real',caption:'Una historia real',likes:0,comments:0}
  ],hasMore:false,page:2,mode:'siguiendo'});
  const invalid=await fetch(base+'/api/pulso/following?page=999',{headers:{'x-test-user':'yes'}});
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).error,'invalid_page');
 });
 assert.deepEqual(calls.map(c=>c.params),[[13,13,0],[13,13,12]]);
});

test('V3.6.62: al no seguir creadores no se muestran vídeos ajenos ni rellenos ficticios',async()=>{
 const db={query:async()=>({rows:[]})};
 await serve(db,async base=>{
  const page=await fetch(base+'/pulso?tab=siguiendo',{headers:{'x-test-user':'yes'}});
  const html=await page.text();
  assert.match(html,/Aún no hay vídeos en Siguiendo/);
  assert.match(html,/Aquí aparecerán los Reels públicos de las personas que sigues/);
  assert.match(html,/href="\/pulso">Descubrir vídeos/);
  assert.doesNotMatch(html,/class="pulso-card"/);
  assert.match(html,/pulso-feed-empty-v3660/);
 });
 const items=await fetchFollowingVideos(db,13,1);
 assert.deepEqual(items,{items:[],hasMore:false});
});

test('V3.6.62: el navegador separa paginación pública y privada sin cambiar Like/Follow',()=>{
 const js=read('public/pulso-v3658.js');
 assert.match(js,/feed\.dataset\.pulsoMode==='siguiendo'/);
 assert.match(js,/\/api\/pulso\/following\?page=/);
 assert.match(js,/\/api\/pulso\/public\?page=/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/credentials:'omit'/);
 assert.match(js,/data\.mode!=='siguiendo'/);
 assert.match(js,/if\(response\.status===401&&mode==='siguiendo'\)/);
 assert.match(js,/const observer=playback\(\)/);
 assert.match(js,/feed\.insertBefore\(fragment,footer\)/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|Math\.random|sendBeacon/);
});
