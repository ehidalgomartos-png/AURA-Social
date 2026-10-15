'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('public/marketplace-v3250.js');
const html=read('public/marketplace.html');
function extract(name,endName,context){
 const begin=app.indexOf('function '+name+'(');
 const end=app.indexOf(endName,begin);
 assert.ok(begin>=0&&end>begin,name+' extracted');
 return vm.runInNewContext('('+app.slice(begin,end).trim()+')',context);
}
test('client parses as JavaScript',()=>assert.doesNotThrow(()=>new vm.Script(app)));
test('Marketplace has multi-select gallery and rear camera controls',()=>{
 assert.match(html,/id="photoAddGallery"/);
 assert.match(html,/id="photoTakeCamera"/);
 assert.match(html,/name="photos"[^>]*multiple/);
 assert.match(html,/name="cameraPhoto"[^>]*capture="environment"/);
 assert.match(html,/id="photoCount"/);
 assert.match(html,/id="imagesPreview"/);
 assert.match(app,/state\.pendingPhotos/);
 assert.match(app,/addPendingPhotos\(event\.target\.files\)/);
 assert.match(app,/URL\.revokeObjectURL/);
});
test('gallery adds photos in separate batches, rejects seventh and retains originals',()=>{
 const state={images:['/uploads/previous.jpg'],pendingPhotos:[],authenticated:true};
 let count=0,lastError='';
 const ctx={state,MAX_MARKET_PHOTOS:6,photoValidation:()=>'',URL:{createObjectURL:file=>'blob:'+file.name},renderPhotos:()=>{count++;},listingError:m=>{lastError=m;},$:()=>({textContent:''})};
 const add=extract('addPendingPhotos','async function request(',ctx);
 add([{name:'one.jpg'},{name:'two.jpg'}]);
 add([{name:'three.jpg'}]);
 assert.equal(state.pendingPhotos.length,3);
 assert.equal(state.images.length,1);
 assert.equal(count,2);
 add([{name:'four.jpg'},{name:'five.jpg'},{name:'six.jpg'}]);
 assert.equal(state.pendingPhotos.length,3);
 assert.match(lastError,/hasta 6 fotografías/);
 add([{name:'four.jpg'},{name:'five.jpg'}]);
 assert.equal(state.pendingPhotos.length,5);
});
test('photo validation rejects unsupported files and oversized images',()=>{
 const start=app.indexOf('function photoValidation('),end=app.indexOf('function addPendingPhotos(',start);
 const fn=vm.runInNewContext('('+app.slice(start,end).trim()+')',{MAX_MARKET_IMAGE_BYTES:15*1024*1024});
 assert.equal(fn({name:'ok.jpg',type:'image/jpeg',size:2500}),'');
 assert.equal(fn({name:'ok.webp',type:'image/webp',size:2500}),'');
 assert.match(fn({name:'bad.heic',type:'image/heic',size:2500}),/HEIC/);
 assert.match(fn({name:'big.png',type:'image/png',size:16*1024*1024}),/15 MB/);
});
test('guest is warned before opening publish form, and sign-in controls appear',()=>{
 assert.match(html,/id="newListing" disabled/);
 assert.match(html,/id="authNotice"/);
 assert.match(html,/id="authSignIn" href="\/"/);
 assert.match(html,/id="editorAuthLink"/);
 assert.match(app,/if\(!state\.authenticated\)\{updateMarketplaceAuth\('guest'\);return;\}/);
 assert.match(app,/me\.status===401\?'guest':'unavailable'/);
 assert.match(app,/if\(response\.status===401\)\{updateMarketplaceAuth\('guest'\)/);
 assert.match(app,/btn\.disabled=!state\.authenticated/);
});
test('owner delete action remains authenticated, server-owned, and confirmed',()=>{
 const api=read('src/routes/marketplace-v3250.js');
 assert.match(api,/router\.delete\('\/:id'/);
 assert.match(api,/DELETE FROM marketplace_listings WHERE id=\$1 AND seller_id=\$2/);
 assert.match(app,/state\.mode!=='mine'/);
 assert.match(app,/if\(!confirm\(message\)\)return/);
 assert.match(app,/Anuncio eliminado correctamente/);
 assert.match(app,/Eliminar anuncio/);
});
test('version and image preview style are current',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.63');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.63'/);
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.63/);
 assert.match(html,/marketplace-v3250\.css\?v=3\.2\.63/);
 const css=read('public/marketplace-v3250.css');
 assert.match(css,/\.photo-grid/);
 assert.match(css,/\.photo-tile/);
 assert.match(css,/\.auth-notice/);
});
