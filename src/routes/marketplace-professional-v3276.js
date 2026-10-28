'use strict';
// V3.2.76: seller storefront enrollment without billing or checkout.
const express=require('express');
const rateLimit=require('express-rate-limit');
const {z}=require('zod');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {PLATFORMS,normalizeStoreUrl,normalizeProductUrl,DDL}=require('../services/marketplace-professional-v3276');
const {DDL:wooDDL}=require('../services/marketplace-woocommerce-v3277');
const {DDL:reconcileDDL}=require('../services/marketplace-woocommerce-reconcile-v32776');
const {TransferError,transferStoreOwner}=require('../services/marketplace-store-owner-v32775');
const {approvePendingStore}=require('../services/marketplace-comparador-domain-approval-v3426');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
let ready=null;
function ensureProfessionalSchema(){
 if(!ready)ready=(async()=>{for(const sql of [...DDL,...wooDDL,...reconcileDDL])await db.query(sql);})().catch(e=>{ready=null;throw e;});
 return ready;
}
// The professional program is administered internally until enrollment opens.
router.use(requireAdmin);
router.use((_req,_res,next)=>ensureProfessionalSchema().then(()=>next(),next));
const editLimiter=rateLimit({windowMs:60*60*1000,max:50,standardHeaders:true,legacyHeaders:false});
const storeInput=z.object({
 name:z.string().trim().min(3).max(120),
 platform:z.enum(PLATFORMS),
 storeUrl:z.string().trim().max(500)
}).strict();
const externalInput=z.object({
 storeId:z.coerce.number().int().positive(),
 productUrl:z.string().trim().max(2048),
 sku:z.string().trim().max(150).optional(),
 stockStatus:z.enum(['in_stock','out_of_stock','unknown']).default('unknown'),
 stockQuantity:z.number().int().nonnegative().nullable().optional()
}).strict();
const idOk=value=>/^[1-9]\d{0,15}$/.test(String(value||''));
router.use('/woocommerce',require('./marketplace-woocommerce-v3277').router);
router.get('/mine',wrap(async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 const r=await db.query('SELECT id,name,platform,store_url,status,purchase_enabled,created_at,updated_at FROM marketplace_professional_stores WHERE seller_id=$1 ORDER BY id DESC',[req.user.id]);
 res.json({ok:true,stores:r.rows,billingEnabled:false,merchantFeedEnabled:false,syncEnabled:false});
}));
router.post('/stores',editLimiter,wrap(async(req,res)=>{
 const v=storeInput.safeParse(req.body);
 if(!v.success)return res.status(400).json({error:'invalid_store'});
 const url=normalizeStoreUrl(v.data.storeUrl);
 if(!url)return res.status(400).json({error:'invalid_store_url'});
 const r=await db.query("INSERT INTO marketplace_professional_stores(seller_id,name,platform,store_url) VALUES($1,$2,$3,$4) ON CONFLICT(seller_id,store_url) DO NOTHING RETURNING id,status",[req.user.id,v.data.name,v.data.platform,url]);
 if(!r.rowCount)return res.status(409).json({error:'store_already_registered'});
 res.status(201).json({ok:true,id:r.rows[0].id,status:r.rows[0].status});
}));
router.post('/stores/:id/submit',editLimiter,wrap(async(req,res)=>{
 if(!idOk(req.params.id))return res.status(400).json({error:'invalid_store_id'});
 // This entire router is restricted to administrators. After a store owner transfer,
 // the administering account is intentionally NOT the seller_id.
 const r=await db.query("UPDATE marketplace_professional_stores SET status='pending',purchase_enabled=false,updated_at=now() WHERE id=$1 AND status='draft' RETURNING id,status",[req.params.id]);
 if(!r.rowCount)return res.status(409).json({error:'store_not_draft'});
 res.json({ok:true,status:'pending'});
}));
router.post('/products/:listingId',editLimiter,wrap(async(req,res)=>{
 if(!idOk(req.params.listingId))return res.status(400).json({error:'invalid_listing_id'});
 const parsed=externalInput.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'invalid_product'});
 const v=parsed.data;
 const store=await db.query("SELECT id,store_url,status FROM marketplace_professional_stores WHERE id=$1 AND seller_id=$2",[v.storeId,req.user.id]);
 if(!store.rowCount)return res.status(404).json({error:'store_not_found'});
 const url=normalizeProductUrl(store.rows[0].store_url,v.productUrl);
 if(!url)return res.status(400).json({error:'external_domain_mismatch'});
 // A seller may only link their own active, published SALE products.
 const r=await db.query(`INSERT INTO marketplace_external_products(listing_id,store_id,seller_id,product_url,sku,stock_status,stock_quantity,source)
 SELECT l.id,$3,$1,$4,$5,$6,$7,'manual' FROM marketplace_listings l
 WHERE l.id=$2 AND l.seller_id=$1 AND l.kind='product' AND l.deal='sale'
 ON CONFLICT(listing_id) DO UPDATE SET store_id=EXCLUDED.store_id,
 seller_id=EXCLUDED.seller_id,product_url=EXCLUDED.product_url,sku=EXCLUDED.sku,
 stock_status=EXCLUDED.stock_status,stock_quantity=EXCLUDED.stock_quantity,source='manual',updated_at=now()
 WHERE marketplace_external_products.seller_id=$1 RETURNING listing_id`,
 [req.user.id,req.params.listingId,v.storeId,url,v.sku||null,v.stockStatus,v.stockQuantity??null]);
 if(!r.rowCount)return res.status(404).json({error:'listing_not_owned_or_not_for_sale'});
 res.json({ok:true,listingId:r.rows[0].listing_id,purchaseEnabled:store.rows[0].status==='approved'});
}));
router.get('/products',wrap(async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 const r=await db.query("SELECT x.listing_id,x.store_id,x.product_url,x.sku,x.stock_status,x.stock_quantity,x.source,s.status AS store_status,s.purchase_enabled,l.title FROM marketplace_external_products x JOIN marketplace_professional_stores s ON s.id=x.store_id JOIN marketplace_listings l ON l.id=x.listing_id WHERE x.seller_id=$1 ORDER BY x.updated_at DESC LIMIT 200",[req.user.id]);
 res.json({ok:true,items:r.rows});
}));
router.delete('/products/:listingId',editLimiter,wrap(async(req,res)=>{
 if(!idOk(req.params.listingId))return res.status(400).json({error:'invalid_listing_id'});
 const r=await db.query('DELETE FROM marketplace_external_products WHERE listing_id=$1 AND seller_id=$2 RETURNING listing_id',[req.params.listingId,req.user.id]);
 if(!r.rowCount)return res.status(404).json({error:'product_link_not_found'});
 res.json({ok:true});
}));
router.get('/admin/products',wrap(async(req,res)=>{
 if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
 res.setHeader('Cache-Control','private,no-store');
 const r=await db.query("SELECT x.listing_id,x.store_id,x.product_url,x.sku,x.stock_status,x.stock_quantity,x.source,s.status AS store_status,s.purchase_enabled,s.name AS store_name,l.title,u.username AS seller_username FROM marketplace_external_products x JOIN marketplace_professional_stores s ON s.id=x.store_id JOIN marketplace_listings l ON l.id=x.listing_id JOIN users u ON u.id=x.seller_id ORDER BY x.updated_at DESC LIMIT 200");
 res.json({ok:true,items:r.rows});
}));
router.get('/admin/stores',wrap(async(req,res)=>{
 if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
 res.setHeader('Cache-Control','private,no-store');
 const r=await db.query("SELECT s.id,s.seller_id,s.name,s.platform,s.store_url,s.status,s.purchase_enabled,u.username FROM marketplace_professional_stores s JOIN users u ON u.id=s.seller_id ORDER BY s.updated_at DESC LIMIT 200");
 res.json({ok:true,stores:r.rows});
}));
router.post('/admin/stores/:id/transfer-owner',editLimiter,wrap(async(req,res)=>{
 if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
 if(!idOk(req.params.id))return res.status(400).json({error:'invalid_store_id'});
 const input=z.object({
  username:z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
  expectedSellerId:z.number().int().positive(),
  confirm:z.literal(true)
 }).strict().safeParse(req.body);
 if(!input.success)return res.status(400).json({error:'invalid_owner_transfer'});
 res.setHeader('Cache-Control','private,no-store');
 try{
  const store=await transferStoreOwner({
   storeId:req.params.id,targetUsername:input.data.username,
   expectedSellerId:input.data.expectedSellerId,adminId:req.user.id
  });
  res.json({ok:true,store});
 }catch(err){
  if(err instanceof TransferError)return res.status(err.status).json({error:err.message});
  throw err;
 }
}));

