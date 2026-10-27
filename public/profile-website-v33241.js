'use strict';
// Shared by the profile API and the app. Never use raw user text as an href.
function normalizeProfileWebsiteV33241(input){
  const raw=String(input??'').trim();
  if(!raw)return '';
  if(raw.length>4096||/[\u0000-\u0020\u007F<>"'\\]/.test(raw)||raw.startsWith('//'))return null;
  const explicit=/^https?:\/\//i.test(raw);
  // Reject non-web schemes, broken protocols and injected schemes.
  // Domain:port (e.g. example.com:8443) is still a valid web address.
  if(!explicit&&/^[a-z][a-z0-9+.-]*:/i.test(raw)&&
     !/^[a-z0-9.-]+:\d{1,5}(?:[/?#]|$)/i.test(raw))return null;
  let url;
  try{url=new URL(explicit?raw:'https://'+raw);}catch(_){return null;}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
  if(url.username||url.password)return null;
  const host=url.hostname;
  // DNS names only, including IDN names normalized to punycode by URL.
  if(!host.includes('.')||
     !host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))return null;
  return url.href.length<=4096?url.href:null;
}
if(typeof module!=='undefined'&&module.exports){
  module.exports={normalizeProfileWebsiteV33241};
}
if(typeof window!=='undefined'){
  window.normalizeProfileWebsiteV33241=normalizeProfileWebsiteV33241;
}
