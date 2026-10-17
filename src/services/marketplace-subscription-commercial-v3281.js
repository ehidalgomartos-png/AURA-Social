'use strict';
// V3.2.81 — internal commercial proposals ONLY.
// Plans are not for sale; drafts must never feed billing, entitlements or seller price endpoints.
const db=require('../db');
const CODES=Object.freeze(['professional','professional_plus']);
const TOPICS=Object.freeze([
 {code:'pricing',name:'Precios definitivos',detail:'Definir importes, límites reales y costes operativos.'},
 {code:'taxes',name:'IVA y facturación',detail:'Confirmar con asesoría fiscal impuestos, datos de factura y territorios.'},
 {code:'terms',name:'Condiciones y consentimiento',detail:'Redactar términos comerciales y aceptar expresamente antes de cualquier contratación.'},
 {code:'renewals',name:'Renovaciones',detail:'Definir calendario, avisos de renovación y fallos de cobro.'},
 {code:'cancellations',name:'Bajas y reembolsos',detail:'Definir cancelación, fecha efectiva, devoluciones y período de gracia.'},
 {code:'privacy',name:'Privacidad',detail:'Revisar datos necesarios, comunicaciones y conservación de información.'}
]);
const STATUSES=Object.freeze(['pending','in_review','reviewed']);
const DDL=[
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_drafts (
  plan_code TEXT PRIMARY KEY REFERENCES marketplace_subscription_plans(code),
  proposed_monthly_cents INTEGER CHECK(proposed_monthly_cents IS NULL OR proposed_monthly_cents BETWEEN 100 AND 1000000),
  summary VARCHAR(400) NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(plan_code IN ('professional','professional_plus'))
 )`,
 `INSERT INTO marketplace_subscription_commercial_drafts(plan_code,summary)
 VALUES
 ('professional','Publicación individual de productos y una tienda externa (propuesta), sin importación CSV ni sincronización automática. Pendiente de aprobación comercial.'),
 ('professional_plus','Modalidad para comercios con necesidades ampliadas, pendiente de aprobación comercial.')
 ON CONFLICT(plan_code) DO NOTHING`,
 // V3.2.90.1: repair only the untouched legacy default text. Explicitly preserve
 // all custom descriptions, prices, updated_by and operational seller records.
 `UPDATE marketplace_subscription_commercial_drafts
  SET summary='Publicación individual de productos y una tienda externa (propuesta), sin importación CSV ni sincronización automática. Pendiente de aprobación comercial.'
  WHERE plan_code='professional'
    AND summary='Conexión de una tienda externa y sincronización, pendiente de aprobación comercial.'`,
 `CREATE TABLE IF NOT EXISTS marketplace_subscription_commercial_reviews (
  topic TEXT PRIMARY KEY CHECK(topic IN ('pricing','taxes','terms','renewals','cancellations','privacy')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','in_review','reviewed')),
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`,
 `INSERT INTO marketplace_subscription_commercial_reviews(topic)
 VALUES ('pricing'),('taxes'),('terms'),('renewals'),('cancellations'),('privacy')
 ON CONFLICT(topic) DO NOTHING`
];
let ready=null;
function ensureCommercialSchema(){
 if(!ready)ready=(async()=>{for(const sql of DDL)await db.query(sql);})().catch(e=>{ready=null;throw e;});
 return ready;
}
class CommercialError extends Error{
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function own(obj){return obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&Object.getPrototypeOf(obj)===Object.prototype;}
function exactKeys(body,keys){
 return own(body)&&Object.keys(body).sort().join(',')===keys.slice().sort().join(',');
}
function parseDraft(planCode,body){
 if(!CODES.includes(planCode))throw new CommercialError('unknown_plan',404);
 if(!exactKeys(body,['proposedMonthlyCents','summary']))throw new CommercialError('invalid_draft_payload');
 const p=body.proposedMonthlyCents;
 if(p!==null&&(!Number.isInteger(p)||p<100||p>1000000))
  throw new CommercialError('invalid_proposed_price');
 if(typeof body.summary!=='string'||body.summary.trim().length<10||body.summary.trim().length>400)
  throw new CommercialError('invalid_summary');
 return {planCode,proposedMonthlyCents:p,summary:body.summary.trim()};
}
function parseReview(topic,body){
 if(!TOPICS.some(t=>t.code===topic))throw new CommercialError('unknown_topic',404);
 if(!exactKeys(body,['reviewStatus','notes']))throw new CommercialError('invalid_review_payload');
 if(!STATUSES.includes(body.reviewStatus))throw new CommercialError('invalid_review_status');
 if(typeof body.notes!=='string'||body.notes.length>1000)
  throw new CommercialError('invalid_review_notes');
 return {topic,reviewStatus:body.reviewStatus,notes:body.notes.trim()};
}
async function overview(query=db.query){
 const [drafts,reviews]=await Promise.all([
  query('SELECT plan_code,proposed_monthly_cents,summary,updated_at FROM marketplace_subscription_commercial_drafts ORDER BY plan_code'),
  query('SELECT topic,review_status,notes,updated_at FROM marketplace_subscription_commercial_reviews ORDER BY topic')
 ]);
 return {ok:true,commercialDraftOnly:true,billingEnabled:false,enrollmentEnabled:false,
   entitlementsEnforced:false,pricesPublished:false,pilotProtected:true,
   drafts:drafts.rows.map(x=>({code:x.plan_code,proposedMonthlyCents:x.proposed_monthly_cents,
     summary:x.summary,updatedAt:x.updated_at})),
   reviews:TOPICS.map(t=>{const row=reviews.rows.find(x=>x.topic===t.code);
    return {...t,status:row?.review_status||'pending',notes:row?.notes||'',updatedAt:row?.updated_at||null};})};
}
async function saveDraft({planCode,body,adminId,query=db.query}){
 const entry=parseDraft(planCode,body);
 const q=await query(
 `UPDATE marketplace_subscription_commercial_drafts SET
  proposed_monthly_cents=$2,summary=$3,updated_by=$4,updated_at=now()
  WHERE plan_code=$1 RETURNING plan_code,proposed_monthly_cents,summary,updated_at`,
  [entry.planCode,entry.proposedMonthlyCents,entry.summary,adminId]);
 if(!q.rowCount)throw new CommercialError('draft_not_found',404);
 return {ok:true,commercialDraftOnly:true,billingEnabled:false,draft:q.rows[0]};
}
async function saveReview({topic,body,adminId,query=db.query}){
 const entry=parseReview(topic,body);
 const q=await query(
 `UPDATE marketplace_subscription_commercial_reviews
 SET review_status=$2,notes=$3,updated_by=$4,updated_at=now()
 WHERE topic=$1 RETURNING topic,review_status,notes,updated_at`,
  [entry.topic,entry.reviewStatus,entry.notes,adminId]);
 if(!q.rowCount)throw new CommercialError('review_not_found',404);
 return {ok:true,commercialDraftOnly:true,billingEnabled:false,review:q.rows[0]};
}
module.exports={CODES,TOPICS,STATUSES,DDL,ensureCommercialSchema,CommercialError,
 parseDraft,parseReview,overview,saveDraft,saveReview};
