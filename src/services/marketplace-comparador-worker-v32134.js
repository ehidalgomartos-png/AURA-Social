'use strict';
// V3.2.134 — worker de precios en segundo plano.
// Cola persistente PostgreSQL, lease atómico entre instancias y coste acotado.
// No busca en Google sin un proveedor autorizado y configurado.
const db=require('../db');
const provider=require('./marketplace-comparador-provider-v32133');
const insights=require('./marketplace-comparador-insights-v32140');
const FRESH_HOURS=24;
let schemaPromise=null;
let timer=null;
let busy=false;
let bootstrap=null;

function periodKeys(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const val=key=>parts.find(p=>p.type===key)?.value||'';
 const month=val('year')+'-'+val('month');
 return {month:'m:'+month,day:'d:'+month+'-'+val('day')};
}
async function ensureSchema(ensurePages=async()=>{}){
 if(!schemaPromise){
  schemaPromise=(async()=>{
   await ensurePages();
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_jobs (page_id BIGINT PRIMARY KEY REFERENCES marketplace_compare_pages(id) ON DELETE CASCADE, status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')), requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), available_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0)");
   await db.query("CREATE INDEX IF NOT EXISTS idx_marketplace_compare_jobs_queue ON marketplace_compare_jobs(available_at,requested_at) WHERE status='queued'");
  })().catch(e=>{schemaPromise=null;throw e;});
 }
 return schemaPromise;
}
async function enqueue(page,ensurePages){
 if(!provider.configured())return false;
 await ensureSchema(ensurePages);
 const id=String(page?.id||'');
 if(!/^[1-9]\d{0,15}$/.test(id))return false;
 // Una página vacía bloqueada por cuota puede reintentarse al renovarse
 // el presupuesto, sin esperar otras 24 horas a una consulta que nunca ocurrió.
 // No reencolar solicitudes que la cuota ya ha rechazado mientras no haya
 // presupuesto disponible. Aplica también cuando ya existen precios guardados.
 if(page?.provider_status==='limit_reached' && !(await quotaStatus()).available)return false;
 const result=await db.query(
  "INSERT INTO marketplace_compare_jobs (page_id,status) "+
  "SELECT id,'queued' FROM marketplace_compare_pages WHERE id=$1 "+
  "AND (last_checked_at IS NULL OR last_checked_at<now()-interval '24 hours' OR (provider_status='limit_reached' AND jsonb_array_length(external_results)=0) "+
  "OR (provider_status IN ('queued','checking') AND jsonb_array_length(external_results)=0 AND EXISTS "+
  "(SELECT 1 FROM marketplace_compare_jobs j WHERE j.page_id=$1 AND j.status IN ('done','failed') AND j.finished_at<now()-interval '2 minutes'))) "+
  "ON CONFLICT(page_id) DO UPDATE SET status='queued',requested_at=now(),available_at=now(),started_at=NULL,finished_at=NULL,attempts=0 "+
  "WHERE marketplace_compare_jobs.status IN ('done','failed') AND (marketplace_compare_jobs.status!='failed' "+
  "OR marketplace_compare_jobs.finished_at<now()-interval '2 hours' "+
  "OR EXISTS (SELECT 1 FROM marketplace_compare_pages q WHERE q.id=$1 AND q.provider_status='limit_reached')) AND EXISTS "+
  "(SELECT 1 FROM marketplace_compare_pages p WHERE p.id=$1 AND (p.last_checked_at IS NULL OR p.last_checked_at<now()-interval '24 hours' OR (p.provider_status='limit_reached' AND jsonb_array_length(p.external_results)=0) "+
  "OR (p.provider_status IN ('queued','checking') AND jsonb_array_length(p.external_results)=0 AND marketplace_compare_jobs.finished_at<now()-interval '2 minutes'))) "+
  "RETURNING page_id",[id]
 );
 if(result.rowCount)await db.query("UPDATE marketplace_compare_pages SET provider_status='queued' WHERE id=$1",[id]);
 return Boolean(result.rowCount);
}
// Estado de la cuota compartida entre búsquedas y enlaces de tiendas.
// Solo consulta contadores locales de PostgreSQL, nunca consume SerpApi.
async function quotaStatus(now=new Date()){
 const limits=provider.budget();
 if(!provider.configured())return {available:false,reason:'not_configured',...limits};
 if(limits.daily===0||limits.monthly===0)return {available:false,reason:'disabled',...limits};
 const keys=periodKeys(now);
 const records=await db.query('SELECT period_key,used FROM marketplace_compare_provider_usage WHERE period_key=ANY($1::varchar[])',[[keys.day,keys.month]]);
 const usage=new Map(records.rows.map(x=>[x.period_key,Number(x.used)||0]));
 const dailyUsed=usage.get(keys.day)||0,monthlyUsed=usage.get(keys.month)||0;
 return {
  available:dailyUsed<limits.daily && monthlyUsed<limits.monthly,
  reason:dailyUsed>=limits.daily?'daily':monthlyUsed>=limits.monthly?'monthly':null,
  daily:limits.daily,monthly:limits.monthly,dailyUsed,monthlyUsed
 };
}
async function reserveQuota(now=new Date()){
 const {daily,monthly}=provider.budget();
 if(!provider.configured()||daily===0||monthly===0)return false;
 const keys=periodKeys(now);
 const client=await db.pool.connect();
 try{
  await client.query('BEGIN');
  const q='INSERT INTO marketplace_compare_provider_usage(period_key,used) VALUES($1,1) ON CONFLICT(period_key) DO UPDATE SET used=marketplace_compare_provider_usage.used+1 WHERE marketplace_compare_provider_usage.used<$2 RETURNING used';
  const m=await client.query(q,[keys.month,monthly]);
  if(!m.rowCount){await client.query('ROLLBACK');return false;}
  const d=await client.query(q,[keys.day,daily]);
  if(!d.rowCount){await client.query('ROLLBACK');return false;}
  await client.query('COMMIT');
  return true;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client.release();}
}
async function claimJob(){
 // Retomamos trabajos huérfanos de un proceso reiniciado. La llamada externa
 // expira a los 12 s; no es legítimo mantener un lease > 2 minutos.
 await db.query("UPDATE marketplace_compare_jobs SET status='queued',available_at=now(),started_at=NULL WHERE status='running' AND started_at<now()-interval '2 minutes'");
 const claimed=await db.query(
  "UPDATE marketplace_compare_jobs SET status='running',started_at=now(),attempts=attempts+1 "+
  "WHERE page_id=(SELECT page_id FROM marketplace_compare_jobs WHERE status='queued' AND available_at<=now() "+
  "ORDER BY requested_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING page_id,attempts"
 );
 return claimed.rows[0]||null;
}
async function finish(job,status,pageStatus,offers){
 // Si se trata de un error, nunca sobrescribimos las ofertas anteriores.
 if(Array.isArray(offers)){
  await db.query("UPDATE marketplace_compare_pages SET external_results=$2::jsonb,provider_status=$3,last_checked_at=now(),updated_at=now() WHERE id=$1",
   [job.page_id,JSON.stringify(offers),pageStatus]);
 }else if(pageStatus==='limit_reached'){
  // No hemos consultado al proveedor: conservar la fecha de la última
  // consulta real y permitir reintento de fichas vacías con nueva cuota.
  await db.query("UPDATE marketplace_compare_pages SET provider_status=$2 WHERE id=$1",[job.page_id,pageStatus]);
 }else{
  // Un fallo de red NO equivale a haber consultado correctamente los precios.
  // Mantener la hora de la última respuesta válida y la lista anterior.
  await db.query("UPDATE marketplace_compare_pages SET provider_status=$2 WHERE id=$1",[job.page_id,pageStatus]);
 }
 await db.query("UPDATE marketplace_compare_jobs SET status=$2,finished_at=now() WHERE page_id=$1 AND status='running'",
  [job.page_id,status]);
}
async function recordVerifiedHistory(page,offers,now=new Date()){
 if(!page||!page.id)return false;
 const snapshot=insights.verifiedSnapshot(page,offers,now);
 if(!snapshot)return false;
 await db.query("INSERT INTO marketplace_compare_price_history(page_id,checked_day,low_price_cents,high_price_cents,shop_count,offer_count,updated_at) "+
  "VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(page_id,checked_day) DO UPDATE SET "+
  "low_price_cents=EXCLUDED.low_price_cents,high_price_cents=EXCLUDED.high_price_cents,"+
  "shop_count=EXCLUDED.shop_count,offer_count=EXCLUDED.offer_count,updated_at=now()",
  [page.id,snapshot.day,snapshot.lowCents,snapshot.highCents,snapshot.shopCount,snapshot.offerCount]);
 return true;
}
async function processOne(){
 if(!provider.configured()||busy)return false;
 busy=true;
 try{
  await ensureSchema(bootstrap||undefined);
  const job=await claimJob();
  if(!job)return false;
  const result=await db.query('SELECT id,query_text,last_checked_at,provider_status,external_results FROM marketplace_compare_pages WHERE id=$1',[job.page_id]);
  const page=result.rows[0];
  if(!page){
   await db.query("DELETE FROM marketplace_compare_jobs WHERE page_id=$1",[job.page_id]);
   return true;
  }
  const since=page.last_checked_at?Date.now()-Date.parse(page.last_checked_at):Infinity;
  // Solo ignorar el trabajo si otro proceso guardó un resultado válido recientemente.
   // No confundir last_checked_at de un intento anterior con una búsqueda completada.
   if(page.provider_status==='ok'&&Number.isFinite(since)&&since>=0&&since<FRESH_HOURS*3600000){
   await db.query("UPDATE marketplace_compare_jobs SET status='done',finished_at=now() WHERE page_id=$1",[job.page_id]);
   return true;
  }
  try{
   if(!await reserveQuota()){
    await finish(job,'failed','limit_reached');
    return true;
   }
   await db.query("UPDATE marketplace_compare_pages SET provider_status='checking' WHERE id=$1",[job.page_id]);
   const offers=await provider.fetchOffers(page.query_text);
   await finish(job,'done','ok',offers);
   // El historial es informativo: un fallo de persistencia nunca borra precios
   // actuales ni provoca un nuevo gasto de SerpApi.
   try{await recordVerifiedHistory(page,offers);}
   catch(e){console.warn('Comparador history persistence:',String(e.message).slice(0,80));}
  }catch(e){
   // No se registra la clave ni la URL completa con api_key.
   console.warn('Comparador background fetch failed:',String(e?.message||'provider_error').slice(0,80));
   await finish(job,'failed','unavailable');
  }
  return true;
 }finally{busy=false;}
}
function start(ensurePages){
 if(timer)return;
 bootstrap=ensurePages;
 // Nunca se crean temporizadores durante tests por el mero hecho de importar.
 timer=setInterval(()=>{processOne().catch(e=>console.error('Comparador queue:',String(e.message).slice(0,110)));},8000);
 timer.unref?.();
 if(provider.configured())processOne().catch(e=>console.error('Comparador queue startup:',String(e.message).slice(0,110)));
}
function stop(){
 if(timer){clearInterval(timer);timer=null;}
}
module.exports={periodKeys,ensureSchema,enqueue,reserveQuota,quotaStatus,claimJob,recordVerifiedHistory,processOne,start,stop};
