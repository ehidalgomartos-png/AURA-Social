'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PUBLIC_VIDEO_SQL,FOLLOWING_VIDEO_SQL}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const social=read('public/social.js');
const preview=read('public/pulso-reel-preview-v3667.js');
const html=read('public/app.html');
const start=social.indexOf('function reelPublishMessageV3683(');
const end=social.indexOf('// V3.6.69: mostrar',start);
assert.ok(start>=0&&end>start,'Reel result helper exists');
const context={};
vm.runInNewContext(social.slice(start,end)+'\nthis.result=reelPublishMessageV3683;',context,{timeout:2500});
const result=context.result;
const published={id:25,post_kind:'reel',moderation_status:'published',media_type:'video',
 audience:'public',content_level:'normal'};
const message=(post=published,extra={})=>
 result({kind:'reel',publishMode:'now',waitingApprovals:false,post,...extra});

test('V3.6.83: una publicación de vídeo público indica comprobar su aparición en Pulso',()=>{
 assert.match(message(),/Reel publicado/);
 assert.match(message(),/Consulta Pulso para comprobar/);
 assert.doesNotMatch(message(),/garantizado|ya visible/);
});
test('V3.6.83: un Reel con foto informa de que no entra en el feed solo de vídeos',()=>{
 const msg=message({...published,media_type:'image'});
 assert.match(msg,/foto publicado en RedLibertad/);
 assert.match(msg,/Pulso solo muestra vídeos/);
});
test('V3.6.83: privado, conexiones, círculos o niveles limitados no prometen visibilidad pública',()=>{
 for(const post of [
  {...published,audience:'connections'},
  {...published,audience:'circles'},
  {...published,audience:'vip'},
  {...published,content_level:'nudity'}
 ]){
  const msg=message(post);
  assert.match(msg,/No aparecerá en Pulso público/);
  assert.doesNotMatch(msg,/Consulta Pulso/);
 }
});
test('V3.6.83: un Reel pendiente de revisión nunca se declara publicado',()=>{
 for(const post of [
  {...published,moderation_status:'under_review'},
  {...published,moderation_status:'pending'},
  {...published,moderation_status:'rejected'},
  {...published,post_kind:'post'},
  null
 ]){
  const msg=message(post);
  assert.match(msg,/Aún no está publicado/);
  assert.doesNotMatch(msg,/Reel publicado/);
 }
});
test('V3.6.83: borradores, programación y colaboraciones respetan su estado',()=>{
 assert.equal(message(published,{publishMode:'draft'}),'Reel guardado como borrador');
 assert.equal(message(published,{publishMode:'scheduled'}),'Reel programado');
 assert.equal(message(published,{publishMode:'scheduled',waitingApprovals:true}),
  'Reel programado. Esperando aprobaciones.');
 assert.equal(message(published,{waitingApprovals:true}),
  'Reel guardado. Esperando aprobaciones.');
 assert.equal(message(published,{kind:'post'}),null);
});
test('V3.6.83: el feed realmente excluye Reels de foto y publicaciones no públicas',()=>{
 for(const sql of [PUBLIC_VIDEO_SQL,FOLLOWING_VIDEO_SQL]){
  for(const term of ["p.post_kind='reel'","p.media_type='video'",
   "p.audience='public'","p.moderation_status='published'",
   "p.content_level='normal'","u.discoverable=true"]){
   assert.ok(sql.includes(term),term);
  }
 }
});
test('V3.6.83: el aviso previo se muestra para imágenes sin impedir la selección',()=>{
 assert.match(preview,/Pulso solo muestra vídeos/);
 assert.match(preview,/Las fotos se publican en RedLibertad/);
 assert.match(preview,/\\\.\(mp4\|webm\|mov\)/);
 assert.match(preview,/input\.addEventListener\('change',sync\)/);
 assert.match(preview,/info\.textContent=base/);
 assert.doesNotMatch(preview,/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
test('V3.6.83: conserva subida real, publicación idempotente local y enlaces seguros',()=>{
 assert.match(social,/if\(kind==='reel'\)\{\s*const reelMessage=reelPublishMessageV3683/);
 assert.match(social,/toastPublishedReelV3669\(reelMessage/);
 assert.match(social,/await window\.RedLibertadPulsoUploadV3668\.upload\(f,reelProgress\)/);
 assert.match(social,/await api\('\/api\/posts'/);
 assert.match(social,/if\(kind==='reel'&&r\.status===0\)/);
 assert.match(social,/runSocialSubmitOnce\(e\.currentTarget/);
 assert.match(social,/return \{\s*href:'\/app\?post='\+id/);
 assert.match(html,/reel-status=3\.6\.83/);
 assert.match(html,/feed-eligibility=3\.6\.83/);
});
