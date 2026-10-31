'use strict';
// V3.6.39: ONLY private drafts. Never exposes public article content.
const db=require('../db');
const TYPES=new Set(['noticia','reportaje','analisis','opinion']);
const validId=value=>/^[1-9][0-9]{0,14}$/.test(String(value??''));
const clean=value=>typeof value==='string'?value.trim():'';
function validateDraft(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
 const keys=Object.keys(payload);
 if(keys.some(key=>!['title','body','kind','sources'].includes(key)))return null;
 const title=clean(payload.title),body=clean(payload.body),kind=payload.kind;
 if(title.length<3||title.length>180||body.length<1||body.length>15000||!TYPES.has(kind))return null;
 if(!Array.isArray(payload.sources)||payload.sources.length>8)return null;
 const urls=[];
 for(const source of payload.sources){
  if(typeof source!=='string'||source.length>2048)return null;
  try{
   const u=new URL(source.trim());
   if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname==='localhost')return null;
   if(urls.includes(u.href))return null;
   urls.push(u.href);
  }catch(_){return null;}
 }
 // Incomplete sources are allowed ONLY in drafts; publication will require review.
 return {title,body,kind,sources:urls};
}
let schemaReady;
function ensureSchema(){
 if(!schemaReady){
  schemaReady=(async()=>{
   await db.query("CREATE TABLE IF NOT EXISTS independent_article_drafts_v3639 (id BIGSERIAL PRIMARY KEY,author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title VARCHAR(180) NOT NULL,body TEXT NOT NULL,kind VARCHAR(16) NOT NULL CHECK(kind IN ('noticia','reportaje','analisis','opinion')),sources JSONB NOT NULL DEFAULT '[]'::jsonb,status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status='draft'),revision INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("CREATE INDEX IF NOT EXISTS idx_independent_drafts_author_v3639 ON independent_article_drafts_v3639(author_user_id,updated_at DESC,id DESC)");
  })().catch(err=>{schemaReady=null;throw err;});
 }
 return schemaReady;
}
const columns='id,title,body,kind,sources,status,revision,created_at,updated_at';
async function list(userId){
 await ensureSchema();
 const out=await db.query('SELECT '+columns+' FROM independent_article_drafts_v3639 WHERE author_user_id=$1 AND status=$2 ORDER BY updated_at DESC,id DESC LIMIT 30',[userId,'draft']);
 return out.rows;
}
async function get(userId,id){
 if(!validId(id))return null;
 await ensureSchema();
 const out=await db.query('SELECT '+columns+' FROM independent_article_drafts_v3639 WHERE id=$1 AND author_user_id=$2 AND status=$3',[id,userId,'draft']);
 return out.rows[0]||null;
}
async function create(userId,payload){
 const data=validateDraft(payload);
 if(!data)return null;
 await ensureSchema();
 const out=await db.query('INSERT INTO independent_article_drafts_v3639(author_user_id,title,body,kind,sources) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING '+columns,[userId,data.title,data.body,data.kind,JSON.stringify(data.sources)]);
 return out.rows[0]||null;
}
async function update(userId,id,revision,payload){
 const data=validateDraft(payload);
 if(!validId(id)||!Number.isSafeInteger(revision)||revision<1||!data)return null;
 await ensureSchema();
 const out=await db.query("UPDATE independent_article_drafts_v3639 SET title=$1,body=$2,kind=$3,sources=$4::jsonb,revision=revision+1,updated_at=now() WHERE id=$5 AND author_user_id=$6 AND revision=$7 AND status='draft' RETURNING "+columns,[data.title,data.body,data.kind,JSON.stringify(data.sources),id,userId,revision]);
 return out.rows[0]||null;
}
async function remove(userId,id,revision){
 if(!validId(id)||!Number.isSafeInteger(revision)||revision<1)return false;
 await ensureSchema();
 const out=await db.query("DELETE FROM independent_article_drafts_v3639 WHERE id=$1 AND author_user_id=$2 AND revision=$3 AND status='draft' RETURNING id",[id,userId,revision]);
 return out.rowCount>0;
}
module.exports={TYPES,validId,validateDraft,ensureSchema,list,get,create,update,remove};
