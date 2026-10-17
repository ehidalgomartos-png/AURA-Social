'use strict';
// V3.2.85. Internal product-capacity decisions. NEVER production entitlements.
const db=require('../db');
const commercial=require('./marketplace-subscription-commercial-v3281');
const plans=require('./marketplace-commercial-plans-v3282');
const CODES=Object.freeze(['professional','professional_plus']);
const MODES=Object.freeze(['undecided','unlimited_proposal','capped_proposal']);
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_product_policy (
   plan_code TEXT PRIMARY KEY REFERENCES marketplace_subscription_commercial_features(plan_code) ON DELETE CASCADE,
   policy_mode TEXT NOT NULL DEFAULT 'undecided'
     CHECK(policy_mode IN ('undecided','unlimited_proposal','capped_proposal')),
   reason VARCHAR(400) NOT NULL DEFAULT '',
   updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 `INSERT INTO marketplace_subscription_commercial_product_policy(plan_code)
    VALUES ('professional'),('professional_plus')
    ON CONFLICT(plan_code) DO NOTHING`
];
let pending=null;
function ensureSchema(){
 if(!pending)pending=(async()=>{
  await commercial.ensureCommercialSchema();
  await plans.ensureSchema();
  for(const sql of DDL)await db.query(sql);
 })().catch(error=>{pending=null;throw error;});
 return pending;
}
class DecisionError extends Error{
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function parse(planCode,body){
 if(!CODES.includes(planCode))throw new DecisionError('unknown_plan',404);
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.getPrototypeOf(body)!==Object.prototype||
   Object.keys(body).sort().join(',')!=='mode,reason')throw new DecisionError('invalid_decision_payload');
 if(!MODES.includes(body.mode))throw new DecisionError('invalid_policy_mode');
 if(typeof body.reason!=='string'||body.reason.trim().length>400||
  (body.mode!=='undecided'&&body.reason.trim().length<12))
  throw new DecisionError('invalid_policy_reason');
 return {planCode,mode:body.mode,reason:body.reason.trim()};
}
function view(row){
 return {code:row.plan_code,mode:row.policy_mode,reason:row.reason||'',updatedAt:row.updated_at||null};
}
async function policies(query=db.query){
 const result=await query('SELECT plan_code,policy_mode,reason,updated_at FROM marketplace_subscription_commercial_product_policy ORDER BY plan_code');
 return result.rows.map(view);
}
function policyCheck(policy,features){
 const cap=features?.productLimit??null;
 if(!policy||policy.mode==='undecided')return {status:'undecided',description:'Decidir si conviene aplicar un límite de productos.'};
 if(policy.mode==='unlimited_proposal'){
  if(cap!==null)return {status:'mismatch',description:'Para proponer sin límite, deja vacío el límite numérico del plan.'};
  return {status:'proposed',description:'Sin límite de productos propuesto; todavía no aprobado.'};
 }
 if(!Number.isSafeInteger(cap)||cap<1)
  return {status:'mismatch',description:'Para proponer un límite, primero define su número en Características propuestas.'};
 return {status:'proposed',description:'Límite de '+cap+' productos propuesto, todavía no aprobado.'};
}
function summary(drafts,features,reviews,policyRows){
 const cards=CODES.map(code=>{
  const draft=drafts.find(x=>x.code===code)||null;
  const detail=features.find(x=>x.code===code)||null;
  const policy=policyRows.find(x=>x.code===code)||{code,mode:'undecided',reason:''};
  const cap=policyCheck(policy,detail);
  const issues=[];
  if(!draft||!detail)issues.push('Datos del borrador incompletos');
  if(!draft||!Number.isSafeInteger(draft.proposedMonthlyCents))
   issues.push('Precio comercial por decidir');
  if(!detail||!Number.isSafeInteger(detail.storeLimit))
   issues.push('Número de tiendas por decidir');
  if(cap.status==='undecided')issues.push('Criterio de productos por decidir');
  if(cap.status==='mismatch')issues.push('Incoherencia del criterio de productos');
  if(detail?.externalCheckout!==true)issues.push('Compra externa obligatoria no confirmada');
  if(code==='professional'&&(detail?.bulkImport!==false||detail?.wooSync!==false))
   issues.push('Profesional debe ser solo de publicación individual');
  if(code==='professional_plus'&&(detail?.bulkImport!==true||detail?.wooSync!==true))
   issues.push('Revisar ventajas de importación y sincronización de Plus');
  return {
   code,priceProposedCents:draft?.proposedMonthlyCents??null,
   storeLimit:detail?.storeLimit??null,productLimit:detail?.productLimit??null,
   manualOnly:code==='professional',bulkImport:detail?.bulkImport===true,
   wooSync:detail?.wooSync===true,policy,capacity:cap,issues,
   internallyDefined:issues.length===0
  };
 });
 const pendingReviews=reviews.filter(r=>r.status!=='reviewed').map(r=>r.name);
 const reviewed=reviews.filter(r=>r.status==='reviewed').map(r=>r.name);
 return {
  ok:true,commercialDraftOnly:true,pricesPublished:false,
  billingEnabled:false,enrollmentEnabled:false,entitlementsEnforced:false,
  liveStripeEnabled:false,pilotProtected:true,
  productionReady:false,legalApproval:false,externalCheckoutOnly:true,
  cards,pendingReviews,reviewedInternally:reviewed,
  information:'Las propuestas y revisiones internas nunca autorizan contratación ni pagos reales.'
 };
}
async function overview(){
 await ensureSchema();
 const [commercialData,featureData,policyData]=await Promise.all([commercial.overview(),plans.list(),policies()]);
 return summary(commercialData.drafts,featureData.plans,commercialData.reviews,policyData);
}
async function save({planCode,body,adminId,query=db.query}){
 const item=parse(planCode,body);
 const detail=await query('SELECT proposed_product_limit FROM marketplace_subscription_commercial_features WHERE plan_code=$1',[planCode]);
 if(!detail.rowCount)throw new DecisionError('plan_features_missing',404);
 const cap=detail.rows[0].proposed_product_limit;
 if(item.mode==='capped_proposal'&&(!Number.isSafeInteger(cap)||cap<1))
  throw new DecisionError('numeric_limit_required');
 if(item.mode==='unlimited_proposal'&&cap!==null)
  throw new DecisionError('clear_numeric_limit_first');
 const result=await query(
  `UPDATE marketplace_subscription_commercial_product_policy
    SET policy_mode=$2,reason=$3,updated_by=$4,updated_at=now()
    WHERE plan_code=$1 RETURNING plan_code,policy_mode,reason,updated_at`,
  [planCode,item.mode,item.reason,adminId]
 );
 if(!result.rowCount)throw new DecisionError('product_policy_missing',404);
 return {ok:true,commercialDraftOnly:true,billingEnabled:false,entitlementsEnforced:false,
  policy:view(result.rows[0])};
}
module.exports={CODES,MODES,DDL,DecisionError,ensureSchema,parse,view,policies,policyCheck,summary,overview,save};
