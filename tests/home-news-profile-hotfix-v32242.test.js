'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const mixer=require('../public/editorial-interleave-v3224.js');

function entryDestination(type,key,sourcePath,serverPath=''){
  const script=read('public/app.js');
  const start=script.indexOf('function finishPublicEntry(');
  const end=script.indexOf('function registrationValidationMessage(',start);
  assert.ok(start>=0&&end>start);
  let cleared=false;
  const sandbox={
    publicEntry:{type,key,path:sourcePath},
    PUBLIC_ENTRY_STORAGE:'redlibertad-public-entry-v188',
    sessionStorage:{removeItem:()=>{cleared=true}},
    location:{href:'/'},
    encodeURIComponent
  };
  vm.runInNewContext(script.slice(start,end)+'\nfinishPublicEntry('+JSON.stringify(serverPath)+');',sandbox);
  return {destination:sandbox.location.href,cleared};
}
test('successful public profile login enters the authenticated profile view, not the public SEO page',()=>{
  const result=entryDestination('profile','redlibertad','/perfil/redlibertad');
  assert.equal(result.destination,'/app?profile=redlibertad');
  assert.equal(result.cleared,true);
});
test('public entry redirects preserve safe non-profile destinations and reject mismatching signup returns',()=>{
  assert.equal(entryDestination('post','42','/p/42').destination,'/p/42');
  assert.equal(entryDestination('profile','redlibertad','/perfil/redlibertad','/p/42').destination,'/app');
  assert.ok(read('public/social.js').includes("const profile = params.get('profile')"));
  assert.ok(read('public/social.js').includes('await openPublicProfile(profile)'));
});

function makeElement(tag='div'){
  return {
    tagName:tag,className:'',dataset:{},textContent:'',href:'',children:[],
    setAttribute(){},
    append(...items){this.children.push(...items)}
  };
}
async function homepage({ids=['1','2','3'],previous=[],mode='foryou',posts=6}={}){
  const inserted=[];
  const postItems=Array.from({length:posts},(_,idx)=>({
    index:idx,
    classList:{contains:v=>v==='post'},
    after:card=>{inserted.push({after:idx+1,id:card.dataset.editorialNewsId})}
  }));
  const feed={
    children:postItems,
    getAttribute:()=>null,
    querySelector:()=>inserted.length ? inserted[0]:null
  };
  const legacy={hidden:false,classList:{add(){}}};
  const listing={replaceChildren(){}};
  const events={};
  let memory=JSON.stringify(previous);
  const document={
    getElementById:id=>({editorialHomeBlock:legacy,editorialHomeItems:listing,feed})[id]||null,
    querySelector:()=>({dataset:{mode},classList:{contains:()=>true}}),
    createElement:tag=>makeElement(tag),
    addEventListener:(name,handler)=>{events[name]=handler},
    hidden:false
  };
  const responseItems=ids.map(id=>({
    id,title:'Noticia '+id,summary:'Contenido revisado '+id,
    source_name:'Fuente editorial',category:'Actualidad'
  }));
  const sandbox={
    document,window:{RedLibertadNewsMixV3224:mixer},
    sessionStorage:{getItem:()=>memory,setItem:(_k,v)=>{memory=v}},
    fetch:async()=>({ok:true,json:async()=>({items:responseItems})}),
    encodeURIComponent
  };
  const script=read('public/editorial-home-v324.js');
  vm.runInNewContext(script,sandbox);
  await new Promise(resolve=>setImmediate(resolve));
  return {inserted,memory:()=>JSON.parse(memory),resetFeed:()=>{inserted.length=0},update:()=>events['redlibertad:feed-updated']({detail:{mode}})};
}
test('fully seen editorial items restart rotation instead of disappearing from Inicio',async()=>{
  const h=await homepage({previous:['1','2','3']});
  assert.deepEqual(h.inserted.map(e=>e.after),[2,4,6]);
  assert.deepEqual(h.inserted.map(e=>e.id),['1','2','3']);
  assert.deepEqual(h.memory(),['1','2','3']);
  h.resetFeed();
  h.update();
  assert.deepEqual(h.inserted.map(e=>e.id),['1','2','3']);
});
test('new articles are preferred and every item appears at most once per feed render',async()=>{
  const h=await homepage({ids:['1','2','3','4'],previous:['1','2'],posts:6});
  assert.deepEqual(h.inserted.map(e=>e.id),['3','4']);
  assert.equal(new Set(h.inserted.map(e=>e.id)).size,h.inserted.length);
});
test('news never appears in Siguiendo, Cercanas or VIP or without reviewed news',async()=>{
  for(const mode of ['following','close','vip']){
    const h=await homepage({mode});
    assert.equal(h.inserted.length,0,mode);
  }
  const none=await homepage({ids:[]});
  assert.equal(none.inserted.length,0);
});
test('reviewed-only discovery has a bigger rotation pool but keeps max 3 cards in each feed',()=>{
  const route=read('src/routes/editorial-social-v324.js');
  assert.match(route,/WHERE p\.unpublished_at IS NULL AND ep\.status='ready' ORDER BY p\.published_at DESC,p\.id DESC LIMIT 12/);
  assert.deepEqual(mixer.slots(10,12,3),[2,4,6]);
});
test('release versions and cache busters point to the new hotfix assets',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.24+polish.3');
  assert.ok(read('server.js').includes("APP_VERSION='3.2.24.3'"));
  assert.ok(read('public/index.html').includes('/app.js?v=3.2.24.2'));
  assert.ok(read('public/app.html').includes('/editorial-home-v324.js?v=3.2.24.2'));
});
