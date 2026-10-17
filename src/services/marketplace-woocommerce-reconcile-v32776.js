'use strict';
// V3.2.77.6 — compare Woo API products with prior CSV and Marketplace adverts.
// No cross-account linking, automatic ownership change, or implicit content edits.
const db=require('../db');
const {getProduct}=require('./marketplace-woocommerce-v3277');
const {normalizeProductUrl}=require('./marketplace-professional-v3276');
const MAX_MATCHES=15;
function sourceKeys(product){
 const keys=[];
 const sku=String(product?.sku||'').trim().toLowerCase();
 if(sku&&sku.length<145)keys.push('sku:'+sku);
 if(Number.isSafeInteger(product?.id)&&product.id>0)keys.push('id:'+product.id);
 return keys;
}
function reasonFor(row,store,product,keys){
 const same=String(row.seller_id)===String(store.seller_id);
 const key=String(row.source_key||'').toLowerCase();
 if(!same)return 'other_owner';
 if(key.startsWith('sku:')&&keys.includes(key))return 'sku';
 if(key.startsWith('id:')&&keys.includes(key))return 'woocommerce_id';
 return Number(row.price_cents)===Number(product.priceCents)?'title_price':'title_only';
}
async function findMatches(store,product,client=db){
 if(!product?.id)return {state:'invalid',matches:[],canImport:false,existingListingId:null};
 const linked=await client.query(
  'SELECT listing_id FROM marketplace_woocommerce_product_links WHERE store_id=$1 AND woo_id=$2',
  [store.id,product.id]);
 if(linked.rowCount)return {state:'linked',matches:[],canImport:false,existingListingId:linked.rows[0].listing_id};
 const keys=sourceKeys(product);
 // Prior Woo CSV import keys live in marketplace_import_links, NOT in listing.details.
 // An ID key is only comparable within this seller; different Woo stores reuse IDs.
 // Exact title matches also flag prior imports with changed prices; a title alone is never proof of identity.
 const result=await client.query(
  "SELECT l.id,l.seller_id,l.title,l.price_cents,l.category,l.status,l.moderation_status,"+
  " u.username,i.source_key,x.store_id AS external_store_id,x.source AS external_source,"+
  " w.store_id AS linked_woo_store_id FROM marketplace_listings l"+
  " JOIN users u ON u.id=l.seller_id"+
  " LEFT JOIN marketplace_import_links i ON i.listing_id=l.id"+
  " LEFT JOIN marketplace_external_products x ON x.listing_id=l.id"+
  " LEFT JOIN marketplace_woocommerce_product_links w ON w.listing_id=l.id"+
  " WHERE l.kind='product' AND l.deal='sale' AND ("+
  " (i.source_key=ANY($2::text[]) AND (l.seller_id=$1 OR i.source_key LIKE 'sku:%'))"+
  " OR (LOWER(BTRIM(l.title))=LOWER(BTRIM($3)))"+
  " ) ORDER BY (l.seller_id=$1) DESC,(i.source_key=ANY($2::text[])) DESC,l.id DESC LIMIT $4",
  [store.seller_id,keys,product.title||'',MAX_MATCHES+1]);
 const exceeds=result.rows.length>MAX_MATCHES;
 const matches=result.rows.slice(0,MAX_MATCHES).map(row=>({
  listingId:row.id,title:row.title,priceCents:Number(row.price_cents),
  username:row.username,sameOwner:String(row.seller_id)===String(store.seller_id),
  reason:reasonFor(row,store,product,keys),
  linkedElsewhere:row.external_store_id!==null&&row.external_store_id!==undefined||
   row.linked_woo_store_id!==null&&row.linked_woo_store_id!==undefined,
  status:row.status,moderationStatus:row.moderation_status
 }));
 return {state:matches.length||exceeds?'possible_duplicate':'new',
  matches,canImport:!matches.length&&!exceeds,existingListingId:null,
  truncated:exceeds};
}
class ReconcileError extends Error{
 constructor(code,status=409){super(code);this.status=status;}
}
async function linkExisting(store,credentials,wooId,listingId,adminId,deps={}){
 const product=await (deps.getProduct||getProduct)(store,credentials,wooId);
 if(product.state!=='ready')throw new ReconcileError('woocommerce_product_not_ready');
 const client=await db.pool.connect();let started=false;
 try{
  await client.query('BEGIN');started=true;
  // Per seller serializes API import/link operations even if they touch different shops.
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)',[store.seller_id]);
  const current=await client.query(
   'SELECT id,seller_id,store_url,status FROM marketplace_professional_stores WHERE id=$1 FOR UPDATE',
   [store.id]);
  if(!current.rowCount||String(current.rows[0].seller_id)!==String(store.seller_id)||
   current.rows[0].status==='suspended')
   throw new ReconcileError('woocommerce_store_changed');
  const url=normalizeProductUrl(current.rows[0].store_url,product.productUrl);
  if(!url)throw new ReconcileError('invalid_product_domain');
  const candidates=await findMatches(current.rows[0],product,client);
  if(candidates.state==='linked')throw new ReconcileError('woocommerce_already_imported');
  if(candidates.truncated)throw new ReconcileError('woocommerce_ambiguous_match');
  const target=candidates.matches.find(m=>String(m.listingId)===String(listingId));
  if(!target||!target.sameOwner)throw new ReconcileError('woocommerce_match_not_owned');
  if(target.linkedElsewhere)throw new ReconcileError('woocommerce_listing_already_linked');
  if(target.status!=='active'||target.moderationStatus!=='published')
   throw new ReconcileError('woocommerce_listing_not_active');
  const listing=await client.query(
   "SELECT id FROM marketplace_listings WHERE id=$1 AND seller_id=$2 AND kind='product' AND deal='sale' AND status='active' AND moderation_status='published' FOR UPDATE",
   [listingId,store.seller_id]);
  if(!listing.rowCount)throw new ReconcileError('woocommerce_match_not_owned');
  const existing=await client.query('SELECT listing_id FROM marketplace_external_products WHERE listing_id=$1 FOR UPDATE',[listingId]);
  if(existing.rowCount)throw new ReconcileError('woocommerce_listing_already_linked');
  const link=await client.query(
   'INSERT INTO marketplace_woocommerce_product_links(store_id,woo_id,listing_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING listing_id',
   [store.id,wooId,listingId]);
  if(!link.rowCount)throw new ReconcileError('woocommerce_already_imported');
  await client.query(
   "INSERT INTO marketplace_external_products(listing_id,store_id,seller_id,product_url,sku,stock_status,stock_quantity,source,last_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,'api',now())",
   [listingId,store.id,store.seller_id,url,product.sku||null,product.stock,product.quantity]);
  await client.query(
   'INSERT INTO marketplace_woocommerce_reconciliation_audit(store_id,woo_id,listing_id,admin_id,match_reason) VALUES($1,$2,$3,$4,$5)',
   [store.id,wooId,listingId,adminId,target.reason]);
  await client.query('COMMIT');started=false;
  return {state:'linked_existing',listingId,matchReason:target.reason};
 }catch(e){
  if(started)await client.query('ROLLBACK').catch(()=>{});
  if(e?.code==='23505')throw new ReconcileError('woocommerce_already_imported');
  throw e;
 }finally{client.release();}
}
const DDL=[
 "CREATE TABLE IF NOT EXISTS marketplace_woocommerce_reconciliation_audit (id BIGSERIAL PRIMARY KEY,store_id BIGINT NOT NULL REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE,woo_id BIGINT NOT NULL,listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,admin_id BIGINT NOT NULL REFERENCES users(id),match_reason VARCHAR(30) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
 "CREATE INDEX IF NOT EXISTS idx_marketplace_woocommerce_reconcile_log ON marketplace_woocommerce_reconciliation_audit(store_id,created_at DESC)"
];
module.exports={DDL,MAX_MATCHES,sourceKeys,findMatches,linkExisting,ReconcileError};
