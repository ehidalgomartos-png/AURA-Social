'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');
const source=fs.readFileSync('public/social.js','utf8');
const read=path=>fs.readFileSync(path,'utf8');
const handler=marketplace.stack.find(layer=>layer.route?.path==='/share-preview/:id')?.route.stack[0].handle;

function mockResponse(){
 return {statusCode:200,body:null,headers:{},
  setHeader(key,value){this.headers[key]=value;return this;},
  status(code){this.statusCode=code;return this;},
  json(body){this.body=body;return this;}};
}
function harness(imageUrl,opts={}){
 const caption={value:'',dispatchEvent(){}};
 const input={files:[],dispatched:[],dispatchEvent(e){this.dispatched.push(e.type);}};
 const hint={classList:{remove(){}}},back={href:''};
 const nodes={'#createForm [name="caption"]':caption,'#mediaFile':input,'#marketShareComposerHintV3269':hint,'#marketShareComposerBackV3269':back};
 const requests=[],fetches=[],messages=[],opened=[];
 class MockFile{constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;}}
 class MockDataTransfer{constructor(){this.files=[];this.items={add:file=>{this.files.push(file);}};}}
 const data={id:77,title:'Armario Turín',priceCents:23500,url:'/marketplace/p/77',imageUrl};
 const context={
  me:{id:8},$:(selector)=>nodes[selector],location:{origin:'https://redlibertad.com'},
  openModal:async(mode)=>opened.push(mode),toast:(msg)=>messages.push(msg),
  api:async(url)=>{requests.push(url);return {r:{ok:true},d:{item:data}};},
  fetch:async(url,options)=>{fetches.push({url,options});return {
   ok:opts.fetchOk!==false,blob:async()=>({type:'image/webp',size:48000})};},
  File:MockFile,DataTransfer:MockDataTransfer,
  Event:class{constructor(type){this.type=type;}}
 };
 const from=source.indexOf('async function prepareMarketplaceCommunityShareV3269(');
 const to=source.indexOf('async function handleInitialDeepLink()',from);
 assert.ok(from>0&&to>from);
 const helper=source.slice(from,to);
 vm.runInNewContext(helper+'\nthis.prepare=prepareMarketplaceCommunityShareV3269;',context);
 return {context,caption,input,requests,fetches,messages,opened,helper};
}
test('main social JavaScript is syntactically valid after photo share hotfix',()=>{
 assert.doesNotThrow(()=>new vm.Script(source,{filename:'public/social.js'}));
 assert.match(source,/if\(\/\^\\\/uploads\\\/\[/);
});
test('share preview sends only safe listing photo and price from visible seller',async()=>{
 const old=db.query,received=[];
 db.query=async(sql,args)=>{received.push({sql,args});return {rowCount:1,rows:[{
  id:77,title:'Armario Turín',price_cents:23500,
  image_urls:['https://evil.invalid/x.png','/uploads/turin.webp']
 }]};};
 const response=mockResponse();
 try{await handler({params:{id:'77'},user:{id:8}},response,err=>{throw err;});}
 finally{db.query=old;}
 assert.equal(response.statusCode,200);
 assert.deepEqual(response.body,{ok:true,item:{
  id:77,title:'Armario Turín',priceCents:23500,imageUrl:'/uploads/turin.webp',url:'/marketplace/p/77'}});
 assert.equal(response.headers['Cache-Control'],'private,no-store');
 assert.equal(received.length,1);
 for(const term of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true","FROM blocks b"]){
  assert.ok(received[0].sql.includes(term));
 }
 assert.doesNotMatch(received[0].sql,/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
});
test('photo is prepared by the normal editable file input; no post is published',async()=>{
 const h=harness('/uploads/turin.webp');
 await h.context.prepare('77');
 assert.deepEqual(h.requests,['/api/marketplace/share-preview/77']);
 assert.equal(h.fetches.length,1);
 assert.equal(h.fetches[0].url,'/uploads/turin.webp');
 assert.equal(h.fetches[0].options.credentials,'same-origin');
 assert.deepEqual(h.opened,['post']);
 assert.equal(h.input.files.length,1);
 assert.equal(h.input.files[0].name,'anuncio-77.webp');
 assert.equal(h.input.files[0].type,'image/webp');
 assert.deepEqual(h.input.dispatched,['change']);
 assert.match(h.caption.value,/Armario Turín/);
 assert.match(h.caption.value,/235,00/);
 assert.match(h.caption.value,/redlibertad\.com\/marketplace\/p\/77/);
 assert.doesNotMatch(h.helper,/\/api\/posts|method:\s*['"]POST['"]/);
});
test('untrusted photo, no photo and unavailable image never trigger automatic publishing',async()=>{
 for(const url of [null,'https://evil.invalid/file.webp','/uploads/../evil.png']){
  const h=harness(url);
  await h.context.prepare('77');
  assert.equal(h.fetches.length,0);
  assert.equal(h.input.files.length,0);
  assert.equal(h.opened.length,1);
 }
 const h=harness('/uploads/turin.webp',{fetchOk:false});
 await h.context.prepare('77');
 assert.equal(h.input.files.length,0);
 assert.match(h.messages.join(' '),/no se pudo adjuntar la foto/);
});
test('image can still be removed or replaced before user confirms publication',()=>{
 assert.match(source,/function clearPostMedia\(\)[\s\S]*?currentFileMedia = null/);
 assert.match(source,/mediaFile'\)\.addEventListener\('change',[\s\S]*?currentFileMedia = null/);
 assert.match(source,/function ensureUpload\(\{reelProgress=null\}=\{\}\)/);
 assert.match(source,/media = await ensureUpload\(kind==='reel'\?\{reelProgress:onReelProgressV3668\}:\{\}\)/);
 assert.match(source,/const \{ r, d \} = await api\('\/api\/posts', \{/);
 assert.match(read('public/app.html'),/Quitar foto o vídeo/);
});
test('public Marketplace CTA remains readable during touch, hover and focus',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-community-link-v3269:hover,/);
 assert.match(css,/\.market-community-link-v3269:active,/);
 assert.match(css,/\.market-community-link-v3269:focus-visible\{background:#07574f;color:#fff/);
 assert.match(css,/\.market-community-link-v3269:visited\{background:#0a7569;color:#fff/);
});
test('hotfix version and asset cache keys are aligned',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.77');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.77'/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.75/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.77\.8/);
 assert.match(read('public/app.html'),/No se publica automáticamente/);
});
