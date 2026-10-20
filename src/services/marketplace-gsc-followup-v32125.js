'use strict';
// V3.2.125 — bounded history of explicitly requested Google inspections.
// No scheduled Google queries, no keys/tokens, no raw Google payloads saved.
const TABLE='marketplace_gsc_inspections_v32125';
const RETENTION_DAYS=90;
const PER_PRODUCT=8;
const MAX_PRODUCTS=30;
const STATES=Object.freeze({
 indexed:Object.freeze({label:'Indexado según Google',advice:'La ficha figura en el índice de Google. Consulta el rendimiento en Search Console; no solicites nuevas indexaciones por rutina.'}),
 discovered:Object.freeze({label:'Descubierto, pendiente de rastreo',advice:'Google conoce la dirección pero no registra un rastreo para indexarla. Revisa el sitemap, los enlaces internos y su disponibilidad pública; el rastreo puede tardar.'}),
 crawled:Object.freeze({label:'Rastreado, sin indexar',advice:'Google ya la rastreó pero no la ha indexado. Revisa contenido propio, canonicals y duplicados en Search Console; la indexación no está garantizada.'}),
 technical:Object.freeze({label:'Posible problema de acceso o rastreo',advice:'Revisa en Search Console la prueba de URL publicada: el estado guardado por Google puede estar desactualizado. Comprueba HTTP, robots y redirecciones.'}),
 excluded:Object.freeze({label:'Otra exclusión o canónica distinta',advice:'Revisa el motivo de cobertura y la URL canónica elegida por Google. No cambies canonicals ni redirecciones sin comprobarlo.'}),
 unknown:Object.freeze({label:'Estado no determinado',advice:'Comprueba el mensaje de cobertura completo en Search Console y la prueba de URL publicada antes de sacar conclusiones.'})
});
const STATUS_KEYS=Object.freeze(Object.keys(STATES));
const DDL=[
 "CREATE TABLE IF NOT EXISTS "+TABLE+" (id BIGSERIAL PRIMARY KEY, listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE, checked_at TIMESTAMPTZ NOT NULL DEFAULT now(), status_code VARCHAR(24) NOT NULL CHECK (status_code IN ('indexed','discovered','crawled','technical','excluded','unknown')), verdict VARCHAR(25) NOT NULL, coverage_state VARCHAR(180) NOT NULL, last_crawl_time TIMESTAMPTZ)",
 'CREATE INDEX IF NOT EXISTS idx_marketplace_gsc_inspections_v32125_recent ON '+TABLE+' (checked_at DESC,id DESC)',
 'CREATE INDEX IF NOT EXISTS idx_marketplace_gsc_inspections_v32125_listing ON '+TABLE+' (listing_id,checked_at DESC,id DESC)'
];
function normalize(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function classify(inspection){
 const verdict=String(inspection?.verdict||'');
 const coverage=normalize(inspection?.coverageState);
 const robots=String(inspection?.robotsTxtState||'').toUpperCase();
 const fetchState=String(inspection?.pageFetchState||'').toUpperCase();
 if(verdict==='PASS')return 'indexed';
 if(/discovered|descubiert/.test(coverage)&&/not indexed|sin indexar|no indexad/.test(coverage))
  return 'discovered';
 if(/crawled|rastread/.test(coverage)&&/not indexed|sin indexar|no indexad/.test(coverage))
  return 'crawled';
 if(robots==='DISALLOWED'||/BLOCKED|NOT_FOUND|SERVER_ERROR|ACCESS_DENIED|SOFT_404/.test(fetchState)||
  /blocked|bloquead|robots\.txt|server error|error del servidor|soft 404|not found|no encontrad|acceso denegado/.test(coverage))
  return 'technical';
 if(/duplicate|duplicad|alternate page|pagina alternativa|canonical|canonic|excluded|excluid|redirect|redirig/.test(coverage))
  return 'excluded';
 return 'unknown';
}
function interpretation(inspection){
 const code=classify(inspection),s=STATES[code];
 return {code,label:s.label,advice:s.advice,note:'Es el estado de la versión guardada por Google en una inspección manual. No es la prueba en directo ni garantiza indexación.'};
}
function safeCrawlTime(input){
 if(typeof input!=='string'||input.length>40||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input))
  return null;
 const n=Date.parse(input);
 return Number.isFinite(n)?new Date(n).toISOString():null;
}
const INSERT_SQL='INSERT INTO '+TABLE+' (listing_id,status_code,verdict,coverage_state,last_crawl_time) VALUES ($1,$2,$3,$4,$5) RETURNING checked_at';
const PRUNE_SQL='DELETE FROM '+TABLE+" WHERE checked_at < now() - interval '"+RETENTION_DAYS+" days' OR (listing_id=$1 AND id NOT IN (SELECT id FROM "+TABLE+' WHERE listing_id=$1 ORDER BY checked_at DESC,id DESC LIMIT '+PER_PRODUCT+'))';
const HISTORY_SQL=
 'WITH eligible AS ('+
 ' SELECT s.id,s.listing_id,s.checked_at,s.status_code,s.coverage_state,s.last_crawl_time,l.title AS listing_title'+
 ' FROM '+TABLE+' s JOIN marketplace_listings l ON l.id=s.listing_id JOIN users u ON u.id=l.seller_id'+
 " WHERE l.kind='product' AND l.deal='sale' AND l.status='active' AND l.moderation_status='published'"+
 " AND u.status='active' AND u.discoverable=true AND s.checked_at >= now() - interval '"+RETENTION_DAYS+" days'"+
 '), latest_per_product AS ('+
 ' SELECT DISTINCT ON (listing_id) * FROM eligible ORDER BY listing_id,checked_at DESC,id DESC'+
 '), recent AS ('+
 ' SELECT * FROM latest_per_product ORDER BY checked_at DESC,id DESC LIMIT '+MAX_PRODUCTS+
 ') SELECT recent.*, (SELECT e.status_code FROM eligible e WHERE e.listing_id=recent.listing_id AND e.id<>recent.id ORDER BY e.checked_at DESC,e.id DESC LIMIT 1) AS previous_status_code'+
 ' FROM recent ORDER BY recent.checked_at DESC,recent.id DESC';
