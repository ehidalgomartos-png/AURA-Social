'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {staticCacheHeader,setPerformanceHeaders,setUploadHeaders}=require('../src/services/performance-headers');

const root=path.resolve(__dirname,'..');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const social=fs.readFileSync(path.join(root,'public/social.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const origin='https://redlibertad.com';

function key(req){
  return typeof req==='string'?req:req.url;
}
function fakeCache(){
  const entries=new Map();
  return {
    entries,
    put:async(request,response)=>{entries.set(key(request),response);},
    match:async request=>entries.get(key(request))||null,
    keys:async()=>[...entries.keys()],
    delete:async request=>entries.delete(key(request)),
    addAll:async arr=>{for(const uri of arr)entries.set(uri,{ok:true});}
  };
}
function makeWorker(fetchImpl=async()=>({ok:true,type:'basic',clone(){return this;}})){
  const stores=new Map(),callbacks={};
  const caches={
    open:async name=>{
      if(!stores.has(name))stores.set(name,fakeCache());
      return stores.get(name);
    },
    keys:async()=>[...stores.keys()],
    delete:async name=>stores.delete(name),
    match:async req=>{
      for(const cache of stores.values()){
        const found=await cache.match(req);if(found)return found;
      }
      return null;
    }
  };
  const sandbox={
    URL,AbortController,setTimeout,clearTimeout,console,caches,
    Response:{error:()=>({ok:false,type:'error'})},
    self:{location:{origin},addEventListener:(name,fn)=>{callbacks[name]=fn;},skipWaiting:()=>{},clients:{claim:()=>{}}},
    fetch:fetchImpl
  };
  const script=worker.slice(0,worker.indexOf("self.addEventListener('push'"));
  assert.ok(script.length>2000,'must preserve worker push integration');
  const api=vm.runInNewContext(script+'\n;({shouldBypass,isStaticAsset,trimStaticCache,networkFirstAsset,networkFirstNavigation})',sandbox);
  return {...api,caches,stores,callbacks};
}
function request(uri,opts={}){
  return {url:origin+uri,method:'GET',mode:'same-origin',destination:'',headers:{has:()=>false},...opts};
}

test('PWA never caches account, admin, API, uploads or byte-range video requests',()=>{
  const sw=makeWorker();
  for(const uri of ['/api/auth/account','/api/posts/feed','/uploads/private.mp4','/p/12','/admin','/admin-recovery']){
    assert.equal(sw.shouldBypass(new URL(origin+uri),request(uri)),true,uri);
  }
  assert.equal(sw.shouldBypass(new URL(origin+'/video.mp4'),request('/video.mp4',{headers:{has:k=>k==='range'}})),true);
  assert.equal(sw.shouldBypass(new URL(origin+'/assets/f.mp4'),request('/assets/f.mp4',{destination:'video'})),true);
  assert.equal(sw.shouldBypass(new URL('https://external.example/avatar.png'),request('/assets/a.png')),true);
  assert.equal(sw.shouldBypass(new URL(origin+'/app'),request('/app',{method:'POST'})),true);
});
test('only trusted static assets enter the PWA cache',()=>{
  const sw=makeWorker();
  for(const uri of ['/social.js','/styles.css','/assets/logo-mark.svg','/icons/redlibertad-192.png','/manifest.webmanifest']){
    assert.equal(sw.isStaticAsset(new URL(origin+uri),request(uri)),true,uri);
  }
  for(const uri of ['/private/export.csv','/uploads/avatar.png','/api/health','/p/123','/app']){
    assert.equal(sw.isStaticAsset(new URL(origin+uri),request(uri)),false,uri);
  }
});
test('static cache is bounded by size, evicting oldest entries',async()=>{
  const sw=makeWorker(),cache=fakeCache();
  for(let i=0;i<80;i++)await cache.put('/assets/img-'+i+'.png',{ok:true});
  await sw.trimStaticCache(cache);
  assert.equal(cache.entries.size,64);
  assert.equal(cache.entries.has('/assets/img-0.png'),false);
  assert.equal(cache.entries.has('/assets/img-79.png'),true);
});
test('mutable styles and scripts prefer current network response',async()=>{
  const fresh={ok:true,type:'basic',version:'fresh',clone(){return this;}};
  const sw=makeWorker(async()=>fresh);
  const cache=await sw.caches.open('redlibertad-v2120-static');
  await cache.put(request('/social.js'),{version:'old'});
  const result=await sw.networkFirstAsset(request('/social.js'));
  assert.equal(result.version,'fresh');
  assert.equal((await cache.match(request('/social.js'))).version,'fresh');
});
test('mutable scripts keep offline fallback without API response caching',async()=>{
  const sw=makeWorker(async()=>{throw Error('offline')});
  const cache=await sw.caches.open('redlibertad-v2120-static');
  await cache.put(request('/social.js'),{version:'offline'});
  const result=await sw.networkFirstAsset(request('/social.js'));
  assert.equal(result.version,'offline');
});
test('navigation cache removes query parameters and never stores non-shell pages',async()=>{
  const response={ok:true,type:'basic',clone(){return this;}};
  const sw=makeWorker(async()=>response);
  const shell=await sw.caches.open('redlibertad-v2120-shell');
  await sw.networkFirstNavigation(request('/app?view=messages'),new URL(origin+'/app?view=messages'));
  await sw.networkFirstNavigation(request('/privacy/'),new URL(origin+'/privacy/'));
  assert.equal(shell.entries.has('/app'),true);
  assert.equal(shell.entries.has('/app?view=messages'),false);
  assert.equal(shell.entries.has('/privacy/'),false);
});
test('HTTP cache policy revalidates mutable code and protects uploads',()=>{
  assert.equal(staticCacheHeader('/srv/public/social.js'),'public, max-age=0, must-revalidate');
  assert.equal(staticCacheHeader('/srv/public/sw.js'),'no-cache');
  assert.equal(staticCacheHeader('/srv/public/app.html'),'no-cache');
  assert.match(staticCacheHeader('/srv/public/assets/logo-mark.svg'),/max-age=86400/);
  const headers={};
  const res={setHeader:(name,value)=>{headers[name]=value;}};
  setPerformanceHeaders(res,'/srv/public/social.css');
  assert.match(headers['Cache-Control'],/must-revalidate/);
  setUploadHeaders(res);
  assert.match(headers['Cache-Control'],/^private, max-age=3600/);
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
});
test('first feed picture is prioritized; offscreen video avoids eager downloads',()=>{
  const start=social.indexOf('function mediaHTML(p, compact = false, priority = false) {');
  const end=social.indexOf('function profileLink(',start);
  assert.ok(start>=0&&end>start);
  const media=new Function('esc','gateText',social.slice(start,end)+'\nreturn mediaHTML;')(
    value=>String(value),()=>''
  );
  const image={media_type:'image',media_url:'/uploads/image.jpg',username:'demo'};
  const video={media_type:'video',media_url:'/uploads/video.mp4'};
  assert.match(media(image,false,true),/loading="eager" fetchpriority="high"/);
  assert.match(media(image),/loading="lazy" fetchpriority="auto"/);
  assert.match(media(video),/preload="none"/);
  assert.match(media(video,false,true),/preload="metadata"/);
  assert.match(social,/posts\.map\(\(post,index\)=>postHTML\(post,\{priorityMedia:index===0\}\)\)/);
});
test('existing push handlers and offline shell remain available',()=>{
  const sw=makeWorker();
  assert.match(worker,/self\.addEventListener\('push'/);
  assert.match(worker,/self\.addEventListener\('notificationclick'/);
  assert.ok(sw.callbacks.install);
  assert.ok(sw.callbacks.activate);
  assert.ok(sw.callbacks.fetch);
});
test('server uses performance headers, retains range-capable static delivery and version',()=>{
  assert.match(server,/const APP_VERSION='2\.12\.0'/);
  assert.match(server,/app\.use\('\/uploads', express\.static\(UPLOAD_DIR/);
  assert.match(server,/setHeaders: setUploadHeaders/);
  assert.match(server,/setHeaders: setPerformanceHeaders/);
});
