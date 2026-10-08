'use strict';

const POLL_MS=120000;
const ALERT_KEYS=Object.freeze(['database_unavailable','database_pool_backlog','media_unavailable','media_space_low','api_error_spike','api_latency_spike']);

function evaluateSignals({runtime={},dependencies={}}={}){
  const signals=[];
  const services=Array.isArray(dependencies.services)?dependencies.services:[];
  const db=services.find(x=>x.key==='database');
  const media=services.find(x=>x.key==='media');
  if(db?.status==='critical')signals.push({key:'database_unavailable',severity:'critical',title:'PostgreSQL no disponible',detail:'Revisar conectividad y servicio en Coolify.'});
  else if(db?.status==='warning' && Number(db.waitingConnections)>=3)
    signals.push({key:'database_pool_backlog',severity:'warning',title:'Conexiones PostgreSQL en espera',detail:'Revisar el pool y las consultas lentas.'});
  if(media?.status==='critical')signals.push({key:'media_unavailable',severity:'critical',title:'Volumen multimedia inaccesible',detail:'Comprobar montaje persistente, permisos y espacio libre en Coolify.'});
  else if(media?.status==='warning')signals.push({key:'media_space_low',severity:'warning',title:'Espacio multimedia bajo',detail:'Revisar almacenamiento, copias de seguridad y capacidad.'});
  const o=runtime.overall||{};
  if(Number(o.requests)>=20 && Number(o.serverErrors)>=5 && Number(o.errorRatePct)>=10)
    signals.push({key:'api_error_spike',severity:'critical',title:'Errores elevados en la API',detail:'Revisar errores y rendimiento en los registros de Coolify.'});
  if(Number(o.requests)>=20 && Number(o.slow)>=5 && Number(o.slowRatePct)>=20)
    signals.push({key:'api_latency_spike',severity:'warning',title:'Respuestas lentas en la API',detail:'Revisar latencia por área y saturación de recursos.'});
  return signals;
}

let schemaReady=null;
async function ensureOperationalAlerts(db){
  if(!schemaReady){
    schemaReady=(async()=>{
      await db.query("CREATE TABLE IF NOT EXISTS operational_alerts_v215 ("+
        "id BIGSERIAL PRIMARY KEY, alert_key VARCHAR(60) NOT NULL UNIQUE,"+
        "severity VARCHAR(12) NOT NULL CHECK(severity IN ('warning','critical')),"+
        "title VARCHAR(120) NOT NULL,detail VARCHAR(300) NOT NULL,"+
        "status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),"+
        "is_active BOOLEAN NOT NULL DEFAULT TRUE, occurrences INTEGER NOT NULL DEFAULT 1,"+
        "first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_cleared_at TIMESTAMPTZ,"+
        "acknowledged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,acknowledged_at TIMESTAMPTZ,"+
        "resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,resolved_at TIMESTAMPTZ)");
      await db.query("CREATE INDEX IF NOT EXISTS idx_operational_alerts_v215_queue ON operational_alerts_v215(status,is_active,last_seen_at DESC)");
      await db.query("CREATE TABLE IF NOT EXISTS operational_alert_audit_v215 ("+
        "id BIGSERIAL PRIMARY KEY,alert_id BIGINT NOT NULL REFERENCES operational_alerts_v215(id) ON DELETE CASCADE,"+
        "admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,"+
        "action VARCHAR(24) NOT NULL CHECK(action IN ('acknowledged','resolved')),"+
        "note VARCHAR(500) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await db.query("CREATE INDEX IF NOT EXISTS idx_operational_alert_audit_v215_alert ON operational_alert_audit_v215(alert_id,created_at DESC)");
    })().catch(error=>{schemaReady=null;throw error;});
  }
  return schemaReady;
}

function createOperationalAlertService({db,runtimeMonitor,dependencyInspector,
  logger=console,intervalMs=POLL_MS,timers={setInterval,clearInterval}}={}){
  if(!db?.query||!runtimeMonitor?.snapshot||!dependencyInspector?.snapshot)
    throw new TypeError('db and both inspectors are required');
  let timer=null,running=null,stopped=false,lastSuccessAt=null;

  async function persistSignals(signals){
    await ensureOperationalAlerts(db);
    for(const signal of signals){
      await db.query(
        "INSERT INTO operational_alerts_v215(alert_key,severity,title,detail,status,is_active,occurrences) "+
        "VALUES($1,$2,$3,$4,'open',TRUE,1) "+
        "ON CONFLICT(alert_key) DO UPDATE SET severity=EXCLUDED.severity,title=EXCLUDED.title,detail=EXCLUDED.detail,"+
        "is_active=TRUE,last_seen_at=now(),occurrences=operational_alerts_v215.occurrences+1,"+
        "status=CASE WHEN operational_alerts_v215.is_active=FALSE THEN 'open' ELSE operational_alerts_v215.status END,"+
        "acknowledged_by=CASE WHEN operational_alerts_v215.is_active=FALSE THEN NULL ELSE operational_alerts_v215.acknowledged_by END,"+
        "acknowledged_at=CASE WHEN operational_alerts_v215.is_active=FALSE THEN NULL ELSE operational_alerts_v215.acknowledged_at END,"+
        "resolved_by=CASE WHEN operational_alerts_v215.is_active=FALSE THEN NULL ELSE operational_alerts_v215.resolved_by END,"+
        "resolved_at=CASE WHEN operational_alerts_v215.is_active=FALSE THEN NULL ELSE operational_alerts_v215.resolved_at END "+
        "WHERE operational_alerts_v215.is_active=FALSE "+
        "OR operational_alerts_v215.last_seen_at < now()-interval '5 minutes'",
        [signal.key,signal.severity,signal.title,signal.detail]
      );
    }
    await db.query(
      "UPDATE operational_alerts_v215 SET is_active=FALSE,last_cleared_at=now() "+
      "WHERE is_active=TRUE AND NOT(alert_key=ANY($1::text[]))",
      [signals.map(s=>s.key)]
    );
  }
  async function poll(){
    if(running)return running;
    if(stopped)return null;
    running=(async()=>{
      try{
        const dependencies=await dependencyInspector.snapshot({force:true});
        // A failed database cannot persist alerts about itself; Coolify monitoring
        // and the existing dependency panel remain the independent diagnostics.
        if(dependencies.services?.some(x=>x.key==='database' && x.status==='critical')){
          logger.warn('RedLibertad ops: database unavailable; alert write skipped');
          return {skipped:'database_unavailable'};
        }
        const signals=evaluateSignals({runtime:runtimeMonitor.snapshot(),dependencies});
        await persistSignals(signals);
        lastSuccessAt=new Date().toISOString();
        return {count:signals.length};
      }catch(_){
        logger.warn('RedLibertad ops: alert evaluation failed');
        return {skipped:'evaluation_failed'};
      }finally{running=null;}
    })();
    return running;
  }
  function start(){
    if(timer||stopped)return;
    timer=timers.setInterval(()=>{void poll();},intervalMs);
    timer.unref?.();
  }
  function stop(){stopped=true;if(timer){timers.clearInterval(timer);timer=null;}}
  return {poll,start,stop,ensureSchema:()=>ensureOperationalAlerts(db),
    state:()=>({running:!!running,started:!!timer,lastSuccessAt})};
}

module.exports={evaluateSignals,createOperationalAlertService,ensureOperationalAlerts,ALERT_KEYS,POLL_MS};