async function ensureSchema(db){
 for(const ddl of DDL)await db.query(ddl);
}
async function save(db,{listingId,inspection}){
 if(!/^[1-9][0-9]{0,15}$/.test(String(listingId??''))||
  inspection?.source!=='google_search_console_url_inspection')
  throw Error('gsc_followup_invalid_source');
 const status=classify(inspection);
 const values=[
  String(listingId),status,
  typeof inspection.verdict==='string'?inspection.verdict.slice(0,25):'VERDICT_UNSPECIFIED',
  typeof inspection.coverageState==='string'?inspection.coverageState.slice(0,180):'',
  safeCrawlTime(inspection.lastCrawlTime)
 ];
 await ensureSchema(db);
 const inserted=await db.query(INSERT_SQL,values);
 await db.query(PRUNE_SQL,[String(listingId)]);
 return {status,checkedAt:inserted.rows[0]?.checked_at||null};
}
async function history(db,{listingPath}={}){
 if(typeof listingPath!=='function')throw Error('listing_path_required');
 await ensureSchema(db);
 const data=await db.query(HISTORY_SQL);
 const products=(data.rows||[]).map(row=>{
  const status=STATUS_KEYS.includes(row.status_code)?row.status_code:'unknown';
  const previous=STATUS_KEYS.includes(row.previous_status_code)?row.previous_status_code:null;
  const path=listingPath({id:row.listing_id,title:row.listing_title});
  return {
   id:String(row.listing_id),title:String(row.listing_title||'').slice(0,180),
   path:/^\/marketplace\/p\/[1-9][0-9]{0,15}\/[a-z0-9-]+$/.test(path)?path:null,
   status,previousStatus:previous,changed:previous!==null&&previous!==status,
   label:STATES[status].label,advice:STATES[status].advice,
   coverageState:String(row.coverage_state||'').slice(0,180),
   checkedAt:new Date(row.checked_at).toISOString(),
   lastCrawlTime:row.last_crawl_time?new Date(row.last_crawl_time).toISOString():null
  };
 });
 const counts=Object.fromEntries(STATUS_KEYS.map(k=>[k,0]));
 for(const item of products)counts[item.status]++;
 return {
  ok:true,source:'stored_manual_search_console_inspections',
  retentionDays:RETENTION_DAYS,maximumProducts:MAX_PRODUCTS,
  products,counts,
  note:'Solo muestra las últimas inspecciones manuales guardadas de hasta 30 productos públicos y activos en los últimos 90 días. Consultar este historial NO llama a Google ni consume cuota. Los demás productos no se clasifican.'
 };
}
module.exports={TABLE,RETENTION_DAYS,PER_PRODUCT,MAX_PRODUCTS,STATES,STATUS_KEYS,DDL,INSERT_SQL,PRUNE_SQL,HISTORY_SQL,classify,interpretation,safeCrawlTime,ensureSchema,save,history};
