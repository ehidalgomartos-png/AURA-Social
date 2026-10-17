'use strict';
// RedLibertad V3.2.50 - Marketplace: products, services and property.
// Authenticated catalogue, ownership, moderation and reports; no in-app payments.
const express=require('express');
const {z}=require('zod');
const rateLimit=require('express-rate-limit');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');
const googleV3264=require('../services/marketplace-google-v3264');
const router=express.Router();

const KINDS=['product','service','property'];
const DEALS=['sale','rent','offer','buy'];
const STATUSES=['active','reserved','sold','paused'];
const SORTS={recent:'l.created_at DESC,l.id DESC',price_asc:'l.price_cents ASC,l.id DESC',price_desc:'l.price_cents DESC,l.id DESC'};
const picture=z.string().trim().regex(/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:jpe?g|png|webp)$/i);
const listingBase=z.object({
  kind:z.enum(KINDS),
  deal:z.enum(DEALS),
  title:z.string().trim().min(6).max(120),
  description:z.string().trim().min(25).max(4000),
  category:z.string().trim().min(2).max(65),
  city:z.string().trim().min(2).max(100),
  priceCents:z.number().int().nonnegative().max(99999999900),
  images:z.array(picture).max(6).default([]),
  details:z.object({
    condition:z.enum(['new','used']).optional(),
    brand:z.string().trim().min(1).max(80).optional(),
    mpn:z.string().trim().min(1).max(70).regex(/^[A-Za-z0-9][A-Za-z0-9 ._\/-]*$/).optional(),
    gtin:z.string().trim().refine(googleV3264.validGtin,{message:'EAN/GTIN no válido'}).optional(),
    serviceMode:z.enum(['in_person','remote','both']).optional(),
    serviceArea:z.string().trim().max(100).optional(),
    areaM2:z.number().int().positive().max(100000).optional(),
    rooms:z.number().int().min(0).max(100).optional(),
    subtype:z.string().trim().max(60).optional(),
    subcategory:z.string().trim().max(65).optional(),
    province:z.string().trim().max(100).optional(),
    saleScope:z.enum(['local','national']).optional()
  }).strict().default({})
}).strict();
function checkKindDeal(v,ctx){
  if(v.kind!=='product'&&['brand','mpn','gtin'].some(x=>v.details?.[x]))ctx.addIssue({code:'custom',path:['details'],message:'Los identificadores corresponden solo a productos'});
  if(v.details?.saleScope && !(v.kind==='product'&&v.deal==='sale'))ctx.addIssue({code:'custom',path:['details','saleScope'],message:'La zona de venta se aplica solo a productos en venta'});
  if(v.kind==='service'&&v.deal!=='offer')ctx.addIssue({code:'custom',path:['deal'],message:'El servicio debe ser una oferta'});
  if(v.kind==='product'&&!['sale','buy'].includes(v.deal))ctx.addIssue({code:'custom',path:['deal'],message:'Selecciona Venta o Compra / Busco'});
  if(v.kind==='property'&&!['sale','rent','buy'].includes(v.deal))ctx.addIssue({code:'custom',path:['deal'],message:'Selecciona venta, alquiler o compra'});
}
// Zod v3: superRefine returns ZodEffects, which cannot be extended.
// Both create and edit must refine the unwrapped base object independently.
const listingInput=listingBase.superRefine(checkKindDeal);
const listingUpdateInput=listingBase.extend({status:z.enum(STATUSES)}).superRefine(checkKindDeal);
const reportInput=z.object({
  reason:z.enum(['fraud','prohibited','spam','misleading','other']),
  details:z.string().trim().max(500).default('')
}).strict();
const idOk=id=>/^[1-9]\d{0,15}$/.test(String(id||''));

