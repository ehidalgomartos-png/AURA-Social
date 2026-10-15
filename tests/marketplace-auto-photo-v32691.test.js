'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');
const read=p=>fs.readFileSync(p,'utf8');
const social=read('public/social.js');
const preview=marketplace.stack.find(layer=>layer.route?.path==='/share-preview/:id')?.route.stack[0].handle;
function response(){return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(x){this.statusCode=x;return this;},json(x){this.body=x;return this;}};}
async function previewListing(image_urls,valid=true){
 const old=db.query,ret=response(),requests=[];
 db.query=async(sql,args)=>{requests.push({sql,args});return valid?{rowCount:1,rows:[{id:77,title:'Armario Turín blanco',image_urls}]}:{rowCount:0,rows:[]};};
 try{await preview({params:{id:'77'},user:{id:6}},ret,e=>{throw e;});}finally{db.query=old;}
 return {response:ret,requests};
}
function communityHarness(imageUrl,opts={}){
 const caption={value:opts.caption||'',events:[],dispatchEvent(e){this.events.push(e.type);}};
 const upload={files:opts.uploaded?[{name:'my-photo.jpg'}]:[],value:''};
 function cl(){return {removed:[],added:[],add(x){this.added.push(x);},remove(x){this.removed.push(x);}};}
 const mediaPreview={items:[],classList:cl(),replaceChildren(...items){this.items=items;}};
 const uploadText={classList:cl()},removeButton={classList:cl()},hint={classList:cl()},back={href:''};
 const selectors={
  '#createForm [name="caption"]':caption,
  '#marketShareComposerHintV3269':hint,
  '#marketShareComposerBackV3269':back,
  '#preview':mediaPreview,
  '#mediaFile':upload,
  '#uploadText':uploadText,
  '#removePostMedia':removeButton
 };
 const requests=[],opens=[],toasts=[];
 const ctx={
  me:{id:2},location:{origin:'https://redlibertad.com'},currentFileMedia:opts.currentFileMedia||null,
  document:{createElement:type=>({type,src:'',alt:''})},Event:class{constructor(type){this.type=type;}},
  $:s=>selectors[s],openModal:async mode=>{opens.push(mode);},toast:m=>toasts.push(m),
  api:async url=>{requests.push(url);return opts.ok===false?{r:{ok:false},d:{}}:
   {r:{ok:true},d:{item:{id:77,title:'Armario Turín blanco',url:'/marketplace/p/77',imageUrl}}};}
 };
 const start=social.indexOf('async function prepareMarketplaceCommunityShareV3269(');
 const end=social.indexOf('async function handleInitialDeepLink()',start);
 assert.ok(start>0&&end>start);
 vm.runInNewContext(social.slice(start,end)+'\nthis.share=prepareMarketplaceCommunityShareV3269;',ctx);
 return {ctx,caption,mediaPreview,upload,uploadText,removeButton,hint,back,requests,opens,toasts};
}
test('safe public photo is linked to the same advertised listing and only while publicly available',async()=>{
 const image='/uploads/armario-turin-77.webp';
 const {response:r,requests}=await previewListing([image]);
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.body,{ok:true,item:{id:77,title:'Armario Turín blanco',url:'/marketplace/p/77',imageUrl:'/marketplace/imagen/77/0'}});
 assert.equal(r.headers['Cache-Control'],'private,no-store');
 assert.match(requests[0].sql,/l.image_urls/);
 for(const q of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true","FROM blocks b"])assert.ok(requests[0].sql.includes(q));
 assert.doesNotMatch(requests[0].sql,/INSERT|UPDATE|DELETE/);
 const gated=read('src/routes/marketplace-seo-v3251.js');
 assert.match(gated,/router.get\('\/marketplace\/imagen\/:id\/:index'/);
 assert.match(gated,/if\(!eligible\(row\)\)return res.sendStatus\(404\)/);
});
test('unsafe paths are ignored and a safe later image index is selected without leaking URLs',async()=>{
 const r=await previewListing(['https://evil.invalid/remote.jpg','/uploads/armario-2.png','/uploads/%2e%2e.jpg']);
 assert.equal(r.response.body.item.imageUrl,'/marketplace/imagen/77/1');
 for(const values of [[],['https://evil.invalid/t.jpg'],['/uploads/../private.png']]){
  const result=await previewListing(values);
  assert.equal(result.response.body.item.imageUrl,null);
 }
 const gone=await previewListing(['/uploads/photo.jpg'],false);
 assert.equal(gone.response.statusCode,404);
 assert.equal(gone.response.body.error,'listing_not_available');
});
test('the existing publication composer shows the photo and prepares a media reference without uploading or publishing',async()=>{
 const h=communityHarness('/marketplace/imagen/77/0');
 await h.ctx.share('77');
 assert.deepEqual(h.requests,['/api/marketplace/share-preview/77']);
 assert.deepEqual(h.opens,['post']);
 assert.equal(h.caption.value,'Mira este anuncio en RedLibertad: Armario Turín blanco\nhttps://redlibertad.com/marketplace/p/77');
 assert.equal(h.mediaPreview.items.length,1);
 assert.equal(h.mediaPreview.items[0].src,'/marketplace/imagen/77/0');
 assert.match(h.mediaPreview.items[0].alt,/Foto principal/);
 assert.ok(h.mediaPreview.classList.removed.includes('hidden'));
 assert.ok(h.uploadText.classList.added.includes('hidden'));
 assert.ok(h.removeButton.classList.removed.includes('hidden'));
 assert.equal(h.ctx.currentFileMedia.url,'/marketplace/imagen/77/0');
 assert.equal(h.ctx.currentFileMedia.mediaType,'image');
 assert.equal(h.ctx.currentFileMedia.provider,'local');
 assert.ok(h.hint.classList.removed.includes('hidden'));
 assert.equal(h.back.href,'/marketplace/p/77');
});
test('listing without a photo, untrusted image route, and existing user upload never create or replace a media attachment',async()=>{
 for(const url of [null,'https://evil.invalid/photo.webp','/marketplace/imagen/78/0','/marketplace/imagen/77/9']){
  const h=communityHarness(url);
  await h.ctx.share('77');
  assert.equal(h.ctx.currentFileMedia,null);
  assert.equal(h.mediaPreview.items.length,0);
  assert.equal(h.caption.value.startsWith('Mira este anuncio'),true);
 }
 const uploaded=communityHarness('/marketplace/imagen/77/0',{uploaded:true});
 await uploaded.ctx.share('77');
 assert.equal(uploaded.ctx.currentFileMedia,null);
 assert.equal(uploaded.mediaPreview.items.length,0);
 const preserved={url:'/uploads/my-photo.jpg',mediaType:'image',provider:'local'};
 const existing=communityHarness('/marketplace/imagen/77/0',{currentFileMedia:preserved});
 await existing.ctx.share('77');
 assert.equal(existing.ctx.currentFileMedia,preserved);
});
test('removal and user-selected replacement use current composer safeguards; publish is explicit',()=>{
 assert.match(social,/if \(file \|\| currentFileMedia\)/);
 assert.match(social,/if \(currentFileMedia\) return currentFileMedia/);
 assert.match(social,/media = await ensureUpload\(\)/);
 assert.match(social,/mediaUrl: media\?\.url \|\| ''/);
 assert.match(social,/router\.post/); // no producer in share helper; full text may contain unrelated routes
 const start=social.indexOf('async function prepareMarketplaceCommunityShareV3269('),end=social.indexOf('async function handleInitialDeepLink()',start);
 const helper=social.slice(start,end);
 assert.doesNotMatch(helper,/\/api\/posts|method:\s*['"]POST['"]/);
 assert.match(social,/function clearPostMedia\(\)[\s\S]*?currentFileMedia = null/);
 assert.match(social,/mediaFile'\)\.addEventListener\('change',[\s\S]*?currentFileMedia = null/);
 assert.match(read('public/app.html'),/Quitar foto o vídeo/);
});
test('the share button keeps white-on-dark contrast when hovered, pressed and keyboard focused',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-community-link-v3269:hover,[^\n]*\.market-community-link-v3269:active\{background:#07574f;color:#fff/);
 assert.match(css,/\.market-community-link-v3269:focus-visible\{background:#07574f;color:#fff/);
 assert.match(read('public/social.css'),/\.preview img\[src\^="\/marketplace\/imagen\/"\]/);
});
test('hotfix release caches and existing marketplace product data remain untouched',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.69.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.69\.1'/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.69\.1/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.69\.1/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.69\.1/);
 assert.match(read('public/app.html'),/No se publica automáticamente/);
 assert.match(read('public/manifest.webmanifest'),/"id": "\/app"/);
});

