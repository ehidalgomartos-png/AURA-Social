'use strict';

// Optional external notification bridge; disabled unless a supported
// Slack or Discord webhook is explicitly configured in Coolify.
const {ensureOperationalAlerts}=require('./operational-alerts-v215');
const DEFAULT_POLL_MS=120000;
const MAX_ATTEMPTS=5;

function parseWebhookConfig(raw=''){
  if(!String(raw).trim())return {enabled:false,provider:null};
  try{
    const u=new URL(String(raw).trim());
    if(u.protocol!=='https:' || u.port || u.username || u.password || u.hash || u.search)
      return {enabled:false,provider:null,error:'invalid_webhook_config'};
    if(u.hostname==='hooks.slack.com' && /^\/services\/[A-Za-z0-9/_-]{8,}$/.test(u.pathname))
      return {enabled:true,provider:'slack',url:u.href};
    if((u.hostname==='discord.com'||u.hostname==='discordapp.com') &&
      /^\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]{16,}$/.test(u.pathname))
      return {enabled:true,provider:'discord',url:u.href};
    return {enabled:false,provider:null,error:'unsupported_webhook_provider'};
  }catch(_){return {enabled:false,provider:null,error:'invalid_webhook_config'};}
}
function retryDelaySeconds(attempt){
  return Math.min(900,60*2**Math.max(0,Math.min(8,Number(attempt)||1)-1));
}
function formatAlertPayload(item,provider){
  const severity=item.severity==='critical'?'CRÍTICA':'ATENCIÓN';
  // The values originate from fixed internal alert labels only.
  const text='RedLibertad · alerta '+severity+'\n'+
    String(item.title||'Incidencia técnica').slice(0,120)+'\n'+
    String(item.detail||'Revisar el panel de administración.').slice(0,300)+'\n'+
    'Administración: https://redlibertad.com/admin';
  return provider==='discord'?{content:text,allowed_mentions:{parse:[]}}:{text,unfurl_links:false,unfurl_media:false};
}

