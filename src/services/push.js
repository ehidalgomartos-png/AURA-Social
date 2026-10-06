const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC_KEY=String(process.env.PUSH_VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY=String(process.env.PUSH_VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT=String(process.env.PUSH_VAPID_SUBJECT || '').trim();
const PUSH_CONFIGURED=!!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if(PUSH_CONFIGURED){
  webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
}

let schemaReady=null;
async function ensurePushSchema(){
  if(!schemaReady){
    schemaReady=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent VARCHAR(500) NOT NULL DEFAULT '',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id,enabled)');

      await db.query(`
        CREATE TABLE IF NOT EXISTS push_jobs (
          id BIGSERIAL PRIMARY KEY,
          notification_id BIGINT NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','expired')),
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          processed_at TIMESTAMPTZ
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_push_jobs_queue ON push_jobs(status,next_attempt_at,created_at)');

      await db.query(`
        CREATE OR REPLACE FUNCTION redlibertad_enqueue_push_notification()
        RETURNS TRIGGER AS $$
        BEGIN
          INSERT INTO push_jobs(notification_id,user_id)
          VALUES (NEW.id,NEW.user_id)
          ON CONFLICT(notification_id) DO NOTHING;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await db.query('DROP TRIGGER IF EXISTS trg_redlibertad_push_notification ON notifications');
      await db.query(`
        CREATE TRIGGER trg_redlibertad_push_notification
        AFTER INSERT ON notifications
        FOR EACH ROW
        EXECUTE FUNCTION redlibertad_enqueue_push_notification()
      `);
    })().catch(error=>{
      schemaReady=null;
      throw error;
    });
  }
  return schemaReady;
}

function isPushConfigured(){
  return PUSH_CONFIGURED;
}

function publicPushConfig(){
  return {
    enabled:PUSH_CONFIGURED,
    publicKey:PUSH_CONFIGURED ? VAPID_PUBLIC_KEY : null
  };
}

function notificationUrl(notification){
  const type=String(notification.type || '');
  const entityType=String(notification.entity_type || '');
  const entityId=notification.entity_id;

  if(type==='message' && entityType==='conversation' && entityId){
    return `/app?view=messages&conversation=${encodeURIComponent(entityId)}`;
  }
  if(entityType==='post' && entityId){
    return `/app?post=${encodeURIComponent(entityId)}`;
  }
  if(notification.actor_username && ['follow','creator_broadcast','creator_vip_broadcast'].includes(type)){
    return `/app?profile=${encodeURIComponent(notification.actor_username)}`;
  }
  if(entityType==='verification'){
    return '/app?view=profile&trust=1';
  }
  return '/app?view=notifications';
}

async function markJob(jobId,status,attempts=0){
  await db.query(`
    UPDATE push_jobs
       SET status=$2,
           attempts=$3,
           processed_at=CASE WHEN $2 IN ('sent','failed','expired') THEN now() ELSE processed_at END,
           next_attempt_at=CASE
             WHEN $2='pending' THEN now() + make_interval(secs => LEAST(300,15 * CAST(power(2,$3) AS integer)))
             ELSE next_attempt_at
           END
     WHERE id=$1
  `,[jobId,status,attempts]);
}

let processing=false;
async function processPushJobs(){
  if(!PUSH_CONFIGURED || processing)return;
  processing=true;
  try{
    await ensurePushSchema();
    await db.query(`
      UPDATE push_jobs
         SET status='expired',processed_at=now()
       WHERE status='pending'
         AND created_at<now()-interval '30 minutes'
    `);

    const jobs=await db.query(`
      SELECT j.id,j.notification_id,j.user_id,j.attempts,
             n.type,n.entity_type,n.entity_id,n.text,n.actor_id,n.created_at AS notification_created_at,
             actor.username AS actor_username,
             actor.display_name AS actor_display_name
        FROM push_jobs j
        JOIN notifications n ON n.id=j.notification_id
        LEFT JOIN users actor ON actor.id=n.actor_id
       WHERE j.status='pending'
         AND j.next_attempt_at<=now()
         AND j.created_at>=now()-interval '30 minutes'
       ORDER BY j.id
       LIMIT 20
    `);

    for(const job of jobs.rows){
      if(job.actor_id){
        const suppressed=await db.query(`
          SELECT 1
           WHERE EXISTS(
             SELECT 1 FROM mutes
              WHERE muter_id=$1 AND muted_id=$2
           )
           OR EXISTS(
             SELECT 1 FROM blocks
              WHERE (blocker_id=$1 AND blocked_id=$2)
                 OR (blocker_id=$2 AND blocked_id=$1)
           )
          LIMIT 1
        `,[job.user_id,job.actor_id]);
        if(suppressed.rowCount){
          await markJob(job.id,'sent',job.attempts);
          continue;
        }
      }

      const subscriptions=await db.query(`
        SELECT id,endpoint,p256dh,auth
          FROM push_subscriptions
         WHERE user_id=$1
           AND enabled=true
           AND created_at<=$2
         ORDER BY id
      `,[job.user_id,job.notification_created_at]);

      if(!subscriptions.rowCount){
        await markJob(job.id,'sent',job.attempts);
        continue;
      }

      const payload=JSON.stringify({
        notificationId:String(job.notification_id),
        type:job.type,
        title:job.actor_display_name || 'RedLibertad',
        body:String(job.text || 'Tienes actividad nueva en RedLibertad.').slice(0,240),
        url:notificationUrl(job)
      });

      let sent=false;
      let transientFailure=false;

      for(const subscription of subscriptions.rows){
        try{
          await webpush.sendNotification({
            endpoint:subscription.endpoint,
            keys:{p256dh:subscription.p256dh,auth:subscription.auth}
          },payload,{TTL:300,urgency:'normal'});
          sent=true;
        }catch(error){
          const code=Number(error?.statusCode || 0);
          if(code===404 || code===410){
            await db.query('DELETE FROM push_subscriptions WHERE id=$1',[subscription.id]);
          }else{
            transientFailure=true;
            console.warn('RedLibertad push delivery failed:',code || error?.message || error);
          }
        }
      }

      const attempts=Number(job.attempts || 0)+1;
      if(sent || !transientFailure){
        await markJob(job.id,'sent',attempts);
      }else if(attempts>=4){
        await markJob(job.id,'failed',attempts);
      }else{
        await markJob(job.id,'pending',attempts);
      }
    }
  }finally{
    processing=false;
  }
}

let workerTimer=null;
async function startPushWorker(){
  await ensurePushSchema();
  if(!PUSH_CONFIGURED)return {enabled:false};
  if(workerTimer)return {enabled:true};
  processPushJobs().catch(error=>console.error('RedLibertad push worker:',error));
  workerTimer=setInterval(()=>{
    processPushJobs().catch(error=>console.error('RedLibertad push worker:',error));
  },5000);
  workerTimer.unref?.();
  return {enabled:true};
}

module.exports={
  ensurePushSchema,
  isPushConfigured,
  publicPushConfig,
  processPushJobs,
  startPushWorker
};
