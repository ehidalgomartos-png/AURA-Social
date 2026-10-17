'use strict';
// V3.2.82: internal plan proposals, NEVER entitlements or paid subscription plans.
const db=require('../db');
const PLANS=Object.freeze(['professional','professional_plus']);
const FEATURES=Object.freeze([
 {key:'storeLimit',label:'Tiendas externas conectadas'},
 {key:'productLimit',label:'Productos sincronizados'},
 {key:'wooSync',label:'Sincronización WooCommerce'},
 {key:'bulkImport',label:'Importación por lotes'},
 {key:'externalCheckout',label:'Compra en la web del vendedor'}
]);
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_features (
  plan_code TEXT PRIMARY KEY REFERENCES marketplace_subscription_commercial_drafts(plan_code) ON DELETE CASCADE,
  proposed_store_limit INTEGER CHECK(proposed_store_limit BETWEEN 1 AND 100),
  proposed_product_limit INTEGER CHECK(proposed_product_limit BETWEEN 1 AND 1000000),
  woo_sync BOOLEAN NOT NULL DEFAULT true,
  bulk_import BOOLEAN NOT NULL DEFAULT true,
  external_checkout BOOLEAN NOT NULL DEFAULT true,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (plan_code IN ('professional','professional_plus'))
 )`,
 `INSERT INTO marketplace_subscription_commercial_features
   (plan_code,proposed_store_limit,proposed_product_limit,woo_sync,bulk_import,external_checkout)
   VALUES ('professional',1,NULL,true,true,true),('professional_plus',3,NULL,true,true,true)
   ON CONFLICT(plan_code) DO NOTHING`
];
let ready;
function ensureSchema(){
 if(!ready)ready=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(e=>{ready=null;throw e;});
 return ready;
}
class ProposalError extends Error {
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function normalize(planCode,body){
 if(!PLANS.includes(planCode))throw new ProposalError('unknown_plan',404);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype||
   Object.keys(body).sort().join(',')!=='bulkImport,externalCheckout,productLimit,storeLimit,wooSync')
  throw new ProposalError('invalid_proposal');
 function lim(v,max,field){
  if(v===null)return null;
  if(!Number.isSafeInteger(v)||v<1||v>max)throw new ProposalError('invalid_'+field);
  return v;
 }
 for(const key of ['wooSync','bulkImport','externalCheckout']){
  if(typeof body[key]!=='boolean')throw new ProposalError('invalid_'+key);
 }
 // Buying products outside RedLibertad is an invariant, never configurable.
 if(body.externalCheckout!==true)throw new ProposalError('external_checkout_required');
 if(body.bulkImport&&!body.wooSync)throw new ProposalError('bulk_import_requires_sync');
 return {
  code:planCode,storeLimit:lim(body.storeLimit,100,'store_limit'),
  productLimit:lim(body.productLimit,1000000,'product_limit'),
  wooSync:body.wooSync,bulkImport:body.bulkImport,externalCheckout:true
 };
}
function toView(row){
 return {code:row.plan_code,storeLimit:row.proposed_store_limit,productLimit:row.proposed_product_limit,
  wooSync:row.woo_sync===true,bulkImport:row.bulk_import===true,externalCheckout:row.external_checkout===true};
}
async function list(query=db.query){
 const result=await query(
  'SELECT plan_code,proposed_store_limit,proposed_product_limit,woo_sync,bulk_import,external_checkout FROM marketplace_subscription_commercial_features ORDER BY plan_code'
 );
 return {ok:true,proposalOnly:true,pricesPublished:false,enrollmentEnabled:false,entitlementsEnforced:false,
  features:FEATURES,plans:result.rows.map(toView)};
}
async function save({planCode,body,adminId,query=db.query}){
 const draft=normalize(planCode,body);
 const result=await query(
  `UPDATE marketplace_subscription_commercial_features
   SET proposed_store_limit=$2,proposed_product_limit=$3,woo_sync=$4,bulk_import=$5,
       external_checkout=$6,updated_by=$7,updated_at=now()
   WHERE plan_code=$1
   RETURNING plan_code,proposed_store_limit,proposed_product_limit,woo_sync,bulk_import,external_checkout`,
  [draft.code,draft.storeLimit,draft.productLimit,draft.wooSync,draft.bulkImport,draft.externalCheckout,adminId]
 );
 if(!result.rowCount)throw new ProposalError('proposal_not_found',404);
 return {ok:true,proposalOnly:true,entitlementsEnforced:false,plan:toView(result.rows[0])};
}
module.exports={DDL,PLANS,FEATURES,ProposalError,ensureSchema,normalize,toView,list,save};
