'use strict';
// V3.2.86: explicit, auditable, *admin-only* proposals to remove product-count caps.
// No seller subscriptions, entitlements, paid plans, checkout or operational routes.
const db=require('../db');
const decisions=require('./marketplace-commercial-decisions-v3285');
const PLAN_CODES=Object.freeze(['professional','professional_plus']);
const CONFIRMATION='propose_unlimited_for_both';
const REASON='Se propone catálogo sin límite comercial en ambos planes; Profesional publica individualmente y Plus incorpora CSV y sincronización. Se mantienen controles técnicos antiabuso.';
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_capacity_audit (
    id BIGSERIAL PRIMARY KEY,
    plan_code TEXT NOT NULL CHECK(plan_code IN ('professional','professional_plus')),
    previous_product_limit INTEGER,
    previous_policy_mode TEXT NOT NULL,
    previous_reason VARCHAR(400) NOT NULL DEFAULT '',
    next_product_limit INTEGER,
    next_policy_mode TEXT NOT NULL,
    next_reason VARCHAR(400) NOT NULL DEFAULT '',
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 `CREATE INDEX IF NOT EXISTS idx_marketplace_capacity_audit_plan_date
    ON marketplace_subscription_commercial_capacity_audit(plan_code,changed_at DESC)`
];
let ready=null;
async function ensureSchema(){
 await decisions.ensureSchema();
 if(!ready)ready=(async()=>{for(const statement of DDL)await db.query(statement);})().catch(err=>{ready=null;throw err;});
 return ready;
}
class UnlimitedError extends Error{
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function parse(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype||
  Object.keys(body).join(',')!=='confirmation'||body.confirmation!==CONFIRMATION)
  throw new UnlimitedError('invalid_unlimited_confirmation');
 return true;
}
function result(changedCodes){
 return {
  ok:true,proposalOnly:true,commercialDraftOnly:true,
  changesAppliedToCommercialDrafts:changedCodes,
  pricesPublished:false,billingEnabled:false,liveStripeEnabled:false,
  enrollmentEnabled:false,entitlementsEnforced:false,pilotProtected:true,externalCheckoutOnly:true,
  explanation:'Propuesta de productos ilimitados guardada únicamente en planificación comercial.'
 };
}
async function apply({body,adminId,pool=db.pool}){
 parse(body);
 if(!Number.isSafeInteger(adminId)||adminId<1)throw new UnlimitedError('invalid_admin');
 await ensureSchema();
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  const old=await client.query(
   `SELECT f.plan_code,f.proposed_product_limit,p.policy_mode,p.reason
    FROM marketplace_subscription_commercial_features f
    JOIN marketplace_subscription_commercial_product_policy p ON p.plan_code=f.plan_code
    WHERE f.plan_code=ANY($1::text[])
    ORDER BY f.plan_code FOR UPDATE OF f,p`,[PLAN_CODES]
  );
  if(old.rows.length!==PLAN_CODES.length||PLAN_CODES.some(code=>!old.rows.some(r=>r.plan_code===code)))
   throw new UnlimitedError('commercial_plans_incomplete',409);
  const changed=old.rows.filter(row=>row.proposed_product_limit!==null||
   row.policy_mode!=='unlimited_proposal'||row.reason!==REASON);
  if(changed.length){
   await client.query(
    `UPDATE marketplace_subscription_commercial_features
     SET proposed_product_limit=NULL,updated_by=$2,updated_at=now()
     WHERE plan_code=ANY($1::text[]) AND proposed_product_limit IS NOT NULL`,
    [PLAN_CODES,adminId]
   );
   await client.query(
    `UPDATE marketplace_subscription_commercial_product_policy
     SET policy_mode='unlimited_proposal',reason=$2,updated_by=$3,updated_at=now()
     WHERE plan_code=ANY($1::text[])
       AND (policy_mode IS DISTINCT FROM 'unlimited_proposal' OR reason IS DISTINCT FROM $2)`,
    [PLAN_CODES,REASON,adminId]
   );
   for(const prior of changed){
    await client.query(
     `INSERT INTO marketplace_subscription_commercial_capacity_audit
       (plan_code,previous_product_limit,previous_policy_mode,previous_reason,
        next_product_limit,next_policy_mode,next_reason,actor_id)
       VALUES ($1,$2,$3,$4,NULL,'unlimited_proposal',$5,$6)`,
     [prior.plan_code,prior.proposed_product_limit,prior.policy_mode,prior.reason||'',REASON,adminId]
    );
   }
  }
  await client.query('COMMIT');begun=false;
  return result(changed.map(x=>x.plan_code));
 }catch(err){
  if(begun)await client.query('ROLLBACK');
  throw err;
 }finally{client.release();}
}
module.exports={PLAN_CODES,CONFIRMATION,REASON,DDL,UnlimitedError,ensureSchema,parse,result,apply};
