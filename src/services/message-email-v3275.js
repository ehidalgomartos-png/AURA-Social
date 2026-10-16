'use strict';
// V3.2.75: private-message emails, delayed and only while still unread.
// Email is disabled unless explicitly enabled in Coolify with a verified sender.
const dbDefault=require('../db');
const DELAY_MINUTES=15;
const RETRY_LIMIT=5;
const POLL_MS=60*1000;
const SUBJECT='Tienes mensajes sin leer en RedLibertad';
function emailConfig(env=process.env){
 const sender=String(env.MESSAGE_EMAIL_FROM||'').trim();
 const key=String(env.RESEND_API_KEY||'').trim();
 const enabled=env.MESSAGE_EMAIL_ENABLED==='true' && key.length>=10
   && /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(sender);
 return {enabled,from:sender,key};
}
function messageLink(conversationId){
 if(!/^[1-9]\d{0,15}$/.test(String(conversationId)))throw Error('invalid_conversation');
 return 'https://redlibertad.com/app?view=messages&conversation='+encodeURIComponent(conversationId);
}
function emailPayload(from,to,conversationId){
 const url=messageLink(conversationId);
 const text='Tienes mensajes pendientes de leer en RedLibertad.\n\nAbre tus mensajes: '+url+
  '\n\nEste correo no contiene mensajes privados. Puedes desactivar estos avisos desde Cuenta en RedLibertad.';
 const html='<div style="font-family:system-ui,Arial,sans-serif;max-width:550px;margin:auto;color:#173036">'+
  '<h1 style="font-size:22px">Tienes mensajes sin leer</h1>'+
  '<p>Entra en RedLibertad para leerlos cuando puedas. No incluimos el contenido de tus conversaciones en los correos.</p>'+
  '<p><a href="'+url+'" style="display:inline-block;padding:13px 18px;background:#0a7569;color:#fff;border-radius:9px;text-decoration:none;font-weight:bold">Ver mis mensajes</a></p>'+
  '<p style="font-size:13px;color:#607478">Puedes desactivar estos avisos en Cuenta y seguridad. Nunca compartas tu contraseña.</p></div>';
 return {from,to:[to],subject:SUBJECT,html,text};
}
function createMessageEmailService({db=dbDefault,fetchFn=global.fetch,env=process.env,logger=console,timers={setInterval,clearInterval}}={}){
 const config=emailConfig(env);
 let initialized=null,timer=null,running=null,closed=false;
 function ensureSchema(){
  if(!initialized)initialized=(async()=>{
   await db.query("CREATE TABLE IF NOT EXISTS message_email_preferences_v3275 ("+
    "user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"+
    "enabled BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("CREATE TABLE IF NOT EXISTS message_email_jobs_v3275 ("+
    "conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,"+
    "recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
    "latest_message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,"+
    "due_at TIMESTAMPTZ NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'pending' "+
    "CHECK(status IN ('pending','sending','sent','discarded','failed')),"+
    "attempts INTEGER NOT NULL DEFAULT 0,locked_until TIMESTAMPTZ,last_sent_at TIMESTAMPTZ,"+
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(conversation_id,recipient_id))");
   await db.query("CREATE INDEX IF NOT EXISTS idx_message_email_jobs_v3275_pending "+
    "ON message_email_jobs_v3275(status,due_at,locked_until)");
  })().catch(error=>{initialized=null;throw error;});
  return initialized;
 }
 async function preference(userId){
  await ensureSchema();
  const r=await db.query('SELECT enabled FROM message_email_preferences_v3275 WHERE user_id=$1',[userId]);
  return r.rows[0]?.enabled!==false;
 }
 async function savePreference(userId,enabled){
  await ensureSchema();
  await db.query("INSERT INTO message_email_preferences_v3275(user_id,enabled) VALUES ($1,$2) "+
   "ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=now()",[userId,enabled]);
  if(!enabled)await db.query("UPDATE message_email_jobs_v3275 SET status='discarded',locked_until=NULL "+
   "WHERE recipient_id=$1 AND status='pending'",[userId]);
  return enabled;
 }
 // Coalesce messages within the same conversation; never enqueue self/muted/blocked users.
 async function enqueue(conversationId,senderId,messageId){
  if(!config.enabled||closed)return {skipped:'disabled'};
  if(![conversationId,senderId,messageId].every(v=>/^[1-9]\d{0,15}$/.test(String(v))))return {skipped:'invalid_id'};
  try{
   await ensureSchema();
   const r=await db.query(
    "INSERT INTO message_email_jobs_v3275(conversation_id,recipient_id,latest_message_id,due_at,status) "+
    "SELECT cm.conversation_id,cm.user_id,$3,now()+interval '15 minutes','pending' "+
    "FROM conversation_members cm JOIN users u ON u.id=cm.user_id "+
    "LEFT JOIN message_email_preferences_v3275 p ON p.user_id=cm.user_id "+
    "WHERE cm.conversation_id=$1 AND cm.user_id<>$2 AND u.status='active' "+
    "AND cm.notifications_muted=false AND COALESCE(p.enabled,true)=true "+
    "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE "+
    "(b.blocker_id=cm.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=cm.user_id)) "+
    "ON CONFLICT(conversation_id,recipient_id) DO UPDATE SET "+
    "latest_message_id=excluded.latest_message_id,"+
    "due_at=GREATEST(excluded.due_at,COALESCE(message_email_jobs_v3275.last_sent_at+interval '60 minutes',excluded.due_at)),"+
    "status='pending',attempts=0,locked_until=NULL,updated_at=now() "+
    "WHERE message_email_jobs_v3275.latest_message_id<excluded.latest_message_id "+
    "RETURNING recipient_id",[conversationId,senderId,messageId]);
   return {queued:r.rows.length};
  }catch(error){
   logger.warn('Message email queue unavailable (message stored).');
   return {skipped:'queue_unavailable'};
  }
 }
 async function claim(){
  return db.query(
   "WITH due AS (SELECT conversation_id,recipient_id FROM message_email_jobs_v3275 "+
   "WHERE status='pending' AND due_at<=now() AND attempts<$1 "+
   "AND (locked_until IS NULL OR locked_until<now()) "+
   "ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 8) "+
   "UPDATE message_email_jobs_v3275 j SET status='sending',attempts=j.attempts+1,"+
   "locked_until=now()+interval '90 seconds',updated_at=now() "+
   "FROM due WHERE j.conversation_id=due.conversation_id AND j.recipient_id=due.recipient_id "+
   "RETURNING j.conversation_id,j.recipient_id,j.latest_message_id,j.attempts",
   [RETRY_LIMIT]);
 }
 async function eligibility(job){
  const q=await db.query(
   "SELECT u.email,u.status,cm.last_read_at,cm.notifications_muted,"+
   "m.created_at AS message_created,m.sender_id,COALESCE(p.enabled,true) AS email_enabled,"+
   "EXISTS(SELECT 1 FROM blocks b WHERE "+
   "(b.blocker_id=cm.user_id AND b.blocked_id=m.sender_id) OR "+
   "(b.blocker_id=m.sender_id AND b.blocked_id=cm.user_id)) AS blocked "+
   "FROM users u JOIN conversation_members cm ON cm.user_id=u.id "+
   "JOIN messages m ON m.id=$3 AND m.conversation_id=cm.conversation_id "+
   "LEFT JOIN message_email_preferences_v3275 p ON p.user_id=u.id "+
   "WHERE cm.conversation_id=$1 AND cm.user_id=$2 LIMIT 1",
   [job.conversation_id,job.recipient_id,job.latest_message_id]);
  const row=q.rows[0];
  if(!row||row.status!=='active'||row.email_enabled!==true||row.notifications_muted===true||
     row.blocked===true||String(row.sender_id)===String(job.recipient_id)||
     !row.email|| !row.message_created)return null;
  if(row.last_read_at && new Date(row.last_read_at).getTime()>=new Date(row.message_created).getTime())return null;
  return row;
 }
 async function finish(job,status,delayMinutes=0){
  await db.query(
   "UPDATE message_email_jobs_v3275 SET status=$4,locked_until=NULL,"+
   "due_at=CASE WHEN $5::int>0 THEN now()+($5::int*interval '1 minute') ELSE due_at END,"+
   "last_sent_at=CASE WHEN $4='sent' THEN now() ELSE last_sent_at END,updated_at=now() "+
   "WHERE conversation_id=$1 AND recipient_id=$2 AND latest_message_id=$3 AND status='sending'",
   [job.conversation_id,job.recipient_id,job.latest_message_id,status,delayMinutes]);
 }
 async function transmit(job,recipient){
  const response=await fetchFn('https://api.resend.com/emails',{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json',
    'Idempotency-Key':'redlibertad-msg-'+job.recipient_id+'-'+job.conversation_id+'-'+job.latest_message_id},
   body:JSON.stringify(emailPayload(config.from,recipient.email,job.conversation_id)),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('provider_rejected');
 }
 async function poll(){
  if(!config.enabled||closed)return {skipped:'disabled'};
  if(running)return running;
  running=(async()=>{
   try{
    await ensureSchema();
    const due=await claim();
    for(const job of due.rows){
     try{
      const recipient=await eligibility(job);
      if(!recipient){await finish(job,'discarded');continue;}
      await transmit(job,recipient);
      await finish(job,'sent');
     }catch(_){
      const failed=Number(job.attempts)>=RETRY_LIMIT;
      try{await finish(job,failed?'failed':'pending',failed?0:Math.min(60,2**Number(job.attempts)));}catch(_){/* Claim expires; no message is lost. */}
     }
    }
    return {processed:due.rows.length};
   }catch(_){
    logger.warn('RedLibertad message email dispatch unavailable.');
    return {skipped:'dispatch_unavailable'};
   }finally{running=null;}
  })();
  return running;
 }
 function start(){
  if(!config.enabled||closed||timer)return;
  void poll();
  timer=timers.setInterval(()=>{void poll();},POLL_MS);
  timer.unref?.();
 }
 function stop(){closed=true;if(timer){timers.clearInterval(timer);timer=null;}}
 return {config:{enabled:config.enabled},ensureSchema,preference,savePreference,enqueue,poll,start,stop};
}
const messageEmailService=createMessageEmailService();
module.exports={createMessageEmailService,messageEmailService,emailConfig,emailPayload,messageLink,DELAY_MINUTES};
