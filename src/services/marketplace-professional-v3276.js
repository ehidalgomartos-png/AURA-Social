'use strict';
// V3.2.76 — Professional storefront: third-party purchases, no RedLibertad checkout.
// No remote network requests, secrets, Google feeds, or payment processing.
const net=require('node:net');
const PLATFORMS=['woocommerce','prestashop','shopify','other'];
function safeHttpsUrl(input){
 if(typeof input!=='string'||input.length>2048||/[\x00-\x20\\]/.test(input))return null;
 try{
  const u=new URL(input);
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(u.protocol!=='https:'||u.username||u.password||u.port||!host.includes('.')||
     host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
     net.isIP(host)||/^(?:10|127|192|169)\./.test(host))return null;
  u.hash='';
  return u;
 }catch{return null;}
}
function normalizeStoreUrl(value){
 const u=safeHttpsUrl(value);
 if(!u||u.search||u.pathname!=='/')return null;
 return u.origin+'/';
}
function productMatchesStore(storeUrl,productUrl){
 const store=safeHttpsUrl(storeUrl),item=safeHttpsUrl(productUrl);
 if(!store||!item)return false;
 // Exact host (allow optional www.) avoids sending customers to other vendors.
 const normalize=h=>h.toLowerCase().replace(/^www\./,'');
 return normalize(store.hostname)===normalize(item.hostname);
}
function normalizeProductUrl(storeUrl,value){
 const item=safeHttpsUrl(value);
 return item&&productMatchesStore(storeUrl,value)?item.toString():null;
}
function freshWooStock(row,now=Date.now()){
 if(row?.external_source!=='api')return true;
 const checked=Date.parse(row.external_checked_at||'');
 return Number.isFinite(checked)&&checked<=now&&now-checked<48*60*60*1000;
}
function purchaseLink(row){
 return row&&row.kind==='product'&&row.deal==='sale'&&row.status==='active'&&
  row.moderation_status==='published'&&row.store_status==='approved'&&
  row.purchase_enabled===true&&row.external_stock_status==='in_stock'&&freshWooStock(row)&&
  normalizeProductUrl(row.store_url,row.external_product_url)||null;
}
const DDL=[
 "CREATE TABLE IF NOT EXISTS marketplace_professional_stores (id BIGSERIAL PRIMARY KEY, seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(120) NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('woocommerce','prestashop','shopify','other')), store_url VARCHAR(500) NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','suspended')), purchase_enabled BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(seller_id,store_url))",
 "ALTER TABLE marketplace_professional_stores ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64)",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_stores_seller ON marketplace_professional_stores(seller_id)",
 "CREATE TABLE IF NOT EXISTS marketplace_external_products (listing_id BIGINT PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE, store_id BIGINT NOT NULL REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE, seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_url VARCHAR(2048) NOT NULL, sku VARCHAR(150), stock_status TEXT NOT NULL DEFAULT 'in_stock' CHECK(stock_status IN ('in_stock','out_of_stock','unknown')), stock_quantity INTEGER CHECK(stock_quantity>=0), source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','woocommerce_csv','feed','api')), last_checked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_external_store ON marketplace_external_products(store_id)",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_external_seller ON marketplace_external_products(seller_id)",
 "CREATE TABLE IF NOT EXISTS marketplace_professional_owner_audit (id BIGSERIAL PRIMARY KEY,store_id BIGINT NOT NULL REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE,actor_id BIGINT NOT NULL REFERENCES users(id),previous_seller_id BIGINT NOT NULL REFERENCES users(id),new_seller_id BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_store_owner_audit ON marketplace_professional_owner_audit(store_id,created_at DESC)"
];
module.exports={PLATFORMS,safeHttpsUrl,normalizeStoreUrl,productMatchesStore,normalizeProductUrl,purchaseLink,freshWooStock,DDL};
