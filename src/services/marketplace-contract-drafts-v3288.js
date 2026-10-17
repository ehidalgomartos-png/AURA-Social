'use strict';
// V3.2.88: versioned INTERNAL templates for possible future professional contracts.
// Never return these private drafts to seller or public routes; never record consent.
const db=require('../db');
const commercial=require('./marketplace-subscription-commercial-v3281');
const {normalizeAdminId}=require('./marketplace-commercial-unlimited-v3286');

const PLANS=Object.freeze(['professional','professional_plus']);
const FIELDS=Object.freeze(['priceDisclosure','taxes','renewals','cancellations','privacy','consent']);
const STATUSES=Object.freeze(['draft','internal_review']);
const LIMIT=1200;
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_contract_drafts (
   plan_code TEXT PRIMARY KEY REFERENCES marketplace_subscription_commercial_drafts(plan_code) ON DELETE CASCADE,
   revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
   review_state TEXT NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','internal_review')),
   price_disclosure VARCHAR(1200) NOT NULL DEFAULT '',
   taxes VARCHAR(1200) NOT NULL DEFAULT '',
   renewals VARCHAR(1200) NOT NULL DEFAULT '',
   cancellations VARCHAR(1200) NOT NULL DEFAULT '',
   privacy VARCHAR(1200) NOT NULL DEFAULT '',
   consent VARCHAR(1200) NOT NULL DEFAULT '',
   updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 `INSERT INTO marketplace_subscription_contract_drafts(plan_code)
    VALUES ('professional'),('professional_plus')
    ON CONFLICT(plan_code) DO NOTHING`,
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_contract_draft_history (
   id BIGSERIAL PRIMARY KEY,
   plan_code TEXT NOT NULL REFERENCES marketplace_subscription_contract_drafts(plan_code) ON DELETE CASCADE,
   revision INTEGER NOT NULL CHECK(revision > 0),
   old_content JSONB NOT NULL,
   new_content JSONB NOT NULL,
   actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
   changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE(plan_code,revision)
 )`
];
const COLUMN_MAP=Object.freeze({
 priceDisclosure:'price_disclosure',taxes:'taxes',renewals:'renewals',
 cancellations:'cancellations',privacy:'privacy',consent:'consent'
});
let pending=null;
async function ensureSchema(){
 await commercial.ensureCommercialSchema();
 if(!pending)pending=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(err=>{pending=null;throw err;});
 return pending;
}
class ContractDraftError extends Error{
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function parse(code,body){
 if(!PLANS.includes(code))throw new ContractDraftError('unknown_contract_plan',404);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype||
  Object.keys(body).sort().join(',')!==[...FIELDS,'expectedRevision','reviewState'].sort().join(','))
  throw new ContractDraftError('invalid_contract_draft_payload');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw new ContractDraftError('invalid_contract_revision');
 if(!STATUSES.includes(body.reviewState))throw new ContractDraftError('invalid_contract_review_state');
 const values={};
 for(const field of FIELDS){
  const raw=body[field];
  if(typeof raw!=='string')throw new ContractDraftError('invalid_contract_text');
  const value=raw.trim();
  if(value.length>LIMIT||value.includes('\u0000'))throw new ContractDraftError('invalid_contract_text');
  values[field]=value;
 }
 if(body.reviewState==='internal_review'&&FIELDS.some(f=>values[f].length<20))
  throw new ContractDraftError('contract_draft_incomplete');
 return {planCode:code,expectedRevision:body.expectedRevision,reviewState:body.reviewState,...values};
}
function view(row){
 const result={code:row.plan_code,revision:row.revision,reviewState:row.review_state,
  updatedAt:row.updated_at||null};
 for(const field of FIELDS)result[field]=row[COLUMN_MAP[field]]||'';
 result.complete=FIELDS.every(field=>result[field].length>=20);
 return result;
}
function state(){
 return {commercialDraftOnly:true,previewOnly:true,publiclyAvailable:false,
  legallyApproved:false,consentCollected:false,pricesPublished:false,
  billingEnabled:false,liveStripeEnabled:false,enrollmentEnabled:false,
  entitlementsEnforced:false,pilotProtected:true,productCheckoutExternal:true};
}
async function list(query=db.query){
 await ensureSchema();
 const result=await query(
  `SELECT plan_code,revision,review_state,price_disclosure,taxes,renewals,
   cancellations,privacy,consent,updated_at FROM marketplace_subscription_contract_drafts ORDER BY plan_code`
 );
 return {ok:true,...state(),drafts:result.rows.map(view)};
}
async function save({planCode,body,adminId,pool=db.pool}){
 const draft=parse(planCode,body);
 const actorId=normalizeAdminId(adminId);
 await ensureSchema();
 const client=await pool.connect();
 let started=false;
 try{
  await client.query('BEGIN');started=true;
  const current=await client.query(
   `SELECT plan_code,revision,review_state,price_disclosure,taxes,renewals,
    cancellations,privacy,consent,updated_at
    FROM marketplace_subscription_contract_drafts WHERE plan_code=$1 FOR UPDATE`,[planCode]);
  if(current.rowCount!==1)throw new ContractDraftError('contract_draft_not_found',404);
  const previous=view(current.rows[0]);
  if(previous.revision!==draft.expectedRevision)throw new ContractDraftError('contract_draft_conflict',409);
  const changed=previous.reviewState!==draft.reviewState||FIELDS.some(k=>previous[k]!==draft[k]);
  let saved=previous;
  if(changed){
   const updated=await client.query(
    `UPDATE marketplace_subscription_contract_drafts SET
     revision=revision+1,review_state=$2,price_disclosure=$3,taxes=$4,
     renewals=$5,cancellations=$6,privacy=$7,consent=$8,
     updated_by=$9,updated_at=now()
     WHERE plan_code=$1 RETURNING
     plan_code,revision,review_state,price_disclosure,taxes,renewals,
     cancellations,privacy,consent,updated_at`,
    [planCode,draft.reviewState,...FIELDS.map(field=>draft[field]),actorId]
   );
   saved=view(updated.rows[0]);
   await client.query(
    `INSERT INTO marketplace_subscription_contract_draft_history
    (plan_code,revision,old_content,new_content,actor_id)
    VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
    [planCode,saved.revision,JSON.stringify(previous),JSON.stringify(saved),actorId]
   );
  }
  await client.query('COMMIT');started=false;
  return {ok:true,...state(),changed,draft:saved};
 }catch(err){
  if(started)await client.query('ROLLBACK');
  throw err;
 }finally{client.release();}
}
module.exports={PLANS,FIELDS,STATUSES,DDL,ContractDraftError,ensureSchema,parse,view,state,list,save};
