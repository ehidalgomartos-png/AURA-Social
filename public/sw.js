const CACHE='aura-v0.3-shell';
const SHELL=['/','/app','/styles.css','/social.css','/app.js','/social.js','/pwa.js','/manifest.webmanifest','/icons/aura-192.png','/icons/aura-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;if(new URL(event.request.url).pathname.startsWith('/api/')||new URL(event.request.url).pathname.startsWith('/uploads/'))return;event.respondWith(fetch(event.request).then(r=>{const clone=r.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));return r;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/'))));});
