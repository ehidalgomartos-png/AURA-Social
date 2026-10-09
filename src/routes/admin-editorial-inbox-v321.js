'use strict';
const express=require('express');
const db=require('../db');
const {requireAdmin}=require('../middleware/auth');
const {ensureEditorialSchema}=require('../services/editorial-v320');
const {fetchXml,parseFeed}=require('../services/editorial-rss-v321');

const router=express.Router();
let schemaReady=null;
async function ensureInbox(){
  if(!schemaReady){
    schemaReady=(async()=>{
      await ensureEditorialSchema(db);
      await db.query("CREATE TABLE IF NOT EXISTS editorial_candidates (id BIGSERIAL PRIMARY KEY, source_id BIGINT REFERENCES editorial_sources(id) ON DELETE SET NULL, profile_id BIGINT REFERENCES editorial_profiles(id) ON DELETE SET NULL, category VARCHAR(30) NOT NULL CHECK(category IN ('actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento')), source_title VARCHAR(240) NOT NULL, source_excerpt VARCHAR(400) NOT NULL DEFAULT '', canonical_url TEXT NOT NULL UNIQUE, title_fingerprint CHAR(64) NOT NULL, published_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ, reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL, CHECK(status='pending' OR reviewed_at IS NOT NULL))");
      await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_candidate_title ON editorial_candidates(category,title_fingerprint)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_candidate_inbox ON editorial_candidates(status,fetched_at DESC,id DESC)');
      await db.query("ALTER TABLE editorial_candidates ADD COLUMN IF NOT EXISTS source_image_url TEXT");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_candidate_source ON editorial_candidates(source_id,fetched_at DESC)');
    })().catch(e=>{schemaReady=null;throw e;});
  }
  return schemaReady;
}
router.use(requireAdmin);
router.use(async(_req,res,next)=>{
  try{await ensureInbox();next();}
  catch(e){console.error('Editorial V3.2.1 inbox bootstrap failed:',e);res.status(500).json({error:'editorial_inbox_unavailable'});}
});

router.get('/candidates',async(req,res)=>{
  try{
    const status=['pending','approved','rejected'].includes(req.query.status)?req.query.status:'pending';
    const candidates=await db.query(
      "SELECT ec.id,ec.source_id,ec.profile_id,ec.category,ec.source_title,ec.source_excerpt,ec.canonical_url,ec.published_at,ec.status,ec.fetched_at,es.name AS source_name FROM editorial_candidates ec LEFT JOIN editorial_sources es ON es.id=ec.source_id WHERE ec.status=$1 ORDER BY ec.fetched_at DESC,ec.id DESC LIMIT 100",
      [status]
    );
    res.json({candidates:candidates.rows,status,publishingEnabled:false});
  }catch(e){
    console.error('Editorial V3.2.1 candidate list failed:',e);
    res.status(500).json({error:'editorial_inbox_failed'});
  }
});

router.post('/sources/:id/fetch',async(req,res)=>{
  const id=String(req.params.id||'');
  if(!/^[1-9]\d{0,8}$/.test(id))return res.status(400).json({error:'editorial_source_id_invalid'});
  let client;
  let locked=false;
  try{
    client=await db.pool.connect();
    const lock=await client.query('SELECT pg_try_advisory_lock(321,$1::integer) AS acquired',[id]);
    locked=lock.rows[0]?.acquired===true;
    if(!locked)return res.status(409).json({error:'editorial_fetch_already_running'});
    const src=await client.query("SELECT id,feed_url,source_kind,category,profile_id,status,last_checked_at FROM editorial_sources WHERE id=$1",[id]);
    if(!src.rowCount)return res.status(404).json({error:'editorial_source_not_found'});
    const source=src.rows[0];
    if(source.status!=='approved')return res.status(403).json({error:'editorial_source_not_approved'});
    if(source.source_kind==='web')return res.status(409).json({error:'editorial_source_is_website_not_rss'});
    if(source.last_checked_at&&Date.now()-new Date(source.last_checked_at).getTime()<5*60*1000){
      return res.status(429).json({error:'editorial_fetch_cooldown'});
    }
    const xml=await fetchXml(source.feed_url);
    const candidates=parseFeed(xml,{sourceId:source.id,profileId:source.profile_id,category:source.category});
    let inserted=0;
    await client.query('BEGIN');
    try{
      // A source edited while the network request ran cannot import stale or unapproved data.
      const current=await client.query("SELECT feed_url,source_kind,status,category,profile_id FROM editorial_sources WHERE id=$1 FOR UPDATE",[id]);
      if(!current.rowCount||current.rows[0].source_kind==='web'||current.rows[0].status!=='approved'||
         current.rows[0].feed_url!==source.feed_url||
         current.rows[0].category!==source.category||
         String(current.rows[0].profile_id||'')!==String(source.profile_id||'')){
        const e=new Error('source_changed');e.code='editorial_source_changed';throw e;
      }
      for(const entry of candidates){
        const r=await client.query(
          "INSERT INTO editorial_candidates (source_id,profile_id,category,source_title,source_excerpt,canonical_url,title_fingerprint,published_at,source_image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id",
          [entry.source_id,entry.profile_id,entry.category,entry.source_title,entry.source_excerpt,entry.canonical_url,entry.title_fingerprint,entry.published_at,entry.source_image_url]
        );
        inserted+=r.rowCount;
      }
      await client.query('UPDATE editorial_sources SET last_checked_at=now() WHERE id=$1',[id]);
      await client.query(
        "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'fetch','source',$2,$3::jsonb)",
        [req.user.id,id,JSON.stringify({found:candidates.length,added:inserted,duplicates:candidates.length-inserted})]
      );
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}
    res.json({ok:true,found:candidates.length,added:inserted,duplicates:candidates.length-inserted,mode:'manual',published:0});
  }catch(e){
    const known=new Set(['feed_network_blocked','feed_url_rejected','feed_redirect_blocked','feed_http_error',
      'feed_not_xml','feed_too_large','feed_timeout','feed_network_error','feed_dns_error','feed_tls_error','feed_connect_error','feed_response_error','feed_xml_rejected','feed_parse_failed',
      'editorial_source_changed']);
    if(known.has(e.code)){
      const code=e.code;
      // Public response carries only a classified error code, never DNS IPs or TLS internals.
      console.warn('Editorial RSS connection rejected:',code);
      return res.status(code==='editorial_source_changed'?409:422).json({error:code});
    }
    console.error('Editorial RSS fetch failed:',e);
    res.status(500).json({error:'editorial_fetch_failed'});
  }finally{
    if(client){
      if(locked){
        try{await client.query('SELECT pg_advisory_unlock(321,$1::integer)',[id]);}
        catch(error){console.error('Editorial RSS advisory unlock failed:',error);client.release(true);client=null;}
      }
      client?.release();
    }
  }
});
module.exports=router;
