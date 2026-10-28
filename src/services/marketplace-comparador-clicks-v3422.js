'use strict';
// V3.4.2.2 — métricas agregadas y gratuitas: clics en tiendas, nunca ventas ficticias.
// No almacenamos IP, sesión, user agent, identidad del visitante ni cookies.
const crypto=require('node:crypto');
const db=require('../db');
const {ensureProfessionalSchema}=require('../routes/marketplace-professional-v3276');
let ready=null;
const dayUtc=(now=Date.now())=>new Date(now).toISOString().slice(0,10);
function sign(storeId,listingId,day,secret=process.env.JWT_SECRET){
 if(!secret||!/^[1-9]\d{0,15}$/.test(String(storeId))||!/^[1-9]\d{0,15}$/.test(String(listingId))||!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 return crypto.createHmac('sha256',secret).update([storeId,listingId,day,'free-comparison-click'].join('|')).digest('hex');
}
function proof(storeId,listingId,secret=process.env.JWT_SECRET){return sign(storeId,listingId,dayUtc(),secret);}
function validProof(storeId,listingId,candidate,now=Date.now(),secret=process.env.JWT_SECRET){
 if(typeof candidate!=='string'||!/^[a-f0-9]{64}$/.test(candidate))return false;
 const today=sign(storeId,listingId,dayUtc(now),secret);
 const yesterday=sign(storeId,listingId,dayUtc(now-86400000),secret);
 return [today,yesterday].some(token=>token&&crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(candidate,'hex')));
}
async function ensureSchema(){
 if(!ready)ready=(async()=>{
  await ensureProfessionalSchema();
  await db.query("CREATE TABLE IF NOT EXISTS marketplace_comparison_store_clicks (store_id BIGINT NOT NULL REFERENCES marketplace_professional_stores(id) ON DELETE CASCADE, listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE, clicked_day DATE NOT NULL, click_count INTEGER NOT NULL DEFAULT 0 CHECK(click_count>=0), PRIMARY KEY(store_id,listing_id,clicked_day))");
  await db.query('CREATE INDEX IF NOT EXISTS idx_marketplace_compare_store_click_day ON marketplace_comparison_store_clicks(clicked_day DESC,store_id)');
 })().catch(e=>{ready=null;throw e;});
 return ready;
}
async function record(storeId,listingId){
 await ensureSchema();
 // Revalidar propietario, producto disponible, tienda y compra en dominio autorizado.
 const out=await db.query(
  "SELECT x.product_url,s.store_url FROM marketplace_external_products x "+
  "JOIN marketplace_professional_stores s ON s.id=x.store_id AND s.seller_id=x.seller_id "+
  "JOIN marketplace_listings l ON l.id=x.listing_id AND l.seller_id=x.seller_id "+
  "WHERE x.store_id=$1 AND x.listing_id=$2 AND s.status='approved' AND s.purchase_enabled=true "+
  "AND x.stock_status='in_stock' AND (x.source<>'api' OR x.last_checked_at>now()-interval '48 hours') "+
  "AND l.status='active' AND l.moderation_status='published' AND l.kind='product' AND l.deal='sale' "+
  "LIMIT 1",[storeId,listingId]);
 if(!out.rowCount)return false;
 const {normalizeProductUrl}=require('./marketplace-professional-v3276');
 if(!normalizeProductUrl(out.rows[0].store_url,out.rows[0].product_url))return false;
 await db.query("INSERT INTO marketplace_comparison_store_clicks(store_id,listing_id,clicked_day,click_count) VALUES($1,$2,$3,1) ON CONFLICT(store_id,listing_id,clicked_day) DO UPDATE SET click_count=marketplace_comparison_store_clicks.click_count+1",
  [storeId,listingId,dayUtc()]);
 return true;
}
module.exports={dayUtc,sign,proof,validProof,ensureSchema,record};
