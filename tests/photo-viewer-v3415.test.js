'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');
const viewer=read('public/photo-viewer-v3415.js');

function harness(){
 const listeners={};
 const classNames=new Set(['hidden']);
 const trigger={dataset:{photoV3415:'post'},isConnected:true};
 const image={currentSrc:'https://redlibertad.com/uploads/allowed.jpg',src:'https://redlibertad.com/uploads/allowed.jpg',alt:'Fotografía de una publicación'};
 trigger.querySelector=selector=>selector==='img'?image:null;
 trigger.closest=selector=>selector==='[data-photo-v3415]'?trigger:null;
 const modal={classList:{contains:n=>classNames.has(n),remove:n=>classNames.delete(n),add:n=>classNames.add(n)},
   contains:()=>false};
 const full={src:'',alt:'',removeAttribute:function(n){if(n==='src')this.src='';}};
 const label={textContent:''};
 const close={focus(){this.focused=true},closest(selector){return selector==='#photoViewerCloseV3415'?this:null}};
 const elements={photoViewerModalV3415:modal,photoViewerImageV3415:full,photoViewerTitleV3415:label,photoViewerCloseV3415:close};
 const previous={isConnected:true,focused:false,focus(){this.focused=true}};
 const doc={
   activeElement:previous,
   getElementById:id=>elements[id],
   addEventListener:(ev,fn)=>{listeners[ev]=fn}
 };
 const global={document:doc,location:{href:'https://redlibertad.com/app',protocol:'https:'},URL};
 vm.runInNewContext(viewer,{window:global,URL});
 return {api:global.RedLibertadPhotoViewerV3415,trigger,image,modal,full,label,close,previous,listeners,classNames};
}
test('post photo opens from its already permitted image, then closes and clears URL',()=>{
 const h=harness();
 assert.equal(h.api.open(h.trigger),true);
 assert.equal(h.classNames.has('hidden'),false);
 assert.equal(h.full.src,h.image.currentSrc);
 assert.equal(h.full.alt,h.image.alt);
 assert.equal(h.close.focused,true);
 h.api.close();
 assert.equal(h.classNames.has('hidden'),true);
 assert.equal(h.full.src,'');
 assert.equal(h.previous.focused,true);
});
test('avatar and cover of visited or own profile open, with descriptive captions',()=>{
 const h=harness();
 h.trigger.dataset.photoV3415='avatar';
 h.image.currentSrc='https://redlibertad.com/uploads/avatar.jpg';
 h.api.open(h.trigger);
 assert.equal(h.label.textContent,'Fotografía de perfil');
 h.api.close();
 h.trigger.dataset.photoV3415='cover';
 h.trigger.dataset.photoUrlV3415='/uploads/cover.jpg';
 h.api.open(h.trigger);
 assert.equal(h.full.src,'https://redlibertad.com/uploads/cover.jpg');
 assert.equal(h.label.textContent,'Fotografía de portada');
});
test('unsafe URLs and gated/non-image markers never open the viewer',()=>{
 const h=harness();
 h.trigger.dataset.photoV3415='private';
 assert.equal(h.api.open(h.trigger),false);
 h.trigger.dataset.photoV3415='cover';
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg/>','blob:https://redlibertad.com/123','http://redlibertad.com/uploads/a.jpg']){
   h.trigger.dataset.photoUrlV3415=value;
   assert.equal(h.api.open(h.trigger),false,value);
 }
 h.trigger.dataset.photoV3415='post';
 h.image.currentSrc='';
 h.image.src='';
 assert.equal(h.api.open(h.trigger),false);
});
test('click, keyboard, modal backdrop and close button work with delegated handlers',()=>{
 const h=harness();
 const target={closest:q=>q==='[data-photo-v3415]'?h.trigger:null};
 h.listeners.click({target});
 assert.equal(h.classNames.has('hidden'),false);
 h.listeners.click({target:h.modal});
 assert.equal(h.classNames.has('hidden'),true);
 let prevented=0;
 h.listeners.keydown({target:h.trigger,key:'Enter',preventDefault(){prevented++}});
 assert.equal(h.classNames.has('hidden'),false);
 h.listeners.keydown({target:h.trigger,key:'Escape',preventDefault(){prevented++}});
 assert.equal(h.classNames.has('hidden'),true);
 assert.equal(prevented,2);
 h.api.open(h.trigger);
 h.listeners.click({target:h.close});
 assert.equal(h.classNames.has('hidden'),true);
});
test('posts enable photos only for accessible non-gated image posts',()=>{
 const start=js.indexOf('function postHTML('),end=js.indexOf('function ',start+10);
 const section=js.slice(start,end);
 assert.match(section,/p\.media_type==='image'&&!p\.gated/);
 assert.match(section,/data-photo-v3415="post"/);
 assert.match(section,/role="button" aria-label="Ampliar foto de la publicación"/);
 assert.match(js,/if \(p\.gated\) return/);
 assert.ok(section.includes('mediaHTML(p'));
});
test('profile avatar and cover only expose triggers when the permitted image exists',()=>{
 assert.match(js,/me\.cover_url \? .*data-photo-v3415="cover"/);
 assert.match(js,/me\.avatar_url \? 'data-photo-v3415="avatar"/);
 assert.match(js,/profile\.cover_url \? .*data-photo-v3415="cover"/);
 assert.match(js,/profile\.avatar_url \? 'data-photo-v3415="avatar"/);
 assert.match(js,/data-photo-url-v3415="\$\{esc\(profile\.cover_url\)\}"/);
 assert.match(js,/data-photo-url-v3415="\$\{esc\(me\.cover_url\)\}"/);
});
test('separate accessible dialog, proper cache roll-out and responsive style for devices',()=>{
 assert.match(html,/id="photoViewerModalV3415" class="modal photo-viewer-v3415 hidden" role="dialog" aria-modal="true"/);
 assert.match(html,/id="photoViewerImageV3415"/);
 assert.match(html,/id="photoViewerCloseV3415"[^>]*aria-label="Cerrar foto ampliada"/);
 assert.match(html,/\/photo-viewer-v3415\.js\?v=3\.4\.1\.5/);
 assert.match(html,/photos=3\.4\.1\.5/);
 assert.match(css,/#photoViewerModalV3415 #photoViewerImageV3415/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/\[data-photo-v3415\]:focus-visible/);
 assert.match(read('public/sw.js'),/\/photo-viewer-v3415\.js/);
 assert.match(read('.github/workflows/validate-js.yml'),/photo-viewer-v3415\.test\.js/);
});
