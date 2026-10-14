'use strict';
// Separate, narrow scope: never cache user pages, listings, uploads or conversations.
// RedLibertad keeps its existing /sw.js and cache namespaces untouched.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode!=='navigate')return; // all assets and API requests stay network-only
 event.respondWith(fetch(request).catch(()=>new Response(
  '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Marketplace sin conexión</title><body style="font:16px system-ui;padding:28px;background:#f7f4ee;color:#0d2238">'+
  '<h1>Marketplace sin conexión</h1><p>Comprueba tu conexión y vuelve a intentarlo.</p>'+
  '<button onclick="location.reload()" style="padding:13px 18px">Reintentar</button></body></html>',
  {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}}
 )));
});
