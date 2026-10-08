'use strict';
const path=require('node:path');

function staticCacheHeader(filePath){
  const file=path.basename(filePath).toLowerCase();
  if(file.endsWith('.html'))return 'no-cache';
  if(file==='sw.js'||file==='manifest.webmanifest')return 'no-cache';
  if(/\.(?:js|css)$/.test(file))return 'public, max-age=0, must-revalidate';
  if(/\.(?:svg|png|jpg|jpeg|webp|ico)$/.test(file))
    return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'public, max-age=0, must-revalidate';
}

function setPerformanceHeaders(res,filePath){
  res.setHeader('Cache-Control',staticCacheHeader(filePath));
}

function setUploadHeaders(res){
  // Uploaded content may be shared privately or later removed from a feed.
  // A browser may cache for one hour; shared proxies/CDNs must not cache it.
  res.setHeader('Cache-Control','private, max-age=3600, must-revalidate');
  res.setHeader('X-Content-Type-Options','nosniff');
}
module.exports={staticCacheHeader,setPerformanceHeaders,setUploadHeaders};