router.post('/admin/stores/:id/review',editLimiter,wrap(async(req,res)=>{
 if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
 if(!idOk(req.params.id)||!['approved','suspended','pending'].includes(req.body?.status))return res.status(400).json({error:'invalid_review'});
 // Prevent a draft from skipping owner/domain/checkout review. Approval also
 // enables eligible external purchase links, so require an explicit attestation.
 const status=req.body.status;
 if(status==='approved'&&req.body?.confirmVerified!==true)
  return res.status(400).json({error:'store_review_confirmation_required'});
 let store=null;
 if(status==='approved'){
  const result=await approvePendingStore(req.params.id);
  if(result.state==='domain_already_approved')
   return res.status(409).json({error:'store_domain_already_approved'});
  if(result.state==='invalid_domain')
   return res.status(409).json({error:'store_invalid_domain'});
  if(result.state==='approved')store=result.store;
 }else{
  const sourceState={suspended:'approved',pending:'suspended'}[status];
  const r=await db.query('UPDATE marketplace_professional_stores SET status=$2,purchase_enabled=$3,updated_at=now() WHERE id=$1 AND status=$4 RETURNING id,status,purchase_enabled',
   [req.params.id,status,false,sourceState]);
  if(r.rowCount)store=r.rows[0];
 }
 if(!store){
  const existing=await db.query('SELECT status FROM marketplace_professional_stores WHERE id=$1',[req.params.id]);
  return res.status(existing.rowCount?409:404).json({error:existing.rowCount?'invalid_store_status_transition':'store_not_found'});
 }
 res.setHeader('Cache-Control','private,no-store');
 res.json({ok:true,store});
}));
module.exports={router,ensureProfessionalSchema};
