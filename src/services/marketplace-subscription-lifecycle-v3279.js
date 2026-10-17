'use strict';
// V3.2.79 — manual, admin-only subscription lifecycle. No payments or entitlement enforcement.
const db=require('../db');

const ONE_DAY=24*60*60*1000;
const MAX_HORIZON=366*ONE_DAY;
const ACTIONS=['start_trial','renew_trial','schedule_cancel','undo_cancel','grant_grace','close_period','restore_pilot'];
class LifecycleError extends Error {
 constructor(code,status=409){super(code);this.code=code;this.status=status;}
}
function safeId(id){return /^[1-9]\d{0,15}$/.test(String(id||''));}
function dateValue(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
 const time=Date.parse(value);
 return Number.isFinite(time)?new Date(time):null;
}
function displayedStatus(row,now=Date.now()){
 if(!row)return 'free';
 if(['trialing','active'].includes(row.status)&&row.period_ends_at){
  const end=new Date(row.period_ends_at).getTime();
  if(Number.isFinite(end)&&end<=now){
   const grace=row.grace_until?new Date(row.grace_until).getTime():0;
   if(grace>now)return 'grace';
   return 'awaiting_review';
  }
 }
 return row.status;
}
function accountView(row,approvedCount=0,now=Date.now()){
 return {
  planCode:row?.plan_code||(approvedCount>0?'professional':'particular'),
  status:displayedStatus(row,now)==='free'&&approvedCount>0?'pilot':displayedStatus(row,now),
  recordedStatus:row?.status||null,
  periodStartsAt:row?.period_starts_at||null,
  periodEndsAt:row?.period_ends_at||null,
  graceUntil:row?.grace_until||null,
  cancelAtPeriodEnd:row?.cancel_at_period_end===true,
  grandfathered:!row&&approvedCount>0
 };
}
function parseAction(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new LifecycleError('invalid_action',400);
 const allowed=['action','periodEndAt','graceDays','confirmPilotChange'];
 if(Object.keys(body).some(k=>!allowed.includes(k))||!ACTIONS.includes(body.action))throw new LifecycleError('invalid_action',400);
 if(body.periodEndAt!==undefined && (typeof body.periodEndAt!=='string'||!dateValue(body.periodEndAt)))throw new LifecycleError('invalid_period_end',400);
 if(body.graceDays!==undefined&&(!Number.isInteger(body.graceDays)||body.graceDays<1||body.graceDays>30))throw new LifecycleError('invalid_grace_days',400);
 if(body.confirmPilotChange!==undefined&&typeof body.confirmPilotChange!=='boolean')throw new LifecycleError('invalid_confirmation',400);
 if(['start_trial','renew_trial'].includes(body.action)&&!dateValue(body.periodEndAt))throw new LifecycleError('period_end_required',400);
 if(body.action==='grant_grace'&&!Number.isInteger(body.graceDays))throw new LifecycleError('grace_days_required',400);
 return body;
}
function transition(existing,input,approvedCount,now=Date.now()){
 const a=parseAction(input),before=existing||null;
 const status=before?.status||null;
 const next={plan_code:before?.plan_code||'professional',status:status||'pilot',
  period_starts_at:before?.period_starts_at||null,period_ends_at:before?.period_ends_at||null,
  grace_until:before?.grace_until||null,cancel_at_period_end:before?.cancel_at_period_end===true};
 if(a.action==='restore_pilot'){
  if(approvedCount<1)throw new LifecycleError('approved_store_required');
  if(status&&status!=='pilot'&&a.confirmPilotChange!==true)throw new LifecycleError('confirm_pilot_change_required');
  next.status='pilot';next.plan_code='professional';next.period_starts_at=null;next.period_ends_at=null;next.grace_until=null;next.cancel_at_period_end=false;
 }else if(a.action==='start_trial'){
  if(approvedCount<1)throw new LifecycleError('approved_store_required');
  if(status&&!['pilot','canceled','expired'].includes(status))throw new LifecycleError('invalid_transition');
  if(a.confirmPilotChange!==true)throw new LifecycleError('confirm_pilot_change_required');
  const end=dateValue(a.periodEndAt).getTime();
  if(end<=now||end>now+MAX_HORIZON)throw new LifecycleError('period_end_out_of_range',400);
  next.status='trialing';next.plan_code='professional';next.period_starts_at=new Date(now);next.period_ends_at=new Date(end);
  next.grace_until=null;next.cancel_at_period_end=false;
 }else if(a.action==='renew_trial'){
  if(status!=='trialing')throw new LifecycleError('trial_required');
  const end=dateValue(a.periodEndAt).getTime();
  const prev=new Date(before.period_ends_at).getTime();
  if(end<=now||end>now+MAX_HORIZON||!(end>prev))throw new LifecycleError('period_end_out_of_range',400);
  next.period_ends_at=new Date(end);next.grace_until=null;next.cancel_at_period_end=false;
 }else if(a.action==='schedule_cancel'){
  if(status!=='trialing'||!before.period_ends_at||new Date(before.period_ends_at).getTime()<=now)
   throw new LifecycleError('active_trial_required');
  if(next.cancel_at_period_end)throw new LifecycleError('already_scheduled');
  next.cancel_at_period_end=true;
 }else if(a.action==='undo_cancel'){
  if(status!=='trialing'||!next.cancel_at_period_end)throw new LifecycleError('no_scheduled_cancellation');
  next.cancel_at_period_end=false;
 }else if(a.action==='grant_grace'){
  if(status!=='trialing'||!before.period_ends_at||new Date(before.period_ends_at).getTime()>now)
   throw new LifecycleError('ended_trial_required');
  if(before.grace_until&&new Date(before.grace_until).getTime()>now)throw new LifecycleError('grace_already_active');
  next.grace_until=new Date(now+a.graceDays*ONE_DAY);
 }else if(a.action==='close_period'){
  if(status!=='trialing'||!before.period_ends_at||new Date(before.period_ends_at).getTime()>now)
   throw new LifecycleError('ended_trial_required');
  if(before.grace_until&&new Date(before.grace_until).getTime()>now)throw new LifecycleError('grace_still_active');
  next.status=next.cancel_at_period_end?'canceled':'expired';next.grace_until=null;
 }else throw new LifecycleError('invalid_action',400);
 return next;
}
async function recordAction({sellerId,actorId,body,clock=Date.now,connect=()=>db.pool.connect()}){
 if(!safeId(sellerId))throw new LifecycleError('invalid_seller_id',400);
 if(!safeId(actorId))throw new LifecycleError('invalid_actor',403);
 const input=parseAction(body),client=await connect();
 let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  // Lock the seller row first: serializes simultaneous admin actions even before subscription exists.
  const owner=await client.query('SELECT id FROM users WHERE id=$1 AND status=$2 FOR UPDATE',[sellerId,'active']);
  if(!owner.rowCount)throw new LifecycleError('seller_not_found',404);
  const approved=await client.query("SELECT count(*)::integer AS count FROM marketplace_professional_stores WHERE seller_id=$1 AND status='approved'",[sellerId]);
  const count=Number(approved.rows[0]?.count||0);
  const sub=await client.query('SELECT plan_code,status,period_starts_at,period_ends_at,grace_until,cancel_at_period_end,billing_provider,billing_subscription_ref FROM marketplace_seller_subscriptions WHERE seller_id=$1 FOR UPDATE',[sellerId]);
  const before=sub.rows[0]||null;
  if(before&&(before.billing_provider||before.billing_subscription_ref))throw new LifecycleError('external_billing_managed');
  const now=clock();
  const after=transition(before,input,count,now);
  await client.query(
    `INSERT INTO marketplace_seller_subscriptions
     (seller_id,plan_code,status,period_starts_at,period_ends_at,grace_until,cancel_at_period_end)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (seller_id) DO UPDATE SET
      plan_code=EXCLUDED.plan_code,status=EXCLUDED.status,
      period_starts_at=EXCLUDED.period_starts_at,period_ends_at=EXCLUDED.period_ends_at,
      grace_until=EXCLUDED.grace_until,cancel_at_period_end=EXCLUDED.cancel_at_period_end,
      updated_at=now()`,
    [sellerId,after.plan_code,after.status,after.period_starts_at,after.period_ends_at,after.grace_until,after.cancel_at_period_end]);
  const audit={
   before:before?accountView(before,count,now):accountView(null,count,now),
   after:accountView(after,count,now),
   billingEnabled:false,entitlementsEnforced:false
  };
  await client.query('INSERT INTO marketplace_subscription_audit(seller_id,actor_id,event_type,details) VALUES($1,$2,$3,$4::jsonb)',[sellerId,actorId,input.action,JSON.stringify(audit)]);
  await client.query('COMMIT');begun=false;
  return {ok:true,sellerId,account:audit.after,billingEnabled:false,entitlementsEnforced:false};
 }catch(error){
  if(begun)try{await client.query('ROLLBACK');}catch(_){}
  throw error;
 }finally{client.release();}
}
module.exports={ACTIONS,ONE_DAY,safeId,dateValue,displayedStatus,accountView,parseAction,transition,recordAction,LifecycleError};
