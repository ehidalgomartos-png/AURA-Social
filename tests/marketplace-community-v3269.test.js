'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const db=require('../src/db');
const marketplace=require('../src/routes/marketplace-v3250');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const social=read('public/social.js'),login=read('public/app.js'),auth=read('src/routes/auth.js');
const preview=marketplace.stack.find(x=>x.route?.path==='/share-preview/:id')?.route.stack[0].handle;
const listing={
 id:31,title:'Armario Turín blanco',kind:'product',deal:'sale',city:'Valencia',description:'Armario de 3 puertas, con dos cajones.',
 category:'Hogar y muebles',details:{province:'Valencia',saleScope:'national'},image_urls:[],price_cents:23500,
 seller_username:'tienda',seller_name:'Tienda',status:'active',moderation_status:'published',
 seller_status:'active',seller_discoverable:true,created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z'
};
function res(){
 return {statusCode:200,body:null,headers:{},
  setHeader(n,v){this.headers[n]=v;return this;},status(n){this.statusCode=n;return this;},
  json(v){this.body=v;return this;}
 };
}
test('share preview is a read-only authenticated route with public-only visibility and block filter',async()=>{
 assert.equal(typeof preview,'function');
 assert.ok(marketplace.stack.some(x=>x.handle?.name==='requireAuth'||String(x.handle).includes('requireAuth')));
 const existing=db.query,requests=[],response=res();
 db.query=async(sql,args)=>{requests.push({sql,args});return {rowCount:1,rows:[{id:31,title:'Armario Turín blanco',price_cents:23500,image_urls:[]}]};};
 try{await preview({params:{id:'31'},user:{id:8}},response,e=>{throw e;});}
 finally{db.query=existing;}
 assert.equal(response.statusCode,200);
 assert.deepEqual(response.body,{ok:true,item:{id:31,title:'Armario Turín blanco',priceCents:23500,imageUrl:null,url:'/marketplace/p/31'}});
 assert.equal(response.headers['Cache-Control'],'private,no-store');
 assert.equal(requests.length,1);
 assert.deepEqual(requests[0].args,['31',8]);
 for(const term of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true","FROM blocks b","LIMIT 1"])assert.ok(requests[0].sql.includes(term),term);
 assert.doesNotMatch(requests[0].sql,/INSERT|UPDATE|DELETE/);
});
test('unavailable and invalid listings never produce share previews',async()=>{
 const original=db.query;
 const invalid=res(),gone=res();
 let calls=0;
 db.query=async()=>{calls++;return {rowCount:0,rows:[]};};
 try{
  await preview({params:{id:'../../secret'},user:{id:8}},invalid,e=>{throw e;});
  await preview({params:{id:'77'},user:{id:8}},gone,e=>{throw e;});
 }finally{db.query=original;}
 assert.equal(invalid.statusCode,400);
 assert.equal(gone.statusCode,404);
 assert.equal(calls,1);
 assert.deepEqual(gone.body,{error:'listing_not_available'});
});
test('public listing, signed-in cards and post-save UI offer explicit community share links only for eligible ads',()=>{
 const html=seo.listingHtml(listing);
 assert.match(html,/compartirAnuncio=31/);
 assert.match(html,/Publicar en RedLibertad/);
 assert.match(html,/Consultar al vendedor/);
 const ui=read('public/marketplace-v3250.js');
 assert.match(ui,/publicOK\?'<button type="button" data-share=/);
 assert.match(ui,/market-community-link-v3269/);
 assert.match(ui,/showPublishShare\(id,title\)/);
 assert.match(ui,/data-copy-published/);
 assert.match(read('public/app.html'),/marketShareComposerHintV3269/);
});
test('login and registration return paths are allowlisted and tied to the same listing ID',()=>{
 const start=login.indexOf('function validPublicEntry('),end=login.indexOf('function loadPublicEntry()',start);
 assert.ok(start>0&&end>start);
 const context={};vm.runInNewContext(login.slice(start,end)+'\nthis.validate=validPublicEntry;',context);
 const valid=context.validate({type:'marketplace_share',key:'31',path:'/app?view=feed&compartirAnuncio=31'});
 assert.equal(valid?.path,'/app?view=feed&compartirAnuncio=31');
 for(const bad of [
  {type:'marketplace_share',key:'31',path:'/app?view=feed&compartirAnuncio=32'},
  {type:'marketplace_share',key:'31',path:'https://evil.invalid/app'},
  {type:'marketplace_share',key:'bad',path:'/app?view=feed&compartirAnuncio=31'},
  {type:'marketplace_share',key:'31',path:'/app?view=feed&compartirAnuncio=31&external=https://evil.invalid'}
 ])assert.equal(context.validate(bad),null);
 assert.match(auth,/marketplace_share:\/\^\\\/app/);
 assert.match(auth,/if\(type==='marketplace_share'&&!path.endsWith\('compartirAnuncio='\+key\)\)return null/);
});
test('editor prefill only follows successful public preview and never calls the post creation API',async()=>{
 const start=social.indexOf('async function prepareMarketplaceCommunityShareV3269(');
 const end=social.indexOf('async function handleInitialDeepLink()',start);
 assert.ok(start>0&&end>start);
 const helper=social.slice(start,end);
 const caption={value:'',events:[],dispatchEvent(e){this.events.push(e.type);}};
 const hint={classList:{removed:[],remove(x){this.removed.push(x);}}},back={href:''};
 const requests=[],toasts=[],opens=[];
 const selectors={'#createForm [name="caption"]':caption,'#marketShareComposerHintV3269':hint,'#marketShareComposerBackV3269':back};
 const ctx={me:{id:1},location:{origin:'https://redlibertad.com'},
  $:s=>selectors[s],api:async path=>{requests.push(path);return {r:{ok:true},d:{item:{id:31,title:'Armario Turín blanco',url:'/marketplace/p/31'}}};},
  openModal:async mode=>{opens.push(mode);},toast:s=>toasts.push(s),Event:class{constructor(type){this.type=type;}}};
 vm.runInNewContext(helper+'\nthis.share=prepareMarketplaceCommunityShareV3269;',ctx);
 await ctx.share('31');
 assert.deepEqual(requests,['/api/marketplace/share-preview/31']);
 assert.deepEqual(opens,['post']);
 assert.equal(caption.value,'Mira este anuncio en RedLibertad: Armario Turín blanco\nhttps://redlibertad.com/marketplace/p/31');
 assert.deepEqual(caption.events,['input']);
 assert.equal(back.href,'/marketplace/p/31');
 assert.ok(hint.classList.removed.includes('hidden'));
 assert.doesNotMatch(helper,/\/api\/posts|method:\s*'POST'/);
 await ctx.share('31');
 assert.equal(requests.length,1);
 assert.equal(opens.length,1);
 assert.ok(toasts.length);
});
test('safety on unavailable listing leaves the composer untouched',async()=>{
 const start=social.indexOf('async function prepareMarketplaceCommunityShareV3269('),end=social.indexOf('async function handleInitialDeepLink()',start);
 const caption={value:'',dispatchEvent(){}},calls=[];
 const ctx={me:{id:1},location:{origin:'https://redlibertad.com'},
  $:s=>s==='#createForm [name="caption"]'?caption:null,
  api:async()=>({r:{ok:false,status:404},d:{error:'listing_not_available'}}),
  openModal:async()=>calls.push('opened'),toast:()=>calls.push('error')};
 vm.runInNewContext(social.slice(start,end)+'\nthis.share=prepareMarketplaceCommunityShareV3269;',ctx);
 await ctx.share('31');
 await ctx.share('bad-id');
 assert.equal(caption.value,'');
 assert.deepEqual(calls,['error']);
});
test('release wiring and media safety are intact',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.73');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.73'/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.73/);
 assert.match(read('public/index.html'),/app\.js\?v=3\.2\.73/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.73/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.73/);
 assert.match(read('public/manifest.webmanifest'),/"id": "\/app"/);
 assert.match(read('public/marketplace.html'),/marketSellerTools/);
});