async function ensureDeliverySchema(db){
  await db.query(
    "CREATE TABLE IF NOT EXISTS operational_alert_deliveries_v216 ("+
    "id BIGSERIAL PRIMARY KEY, alert_id BIGINT NOT NULL REFERENCES operational_alerts_v215(id) ON DELETE CASCADE,"+
    "cycle_key TIMESTAMPTZ NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'pending' "+
    "CHECK(status IN ('pending','sent','failed')),"+
    "attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
    "locked_until TIMESTAMPTZ, sent_at TIMESTAMPTZ, last_attempt_at TIMESTAMPTZ,"+
    "last_error_code VARCHAR(40) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),"+
    "UNIQUE(alert_id,cycle_key))"
  );
  await db.query("CREATE INDEX IF NOT EXISTS idx_operational_deliveries_v216_pending ON "+
    "operational_alert_deliveries_v216(status,next_attempt_at,locked_until)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS operational_delivery_audit_v216 ("+
    "id BIGSERIAL PRIMARY KEY, delivery_id BIGINT NOT NULL REFERENCES operational_alert_deliveries_v216(id) ON DELETE CASCADE,"+
    "admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,"+
    "action VARCHAR(24) NOT NULL CHECK(action IN ('retry_requested')),"+
    "note VARCHAR(500) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
}

function createAlertDeliveryService({db,url=process.env.OPS_ALERT_WEBHOOK_URL,
  fetchFn=fetch,logger=console,intervalMs=DEFAULT_POLL_MS,
  timers={setInterval,clearInterval}}={}){
  if(!db?.query)throw new TypeError('db required');
  const config=parseWebhookConfig(url);
  let schema=null,working=null,timer=null,stopped=false,lastAttemptAt=null,lastSuccessAt=null;

  function ensureSchema(){
    if(!schema) schema=(async()=>{
      await ensureOperationalAlerts(db);
      await ensureDeliverySchema(db);
    })().catch(error=>{schema=null;throw error;});
    return schema;
  }
  function status(){
    return {enabled:config.enabled,provider:config.provider,
      configurationError:config.error||null,
      running:!!working,lastAttemptAt,lastSuccessAt,maxAttempts:MAX_ATTEMPTS};
  }
  async function enqueue(){
    await db.query(
      "INSERT INTO operational_alert_deliveries_v216(alert_id,cycle_key) "+
      "SELECT id,COALESCE(last_cleared_at,first_seen_at) FROM operational_alerts_v215 "+
      "WHERE status='open' AND is_active=TRUE AND severity='critical' "+
      "ON CONFLICT(alert_id,cycle_key) DO NOTHING"
    );
  }
  async function retireCleared(){
    await db.query(
      "UPDATE operational_alert_deliveries_v216 d SET status='failed',"+
      "last_error_code='incident_cleared',locked_until=NULL "+
      "FROM operational_alerts_v215 a WHERE a.id=d.alert_id AND d.status='pending' "+
      "AND (a.is_active=FALSE OR a.status<>'open')"
    );
  }
  async function claim(){
    return db.query(
      "WITH claim AS ("+
      "SELECT d.id FROM operational_alert_deliveries_v216 d "+
      "JOIN operational_alerts_v215 a ON a.id=d.alert_id "+
      "WHERE d.status='pending' AND d.attempts < $1 AND d.next_attempt_at<=now() "+
      "AND (d.locked_until IS NULL OR d.locked_until<now()) "+
      "AND a.is_active=TRUE AND a.status='open' AND a.severity='critical' "+
      "ORDER BY d.created_at ASC FOR UPDATE OF d SKIP LOCKED LIMIT 3),"+
      "locked AS (UPDATE operational_alert_deliveries_v216 d SET attempts=d.attempts+1,"+
      "last_attempt_at=now(),locked_until=now()+interval '30 seconds' "+
      "FROM claim WHERE d.id=claim.id "+
      "RETURNING d.id,d.alert_id,d.attempts) "+
      "SELECT locked.id,locked.attempts,a.severity,a.title,a.detail "+
      "FROM locked JOIN operational_alerts_v215 a ON a.id=locked.alert_id",
      [MAX_ATTEMPTS]
    );
  }
  async function transmit(item){
    const controller=new AbortController();
    const handle=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetchFn(config.url,{
        method:'POST',redirect:'error',headers:{'Content-Type':'application/json',
          'X-RedLibertad-Delivery':String(item.id)},
        body:JSON.stringify(formatAlertPayload(item,config.provider)),
        signal:controller.signal
      });
      // Slack returns plain "ok". Discord returns 204 on success.
      if(!response.ok)throw Object.assign(new Error('delivery_failed'),{status:response.status});
      return {ok:true};
    }catch(error){
      const status=Number(error?.status);
      return {ok:false,code:error?.name==='AbortError'?'timeout':
        Number.isInteger(status)&&status>=400&&status<=599?'http_'+status:'network_error'};
    }finally{clearTimeout(handle);}
  }
  async function markDelivered(item,outcome){
    if(outcome.ok){
      await db.query(
        "UPDATE operational_alert_deliveries_v216 SET status='sent',sent_at=now(),"+
        "locked_until=NULL,last_error_code='' WHERE id=$1",
        [item.id]
      );
      lastSuccessAt=new Date().toISOString();
      return;
    }
    const failed=item.attempts>=MAX_ATTEMPTS;
    await db.query(
      "UPDATE operational_alert_deliveries_v216 SET status=$2,locked_until=NULL,"+
      "next_attempt_at=now()+($3::int*interval '1 second'),last_error_code=$4 WHERE id=$1",
      [item.id,failed?'failed':'pending',retryDelaySeconds(item.attempts),outcome.code]
    );
  }
  async function poll(){
    if(!config.enabled||stopped)return {skipped:'disabled'};
    if(working)return working;
    working=(async()=>{
      try{
        await ensureSchema();
        await enqueue();
        await retireCleared();
        const jobs=await claim();
        for(const item of jobs.rows){
          lastAttemptAt=new Date().toISOString();
          await markDelivered(item,await transmit(item));
        }
        return {processed:jobs.rows.length};
      }catch(_){
        logger.warn('RedLibertad ops delivery: delivery poll failed');
        return {skipped:'delivery_unavailable'};
      }finally{working=null;}
    })();
    return working;
  }
  function start(){
    if(!config.enabled||timer||stopped)return;
    timer=timers.setInterval(()=>{void poll();},intervalMs);
    timer.unref?.();
  }
  function stop(){
    stopped=true;
    if(timer){timers.clearInterval(timer);timer=null;}
  }
  return {poll,start,stop,status,ensureSchema};
}

module.exports={parseWebhookConfig,formatAlertPayload,retryDelaySeconds,
  createAlertDeliveryService,ensureDeliverySchema,MAX_ATTEMPTS};
