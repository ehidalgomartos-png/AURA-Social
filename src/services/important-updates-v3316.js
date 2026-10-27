'use strict';
// RedLibertad V3.3.16: curator-approved email notices, never automatic campaigns.
const crypto=require('node:crypto');
const dbDefault=require('../db');
const ORIGIN='https://redlibertad.com';
const POLL_MS=60*1000;
function htmlEscape(v){return String(v||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function validAddress(value){return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(String(value||''));}
function createImportantUpdatesService({db=dbDefault,fetchFn=global.fetch,env=process.env,logger=console,timers={setInterval,clearInterval}}={}){
 const from=String(env.MESSAGE_EMAIL_FROM||'').trim();
 const apiKey=String(env.RESEND_API_KEY||'').trim();
 const enabled=env.IMPORTANT_UPDATES_EMAIL_ENABLED==='true'&&validAddress(from)&&apiKey.length>=10;
 let ready=null,running=null,timer=null,stopped=false;
 function ensureSchema(){
   if(!ready)ready=(async()=>{
     await db.query('CREATE TABLE IF NOT EXISTS important_update_optins_v3316 ('+
       'user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,'+
       'enabled BOOLEAN NOT NULL DEFAULT false,'+
       'unsubscribe_token VARCHAR(48) NOT NULL UNIQUE,'+
       'updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
     await db.query('CREATE TABLE IF NOT EXISTS important_update_campaigns_v3316 ('+
       'id BIGSERIAL PRIMARY KEY,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,'+
       'title VARCHAR(120) NOT NULL,summary VARCHAR(800) NOT NULL,'+
       'content_key CHAR(64) NOT NULL,send_day DATE NOT NULL DEFAULT CURRENT_DATE,'+
       'created_at TIMESTAMPTZ NOT NULL DEFAULT now(),'+
       'UNIQUE(send_day,content_key))');
     await db.query('CREATE TABLE IF NOT EXISTS important_update_jobs_v3316 ('+
       'campaign_id BIGINT NOT NULL REFERENCES important_update_campaigns_v3316(id) ON DELETE CASCADE,'+
       'user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,'+
       "status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','skipped','failed')),"+
       'attempts INTEGER NOT NULL DEFAULT 0,due_at TIMESTAMPTZ NOT NULL DEFAULT now(),'+
       'claimed_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,'+
       'PRIMARY KEY(campaign_id,user_id))');
     await db.query('CREATE INDEX IF NOT EXISTS idx_important_update_jobs_v3316_due ON important_update_jobs_v3316(status,due_at)');
   })().catch(e=>{ready=null;throw e;});
   return ready;
 }
 async function preference(userId){
   await ensureSchema();
   const r=await db.query('SELECT enabled FROM important_update_optins_v3316 WHERE user_id=$1',[userId]);
   return r.rows[0]?.enabled===true;
 }
 async function savePreference(userId,value){
   if(typeof value!=='boolean')throw Error('invalid_preference');
   await ensureSchema();
   const token=crypto.randomBytes(24).toString('hex');
   await db.query('INSERT INTO important_update_optins_v3316(user_id,enabled,unsubscribe_token) '+
     'VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()',
     [userId,value,token]);
   return value;
 }
 async function unsubscribe(token){
   if(!/^[0-9a-f]{48}$/.test(String(token||'')))return false;
   await ensureSchema();
   const r=await db.query('UPDATE important_update_optins_v3316 SET enabled=false,updated_at=now() WHERE unsubscribe_token=$1 RETURNING user_id',[token]);
   return r.rowCount>0;
 }
 async function subscriberCount(){
   await ensureSchema();
   const r=await db.query("SELECT count(*)::int n FROM important_update_optins_v3316 s "+
     "JOIN users u ON u.id=s.user_id WHERE s.enabled=true AND u.status='active' AND u.email LIKE '%@%'");
   return Number(r.rows[0]?.n||0);
 }
 async function status(){
   await ensureSchema();
   const [total,campaigns]=await Promise.all([
     subscriberCount(),
     db.query('SELECT c.id,c.title,c.created_at,COUNT(j.user_id)::int total,'+
       "COUNT(j.user_id) FILTER(WHERE j.status='sent')::int sent,"+
       "COUNT(j.user_id) FILTER(WHERE j.status='failed')::int failed,"+
       "COUNT(j.user_id) FILTER(WHERE j.status='pending' OR j.status='sending')::int pending "+
       'FROM important_update_campaigns_v3316 c LEFT JOIN important_update_jobs_v3316 j ON j.campaign_id=c.id '+
       'GROUP BY c.id ORDER BY c.id DESC LIMIT 5')
   ]);
   return {enabled,subscriberCount:total,campaigns:campaigns.rows};
 }
 async function queue({adminId,title,summary}){
   if(!enabled)return {disabled:true};
   await ensureSchema();
   const key=crypto.createHash('sha256').update(title+'\n'+summary).digest('hex');
   const conn=await db.pool.connect();
   try{
     await conn.query('BEGIN');
     const created=await conn.query(
       'INSERT INTO important_update_campaigns_v3316(created_by,title,summary,content_key) '+
       'VALUES($1,$2,$3,$4) ON CONFLICT(send_day,content_key) DO NOTHING RETURNING id',
       [adminId,title,summary,key]);
     let id=created.rows[0]?.id;
     if(!id){
       const prev=await conn.query('SELECT id FROM important_update_campaigns_v3316 WHERE send_day=CURRENT_DATE AND content_key=$1',[key]);
       await conn.query('COMMIT');
       return {queued:false,duplicate:true,id:prev.rows[0]?.id};
     }
     const jobs=await conn.query('INSERT INTO important_update_jobs_v3316(campaign_id,user_id) '+
       'SELECT $1,s.user_id FROM important_update_optins_v3316 s JOIN users u ON u.id=s.user_id '+
       "WHERE s.enabled=true AND u.status='active' AND u.email LIKE '%@%' ON CONFLICT DO NOTHING RETURNING user_id",[id]);
     await conn.query('COMMIT');
     return {queued:true,id,recipients:jobs.rowCount};
   }catch(error){await conn.query('ROLLBACK').catch(()=>{});throw error;}
   finally{conn.release();}
 }
 function content({title,summary,token}){
   const unsub=ORIGIN+'/api/important-updates/unsubscribe?token='+token;
   const portal=ORIGIN+'/app';
   const subject='Novedades importantes en RedLibertad: '+title;
   const text=title+'\n\n'+summary+'\n\nEntra en RedLibertad: '+portal+
     '\n\nHas solicitado recibir novedades importantes. Darse de baja: '+unsub;
   const html='<div style="font-family:Arial,system-ui,sans-serif;max-width:560px;margin:auto;color:#173036">'+
     '<h1 style="font-size:22px">Novedades de RedLibertad</h1>'+
     '<h2 style="font-size:18px">'+htmlEscape(title)+'</h2>'+
     '<p style="white-space:pre-line;line-height:1.5">'+htmlEscape(summary)+'</p>'+
     '<p><a href="'+portal+'">Entrar en RedLibertad</a></p>'+
     '<hr><p style="font-size:12px;color:#526872">Este correo se envía solo a personas suscritas a las novedades importantes de RedLibertad. '+
     '<a href="'+unsub+'">Darme de baja</a> cuando quieras.</p></div>';
   return {unsub,subject,text,html};
 }
 async function claim(){
   return db.query(
     'WITH due AS (SELECT campaign_id,user_id FROM important_update_jobs_v3316 '+
     "WHERE attempts<3 AND due_at<=now() AND (status='pending' OR (status='sending' AND claimed_at<now()-interval '5 minutes')) "+
     'ORDER BY due_at,campaign_id,user_id FOR UPDATE SKIP LOCKED LIMIT 5) '+
     'UPDATE important_update_jobs_v3316 j SET status=\'sending\',attempts=j.attempts+1,claimed_at=now() '+
     'FROM due WHERE j.campaign_id=due.campaign_id AND j.user_id=due.user_id '+
     'RETURNING j.campaign_id,j.user_id,j.attempts');
 }
 async function finalize(job,status){
   await db.query('UPDATE important_update_jobs_v3316 SET status=$3,'+
     "due_at=CASE WHEN $3='pending' THEN now()+interval '10 minutes' ELSE due_at END,"+
     "sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END,claimed_at=NULL "+
     'WHERE campaign_id=$1 AND user_id=$2 AND status=\'sending\'',[job.campaign_id,job.user_id,status]);
 }
 async function send(job){
   const q=await db.query(
     'SELECT u.email,u.status,s.enabled,s.unsubscribe_token,c.title,c.summary '+
     'FROM important_update_campaigns_v3316 c CROSS JOIN users u '+
     'LEFT JOIN important_update_optins_v3316 s ON s.user_id=u.id '+
     'WHERE c.id=$1 AND u.id=$2',[job.campaign_id,job.user_id]);
   const p=q.rows[0];
   if(!p||p.enabled!==true||p.status!=='active'||!validAddress(p.email))return finalize(job,'skipped');
   const email=content({title:p.title,summary:p.summary,token:p.unsubscribe_token});
   try{
     const response=await fetchFn('https://api.resend.com/emails',{
       method:'POST',redirect:'error',
       headers:{
         'Authorization':'Bearer '+apiKey,'Content-Type':'application/json',
         'Idempotency-Key':'rl-important-'+job.campaign_id+'-'+job.user_id
       },
       body:JSON.stringify({
         from,to:[p.email],subject:email.subject,html:email.html,text:email.text,
         headers:{'List-Unsubscribe':'<'+email.unsub+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}
       })
     });
     if(!response.ok)throw Error('provider_rejected');
     await finalize(job,'sent');
   }catch(error){
     logger.warn('RedLibertad important update mail provider unavailable:',error.message);
     await finalize(job,job.attempts>=3?'failed':'pending');
   }
 }
 async function poll(){
   if(!enabled||stopped)return {skipped:'disabled'};
   if(running)return running;
   running=(async()=>{
     try{
       await ensureSchema();
       const claimed=await claim();
       for(const job of claimed.rows)await send(job);
       return {processed:claimed.rowCount};
     }catch(e){logger.warn('RedLibertad important update worker:',e.message);return {error:true};}
     finally{running=null;}
   })();
   return running;
 }
 function start(){
   if(!enabled||stopped||timer)return;
   void poll();
   timer=timers.setInterval(()=>{void poll();},POLL_MS);
   timer.unref?.();
 }
 function stop(){stopped=true;if(timer){timers.clearInterval(timer);timer=null;}}
 return {config:{enabled,from},ensureSchema,preference,savePreference,unsubscribe,subscriberCount,status,queue,poll,start,stop,content};
}
module.exports={createImportantUpdatesService,htmlEscape};
