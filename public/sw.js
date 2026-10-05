const CACHE='redlibertad-v112-shell';
const ASSETS=['/','/app','/styles.css','/social.css','/app.js','/social.js','/pwa.js','/manifest.webmanifest','/assets/logo-mark.svg','/icons/redlibertad-192.png','/icons/redlibertad-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;

  const url=new URL(event.request.url);
  const privateOrDynamic=
    url.origin!==self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/p/');

  if(privateOrDynamic)return;

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok && response.type==='basic'){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(event.request);
        if(cached)return cached;
        if(event.request.mode==='navigate'){
          return (await caches.match('/app')) || (await caches.match('/'));
        }
        return Response.error();
      })
  );
});
