'use strict';
const SHELL_CACHE='redlibertad-v3400-shell';
const STATIC_CACHE='redlibertad-v3400-static';
const CACHE_PREFIX='redlibertad-';
const MAX_STATIC_ENTRIES=64;

const SHELL_ASSETS=[
  '/',
  '/app',
  '/styles.css',
  '/social.css',
  '/home-growth-desktop-v33242.css',
  '/creator-ops.css',
  '/app.js',
  '/social.js',
  '/social-embeds-v341.js',
  '/creator-ops.js',
  '/pwa.js',
  '/pwa-badges-v3323.js',
  '/profile-website-v33241.js',
  '/pwa-install.css',
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
  if(request.headers?.has?.('range'))return true;
  if(['video','audio'].includes(request.destination))return true;
  return (
    (url.pathname==='/api' || url.pathname.startsWith('/api/')) ||
    (url.pathname==='/uploads' || url.pathname.startsWith('/uploads/')) ||
    (url.pathname==='/p' || url.pathname.startsWith('/p/')) ||
    url.pathname==='/admin' || url.pathname.startsWith('/admin/') ||
    url.pathname==='/admin-recovery'
  );
}

function isStaticAsset(url,request){
  if(['video','audio','document'].includes(request.destination))return false;
  const pathname=url.pathname;
  return (
    /^\/(?:assets|icons)\/[A-Za-z0-9_./-]+\.(?:svg|png|jpg|jpeg|webp|ico)$/i.test(pathname) ||
    /^\/[a-z0-9_-]+\.(?:css|js)$/i.test(pathname) ||
    pathname==='/manifest.webmanifest'
  );
}

function isMutableCodeAsset(url){
  return /\.(?:js|css|webmanifest)$/i.test(url.pathname);
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

// Only the public HTML shells can be cached; no personalized URL parameters.
async function networkFirstNavigation(request,url){
  try{
    const response=await fetchWithTimeout(request,8000);
    if(response.ok && response.type==='basic' && ['/', '/app'].includes(url.pathname)){
      const cache=await caches.open(SHELL_CACHE);
      cache.put(url.pathname,response.clone()).catch(()=>{});
    }
    return response;
  }catch(_){
    if(url.pathname==='/app')return (await caches.match('/app')) || (await caches.match('/'));
    if(url.pathname==='/')return (await caches.match('/')) || Response.error();
    return Response.error();
  }
}

async function trimStaticCache(cache){
  const keys=await cache.keys();
  if(keys.length>MAX_STATIC_ENTRIES){
    await Promise.all(keys.slice(0,keys.length-MAX_STATIC_ENTRIES).map(key=>cache.delete(key)));
  }
}

async function storeStaticResponse(cache,request,response){
  if(response.ok && response.type==='basic'){
    try{
      await cache.put(request,response.clone());
      await trimStaticCache(cache);
    }catch(_){}
  }
}

// Mutable scripts/styles prefer the latest version, but still work offline.
async function networkFirstAsset(request){
  const cache=await caches.open(STATIC_CACHE);
  try{
    const response=await fetchWithTimeout(request,4000);
    await storeStaticResponse(cache,request,response);
    return response;
  }catch(_){
    return (await cache.match(request)) || (await caches.match(request)) || Response.error();
  }
}

// Decorative static images can paint instantly from a bounded cache.
async function staleWhileRevalidate(request,event){
  const cache=await caches.open(STATIC_CACHE);
  const cached=await cache.match(request);
  const network=fetchWithTimeout(request,10000)
    .then(async response=>{
      await storeStaticResponse(cache,request,response);
      return response;
    })
    .catch(()=>null);

  if(cached){
    event.waitUntil(network);
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
    event.respondWith(isMutableCodeAsset(url)
      ? networkFirstAsset(request)
      : staleWhileRevalidate(request,event));
  }
});

async function updatePushIconBadgeV3323(count){
  if(count===null)return false;
  try{
    if(count>0&&typeof self.navigator?.setAppBadge==='function'){
      await self.navigator.setAppBadge(count);
      return true;
    }
    if(count===0&&typeof self.navigator?.clearAppBadge==='function'){
      await self.navigator.clearAppBadge();
      return true;
    }
  }catch(_){}
  return false; // Android icon badges are OS/notification controlled.
}
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

  const value=payload.badgeCount;
  const badge=typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=0&&value<=9999 ? value:null;
  event.waitUntil(Promise.all([
    self.registration.showNotification(title,options),
    updatePushIconBadgeV3323(badge)
  ]));
});

// Push payloads are data, not trusted navigation instructions.
// Only links to the authenticated social app may be opened from a push.
function safeNotificationTarget(value){
  const fallback=new URL('/app',self.location.origin).href;
  try{
    const target=new URL(String(value||'/app'),self.location.origin);
    if(target.origin!==self.location.origin || target.username || target.password)return fallback;
    // Only the single, registered social-app shell is a valid push destination.
    if(target.pathname!=='/app')return fallback;
    return target.href;
  }catch(_){
    return fallback;
  }
}

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=safeNotificationTarget(event.notification.data?.url);

  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      try{
        const clientUrl=new URL(client.url);
        // Do not hijack registration, marketplace, public pages or admin tabs.
        // Reuse only an already open app shell, and focus it after a successful navigation.
        if(clientUrl.origin!==self.location.origin || clientUrl.pathname!=='/app')continue;
        const navigated=await client.navigate(target);
        if(navigated)return navigated.focus();
      }catch(_){
        // A closed or non-navigable app tab must not swallow the notification.
      }
    }
    return self.clients.openWindow(target);
  })());
});
