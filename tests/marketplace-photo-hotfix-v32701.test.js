'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const social=read('public/social.js');
const start=social.indexOf('async function prepareMarketplaceCommunityShareV3269(');
const end=social.indexOf('async function handleInitialDeepLink()',start);
const helper=social.slice(start,end);
function simulate({url='/uploads/armario.webp',selected=false,busy=false}={}){
 const caption={value:'',changes:0,dispatchEvent(){this.changes++;}};
 const input={files:selected?[{name:'elegida.jpg'}]:[],changes:0,dispatchEvent(){this.changes++;}};
 const ui={'#createForm [name="caption"]':caption,'#mediaFile':input,
  '#marketShareComposerHintV3269':{classList:{remove(){}}},
  '#marketShareComposerBackV3269':{href:''}};
 const events={fetches:[],api:[],modal:[],toasts:[],posted:[]};
 const ctx={me:{id:6},location:{origin:'https://redlibertad.com'},
  currentFileMedia:busy?{url:'/uploads/existing.webp'}:null,
  $:s=>ui[s],toast:s=>events.toasts.push(s),
  api:async path=>{events.api.push(path);return {r:{ok:true},d:{item:{
   id:77,title:'Armario Turín blanco',priceCents:23500,url:'/marketplace/p/77',imageUrl:url
  }}};},
  openModal:async mode=>events.modal.push(mode),
  fetch:async value=>{events.fetches.push(value);return {ok:true,blob:async()=>({type:'image/webp',size:1000})};},
  File:class{constructor(blobs,name,opts){this.name=name;this.type=opts.type;this.blobs=blobs;}},
  DataTransfer:class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}},
  Event:class{constructor(type){this.type=type;}}};
 vm.runInNewContext(helper+'\nthis.share=prepareMarketplaceCommunityShareV3269;',ctx);
 return {ctx,input,caption,events};
}
test('full social JavaScript compiles after repair',()=>{
 assert.doesNotThrow(()=>new Function(social));
 assert.match(social,/const safePhoto=photoName\.length>=5/);
});
test('photo and product text are prefilled in the existing editor without publishing',async()=>{
 const x=simulate();
 await x.ctx.share('77');
 assert.deepEqual(x.events.api,['/api/marketplace/share-preview/77']);
 assert.deepEqual(x.events.modal,['post']);
 assert.equal(x.events.fetches[0],'/uploads/armario.webp');
 assert.equal(x.input.files.length,1);
 assert.equal(x.input.files[0].name,'anuncio-77.webp');
 assert.equal(x.input.files[0].type,'image/webp');
 assert.equal(x.input.changes,1);
 assert.match(x.caption.value,/Armario Turín blanco/);
 assert.match(x.caption.value,/235,00/);
 assert.match(x.caption.value,/https:\/\/redlibertad.com\/marketplace\/p\/77/);
 assert.equal(x.events.posted.length,0);
 assert.doesNotMatch(helper,/\/api\/posts|method:\s*['"]POST['"]/);
});
test('an existing user-selected photo or uploaded media is never replaced',async()=>{
 const original=simulate({selected:true});
 await original.ctx.share('77');
 assert.equal(original.input.files[0].name,'elegida.jpg');
 assert.equal(original.input.changes,0);
 const busy=simulate({busy:true});
 await busy.ctx.share('77');
 assert.equal(busy.input.files.length,0);
 assert.equal(busy.ctx.currentFileMedia.url,'/uploads/existing.webp');
});
test('external URL and unsafe image path are rejected before fetch',async()=>{
 for(const url of ['https://example.org/evil.jpg','/uploads/../secret.jpg','/uploads/photo.svg','/marketplace/imagen/77/0']){
  const x=simulate({url});
  await x.ctx.share('77');
  assert.deepEqual(x.events.fetches,[]);
  assert.equal(x.input.files.length,0);
  assert.match(x.caption.value,/Armario Turín blanco/);
 }
});
test('the post button uses the existing manual upload and remove mechanisms',()=>{
 assert.match(social,/if \(file\) \{\s*msg\.textContent = 'Subiendo archivo/);
 assert.match(social,/media = await ensureUpload\(\)/);
 assert.match(social,/function clearPostMedia\(\)[\s\S]*?currentFileMedia = null/);
 assert.match(social,/removePostMedia'\)\?\.addEventListener\('click', clearPostMedia\)/);
 assert.match(read('public/app.html'),/Quitar foto o vídeo/);
});
test('community share button remains white-on-dark on hover, active and focus',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-community-link-v3269:hover,/);
 assert.match(css,/\.market-community-link-v3269:active,/);
 assert.match(css,/\.market-community-link-v3269:focus-visible\{background:#07574f;color:#fff/);
});
test('release, cache and feature gates are aligned',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.70.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.70\.1'/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.70\.1/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.70\.1/);
 const api=read('src/routes/marketplace-v3250.js');
 for(const bit of ["l.status='active'","l.moderation_status='published'","u.discoverable=true",'FROM blocks b'])assert.ok(api.includes(bit));
});

