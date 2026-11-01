'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/pulso-reel-preview-v3667.js');

function harness(){
 const handlers={};
 const makeClasses=()=>{const set=new Set();return {
  add:k=>set.add(k),remove:k=>set.delete(k),
  toggle:(k,on)=>on?set.add(k):set.delete(k),contains:k=>set.has(k)
 }};
 const label={append(node){node.parentElement=label},after(node){node.parentElement=media}};
 const media={};
 const video={readyState:0,duration:32.8,videoWidth:1080,videoHeight:1920,
  controls:false,preload:'none',attrs:{},handlers:{},
  setAttribute(k,v){this.attrs[k]=v},
  addEventListener(k,fn){this.handlers[k]=fn},
  pause(){this.paused=true}};
 const preview={parentElement:label,querySelector:s=>s==='video'&&preview.videoOn?video:null,videoOn:false};
 const input={files:[],closest:s=>s==='label.upload-drop'?label:null,
  addEventListener:(name,fn)=>{handlers[name]=fn}};
 const modal={dataset:{composerMode:'post'},classList:makeClasses()};
 const text={textContent:'',classList:makeClasses()};
 const info={textContent:'',hidden:true};
 const remove={addEventListener:(name,fn)=>{handlers.remove=fn}};
 const els={modal,mediaFile:input,preview,composerReelMediaInfoV3667:info,
  uploadText:text,removePostMedia:remove};
 let observer;
 class MutationObserverFake{
  constructor(fn){this.fn=fn;observer=this}
  observe(el,opts){this.opts=opts}
  emit(){this.fn([{attributeName:'data-composer-mode'}])}
 }
 const doc={getElementById:id=>els[id]||null};
 vm.runInNewContext(source,{document:doc,MutationObserver:MutationObserverFake},
  {timeout:2000});
 return {modal,input,preview,label,media,video,info,text,handlers,observer};
}

test('V3.6.67: la vista previa sale del selector al abrir Reel, sin duplicar subida',()=>{
 const h=harness();
 assert.equal(h.preview.parentElement,h.label);
 h.input.files=[{name:'mi-reel.mp4',type:'video/mp4',size:5242880}];
 h.preview.videoOn=true;
 h.modal.dataset.composerMode='reel';
 h.observer.emit();
 assert.equal(h.preview.parentElement,h.media);
 assert.equal(h.video.controls,true);
 assert.equal(h.video.preload,'metadata');
 assert.equal(h.info.hidden,false);
 assert.match(h.info.textContent,/mi-reel\.mp4/);
 assert.match(h.info.textContent,/Vista previa local/);
 assert.equal(h.text.textContent,'Cambiar foto o vídeo');
 assert.ok(h.modal.classList.contains('pulso-reel-selected-v3667'));
 h.video.handlers.loadedmetadata();
 assert.match(h.info.textContent,/0:32/);
 assert.match(h.info.textContent,/1080 × 1920/);
});
test('V3.6.67: al cambiar o quitar el archivo no queda una vista previa anterior',()=>{
 const h=harness();
 const a={name:'anterior.mp4',type:'video/mp4',size:1000};
 h.modal.dataset.composerMode='reel';h.input.files=[a];h.preview.videoOn=true;
 h.observer.emit();
 const old=h.video.handlers.loadedmetadata;
 h.preview.videoOn=false;
 h.input.files=[{name:'foto.webp',type:'image/webp',size:1000}];
 h.handlers.change();
 old();
 assert.match(h.info.textContent,/foto\.webp/);
 assert.doesNotMatch(h.info.textContent,/anterior\.mp4/);
 h.input.files=[];h.handlers.remove();
 assert.equal(h.info.hidden,true);
 assert.equal(h.info.textContent,'');
 assert.equal(h.modal.classList.contains('pulso-reel-selected-v3667'),false);
});
test('V3.6.67: cambiar de Reel a Publicación devuelve el preview original',()=>{
 const h=harness();
 h.modal.dataset.composerMode='reel';
 h.input.files=[{name:'reel.mp4',type:'video/mp4',size:1024}];
 h.preview.videoOn=true;h.observer.emit();
 h.modal.dataset.composerMode='post';h.observer.emit();
 assert.equal(h.preview.parentElement,h.label);
 assert.equal(h.video.paused,true);
 assert.equal(h.info.hidden,true);
 assert.equal(h.modal.classList.contains('pulso-reel-selected-v3667'),false);
});
test('V3.6.67: integración sin modificar APIs de vídeos ni controles de publicación',()=>{
 const html=read('public/app.html');
 const css=read('public/pulso-reel-preview-v3667.css');
 const social=read('public/social.js');
 assert.match(html,/id="composerReelMediaInfoV3667"/);
 assert.match(html,/pulso-reel-preview-v3667\.css\?v=3\.6\.67/);
 assert.match(html,/pulso-reel-preview-v3667\.js\?v=3\.6\.67/);
 assert.ok(html.indexOf('social.js?v=3.2.75')<html.indexOf('pulso-reel-preview-v3667.js'));
 assert.match(html,/id="mediaFile" name="file"/);
 assert.match(html,/id="createForm"/);
 assert.match(social,/currentFileMedia = await uploadFile\(f\)/);
 assert.match(social,/await api\('\/api\/posts'/);
 assert.match(social,/if \(kind === 'reel' && !file\)/);
 assert.match(css,/pointer-events:auto/);
 assert.match(css,/object-fit:contain/);
 assert.doesNotMatch(css,/object-fit:cover|transform:scale\(/);
 assert.doesNotMatch(source,/fetch\(|api\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon|createObjectURL/);
});
