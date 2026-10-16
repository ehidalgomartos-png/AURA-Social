'use strict';
// V3.2.77 — Read-only WooCommerce connector. No checkout, payment or Merchant API.
const crypto=require('node:crypto');
const dns=require('node:dns').promises;
const https=require('node:https');
const {safeHost,publicIPv4,pinnedIPv4Lookup}=require('./marketplace-import-photos-v3260');
const {normalizeProductUrl}=require('./marketplace-professional-v3276');
const {cents}=require('./marketplace-woocommerce-csv-v3260');
const {readableDescription}=require('./marketplace-description-v3267');

const MAX_PAGE_SIZE=20,MAX_JSON=1024*1024;
const DDL=[
 "CREATE TABLE IF NOT EXISTS marketplace_woocommerce_connections (store_id BIGINT PRIMARY KEY REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE, credentials_encrypted TEXT NOT NULL, sync_enabled BOOLEAN NOT NULL DEFAULT false, last_sync_at TIMESTAMPTZ, last_attempt_at TIMESTAMPTZ, last_error VARCHAR(70), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
 "CREATE TABLE IF NOT EXISTS marketplace_woocommerce_product_links (store_id BIGINT NOT NULL REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE, woo_id BIGINT NOT NULL, listing_id BIGINT NOT NULL UNIQUE REFERENCES marketplace_listings(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(store_id,woo_id))",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_woo_sync ON marketplace_woocommerce_connections(sync_enabled,last_attempt_at)"
];
function secretKey(){
 const raw=process.env.MARKETPLACE_WC_ENCRYPTION_KEY;
 if(typeof raw!=='string'||!/^([A-Za-z0-9+/]{43}=)$/.test(raw))throw new Error('woocommerce_key_not_configured');
 const key=Buffer.from(raw,'base64');
 if(key.length!==32)throw new Error('woocommerce_key_not_configured');
 return key;
}
function encryptCredentials(key,secret){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);
 const value=Buffer.concat([cipher.update(JSON.stringify({key,secret}),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),value.toString('base64')].join('.');
}
function decryptCredentials(encoded){
 try{
  const [version,iv,tag,ciphertext]=String(encoded).split('.');
  if(version!=='v1'||!iv||!tag||!ciphertext)throw Error();
  const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  const pair=JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64')),decipher.final()]).toString('utf8'));
  if(!/^ck_[a-zA-Z0-9]{25,80}$/.test(pair.key)||!/^cs_[a-zA-Z0-9]{25,80}$/.test(pair.secret))throw Error();
  return pair;
 }catch(e){if(e.message==='woocommerce_key_not_configured')throw e;throw new Error('woocommerce_credentials_unavailable');}
}
function clean(value){
 return String(readableDescription(String(value||''))).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/\s+/g,' ').trim();
}
function normalizeProduct(storeUrl,product){
 if(!product||!Number.isSafeInteger(product.id)||product.id<=0)return {state:'invalid',reason:'invalid_product_id'};
 if(product.type!=='simple'||product.status!=='publish'||product.catalog_visibility==='hidden')
  return {id:product.id,state:'skipped',reason:'not_published_simple_product'};
 const productUrl=normalizeProductUrl(storeUrl,product.permalink);
 if(!productUrl)return {id:product.id,state:'invalid',reason:'invalid_product_domain'};
 const title=clean(product.name),description=clean(product.description||product.short_description);
 const priceCents=cents(product.price);
 const category=clean(product.categories?.[0]?.name||'Otros productos').slice(0,65);
 const urls=Array.isArray(product.images)?product.images.map(i=>i?.src).filter(s=>typeof s==='string').slice(0,4):[];
 const validImages=urls.filter(url=>{try{safeHost(url);return true;}catch{return false;}});
 const valid=title.length>=6&&title.length<=120&&description.length>=25&&description.length<=4000&&
  category.length>=2&&priceCents!==null&&validImages.length>0;
 const stock=product.stock_status==='instock'?'in_stock':product.stock_status==='outofstock'?'out_of_stock':'unknown';
 const quantity=Number.isInteger(product.stock_quantity)&&product.stock_quantity>=0?product.stock_quantity:null;
 const sku=typeof product.sku==='string'?product.sku.trim().slice(0,150):'';
 return {id:product.id,state:valid?'ready':'invalid',reason:valid?null:'incomplete_product_data',
  title,description,category,priceCents,stock,quantity,sku,productUrl,images:validImages};
}
function apiPath(productId=null,page=1){
 if(productId!==null){
  if(!Number.isSafeInteger(productId)||productId<1)throw new Error('invalid_product_id');
  return '/wp-json/wc/v3/products/'+productId;
 }
 if(!Number.isInteger(page)||page<1||page>1000)throw new Error('invalid_page');
 return '/wp-json/wc/v3/products?status=publish&per_page='+MAX_PAGE_SIZE+'&page='+page+'&orderby=id&order=asc';
}
async function requestWoo(storeUrl,credentials,path,dependencies={}){
 const u=safeHost(new URL(path,storeUrl).toString());
 const store=new URL(storeUrl);
 if(u.origin!==store.origin||!u.pathname.startsWith('/wp-json/wc/v3/products'))throw new Error('woocommerce_invalid_target');
 const lookup=dependencies.lookup||dns.lookup;
 const addresses=await lookup(u.hostname,{all:true,family:4,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new Error('woocommerce_private_address');
 const address=addresses[0].address;
 const transport=dependencies.https||https;
 return new Promise((resolve,reject)=>{
  let finished=false,count=0,parts=[];
  const fail=e=>{if(finished)return;finished=true;reject(e)};
  const req=transport.request(u,{
   method:'GET',agent:false,timeout:8000,lookup:pinnedIPv4Lookup(address),
   headers:{Authorization:'Basic '+Buffer.from(credentials.key+':'+credentials.secret).toString('base64'),
    Accept:'application/json','User-Agent':'RedLibertad-WooConnector/3.2.77'}
  },res=>{
   if(res.statusCode!==200){res.resume();return fail(new Error(res.statusCode===401||res.statusCode===403?'woocommerce_auth_failed':'woocommerce_http_error'));}
   const type=String(res.headers['content-type']||'').toLowerCase();
   if(!type.includes('application/json')){res.resume();return fail(new Error('woocommerce_invalid_response'));}
   if(Number(res.headers['content-length']||0)>MAX_JSON){res.destroy();return fail(new Error('woocommerce_response_too_large'));}
   res.on('data',chunk=>{count+=chunk.length;if(count>MAX_JSON){res.destroy();return fail(new Error('woocommerce_response_too_large'));}parts.push(chunk)});
   res.on('error',fail);
   res.on('end',()=>{if(finished)return;try{const json=JSON.parse(Buffer.concat(parts).toString('utf8'));finished=true;resolve(json);}catch{fail(new Error('woocommerce_invalid_json'));}});
  });
  req.on('timeout',()=>req.destroy(new Error('woocommerce_timeout')));
  req.on('error',e=>fail(e?.message?.startsWith('woocommerce_')?e:new Error('woocommerce_connection_failed')));
  req.end();
 });
}
async function listProducts(store,credentials,page=1,deps){
 const data=await requestWoo(store.store_url,credentials,apiPath(null,page),deps);
 if(!Array.isArray(data)||data.length>MAX_PAGE_SIZE)throw new Error('woocommerce_invalid_response');
 return data.map(p=>normalizeProduct(store.store_url,p));
}
async function getProduct(store,credentials,id,deps){
 const data=await requestWoo(store.store_url,credentials,apiPath(id),deps);
 return normalizeProduct(store.store_url,data);
}
function publicError(e){
 return /^woocommerce_[a-z_]+$/.test(e?.message||'')?e.message:'woocommerce_connection_failed';
}
module.exports={DDL,MAX_PAGE_SIZE,secretKey,encryptCredentials,decryptCredentials,normalizeProduct,apiPath,requestWoo,listProducts,getProduct,publicError};
