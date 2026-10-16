'use strict';
// Import one WooCommerce product at a time, then refresh only linked API products.
// Never edit legacy CSV listings, unrelated sellers, or manual Marketplace adverts.
const db=require('../db');
const {saveImages,eraseFiles}=require('./marketplace-import-photos-v3260');
const {getProduct,decryptCredentials}=require('./marketplace-woocommerce-v3277');
const listingInput=()=>require('../routes/marketplace-v3250').listingInput;

const scopeValid=value=>!value||['local','national'].includes(value);
async function loadConnection(storeId,sellerId){
 const r=await db.query("SELECT s.id,s.seller_id,s.store_url,s.status,s.platform,c.credentials_encrypted,c.sync_enabled,c.last_sync_at,c.last_error FROM marketplace_professional_stores s LEFT JOIN marketplace_woocommerce_connections c ON c.store_id=s.id WHERE s.id=$1 AND s.seller_id=$2",[storeId,sellerId]);
 if(!r.rowCount||r.rows[0].platform!=='woocommerce')throw new Error('woocommerce_store_not_found');
 return r.rows[0];
}
async function updateLinked(store,product){
 const linked=await db.query("SELECT w.listing_id FROM marketplace_woocommerce_product_links w JOIN marketplace_external_products x ON x.listing_id=w.listing_id AND x.store_id=w.store_id AND x.seller_id=$3 WHERE w.store_id=$1 AND w.woo_id=$2 AND x.source='api'",[store.id,product.id,store.seller_id]);
 if(!linked.rowCount)return {state:'not_linked'};
 const listingId=linked.rows[0].listing_id;
 if(product.state==='ready'){
  // API imports are owned by this seller; manual listing edits never enter this path.
  await db.query("UPDATE marketplace_listings SET title=$3,description=$4,category=$5,price_cents=$6,updated_at=now() WHERE id=$1 AND seller_id=$2 AND kind='product' AND deal='sale'",[listingId,store.seller_id,product.title,product.description,product.category,product.priceCents]);
 }
 // Disallow purchase for removed/unpublished/invalid products until they become valid again.
 await db.query("UPDATE marketplace_external_products SET stock_status=$3,stock_quantity=$4,product_url=COALESCE($5,product_url),sku=$6,last_checked_at=now(),updated_at=now() WHERE listing_id=$1 AND seller_id=$2 AND store_id=$7 AND source='api'",[listingId,store.seller_id,product.state==='ready'?product.stock:'unknown',product.state==='ready'?product.quantity:null,product.state==='ready'?product.productUrl:null,product.sku||null,store.id]);
 return {state:product.state==='ready'?'updated':'unavailable',listingId};
}
async function importProduct(store,credentials,wooId,options={}){
 const product=await getProduct(store,credentials,wooId);
 if(product.state!=='ready')return {state:product.state,reason:product.reason};
 const old=await db.query('SELECT listing_id FROM marketplace_woocommerce_product_links WHERE store_id=$1 AND woo_id=$2',[store.id,wooId]);
 if(old.rowCount)return updateLinked(store,product);
 const {city,province='',saleScope}=options;
 if(typeof city!=='string'||city.trim().length<2||city.trim().length>100||province.length>100||!scopeValid(saleScope))throw new Error('invalid_import_options');
 let pictures=[],files=[],client=null,committed=false;
 try{
  const downloaded=await saveImages(product.images);
  pictures=downloaded.paths;files=downloaded.files;
  const value=listingInput().safeParse({kind:'product',deal:'sale',title:product.title,description:product.description,
   category:product.category,city:city.trim(),priceCents:product.priceCents,images:pictures,
   details:{...(province.trim()?{province:province.trim()}:{}),...(saleScope?{saleScope}:{})}});
  if(!value.success)throw new Error('invalid_import_listing');
  client=await db.pool.connect();
  await client.query('BEGIN');
  const result=await client.query("INSERT INTO marketplace_listings(seller_id,kind,deal,title,description,category,city,price_cents,image_urls,details) VALUES($1,'product','sale',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id",
  [store.seller_id,product.title,product.description,product.category,city.trim(),product.priceCents,JSON.stringify(pictures),JSON.stringify(value.data.details)]);
  const listingId=result.rows[0].id;
  const link=await client.query('INSERT INTO marketplace_woocommerce_product_links(store_id,woo_id,listing_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING listing_id',[store.id,wooId,listingId]);
  if(!link.rowCount)throw new Error('woocommerce_already_imported');
  await client.query("INSERT INTO marketplace_external_products(listing_id,store_id,seller_id,product_url,sku,stock_status,stock_quantity,source,last_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,'api',now())",[listingId,store.id,store.seller_id,product.productUrl,product.sku||null,product.stock,product.quantity]);
  await client.query('COMMIT');committed=true;
  return {state:'imported',listingId};
 }catch(e){
  if(client&&!committed)await client.query('ROLLBACK').catch(()=>{});
  if(files.length&&!committed)await eraseFiles(files);
  throw e;
 }finally{client?.release();}
}
async function syncLinked(store,credentials,{limit=20}={}){
 const cursor=await db.query('SELECT sync_offset FROM marketplace_woocommerce_connections WHERE store_id=$1',[store.id]);
 const offset=Number(cursor.rows[0]?.sync_offset||0);
 const sql="SELECT w.woo_id FROM marketplace_woocommerce_product_links w JOIN marketplace_external_products x ON x.listing_id=w.listing_id AND x.store_id=w.store_id AND x.source='api' WHERE w.store_id=$1 ORDER BY w.woo_id ASC LIMIT $2 OFFSET $3";
 let rows=await db.query(sql,[store.id,Math.min(20,Math.max(1,limit)),offset]);
 let actualOffset=offset;
 if(!rows.rowCount&&offset>0){rows=await db.query(sql,[store.id,Math.min(20,Math.max(1,limit)),0]);actualOffset=0;}
 let updated=0,unavailable=0,failed=0;
 for(const row of rows.rows){
  try{
   const p=await getProduct(store,credentials,Number(row.woo_id));
   const r=await updateLinked(store,p);
   if(r.state==='updated')updated++;
   else unavailable++;
  }catch{
   failed++;
   // Keep an unknown stock state when the remote source cannot be rechecked.
   await db.query("UPDATE marketplace_external_products x SET stock_status='unknown',last_checked_at=now(),updated_at=now() FROM marketplace_woocommerce_product_links w WHERE w.store_id=$1 AND w.woo_id=$2 AND x.listing_id=w.listing_id AND x.store_id=w.store_id AND x.source='api'",[store.id,row.woo_id]);
  }
 }
 await db.query("UPDATE marketplace_woocommerce_connections SET last_sync_at=now(),last_error=$2,sync_offset=$3,updated_at=now() WHERE store_id=$1",[store.id,failed?'woocommerce_partial_failure':null,rows.rowCount>=20?actualOffset+rows.rowCount:0]);
 return {checked:rows.rowCount,updated,unavailable,failed,partial:rows.rowCount>=20};
}
let active=false,started=false,timer=null;
async function poll(){
 if(active||!process.env.MARKETPLACE_WC_ENCRYPTION_KEY)return;
 active=true;
 try{
  // Atomic claim prevents multiple app replicas from polling the same store.
  const rows=await db.query("WITH due AS (SELECT c.store_id FROM marketplace_woocommerce_connections c JOIN marketplace_professional_stores s ON s.id=c.store_id WHERE c.sync_enabled=true AND s.status='approved' AND s.platform='woocommerce' AND (c.last_attempt_at IS NULL OR c.last_attempt_at<now()-interval '6 hours') ORDER BY c.last_attempt_at NULLS FIRST LIMIT 2 FOR UPDATE OF c SKIP LOCKED) UPDATE marketplace_woocommerce_connections c SET last_attempt_at=now() FROM due WHERE c.store_id=due.store_id RETURNING c.store_id,c.credentials_encrypted");
  for(const row of rows.rows){
   try{
    const s=await db.query("SELECT id,seller_id,store_url,status,platform FROM marketplace_professional_stores WHERE id=$1 AND status='approved'",[row.store_id]);
    if(s.rowCount)await syncLinked(s.rows[0],decryptCredentials(row.credentials_encrypted));
   }catch{
    await db.query("UPDATE marketplace_woocommerce_connections SET last_error='woocommerce_sync_failed',updated_at=now() WHERE store_id=$1",[row.store_id]).catch(()=>{});
   }
  }
 }catch(e){console.error('WooCommerce scheduled sync unavailable:',e?.code||'error');}
 finally{active=false;}
}
function startScheduler(){
 if(started)return;started=true;
 timer=setInterval(()=>{void poll();},15*60*1000);
 timer.unref?.();
}
module.exports={loadConnection,importProduct,syncLinked,startScheduler,poll,updateLinked};
