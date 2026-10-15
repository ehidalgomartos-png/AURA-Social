'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const db=require('../src/db');
const routes=require('../src/routes/marketplace-v3250');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('public/social.js');
const route=routes.stack.find(x=>x.route?.path==='/share-preview/:id')?.route.stack[0].handle;
function response(){return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
async function preview(image_urls,found=true){
 const query=db.query,out=response(),calls=[];
 db.query=async(sql,args)=>{calls.push({sql,args});return found?{rowCount:1,rows:[{id:77,title:'Armario blanco',price_cents:23500,image_urls}]}:{rowCount:0,rows:[]};};
 try{await route({params:{id:'77'},user:{id:9}},out,error=>{throw error;});}finally{db.query=query;}
 return {out,calls};
}
function compose(photo='/uploads/armario-77.webp',options={}){
 const start=js.indexOf('async function prepareMarketplaceCommunityShareV3269(');
 const end=js.indexOf('async function handleInitialDeepLink()',start);
 assert.ok(start>0&&end>start);
 const source=js.slice(start,end);
 const caption={value:options.caption||'',dispatchEvent(e){this.event=e.type;}};
 const upload={files:[],dispatchEvent(e){this.event=e.type;}};
 const hint={classList:{removed:[],remove(x){this.removed.push(x);}}},back={href:''};
 const inputs={'#createForm [name="caption"]':caption,'#mediaFile':upload,'#marketShareComposerHintV3269':hint,'#marketShareComposerBackV3269':back};
 const received=[],requested=[],messages=[],opened=[];
 class FakeFile{constructor(chunks,name,opts){this.chunks=chunks;this.name=name;this.type=opts.type;}}
 class FakeDataTransfer{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}}
 const ctx={
  me:{id:9},location:{origin:'https://redlibertad.com'},
  $:key=>inputs[key]||null,
  Event:class{constructor(type){this.type=type;}},
  File:FakeFile,DataTransfer:FakeDataTransfer,
  fetch:async(url,opts)=>{received.push({url,opts});return options.fetchError?{ok:false}:{ok:true,blob:async()=>({type:'image/webp',size:14560})};},
  api:async url=>{requested.push(url);return {r:{ok:true},d:{item:{id:77,title:'Armario blanco',priceCents:23500,url:'/marketplace/p/77',imageUrl:photo}}};},
  openModal:async mode=>opened.push(mode),
  toast:msg=>messages.push(msg)
 };
 vm.runInNewContext(source+'\nthis.prepare=prepareMarketplaceCommunityShareV3269;',ctx);
 return {ctx,source,caption,upload,hint,back,received,requested,opened,messages};
}
test('Marketplace image preview returns only safe local listing images with active seller and listing',async()=>{
 const {out,calls}=await preview(['/uploads/armario-77.webp']);
 assert.equal(out.statusCode,200);
 assert.deepEqual(out.body,{ok:true,item:{id:77,title:'Armario blanco',priceCents:23500,imageUrl:'/uploads/armario-77.webp',url:'/marketplace/p/77'}});
 assert.equal(out.headers['Cache-Control'],'private,no-store');
 for(const piece of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true","FROM blocks b"])assert.ok(calls[0].sql.includes(piece),piece);
 assert.doesNotMatch(calls[0].sql,/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
 const unsafe=await preview(['https://evil.invalid/p.jpg','/uploads/../../secret.jpg']);
 assert.equal(unsafe.out.body.item.imageUrl,null);
 const gone=await preview(['/uploads/armario-77.webp'],false);
 assert.equal(gone.out.statusCode,404);
});
test('pressing Publicar en RedLibertad prepares caption, price and a local photo but does not post',async()=>{
 const c=compose();
 await c.ctx.prepare('77');
 assert.deepEqual(c.opened,['post']);
 assert.deepEqual(c.requested,['/api/marketplace/share-preview/77']);
 assert.equal(c.caption.value,'Mira este anuncio en RedLibertad: Armario blanco · 235,00 €\nhttps://redlibertad.com/marketplace/p/77');
 assert.equal(c.caption.event,'input');
 assert.equal(c.received.length,1);
 assert.equal(c.received[0].url,'/uploads/armario-77.webp');
 assert.equal(c.received[0].opts.credentials,'same-origin');
 assert.equal(c.upload.files.length,1);
 assert.equal(c.upload.files[0].name,'anuncio-77.webp');
 assert.equal(c.upload.files[0].type,'image/webp');
 assert.equal(c.upload.event,'change');
 assert.deepEqual(c.hint.classList.removed,['hidden']);
 assert.equal(c.back.href,'/marketplace/p/77');
 assert.doesNotMatch(c.source,/\/api\/posts|method:\s*['"]POST['"]/);
});
test('malicious or unavailable images cannot be loaded; text link remains editable',async()=>{
 const unsafe=compose('https://evil.invalid/track.webp');
 await unsafe.ctx.prepare('77');
 assert.equal(unsafe.received.length,0);
 assert.equal(unsafe.upload.files.length,0);
 assert.match(unsafe.caption.value,/https:\/\/redlibertad.com\/marketplace\/p\/77/);
 const failed=compose('/uploads/armario-77.webp',{fetchError:true});
 await failed.ctx.prepare('77');
 assert.equal(failed.upload.files.length,0);
 assert.ok(failed.messages.some(m=>m.includes('no se pudo adjuntar')));
 const draft=compose('/uploads/armario-77.webp',{caption:'Ya estoy escribiendo'});
 await draft.ctx.prepare('77');
 assert.equal(draft.received.length,0);
 assert.equal(draft.opened.length,0);
 assert.equal(draft.caption.value,'Ya estoy escribiendo');
});
test('user can remove or replace selected photo through original composer controls',()=>{
 assert.match(js,/function clearPostMedia\(\)[\s\S]{0,300}currentFileMedia = null/);
 assert.match(js,/mediaFile'\)\.addEventListener\('change', e => \{/);
 assert.match(js,/if \(file\) \{[\s\S]{0,180}media = await ensureUpload\(\)/);
 assert.match(read('public/app.html'),/id="removePostMedia"/);
 assert.match(read('public/app.html'),/id="mediaFile"/);
});
test('share button remains legible when tapped or hovered',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-community-link-v3269:hover,[^\n]*\.market-community-link-v3269:active\{background:#07574f;color:#fff/);
 assert.match(css,/\.market-community-link-v3269:focus-visible\{background:#07574f;color:#fff/);
});
test('hotfix version and local media flow are linked consistently',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.70.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.70\.1'/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.70\.1/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.70\.1/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.70\.1/);
});
