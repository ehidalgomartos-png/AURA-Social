'use strict';

// V3.2.0 is configuration only. It cannot fetch feeds, create social users or publish posts.
const net=require('node:net');
const CATEGORIES=Object.freeze(['actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento']);
const PROFILE_STATUSES=Object.freeze(['draft','ready','paused']);
const SOURCE_STATUSES=Object.freeze(['draft','approved','paused']);

function validateFeedUrl(value){
  if(typeof value!=='string'||value.length>2048||value.trim()!==value) return null;
  try{
    const url=new URL(value);
    const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash) return null;
    if(!host.includes('.')||net.isIP(host)||host==='localhost')return null;
    if(/\.(?:local|localhost|internal|test|invalid|example|onion)$/.test(host))return null;
    if(/[\s\\]/.test(value))return null;
    return url.href;
  }catch(_){return null;}
}

function validateLocalImage(value){
  if(value===''||value==null)return '';
  if(typeof value!=='string'||value.length>500)return null;
  if(!/^\/uploads\/[a-zA-Z0-9_./-]+$/.test(value) ||
     value.includes('..')||value.includes('//'))return null;
  return value;
}

let ready=null;
async function ensureEditorialSchema(db){
  if(!ready){
    ready=(async()=>{
      await db.query("CREATE TABLE IF NOT EXISTS editorial_profiles (id BIGSERIAL PRIMARY KEY, slug VARCHAR(60) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL, bio VARCHAR(500) NOT NULL DEFAULT '', category VARCHAR(30) NOT NULL CHECK(category IN ('actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento')), community_id BIGINT REFERENCES communities(id) ON DELETE SET NULL, avatar_url TEXT, cover_url TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','paused')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_profiles_status ON editorial_profiles(status,category,id)');
      await db.query("CREATE TABLE IF NOT EXISTS editorial_sources (id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, feed_url TEXT NOT NULL UNIQUE, category VARCHAR(30) NOT NULL CHECK(category IN ('actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento')), profile_id BIGINT REFERENCES editorial_profiles(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paused')), rights_mode TEXT NOT NULL DEFAULT 'link_only' CHECK(rights_mode IN ('link_only','licensed')), rights_reference VARCHAR(1000) NOT NULL DEFAULT '', last_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(rights_mode <> 'licensed' OR length(btrim(rights_reference)) >= 10))");
      await db.query("ALTER TABLE editorial_sources ADD COLUMN IF NOT EXISTS source_kind VARCHAR(8) NOT NULL DEFAULT 'rss' CHECK(source_kind IN ('rss','web'))");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_sources_status ON editorial_sources(status,category,id)');
      await db.query("CREATE TABLE IF NOT EXISTS editorial_settings (singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton), review_required BOOLEAN NOT NULL DEFAULT TRUE CHECK(review_required), ingestion_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK(NOT ingestion_enabled), auto_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK(NOT auto_publish_enabled), created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await db.query('INSERT INTO editorial_settings(singleton) VALUES(TRUE) ON CONFLICT(singleton) DO NOTHING');
      await db.query("CREATE TABLE IF NOT EXISTS editorial_audit (id BIGSERIAL PRIMARY KEY, admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action VARCHAR(40) NOT NULL, entity_type VARCHAR(30) NOT NULL, entity_id BIGINT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_audit_created ON editorial_audit(created_at DESC,id DESC)');
    })().catch(error=>{ready=null;throw error;});
  }
  return ready;
}

module.exports={CATEGORIES,PROFILE_STATUSES,SOURCE_STATUSES,validateFeedUrl,validateLocalImage,ensureEditorialSchema};
