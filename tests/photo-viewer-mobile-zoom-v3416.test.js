'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function harness(){
 const handlers={};
 const classes=new Set(['hidden']),stageClasses=new Set();
 const classList=items=>({
   add(x){items.add(x)},remove(x){items.delete(x)},
   contains(x){return items.has(x)},
   toggle(x,on){if(on)items.add(x);else items.delete(x)}
 });
 const stage={classList:classList(stageClasses),scrollWidth:800,clientWidth:360,scrollLeft:0,scrollTop:0};
 const full={src:'',alt:'',removeAttribute(name){if(name==='src')this.src=''}};
 const zoom={textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},closest(s){return s==='#photoViewerZoomV3416'?this:null}};
 const modal={classList:classList(classes),contains:()=>false};
 const close={focus(){this.focused=true},closest(s){return s==='#photoViewerCloseV3415'?this:null}};
 const title={textContent:''};
 const prev={isConnected:true,focus(){this.focused=true}};
 const els={photoViewerModalV3415:modal,photoViewerImageV3415:full,
   photoViewerTitleV3415:title,photoViewerCloseV3415:close,photoViewerZoomV3416:zoom};
 const doc={activeElement:prev,getElementById:id=>els[id]||null,
   querySelector:s=>s==='#photoViewerModalV3415 .photo-viewer-stage-v3415'?stage:null,
   addEventListener:(name,fn)=>{handlers[name]=fn}};
 const global={document:doc,location:{href:'https://redlibertad.com/app',protocol:'https:'},
   requestAnimationFrame:fn=>fn()};
 const trigger={dataset:{photoV3415:'post'},querySelector:s=>s==='img'?{
   src:'https://redlibertad.com/uploads/post.jpg',
   currentSrc:'https://redlibertad.com/uploads/post.jpg',alt:'Foto publicada'}:null};
 const sandbox={window:global,URL};
 vm.runInNewContext(read('public/photo-viewer-v3415.js'),sandbox);
 return {api:global.RedLibertadPhotoViewerV3415,stage,stageClasses,full,zoom,modal,close,
   prev,handlers,trigger,classes};
}
test('opens in fit-to-screen mode and zooms 2× only when requested',()=>{
 const h=harness();
 assert.equal(h.api.open(h.trigger),true);
 assert.equal(h.zoom.textContent,'Ampliar foto ×2');
 assert.equal(h.zoom.attrs['aria-pressed'],'false');
 assert.equal(h.stageClasses.has('is-zoomed-v3416'),false);
 assert.equal(h.api.setZoom(true),true);
 assert.equal(h.zoom.attrs['aria-pressed'],'true');
 assert.equal(h.zoom.textContent,'Ajustar foto');
 assert.equal(h.stageClasses.has('is-zoomed-v3416'),true);
 assert.equal(h.stage.scrollLeft,220);
 assert.equal(h.api.setZoom(false),true);
 assert.equal(h.stage.scrollLeft,0);
 assert.equal(h.stage.scrollTop,0);
 assert.equal(h.zoom.attrs['aria-pressed'],'false');
});
test('zoom from tapping the image, accessible button, and safe cleanup at close',()=>{
 const h=harness();
 h.api.open(h.trigger);
 h.handlers.click({target:h.full});
 assert.equal(h.zoom.attrs['aria-pressed'],'true');
 h.handlers.click({target:h.zoom});
 assert.equal(h.zoom.attrs['aria-pressed'],'false');
 h.handlers.click({target:h.zoom});
 assert.equal(h.zoom.attrs['aria-pressed'],'true');
 h.api.close();
 assert.equal(h.classes.has('hidden'),true);
 assert.equal(h.stageClasses.has('is-zoomed-v3416'),false);
 assert.equal(h.full.src,'');
 h.api.open(h.trigger);
 assert.equal(h.zoom.attrs['aria-pressed'],'false');
 assert.equal(h.prev.focused,true);
});
test('tap outside photo and Escape still close and reset zoom',()=>{
 const h=harness();
 h.api.open(h.trigger);
 h.api.setZoom(true);
 h.handlers.click({target:h.stage});
 assert.equal(h.classes.has('hidden'),true);
 assert.equal(h.zoom.attrs['aria-pressed'],'false');
 h.api.open(h.trigger);
 h.api.setZoom(true);
 let prevented=0;
 h.handlers.keydown({key:'Escape',preventDefault(){prevented++}});
 assert.equal(prevented,1);
 assert.equal(h.classes.has('hidden'),true);
 assert.equal(h.stageClasses.has('is-zoomed-v3416'),false);
});
test('invalid triggers remain blocked and there are no new image endpoints',()=>{
 const h=harness();
 h.trigger.dataset.photoV3415='private';
 assert.equal(h.api.open(h.trigger),false);
 h.trigger.dataset.photoV3415='cover';
 h.trigger.dataset.photoUrlV3415='javascript:alert(1)';
 assert.equal(h.api.open(h.trigger),false);
 const src=read('public/photo-viewer-v3415.js');
 assert.doesNotMatch(src,/fetch\(|api\/media\/|XMLHttpRequest/);
 assert.match(src,/new URL\(raw,global.location.href\)/);
});
test('photo fills available width, with no fullscreen dark card border, and scrollable zoom',()=>{
 const html=read('public/app.html'),css=read('public/social.css'),workflow=read('.github/workflows/validate-js.yml');
 assert.match(html,/id="photoViewerZoomV3416" type="button" aria-pressed="false"/);
 assert.match(html,/photo-viewer-v3415\.js\?v=3\.4\.1\.6/);
 assert.match(html,/photos=3\.4\.1\.6/);
 const part=css.slice(css.indexOf('/* V3.4.1.6 —'));
 assert.match(part,/#photoViewerModalV3415\.photo-viewer-v3415/);
 assert.match(part,/border:0;outline:0/);
 assert.match(part,/grid-template-rows:minmax\(0,1fr\) auto/);
 assert.match(part,/\.is-zoomed-v3416/);
 assert.match(part,/overflow:auto/);
 assert.match(part,/width:200%/);
 assert.match(part,/max-height:100%/);
 assert.match(part,/safe-area-inset-bottom/);
 assert.match(workflow,/photo-viewer-mobile-zoom-v3416\.test\.js/);
});