let schemaReady=null;
const DDL=[
  "CREATE TABLE IF NOT EXISTS marketplace_listings (id BIGSERIAL PRIMARY KEY, seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('product','service','property')), deal TEXT NOT NULL CHECK(deal IN ('sale','rent','offer','buy')), title VARCHAR(120) NOT NULL, description VARCHAR(4000) NOT NULL, category VARCHAR(65) NOT NULL, city VARCHAR(100) NOT NULL, price_cents BIGINT NOT NULL CHECK(price_cents>=0), image_urls JSONB NOT NULL DEFAULT '[]'::jsonb, details JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','reserved','sold','paused')), moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','hidden')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  // Existing deployments already have the original PostgreSQL CHECK constraint.
  // Upgrade it in place, keeping all existing listings intact and allowing 'buy'.
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid='marketplace_listings'::regclass
         AND conname='marketplace_listings_deal_check'
         AND pg_get_constraintdef(oid) LIKE '%buy%'
     ) THEN
       ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_deal_check;
       ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_deal_check CHECK (deal IN ('sale','rent','offer','buy'));
     END IF;
   END $$`,
  'CREATE INDEX IF NOT EXISTS idx_marketplace_discover ON marketplace_listings(kind,created_at DESC,id DESC) WHERE status=\'active\' AND moderation_status=\'published\'',
  'CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace_listings(seller_id,created_at DESC)',
  'CREATE TABLE IF NOT EXISTS marketplace_favorites (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,listing_id))',
  'CREATE TABLE IF NOT EXISTS marketplace_reports (id BIGSERIAL PRIMARY KEY, listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE, reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL CHECK(reason IN (\'fraud\',\'prohibited\',\'spam\',\'misleading\',\'other\')), details VARCHAR(500) NOT NULL DEFAULT \'\', resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(listing_id,reporter_id))',
  'CREATE INDEX IF NOT EXISTS idx_marketplace_reports_pending ON marketplace_reports(created_at DESC) WHERE resolved_at IS NULL'
];
async function ensureMarketplaceSchema(){
  if(!schemaReady){
    schemaReady=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(err=>{schemaReady=null;throw err;});
  }
  return schemaReady;
}
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use(requireAuth);
// A successful schema check MUST advance the Express router. The previous
// middleware resolved its promise without next(), leaving POST/GET waiting.
function marketplaceSchemaMiddleware(ensureSchema=ensureMarketplaceSchema){
  return (_req,_res,next)=>{
    Promise.resolve().then(ensureSchema).then(()=>next(),next);
  };
}
router.use(marketplaceSchemaMiddleware());

const cardFields="l.id,l.seller_id,l.kind,l.deal,l.title,l.description,l.category,l.city,l.price_cents,l.image_urls,l.details,l.status,l.moderation_status,l.created_at,l.updated_at,u.username AS seller_username,u.display_name AS seller_name,u.avatar_url AS seller_avatar,u.discoverable AS seller_discoverable,EXISTS(SELECT 1 FROM marketplace_favorites mf WHERE mf.listing_id=l.id AND mf.user_id=$1) AS is_favorite";
const joins=' FROM marketplace_listings l JOIN users u ON u.id=l.seller_id ';
const visibleToUser='u.status=\'active\' AND l.moderation_status=\'published\' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=l.seller_id) OR (b.blocked_id=$1 AND b.blocker_id=l.seller_id))';

router.use('/import',require('./marketplace-import-v3260').router);
router.use('/professional',require('./marketplace-professional-v3276').router);
router.use('/subscriptions',require('./marketplace-subscriptions-v3278').router);

router.get('/',wrap(async(req,res)=>{
  const kind=KINDS.includes(req.query.kind)?req.query.kind:null;
  const deal=DEALS.includes(req.query.deal)?req.query.deal:null;
  const query=String(req.query.q||'').trim().slice(0,100);
  const city=String(req.query.city||'').trim().slice(0,80);
  const province=String(req.query.province||'').trim().slice(0,100);
  const category=String(req.query.category||'').trim().slice(0,65);
  const maxPrice=String(req.query.maxPrice||'').trim();
  const sort=Object.hasOwn(SORTS,req.query.sort)?req.query.sort:'recent';
  const nationwide=req.query.saleScope==='national';
  const page=Math.min(20,Math.max(1,Number.parseInt(req.query.page,10)||1));
  const args=[req.user.id];
  const clauses=[visibleToUser,"l.status='active'"];
  if(kind){args.push(kind);clauses.push('l.kind=$'+args.length);}
  if(deal){args.push(deal);clauses.push('l.deal=$'+args.length);}
  if(query){args.push('%'+query+'%');clauses.push('(l.title ILIKE $'+args.length+' OR l.description ILIKE $'+args.length+' OR l.category ILIKE $'+args.length+')');}
  if(city){args.push('%'+city+'%');clauses.push('l.city ILIKE $'+args.length);}
  if(province){args.push('%'+province+'%');clauses.push("COALESCE(l.details->>'province','') ILIKE $"+args.length);}
  if(category){args.push(category);clauses.push('l.category=$'+args.length);}
  if(nationwide){
    clauses.push("l.kind='product' AND l.deal='sale' AND (l.details->>'saleScope'='national' OR (COALESCE(l.details->>'saleScope','')='' AND LOWER(l.city) IN ('españa','espana') AND LOWER(COALESCE(l.details->>'province','')) IN ('españa','espana')))");
  }
  if(maxPrice && /^\d{1,9}$/.test(maxPrice)){args.push(Number(maxPrice)*100);clauses.push('l.price_cents<=$'+args.length);}
  args.push(24,(page-1)*24);
  const items=await db.query('SELECT '+cardFields+joins+' WHERE '+clauses.join(' AND ')+' ORDER BY '+SORTS[sort]+' LIMIT $'+(args.length-1)+' OFFSET $'+args.length,args);
  res.json({ok:true,items:items.rows,page,hasMore:items.rows.length===24});
}));

// Private diagnostics for this signed-in seller: not a public Merchant feed.
router.get('/google-readiness',wrap(async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 const rows=await db.query("SELECT l.id,l.kind,l.deal,l.title,l.description,l.price_cents,l.image_urls,l.details,l.status,l.moderation_status,u.status AS seller_status,u.discoverable AS seller_discoverable FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.seller_id=$1 ORDER BY l.updated_at DESC LIMIT 251",[req.user.id]);
 const items=rows.rows.slice(0,250).map(googleV3264.auditProduct);
 res.json({ok:true,merchantFeedEnabled:false,merchantCheckoutAvailable:false,partial:rows.rows.length>250,
   summary:googleV3264.summary(items),items});
}));
router.get('/mine',wrap(async(req,res)=>{
  const result=await db.query('SELECT '+cardFields+joins+' WHERE l.seller_id=$1 ORDER BY l.created_at DESC LIMIT 200',[req.user.id]);
  res.json({ok:true,items:result.rows});
}));
router.get('/favorites',wrap(async(req,res)=>{
  const result=await db.query('SELECT '+cardFields+joins+' JOIN marketplace_favorites fav ON fav.listing_id=l.id AND fav.user_id=$1 WHERE '+visibleToUser+' AND l.status=\'active\' ORDER BY fav.created_at DESC LIMIT 200',[req.user.id]);
  res.json({ok:true,items:result.rows});
}));

router.get('/admin/reports',wrap(async(req,res)=>{
  if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
  const rows=await db.query('SELECT r.id,r.reason,r.details,r.created_at,r.listing_id,l.title,l.moderation_status,reporter.username AS reporter FROM marketplace_reports r JOIN marketplace_listings l ON l.id=r.listing_id JOIN users reporter ON reporter.id=r.reporter_id WHERE r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT 100');
  res.json({ok:true,reports:rows.rows});
}));
router.post('/admin/:id/moderate',wrap(async(req,res)=>{
  if(!req.user.isAdmin)return res.status(403).json({error:'admin_required'});
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const action=req.body?.action;
  if(!['hide','restore','resolve'].includes(action))return res.status(400).json({error:'invalid_action'});
  if(action==='resolve'){
    await db.query('UPDATE marketplace_reports SET resolved_at=now() WHERE listing_id=$1 AND resolved_at IS NULL',[req.params.id]);
  }else{
    const status=action==='hide'?'hidden':'published';
    const result=await db.query('UPDATE marketplace_listings SET moderation_status=$2,updated_at=now() WHERE id=$1 RETURNING id',[req.params.id,status]);
    if(!result.rowCount)return res.status(404).json({error:'listing_not_found'});
    await db.query('UPDATE marketplace_reports SET resolved_at=now() WHERE listing_id=$1 AND resolved_at IS NULL',[req.params.id]);
  }
  res.json({ok:true});
}));

// V3.2.69 — Read-only share preview, no publishing side effects.
router.get('/share-preview/:id',wrap(async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
 const result=await db.query(
  "SELECT l.id,l.title,l.price_cents,l.image_urls FROM marketplace_listings l JOIN users u ON u.id=l.seller_id "+
  "WHERE l.id=$1 AND l.status='active' AND l.moderation_status='published' "+
  "AND u.status='active' AND u.discoverable=true "+
  "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=l.seller_id) OR "+
  "(b.blocked_id=$2 AND b.blocker_id=l.seller_id)) LIMIT 1",
  [req.params.id,req.user.id]);
 if(!result.rowCount)return res.status(404).json({error:'listing_not_available'});
 const row=result.rows[0];
 const photo=Array.isArray(row.image_urls) ? row.image_urls.find(value=>picture.safeParse(value).success) : null;
 return res.json({ok:true,item:{id:row.id,title:row.title,priceCents:Number(row.price_cents),imageUrl:photo||null,url:'/marketplace/p/'+row.id}});
}));

router.get('/:id',wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const result=await db.query('SELECT '+cardFields+joins+' WHERE l.id=$2 AND (l.seller_id=$1 OR $3::boolean OR ('+visibleToUser+" AND l.status IN ('active','reserved','sold')))",[req.user.id,req.params.id,!!req.user.isAdmin]);
  if(!result.rowCount)return res.status(404).json({error:'listing_not_found'});
  res.json({ok:true,item:result.rows[0]});
}));

router.post('/',rateLimit({windowMs:60*60*1000,max:10,standardHeaders:true,legacyHeaders:false}),wrap(async(req,res)=>{
  const parsed=listingInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_listing',details:parsed.error.flatten()});
  const v=parsed.data;
  const r=await db.query('INSERT INTO marketplace_listings (seller_id,kind,deal,title,description,category,city,price_cents,image_urls,details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id',[req.user.id,v.kind,v.deal,v.title,v.description,v.category,v.city,v.priceCents,JSON.stringify(v.images),JSON.stringify(v.details)]);
  res.status(201).json({ok:true,id:r.rows[0].id});
}));

router.patch('/:id',wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const parsed=listingUpdateInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_listing',details:parsed.error.flatten()});
  const v=parsed.data;
  const r=await db.query("UPDATE marketplace_listings SET kind=$3,deal=$4,title=$5,description=$6,category=$7,city=$8,price_cents=$9,image_urls=$10::jsonb,details=$11::jsonb,status=$12,updated_at=now() WHERE id=$1 AND seller_id=$2 RETURNING id",[req.params.id,req.user.id,v.kind,v.deal,v.title,v.description,v.category,v.city,v.priceCents,JSON.stringify(v.images),JSON.stringify(v.details),v.status]);
  if(!r.rowCount)return res.status(404).json({error:'listing_not_found'});
  res.json({ok:true});
}));

// Owner-only quick status actions: preserve moderation status.
router.patch('/:id/status',wrap(async(req,res)=>{
 if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
 const parsed=z.object({status:z.enum(STATUSES)}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'invalid_status'});
 const row=await db.query('UPDATE marketplace_listings SET status=$3,updated_at=now() WHERE id=$1 AND seller_id=$2 RETURNING id,status',[req.params.id,req.user.id,parsed.data.status]);
 if(!row.rowCount)return res.status(404).json({error:'listing_not_found'});
 res.json({ok:true,id:row.rows[0].id,status:row.rows[0].status});
}));
router.delete('/:id',wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const result=await db.query('DELETE FROM marketplace_listings WHERE id=$1 AND seller_id=$2 RETURNING id',[req.params.id,req.user.id]);
  if(!result.rowCount)return res.status(404).json({error:'listing_not_found'});
  res.json({ok:true});
}));
router.post('/:id/favorite',wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const result=await db.query('INSERT INTO marketplace_favorites(user_id,listing_id) SELECT $1,l.id FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$2 AND l.seller_id<>$1 AND '+visibleToUser+" AND l.status='active' ON CONFLICT DO NOTHING RETURNING listing_id",[req.user.id,req.params.id]);
  if(!result.rowCount){
    const check=await db.query('SELECT 1 FROM marketplace_favorites WHERE user_id=$1 AND listing_id=$2',[req.user.id,req.params.id]);
    if(!check.rowCount)return res.status(404).json({error:'listing_not_available'});
  }
  res.json({ok:true});
}));
router.delete('/:id/favorite',wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  await db.query('DELETE FROM marketplace_favorites WHERE user_id=$1 AND listing_id=$2',[req.user.id,req.params.id]);
  res.json({ok:true});
}));
router.post('/:id/report',rateLimit({windowMs:60*60*1000,max:25,standardHeaders:true,legacyHeaders:false}),wrap(async(req,res)=>{
  if(!idOk(req.params.id))return res.status(400).json({error:'invalid_id'});
  const parsed=reportInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_report'});
  const result=await db.query('INSERT INTO marketplace_reports(listing_id,reporter_id,reason,details) SELECT id,$2,$3,$4 FROM marketplace_listings WHERE id=$1 AND seller_id<>$2 ON CONFLICT (listing_id,reporter_id) DO UPDATE SET reason=EXCLUDED.reason,details=EXCLUDED.details,created_at=now(),resolved_at=NULL RETURNING id',[req.params.id,req.user.id,parsed.data.reason,parsed.data.details]);
  if(!result.rowCount)return res.status(404).json({error:'listing_not_found'});
  res.json({ok:true});
}));

router.use((err,_req,res,_next)=>{
  console.error('Marketplace error:',err);
  if(!res.headersSent)res.status(500).json({error:'marketplace_unavailable'});
});
module.exports=router;
module.exports.ensureMarketplaceSchema=ensureMarketplaceSchema;
module.exports.DDL=DDL;
module.exports.marketplaceSchemaMiddleware=marketplaceSchemaMiddleware;
module.exports.listingInput=listingInput;
module.exports.listingUpdateInput=listingUpdateInput;
module.exports.checkKindDeal=checkKindDeal;

