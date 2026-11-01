'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/pulso-reel-upload-v3668.js');

function browser(){
 const requests=[];
 class FakeXHR{
  constructor(){this.upload={};this.response=null;this.status=0;requests.push(this);}
  open(method,url,async){this.method=method;this.url=url;this.async=async;}
  send(body){this.body=body;}
  emit(loaded,total){this.upload.onprogress({lengthComputable:true,loaded,total});}
  sent(){this.upload.onload();}
  result(status,body){this.status=status;this.response=body;this.onload();}
 }
 class FormDataFake{
  constructor(){this.parts=[];}
  append(key,value){this.parts.push([key,value]);}
 }
 const window={};
 vm.runInNewContext(source,{window,XMLHttpRequest:FakeXHR,FormData:FormDataFake},{timeout:2000});
 return {upload:window.RedLibertadPulsoUploadV3668.upload,requests};
}
const video={name:'original.mp4',type:'video/mp4',size:1024};
test('V3.6.68: el progreso viene del envío real y nunca afirma 100% antes de respuesta 201',async()=>{
 const b=browser(),events=[];
 const pending=b.upload(video,s=>events.push(s));
 const xhr=b.requests[0];
 assert.equal(xhr.method,'POST');
 assert.equal(xhr.url,'/api/media/upload');
 assert.equal(xhr.async,true);
 assert.equal(xhr.responseType,'json');
 assert.ok(xhr.timeout>=300000);
 assert.equal(xhr.body.parts[0][0],'file');
 assert.equal(xhr.body.parts[0][1],video);
 xhr.emit(250,1000);
 xhr.emit(1000,1000);
 assert.equal(events[1].percent,25);
 assert.equal(events[2].percent,99);
 xhr.sent();
 assert.equal(events.at(-1).phase,'processing');
 const media={url:'/uploads/123.mp4',mediaType:'video',provider:'local'};
 xhr.result(201,{ok:true,media});
 assert.equal(await pending,media);
 assert.equal(events.at(-1).phase,'complete');
});
test('V3.6.68: si se corta Internet se conserva el archivo y no hay reintento automático',async()=>{
 const b=browser(),pending=b.upload(video);
 const xhr=b.requests[0];
 xhr.onerror();
 await assert.rejects(pending,/conexión|Internet/);
 assert.equal(b.requests.length,1);
});
test('V3.6.68: errores JSON del servidor dan instrucciones específicas',async()=>{
 for(const [status,error,expected] of [
  [413,'file_too_large',/límite de subida/],
  [415,'unsupported_media_type',/Formato no compatible/],
  [401,'unauthorized',/sesión ha caducado/],
  [429,'rate_limited',/Demasiadas subidas/]
 ]){
  const b=browser(),pending=b.upload(video);
  b.requests[0].result(status,{error});
  await assert.rejects(pending,expected);
 }
});
test('V3.6.68: tiempo excedido y respuesta incompleta no generan publicación ficticia',async()=>{
 const timed=browser(),p=timed.upload(video);
 timed.requests[0].ontimeout();
 await assert.rejects(p,/tardado demasiado/);
 const invalid=browser(),p2=invalid.upload(video);
 invalid.requests[0].result(200,{media:{url:'/uploads/123.mp4',mediaType:'video'}});
 await assert.rejects(p2,/No se pudo completar/);
});
test('V3.6.68: el editor mantiene su ruta de publicación y protege la selección',()=>{
 const app=read('public/app.html');
 const social=read('public/social.js');
 const css=read('public/pulso-reel-upload-v3668.css');
 assert.match(app,/id="composerReelUploadProgressV3668"[^>]+max="100" hidden/);
 assert.match(app,/pulso-reel-upload-v3668\.js\?v=3\.6\.68/);
 assert.match(app,/pulso-reel-upload-v3668\.css\?v=3\.6\.68/);
 assert.ok(app.indexOf('social.js?v=3.2.75')<app.indexOf('pulso-reel-upload-v3668.js'));
 assert.match(social,/function setReelComposerBusyV3668\(busy\)/);
 assert.match(social,/reelBusyV3668=true;/);
 assert.match(social,/setReelComposerBusyV3668\(true\)/);
 assert.match(social,/finally \{\s*if\(reelBusyV3668\)setReelComposerBusyV3668\(false\)/);
 assert.match(social,/await window\.RedLibertadPulsoUploadV3668\.upload\(f,reelProgress\)/);
 assert.match(social,/if\(\$\('#mediaFile'\)\.files\[0\]!==f\)/);
 assert.match(social,/Comprueba tus Reels antes de intentar publicar otra vez/);
 assert.match(social,/await api\('\/api\/posts'/);
 assert.match(social,/if \(kind === 'reel' && !file\)/);
 assert.match(social,/\$\('#storyForm'\)\.addEventListener\('submit'/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(source,/Math\.random|localStorage|sessionStorage|sendBeacon|fetch\(/);
});
test('V3.6.68: los límites de Multer devuelven 413 y 415 estructurados',()=>{
 const routes=[];
 const router={post:(route,...handlers)=>routes.push({route,handlers})};
 const express={Router:()=>router};
 const multer=()=>({single:()=>((req,res,cb)=>cb(req.uploadError||null))});
 const module={exports:{}};
 const pathModule=require('node:path');
 const fakeFs={mkdirSync(){},unlink(_path,cb){cb();}};
 vm.runInNewContext(read('src/routes/media.js'),{
  require:name=>{
   if(name==='path')return pathModule;
   if(name==='fs')return fakeFs;
   if(name==='express')return express;
   if(name==='multer')return multer;
   if(name==='../middleware/auth')return {requireAuth:(_req,_res,next)=>next()};
   if(name==='../services/mediaStorage')return {storeMedia:async()=>({url:'/uploads/a.mp4'})};
   throw Error('Unexpected dependency '+name);
  },
  __dirname:'/tmp/rl-tests/src/routes',
  process:{env:{}},
  module,console:{error(){}}
 },{timeout:3000});
 const [route]=routes;
 assert.equal(route.route,'/upload');
 const errorHandler=route.handlers[1];
 for(const [uploadError,status,code] of [
  [{code:'LIMIT_FILE_SIZE',message:'File too large'},413,'file_too_large'],
  [{message:'unsupported_media_type'},415,'unsupported_media_type']
 ]){
  const req={uploadError};
  const res={status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
  errorHandler(req,res,()=>{throw Error('Unexpected next')});
  assert.equal(res.statusCode,status);
  assert.equal(res.body.error,code);
 }
});
