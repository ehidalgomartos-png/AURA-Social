const SHELL_CACHE='redlibertad-v196-shell';
const STATIC_CACHE='redlibertad-v196-static';
const CACHE_PREFIX='redlibertad-';

const SHELL_ASSETS=[
  '/',
  '/app',
  '/styles.css',
  '/social.css',
  '/creator-ops.css',
  '/app.js',
  '/social.js',
  '/creator-ops.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/assets/logo-mark.svg',
  '/assets/favicon.svg',
  '/icons/redlibertad-192.png',
  '/icons/redlibertad-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache=>cache.addAll(SHELL_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(key=>key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE,STATIC_CACHE].includes(key))
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

function shouldBypass(url,request){
  if(request.method!=='GET')return true;
  if(url.origin!==self.location.origin)return true;
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/p/')
  );
}

function isStaticAsset(url,request){
  if(['style','script','image','font'].includes(request.destination))return true;
  return /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|webmanifest)$/i.test(url.pathname);
}

async function fetchWithTimeout(request,timeoutMs=10000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(request,{signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function networkFirstNavigation(request,url){
  try{
    const response=await fetchWithTimeout(request,8000);
    if(response.ok && response.type==='basic'){
      const cache=await caches.open(SHELL_CACHE);
      cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }catch(_){
    const exact=await caches.match(request);
    if(exact)return exact;
    if(url.pathname.startsWith('/app'))return (await caches.match('/app')) || (await caches.match('/'));
    return (await caches.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(STATIC_CACHE);
  const cached=await cache.match(request);
  const network=fetchWithTimeout(request,10000)
    .then(response=>{
      if(response.ok && response.type==='basic'){
        cache.put(request,response.clone()).catch(()=>{});
      }
      return response;
    })
    .catch(()=>null);

  if(cached){
    network.catch(()=>{});
    return cached;
  }

  return (await network) || Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(shouldBypass(url,request))return;

  if(request.mode==='navigate'){
    event.respondWith(networkFirstNavigation(request,url));
    return;
  }

  if(isStaticAsset(url,request)){
    event.respondWith(staleWhileRevalidate(request));
  }
});


self.addEventListener('push',event=>{
  let payload={};
  try{
    payload=event.data ? event.data.json() : {};
  }catch(_){
    payload={body:event.data?.text?.() || ''};
  }

  const title=String(payload.title || 'RedLibertad');
  const options={
    body:String(payload.body || 'Tienes actividad nueva en RedLibertad.'),
    icon:'/icons/redlibertad-192.png',
    badge:'/icons/redlibertad-192.png',
    tag:payload.notificationId ? `redlibertad-${payload.notificationId}` : 'redlibertad-activity',
    renotify:false,
    data:{
      url:String(payload.url || '/app?view=notifications'),
      notificationId:payload.notificationId || null,
      type:payload.type || null
    }
  };

  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url || '/app',self.location.origin).href;

  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===self.location.origin){
        try{
          await client.navigate(target);
        }catch(_){}
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
