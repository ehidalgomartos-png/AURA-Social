'use strict';
// Admin-only WooCommerce API adapter. Existing professional middleware checks requireAdmin.
const express=require('express');
const rateLimit=require('express-rate-limit');
const {z}=require('zod');
const db=require('../db');
const {encryptCredentials,decryptCredentials,listProducts,publicError,secretKey}=require('../services/marketplace-woocommerce-v3277');
const {loadConnection,importProduct,syncLinked}=require('../services/marketplace-woocommerce-sync-v3277');
const {findMatches,linkExisting,ReconcileError}=require('../services/marketplace-woocommerce-reconcile-v32776');
const {ensureImportSchema}=require('./marketplace-import-v3260');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const limiter=rateLimit({windowMs:60*60*1000,max:35,standardHeaders:true,legacyHeaders:false});
const idOK=value=>/^[1-9]\d{0,15}$/.test(String(value||''));
const credentials=z.object({consumerKey:z.string().regex(/^ck_[a-zA-Z0-9]{25,80}$/),
 consumerSecret:z.string().regex(/^cs_[a-zA-Z0-9]{25,80}$/)}).strict();
const linkOptions=z.object({confirm:z.literal(true),listingId:z.coerce.number().int().positive()}).strict();
const importOptions=z.object({confirm:z.literal(true),city:z.string().trim().min(2).max(100),province:z.string().trim().max(100).optional().default(''),saleScope:z.enum(['local','national']).optional()}).strict();
router.use((_req,res,next)=>{res.setHeader('Cache-Control','private,no-store');next();});
async function owned(req,res){
 if(!idOK(req.params.id)){res.status(400).json({error:'invalid_store_id'});return null;}
 // The parent professional router verifies requireAdmin before mounting this route.
 // Admins may connect shops owned by other RedLibertad users.
 const store=await loadConnection(req.params.id,null);
 return store;
}
function failure(res,e){
 if(e instanceof ReconcileError)return res.status(e.status).json({error:e.message});
 const reason=publicError(e);
 const status=reason==='woocommerce_key_not_configured'?503:reason==='woocommerce_auth_failed'?400:
  reason==='woocommerce_store_not_found'?404:reason==='invalid_import_options'||reason==='woocommerce_already_imported'?409:502;
 return res.status(status).json({error:reason});
}
router.get('/stores/:id/status',wrap(async(req,res)=>{
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 let encryptionReady=true;try{secretKey();}catch{encryptionReady=false;}
 res.json({ok:true,storeId:store.id,connected:!!store.credentials_encrypted,
  encryptionReady,syncEnabled:!!store.sync_enabled,lastSyncAt:store.last_sync_at||null,
  lastError:store.last_error||null,status:store.status,
  merchantFeedEnabled:false,billingEnabled:false});
}));
router.post('/stores/:id/connect',limiter,wrap(async(req,res)=>{
 const v=credentials.safeParse(req.body);
 if(!v.success)return res.status(400).json({error:'invalid_woocommerce_credentials'});
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(store.status==='suspended')return res.status(409).json({error:'store_suspended'});
 try{
  secretKey(); // Fail closed; never store plaintext.
  const pair={key:v.data.consumerKey,secret:v.data.consumerSecret};
  // Validate permissions and connectivity BEFORE writing credentials.
  await listProducts(store,pair,1);
  const encrypted=encryptCredentials(pair.key,pair.secret);
  await db.query("INSERT INTO marketplace_woocommerce_connections(store_id,credentials_encrypted,sync_enabled) VALUES($1,$2,false) ON CONFLICT(store_id) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,sync_enabled=false,last_error=NULL,updated_at=now()",[store.id,encrypted]);
  res.json({ok:true,connected:true,syncEnabled:false});
 }catch(e){return failure(res,e);}
}));
router.get('/stores/:id/preview',limiter,wrap(async(req,res)=>{
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(!store.credentials_encrypted)return res.status(409).json({error:'woocommerce_not_connected'});
 const page=Number(req.query.page||1);
 if(!Number.isInteger(page)||page<1||page>1000)return res.status(400).json({error:'invalid_page'});
 try{
  await ensureImportSchema();
  const products=await listProducts(store,decryptCredentials(store.credentials_encrypted),page);
  const matches=await Promise.all(products.map(p=>findMatches(store,p)));
  const results=products.map(({images,description,...product},index)=>({
   ...product,photoCount:images?.length||0,
   photoUrl:images?.[0]||null,
   descriptionPreview:description?.slice(0,180)||'',
   existingListingId:matches[index].existingListingId,
   duplicate:matches[index]
  }));
  res.json({ok:true,storeId:store.id,page,hasMore:products.length===20,products:results});
 }catch(e){return failure(res,e);}
}));
router.post('/stores/:id/import/:wooId',limiter,wrap(async(req,res)=>{
 const opts=importOptions.safeParse(req.body);
 if(!opts.success||!idOK(req.params.wooId))return res.status(400).json({error:'invalid_import_options'});
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(store.status==='suspended')return res.status(409).json({error:'store_suspended'});
 if(!store.credentials_encrypted)return res.status(409).json({error:'woocommerce_not_connected'});
 try{
  await ensureImportSchema();
  const result=await importProduct(store,decryptCredentials(store.credentials_encrypted),Number(req.params.wooId),opts.data);
  res.json({ok:true,...result});
 }catch(e){return failure(res,e);}
}));
router.post('/stores/:id/link-existing/:wooId',limiter,wrap(async(req,res)=>{
 const payload=linkOptions.safeParse(req.body);
 if(!payload.success||!idOK(req.params.wooId))return res.status(400).json({error:'invalid_link_confirmation'});
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(store.status==='suspended')return res.status(409).json({error:'store_suspended'});
 if(!store.credentials_encrypted)return res.status(409).json({error:'woocommerce_not_connected'});
 try{
  await ensureImportSchema();
  const result=await linkExisting(store,decryptCredentials(store.credentials_encrypted),
   Number(req.params.wooId),payload.data.listingId,req.user.id);
  res.json({ok:true,...result});
 }catch(e){return failure(res,e);}
}));

router.post('/stores/:id/sync',limiter,wrap(async(req,res)=>{
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(store.status!=='approved')return res.status(409).json({error:'store_requires_approval'});
 if(!store.credentials_encrypted)return res.status(409).json({error:'woocommerce_not_connected'});
 try{res.json({ok:true,...await syncLinked(store,decryptCredentials(store.credentials_encrypted))});}
 catch(e){return failure(res,e);}
}));
router.post('/stores/:id/sync-settings',limiter,wrap(async(req,res)=>{
 if(typeof req.body?.enabled!=='boolean'||Object.keys(req.body).length!==1)return res.status(400).json({error:'invalid_sync_settings'});
 let store;try{store=await owned(req,res);}catch(e){return failure(res,e);}
 if(!store)return;
 if(req.body.enabled&&(store.status!=='approved'||!store.credentials_encrypted))
  return res.status(409).json({error:'store_requires_approval_and_connection'});
 await db.query('UPDATE marketplace_woocommerce_connections SET sync_enabled=$2,last_attempt_at=NULL,updated_at=now() WHERE store_id=$1',[store.id,req.body.enabled]);
 res.json({ok:true,syncEnabled:req.body.enabled});
}));
module.exports={router};
