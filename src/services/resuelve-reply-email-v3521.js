'use strict';
// V3.5.21 — Aviso opt-in por email de respuesta a Resuelve; ninguna respuesta se incluye en el correo.
const dbDefault=require('../db');
const {ensureSchema:ensureVerificationSchema}=require('./signup-email-verification-v32131');
const validId=v=>/^[1-9]\d{0,15}$/.test(String(v));
const INTERVAL_MS=60000;
function emailConfig(env=process.env){
 const from=String(env.RESUELVE_EMAIL_FROM||env.MESSAGE_EMAIL_FROM||'').trim();
 const key=String(env.RESEND_API_KEY||'').trim();
 return {enabled:env.RESUELVE_EMAIL_ENABLED==='true'&&key.length>=10&&
  /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from),from,key};
}
function emailPayload(from,to,questionId){
 if(!validId(questionId))throw Error('invalid_question_id');
 const url='https://redlibertad.com/resuelve?id='+encodeURIComponent(String(questionId));
 return {from,to:[to],subject:'Alguien ha respondido a tu petición en Resuelve',
  text:'Tienes una respuesta nueva en RedLibertad Resuelve.\n\nPara verla, entra aquí:\n'+url+
   '\n\nNo incluimos el contenido de la respuesta ni datos privados. Puedes desactivar estos correos desde Resuelve.'};
}
function createResuelveReplyEmailService({db=dbDefault,fetchFn=global.fetch,env=process.env,logger=console,timers={setInterval,clearInterval}}={}){
 const config=emailConfig(env);
 let initialized=null,running=null,timer=null,closed=false;
 async function ensureSchema(){
  if(!initialized)initialized=(async()=>{
   await db.query("CREATE TABLE IF NOT EXISTS resuelve_reply_email_preferences_v3521 ("+
    "user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"+
    "enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("CREATE TABLE IF NOT EXISTS resuelve_reply_email_jobs_v3521 ("+
    "answer_id BIGINT PRIMARY KEY REFERENCES resuelve_answers(id) ON DELETE CASCADE,"+
    "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,"+
    "recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
    "status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','discarded','failed')),"+
    "attempts INTEGER NOT NULL DEFAULT 0,due_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '15 minutes',"+
    "locked_until TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_reply_email_due_v3521 ON resuelve_reply_email_jobs_v3521(status,due_at,locked_until)");
  })().catch(e=>{initialized=null;throw e;});
  return initialized;
 }
 async function preference(userId){
  await ensureSchema();
  const result=await db.query('SELECT enabled FROM resuelve_reply_email_preferences_v3521 WHERE user_id=$1',[userId]);
  return result.rows[0]?.enabled===true;
 }
 async function savePreference(userId,enabled){
  if(typeof enabled!=='boolean')throw Error('invalid_preference');
  await ensureSchema();
  await db.query("INSERT INTO resuelve_reply_email_preferences_v3521(user_id,enabled) VALUES($1,$2) "+
   "ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=now()",[userId,enabled]);
  if(!enabled)await db.query("UPDATE resuelve_reply_email_jobs_v3521 SET status='discarded',locked_until=NULL "+
   "WHERE recipient_id=$1 AND status='pending'",[userId]);
  return enabled;
 }
 async function enqueue(questionId,answerId,actorId){
  if(!config.enabled||closed)return {skipped:'disabled'};
  if(![questionId,answerId,actorId].every(validId))return {skipped:'invalid_id'};
  try{
   await ensureSchema();
   await ensureVerificationSchema(db);
   const result=await db.query(
    "INSERT INTO resuelve_reply_email_jobs_v3521(answer_id,question_id,recipient_id) "+
    "SELECT a.id,q.id,q.author_id FROM resuelve_answers a "+
    "JOIN resuelve_questions q ON q.id=a.question_id "+
    "JOIN users u ON u.id=q.author_id AND u.status='active' "+
    "JOIN signup_email_verifications_v32131 ev ON ev.user_id=u.id AND ev.verified_at IS NOT NULL "+
    "JOIN resuelve_reply_email_preferences_v3521 p ON p.user_id=u.id AND p.enabled=true "+
    "WHERE a.id=$2 AND a.question_id=$1 AND a.author_id=$3 "+
    "AND a.status='visible' AND q.status='open' AND q.author_id<>$3 "+
    "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=q.author_id AND b.blocked_id=$3) "+
    "OR (b.blocker_id=$3 AND b.blocked_id=q.author_id)) "+
    "AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=q.author_id AND m.muted_id=$3) "+
    "ON CONFLICT(answer_id) DO NOTHING RETURNING answer_id",[questionId,answerId,actorId]);
   return {queued:result.rowCount};
  }catch(_){logger.warn('Resuelve reply email queue unavailable; answer was saved.');return {skipped:'queue_unavailable'};}
 }
 async function claim(){
  return db.query("WITH due AS (SELECT answer_id FROM resuelve_reply_email_jobs_v3521 "+
   "WHERE (status='pending' OR (status='sending' AND locked_until<now())) "+
   "AND due_at<=now() AND attempts<4 AND (locked_until IS NULL OR locked_until<now()) "+
   "ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 8) "+
   "UPDATE resuelve_reply_email_jobs_v3521 j SET status='sending',attempts=j.attempts+1,"+
   "locked_until=now()+interval '90 seconds',updated_at=now() FROM due WHERE j.answer_id=due.answer_id "+
   "RETURNING j.answer_id,j.question_id,j.recipient_id,j.attempts");
 }
 async function eligibility(job){
  const r=await db.query(
   "SELECT u.email,u.status,q.status AS question_status,a.status AS answer_status,a.author_id, "+
   "COALESCE(p.enabled,false) AS email_enabled,(ev.verified_at IS NOT NULL) AS email_verified, "+
   "EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=a.author_id) "+
   "OR (b.blocker_id=a.author_id AND b.blocked_id=$2)) AS blocked, "+
   "EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$2 AND m.muted_id=a.author_id) AS muted, "+
   "EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=$2 AND n.actor_id=a.author_id "+
   "AND n.entity_type='resuelve' AND n.entity_id=q.id AND n.read_at IS NOT NULL "+
   "AND n.created_at>=a.created_at) AS already_read "+
   "FROM resuelve_answers a JOIN resuelve_questions q ON q.id=a.question_id "+
   "JOIN users u ON u.id=q.author_id "+
   "LEFT JOIN resuelve_reply_email_preferences_v3521 p ON p.user_id=u.id "+
   "LEFT JOIN signup_email_verifications_v32131 ev ON ev.user_id=u.id "+
   "WHERE a.id=$1 AND q.id=$3 AND q.author_id=$2 LIMIT 1",
   [job.answer_id,job.recipient_id,job.question_id]);
  const row=r.rows[0];
  return row&&row.status==='active'&&row.email_enabled===true&&row.email_verified===true&&
   row.question_status==='open'&&row.answer_status==='visible'&&!row.blocked&&!row.muted&&!row.already_read&&
   String(row.author_id)!==String(job.recipient_id)&&row.email?row:null;
 }
 async function finish(job,status,delay=0){
  await db.query("UPDATE resuelve_reply_email_jobs_v3521 SET status=$3,locked_until=NULL,"+
   "due_at=CASE WHEN $4::int>0 THEN now()+($4::int*interval '1 minute') ELSE due_at END,"+
   "updated_at=now() WHERE answer_id=$1 AND recipient_id=$2 AND status='sending'",
   [job.answer_id,job.recipient_id,status,delay]);
 }
 async function poll(){
  if(!config.enabled||closed)return {skipped:'disabled'};
  if(running)return running;
  running=(async()=>{
   try{
    await ensureSchema();await ensureVerificationSchema(db);
    const jobs=await claim();
    for(const job of jobs.rows){
     try{
      const recipient=await eligibility(job);
      if(!recipient){await finish(job,'discarded');continue;}
      const response=await fetchFn('https://api.resend.com/emails',{
       method:'POST',redirect:'error',
       headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json',
        'Idempotency-Key':'resuelve-reply-'+job.answer_id+'-'+job.recipient_id},
       body:JSON.stringify(emailPayload(config.from,recipient.email,job.question_id)),
       signal:AbortSignal.timeout(10000)
      });
      if(!response.ok)throw Error('email_provider_rejected');
      await finish(job,'sent');
     }catch(_){
      const exhausted=Number(job.attempts)>=4;
      try{await finish(job,exhausted?'failed':'pending',exhausted?0:Math.min(60,2**Number(job.attempts)));}catch(_){}
     }
    }
    return {processed:jobs.rowCount};
   }catch(_){logger.warn('Resuelve reply email dispatch unavailable.');return {skipped:'dispatch_unavailable'};}
   finally{running=null;}
  })();
  return running;
 }
 function start(){
  if(!config.enabled||closed||timer)return;
  void poll();timer=timers.setInterval(()=>{void poll();},INTERVAL_MS);timer.unref?.();
 }
 function stop(){closed=true;if(timer){timers.clearInterval(timer);timer=null;}}
 return {config:{enabled:config.enabled},ensureSchema,preference,savePreference,enqueue,poll,start,stop};
}
const resuelveReplyEmailService=createResuelveReplyEmailService();
module.exports={emailConfig,emailPayload,createResuelveReplyEmailService,resuelveReplyEmailService};
