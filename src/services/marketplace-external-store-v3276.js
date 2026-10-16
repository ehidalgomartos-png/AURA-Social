'use strict';
// RedLibertad V3.2.76 — Seller-site links, never a RedLibertad checkout.
const net=require('node:net');
function parsedHttps(raw){
 if(typeof raw!=='string'||raw.length>2048||!raw.trim()||raw.trim()!==raw)return null;
 try{
  const u=new URL(raw);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.origin==='null'||!host.includes('.')||
     net.isIP(host)||host==='localhost'||host.endsWith('.localhost')||
     host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||
     host.split('.').some(s=>!s||s.length>63)||/[^\x21-\x7e]/.test(raw))return null;
  return u;
 }catch(_){return null;}
}
function domain(host){return String(host||'').toLowerCase().replace(/^www\./,'');}
function storeProductLink(productUrl,websiteUrl){
 const product=parsedHttps(productUrl),site=parsedHttps(websiteUrl);
 if(!product||!site||domain(product.hostname)!==domain(site.hostname))return null;
 // The destination must lead to a product page, not just the store homepage.
 if((!product.pathname||product.pathname==='/')&&!product.searchParams.has('p')&&
    !product.searchParams.has('product')&&!product.searchParams.has('post_type'))return null;
 return product.href;
}
function validExternalProductLink(url){return parsedHttps(url)!==null;}
function externalStoreLinkForListing(row){
 if(!row||row.kind!=='product'||row.deal!=='sale'||row.status!=='active'||
    row.moderation_status!=='published'||row.seller_status!=='active'||
    row.seller_discoverable!==true)return null;
 return storeProductLink(row.details?.externalProductUrl,row.seller_website_url);
}
module.exports={parsedHttps,storeProductLink,validExternalProductLink,externalStoreLinkForListing};
