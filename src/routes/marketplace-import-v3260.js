'use strict';
// Seller-owned, resumable WooCommerce CSV imports: preview -> confirm -> safe one-product steps.
const express=require('express');
const crypto=require('node:crypto');
const rateLimit=require('express-rate-limit');
const db=require('../db');
// Resolve schema on request, after the parent Marketplace router is fully initialized.
const listingSchema=()=>require('./marketplace-v3250').listingInput;
const {csvRecords,parseProduct,importOptions,MAX_CSV_BYTES}=require('../services/marketplace-woocommerce-csv-v3260');
const {saveImages,eraseFiles,imageFailureCode}=require('../services/marketplace-import-photos-v3260');
const router=express.Router();
let prepared=null;
async function ensureImportSchema(){
 if(!prepared){
  prepared=(async()=>{
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_import_batches (id UUID PRIMARY KEY,seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,items JSONB NOT NULL,confirmed BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '24 hours'))");
   await db.query("CREATE INDEX IF NOT EXISTS idx_marketplace_import_batches_seller ON marketplace_import_batches(seller_id,created_at DESC)");
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_import_links (seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,source_key VARCHAR(150) NOT NULL,listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(seller_id,source_key),UNIQUE(listing_id))");
  })().catch(e=>{prepared=null;throw e;});
 }
 return prepared;
}
const limiter=rateLimit({windowMs:60*60*1000,max:30,standardHeaders:true,legacyHeaders:false});
const stepsLimiter=rateLimit({windowMs:60*60*1000,max:500,standardHeaders:true,legacyHeaders:false});
function summary(items){
 const counts={total:items.length,ready:0,invalid:0,duplicate:0,imported:0,failed:0,pending:0};
 for(const i of items){const key=i.state;if(key in counts)counts[key]++;if(key==='pending')counts.ready++;}
 counts.completed=counts.invalid+counts.duplicate+counts.imported+counts.failed;
 return counts;
}
const idOk=id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(id||''));
async function batch(req,res){
 if(!idOk(req.params.id)){res.status(400).json({error:'invalid_batch'});return null;}
 const found=await db.query('SELECT id,items,confirmed,expires_at FROM marketplace_import_batches WHERE id=$1 AND seller_id=$2',[req.params.id,req.user.id]);
 if(!found.rowCount){res.status(404).json({error:'import_not_found'});return null;}
 return found.rows[0];
}
router.post('/preview',limiter,async(req,res,next)=>{
 try{
  await ensureImportSchema();
  const parsed=importOptions.safeParse(req.body?.options);
  if(!parsed.success)return res.status(400).json({error:'invalid_import_options'});
  const csv=req.body?.csv;
  if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)return res.status(413).json({error:'csv_too_large'});
  const records=csvRecords(csv);
  const seen=new Set(),items=records.map(r=>{
   const item=parseProduct(r,parsed.data);
   if(item.key&&seen.has(item.key)){item.state='duplicate';item.error='SKU o ID repetido dentro del archivo';}
   else if(item.key)seen.add(item.key);
   const checked=listingSchema().safeParse(item.listing);
   if(!checked.success&&item.state==='pending'){item.state='invalid';item.error='Campos del anuncio incompatibles';}
   return item;
  });
  const keys=items.filter(i=>i.key&&i.state==='pending').map(i=>i.key);
  if(keys.length){
   const existing=await db.query('SELECT source_key FROM marketplace_import_links WHERE seller_id=$1 AND source_key=ANY($2::text[])',[req.user.id,keys]);
   const taken=new Set(existing.rows.map(r=>r.source_key));
   for(const i of items)if(i.state==='pending'&&taken.has(i.key)){i.state='duplicate';i.error='Producto importado anteriormente';}
  }
  const id=crypto.randomUUID();
  await db.query('INSERT INTO marketplace_import_batches(id,seller_id,items) VALUES($1,$2,$3::jsonb)',[id,req.user.id,JSON.stringify(items)]);
  res.status(201).json({ok:true,id,summary:summary(items),items:items.slice(0,40).map(i=>({line:i.line,title:i.title,priceCents:i.priceCents,photos:i.urls.length,state:i.state,error:i.error}))});
 }catch(e){if(/^csv_/.test(e.message))return res.status(400).json({error:e.message});next(e);}
});
router.get('/latest',async(req,res,next)=>{
 try{
  await ensureImportSchema();
  const found=await db.query('SELECT id,items,confirmed FROM marketplace_import_batches WHERE seller_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 1',[req.user.id]);
  if(!found.rowCount)return res.json({ok:true,batch:null});
  const b=found.rows[0];res.json({ok:true,batch:{id:b.id,confirmed:b.confirmed,summary:summary(b.items)}});
 }catch(e){next(e);}
});
router.get('/:id',async(req,res,next)=>{
 try{
  await ensureImportSchema();const b=await batch(req,res);if(!b)return;
  const page=Math.min(10,Math.max(1,Number.parseInt(req.query.page,10)||1));
  res.json({ok:true,id:b.id,confirmed:b.confirmed,summary:summary(b.items),items:b.items.slice((page-1)*50,page*50).map(i=>({line:i.line,title:i.title,priceCents:i.priceCents,photos:i.urls.length,state:i.state,error:i.error,listingId:i.listingId})),page});
 }catch(e){next(e);}
});
router.post('/:id/confirm',limiter,async(req,res,next)=>{
 try{
  await ensureImportSchema();const b=await batch(req,res);if(!b)return;
  if(new Date(b.expires_at)<new Date())return res.status(410).json({error:'preview_expired'});
  if(!b.items.some(i=>i.state==='pending'))return res.status(400).json({error:'no_products_to_import'});
  await db.query('UPDATE marketplace_import_batches SET confirmed=true WHERE id=$1 AND seller_id=$2',[b.id,req.user.id]);
  res.json({ok:true,id:b.id,summary:summary(b.items)});
 }catch(e){next(e);}
});
router.post('/:id/step',stepsLimiter,async(req,res,next)=>{
 let client=null,files=[],committed=false;
 try{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_batch'});
  await ensureImportSchema();
  client=await db.pool.connect();
  await client.query('BEGIN');
  const r=await client.query('SELECT id,items,confirmed,expires_at FROM marketplace_import_batches WHERE id=$1 AND seller_id=$2 FOR UPDATE',[req.params.id,req.user.id]);
  if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'import_not_found'});}
  const b=r.rows[0];
  if(!b.confirmed){await client.query('ROLLBACK');return res.status(409).json({error:'confirmation_required'});}
  if(new Date(b.expires_at)<new Date()){await client.query('ROLLBACK');return res.status(410).json({error:'import_expired'});}
  const items=b.items;const item=items.find(x=>x.state==='pending');
  if(!item){await client.query('COMMIT');committed=true;return res.json({ok:true,done:true,summary:summary(items)});}
  const existing=await client.query('SELECT listing_id FROM marketplace_import_links WHERE seller_id=$1 AND source_key=$2',[req.user.id,item.key]);
  if(existing.rowCount){item.state='duplicate';item.error='Producto importado previamente';}
  else{
   let phase='images';
   try{
    const photos=await saveImages(item.urls);files=photos.files;
    phase='listing';
    const validate=listingSchema().safeParse({...item.listing,images:photos.paths});
    if(!validate.success)throw new Error('invalid_import_listing');
    const v=validate.data;
    const saved=await client.query('INSERT INTO marketplace_listings(seller_id,kind,deal,title,description,category,city,price_cents,image_urls,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id',[req.user.id,v.kind,v.deal,v.title,v.description,v.category,v.city,v.priceCents,JSON.stringify(v.images),JSON.stringify(v.details)]);
    const id=saved.rows[0].id;
    const linked=await client.query('INSERT INTO marketplace_import_links(seller_id,source_key,listing_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING listing_id',[req.user.id,item.key,id]);
    if(!linked.rowCount){await client.query('DELETE FROM marketplace_listings WHERE id=$1 AND seller_id=$2',[id,req.user.id]);item.state='duplicate';item.error='Producto importado en otra sesión';}
    else{item.state='imported';item.listingId=id;}
   }catch(e){
    if(phase==='images'||e.message==='invalid_import_listing'){item.state='failed';item.error='No se pudo importar: '+(phase==='images'?imageFailureCode(e):'invalid_import_listing');}
    else throw e;
   }
  }
  await client.query('UPDATE marketplace_import_batches SET items=$3::jsonb WHERE id=$1 AND seller_id=$2',[b.id,req.user.id,JSON.stringify(items)]);
  await client.query('COMMIT');committed=true;
  if(item.state!=='imported'&&files.length)await eraseFiles(files);
  const stats=summary(items);
  return res.json({ok:true,done:stats.pending===0,summary:stats,processed:{line:item.line,title:item.title,state:item.state,error:item.error,listingId:item.listingId}});
 }catch(e){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  if(files.length)await eraseFiles(files);
  console.error('Marketplace CSV step error:',{code:e.code||'unknown',message:e.message,batchId:req.params.id});
  next(e);
 }finally{client?.release();}
});
router.use((err,_req,res,_next)=>{
 console.error('Marketplace CSV import error:',err?.message);
 if(!res.headersSent)res.status(500).json({error:'import_unavailable'});
});
module.exports={router,ensureImportSchema,summary};
